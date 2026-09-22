import os
import unittest
from unittest.mock import Mock, patch

os.environ.setdefault("CELERY_BROKER_URL", "memory://")

from kide_worker.tasks import SessionTypeError, _device_bindings, _select, compose_machines


def binding(device: str, session_type: str | None = None) -> dict:
    result = {"device": {"type": "uri", "value": device}}
    if session_type is not None:
        result["sessionType"] = {"type": "uri", "value": session_type}
    return result


def machine(
    capability_uri: str,
    session_type: str = "urn:session:sync",
    *,
    states: list[str] | None = None,
    start_states: list[str] | None = None,
    end_states: list[str] | None = None,
    transitions: list[dict] | None = None,
) -> dict:
    return {
        "capabilityUri": capability_uri,
        "sessionType": session_type,
        "states": states or ["idle", "running", "done"],
        "startStates": start_states or ["idle"],
        "endStates": end_states or ["done"],
        "transitions": (
            transitions
            if transitions is not None
            else [
                {"source": "idle", "target": "running", "event": "start"},
                {"source": "running", "target": "done", "event": "finish"},
            ]
        ),
    }


def payload(
    activities: list[dict] | None = None,
    machines: list[dict] | None = None,
    plan: list[dict] | None = None,
) -> dict:
    activities = activities or [
        {"name": "Move", "capabilityUri": "urn:capability:move"},
        {"name": "Stop", "capabilityUri": "urn:capability:stop"},
    ]
    machines = machines or [
        machine("urn:capability:move"),
        machine("urn:capability:stop"),
    ]
    result = {
        "projectId": "project-1",
        "activities": activities,
        "capabilityMachines": machines,
    }
    if plan is not None:
        result["executionPlan"] = plan
    return result


class ComposeMachinesValidationTests(unittest.TestCase):
    def test_rejects_missing_project(self) -> None:
        request = payload()
        request["projectId"] = ""
        with self.assertRaisesRegex(ValueError, "projectId is required"):
            compose_machines(request)

    def test_rejects_duplicate_activity_names(self) -> None:
        request = payload(
            activities=[
                {"name": "Move", "capabilityUri": "urn:capability:move"},
                {"name": "Move", "capabilityUri": "urn:capability:stop"},
            ]
        )
        with self.assertRaisesRegex(ValueError, "duplicate activity name"):
            compose_machines(request)

    def test_rejects_unsafe_capability_iri_before_sparql(self) -> None:
        request = payload(
            activities=[
                {"name": "Move", "capabilityUri": "urn:capability:move> } UNION { ?s ?p ?o"}
            ],
            machines=[machine("urn:capability:move")],
        )
        lookup = Mock(return_value=[])
        with self.assertRaisesRegex(ValueError, "SPARQL-safe IRI"):
            compose_machines(request, device_lookup=lookup)
        lookup.assert_not_called()

    def test_rejects_machine_state_references_outside_declared_states(self) -> None:
        request = payload(
            activities=[{"name": "Move", "capabilityUri": "urn:capability:move"}],
            machines=[
                machine(
                    "urn:capability:move",
                    states=["idle"],
                    start_states=["idle"],
                    end_states=["missing"],
                    transitions=[],
                )
            ],
        )
        with self.assertRaisesRegex(ValueError, "unknown state"):
            compose_machines(request)

    def test_requires_machine_for_every_activity_capability(self) -> None:
        request = payload(
            activities=[{"name": "Move", "capabilityUri": "urn:capability:move"}],
            machines=[machine("urn:capability:other")],
        )
        with self.assertRaisesRegex(LookupError, "no capability machine declared"):
            compose_machines(
                request,
                device_lookup=lambda _: [binding("urn:device:robot", "urn:session:sync")],
            )

    def test_execution_plan_must_cover_all_activities(self) -> None:
        request = payload(
            plan=[{"kind": "parallel", "activities": ["Move", "Stop"]}],
            activities=[
                {"name": "Move", "capabilityUri": "urn:capability:move"},
                {"name": "Stop", "capabilityUri": "urn:capability:stop"},
                {"name": "Inspect", "capabilityUri": "urn:capability:inspect"},
            ],
            machines=[
                machine("urn:capability:move"),
                machine("urn:capability:stop"),
                machine("urn:capability:inspect"),
            ],
        )
        with self.assertRaisesRegex(ValueError, "does not cover activities: Inspect"):
            compose_machines(request)

    def test_sequential_and_parallel_conflict_fails_closed(self) -> None:
        request = payload(
            plan=[
                {"kind": "sequential", "activities": ["Move", "Stop"]},
                {"kind": "parallel", "activities": ["Move", "Stop"]},
            ]
        )
        with self.assertRaisesRegex(ValueError, "both sequential and parallel"):
            compose_machines(request)


class SessionCompatibilityTests(unittest.TestCase):
    def test_fails_when_capability_has_no_device(self) -> None:
        request = payload(
            activities=[{"name": "Move", "capabilityUri": "urn:capability:move"}],
            machines=[machine("urn:capability:move")],
        )
        with self.assertRaisesRegex(LookupError, "no device offers"):
            compose_machines(request, device_lookup=lambda _: [])

    def test_fails_when_no_device_has_required_session_type(self) -> None:
        request = payload(
            activities=[{"name": "Move", "capabilityUri": "urn:capability:move"}],
            machines=[machine("urn:capability:move", "urn:session:sync")],
        )
        with self.assertRaisesRegex(SessionTypeError, "requires session type"):
            compose_machines(
                request,
                device_lookup=lambda _: [binding("urn:device:robot", "urn:session:async")],
            )

    def test_selects_first_compatible_device_not_first_device(self) -> None:
        request = payload(
            activities=[{"name": "Move", "capabilityUri": "urn:capability:move"}],
            machines=[machine("urn:capability:move", "urn:session:sync")],
        )
        result = compose_machines(
            request,
            device_lookup=lambda _: [
                binding("urn:device:a", "urn:session:async"),
                binding("urn:device:b", "urn:session:sync"),
                binding("urn:device:c", "urn:session:sync"),
            ],
        )
        self.assertEqual(result["bindings"][0]["deviceUri"], "urn:device:b")
        self.assertEqual(result["evidence"]["sessionTypesValidated"], 1)


class CompositionTests(unittest.TestCase):
    def test_default_plan_is_sequential_and_adds_local_transition(self) -> None:
        result = compose_machines(
            payload(),
            device_lookup=lambda _: [binding("urn:device:robot", "urn:session:sync")],
        )

        controller = result["controllers"][0]
        sequential = [
            transition
            for transition in controller["transitions"]
            if transition["kind"] == "sequential"
        ]
        self.assertEqual(result["algorithm"], "COMPOSEMACHINES-v2")
        self.assertEqual(len(sequential), 1)
        self.assertEqual(sequential[0]["source"], "Move::done")
        self.assertEqual(sequential[0]["target"], "Stop::idle")
        self.assertEqual(controller["startStates"], ["Move::idle"])
        self.assertEqual(controller["endStates"], ["Stop::done"])

    def test_all_end_states_connect_to_all_next_start_states(self) -> None:
        move = machine(
            "urn:capability:move",
            states=["a", "b", "c", "d"],
            start_states=["a", "b"],
            end_states=["c", "d"],
            transitions=[],
        )
        stop = machine(
            "urn:capability:stop",
            states=["x", "y", "z"],
            start_states=["x", "y"],
            end_states=["z"],
            transitions=[],
        )
        result = compose_machines(
            payload(machines=[move, stop]),
            device_lookup=lambda _: [binding("urn:device:robot", "urn:session:sync")],
        )
        sequential = [
            transition
            for transition in result["controllers"][0]["transitions"]
            if transition["kind"] == "sequential"
        ]
        self.assertEqual(len(sequential), 4)
        self.assertEqual(
            {(item["source"], item["target"]) for item in sequential},
            {
                ("Move::c", "Stop::x"),
                ("Move::c", "Stop::y"),
                ("Move::d", "Stop::x"),
                ("Move::d", "Stop::y"),
            },
        )

    def test_cross_device_sequence_creates_coordination_edge(self) -> None:
        def lookup(capability_uri: str) -> list[dict]:
            device = (
                "urn:device:arm"
                if capability_uri == "urn:capability:move"
                else "urn:device:plc"
            )
            return [binding(device, "urn:session:sync")]

        result = compose_machines(payload(), device_lookup=lookup)

        self.assertEqual(len(result["controllers"]), 2)
        self.assertEqual(len(result["coordination"]), 1)
        self.assertEqual(result["coordination"][0]["fromDeviceUri"], "urn:device:arm")
        self.assertEqual(result["coordination"][0]["toDeviceUri"], "urn:device:plc")
        self.assertEqual(result["evidence"]["syntheticTransitions"], 0)

    def test_parallel_group_keeps_machines_independent(self) -> None:
        result = compose_machines(
            payload(
                plan=[{"kind": "parallel", "activities": ["Move", "Stop"]}],
            ),
            device_lookup=lambda _: [binding("urn:device:robot", "urn:session:sync")],
        )

        controller = result["controllers"][0]
        self.assertFalse(
            any(transition["kind"] == "sequential" for transition in controller["transitions"])
        )
        self.assertEqual(controller["startStates"], ["Move::idle", "Stop::idle"])
        self.assertEqual(controller["endStates"], ["Move::done", "Stop::done"])
        self.assertEqual(result["parallelGroups"][0]["activities"], ["Move", "Stop"])

    def test_state_names_are_namespaced_per_activity(self) -> None:
        result = compose_machines(
            payload(),
            device_lookup=lambda _: [binding("urn:device:robot", "urn:session:sync")],
        )
        states = result["controllers"][0]["states"]
        self.assertIn("Move::idle", states)
        self.assertIn("Stop::idle", states)
        self.assertEqual(len(states), len(set(states)))

    def test_progress_is_monotonic_and_finishes_at_100(self) -> None:
        progress: list[dict] = []
        compose_machines(
            payload(),
            device_lookup=lambda _: [binding("urn:device:robot", "urn:session:sync")],
            progress=progress.append,
        )
        percentages = [entry["percent"] for entry in progress]
        self.assertEqual(percentages, sorted(percentages))
        self.assertEqual(percentages[-1], 100)
        self.assertEqual(progress[-1]["stage"], "serialization")


class SparqlBoundaryTests(unittest.TestCase):
    @patch("kide_worker.tasks.requests.post")
    def test_select_checks_http_status_and_validates_shape(self, post: Mock) -> None:
        response = Mock()
        response.json.return_value = {
            "results": {"bindings": [binding("urn:device:robot")]}
        }
        post.return_value = response

        rows = _select("SELECT * WHERE { ?s ?p ?o }")

        response.raise_for_status.assert_called_once_with()
        self.assertEqual(rows[0]["device"]["value"], "urn:device:robot")

    @patch("kide_worker.tasks._select")
    def test_device_lookup_rejects_sparql_injection_iri(self, select: Mock) -> None:
        with self.assertRaisesRegex(ValueError, "SPARQL-safe IRI"):
            _device_bindings("urn:cap> } UNION { ?s ?p ?o")
        select.assert_not_called()

    @patch("kide_worker.tasks.requests.post")
    def test_select_rejects_malformed_jena_response(self, post: Mock) -> None:
        response = Mock()
        response.json.return_value = {"unexpected": True}
        post.return_value = response

        with self.assertRaisesRegex(ValueError, "missing results"):
            _select("SELECT * WHERE { ?s ?p ?o }")


if __name__ == "__main__":
    unittest.main()
