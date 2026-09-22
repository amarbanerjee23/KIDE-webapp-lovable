import os
import re
from collections import defaultdict
from collections.abc import Callable
from itertools import combinations
from typing import Any

import requests

from .celery_app import celery_app

JENA_QUERY_URL = os.getenv("JENA_QUERY_URL", "http://jena:3030/kide/query")
HTTP_TIMEOUT_SECONDS = float(os.getenv("HTTP_TIMEOUT_SECONDS", "5"))

Binding = dict[str, Any]
DeviceLookup = Callable[[str], list[Binding]]
SessionTypeLookup = Callable[[str], str]
ProgressCallback = Callable[[dict[str, Any]], None]
_IRI_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9+.-]*:[^\s<>\"{}|^\x60\\]+$")


class SessionTypeError(ValueError):
    """Raised when no device provides the capability with the required session type."""


def _safe_iri(value: str, *, field: str) -> str:
    candidate = value.strip()
    if not _IRI_PATTERN.fullmatch(candidate):
        raise ValueError(f"{field} must be an absolute, SPARQL-safe IRI")
    return candidate


def _select(query: str) -> list[Binding]:
    response = requests.post(
        JENA_QUERY_URL,
        data={"query": query},
        headers={"Accept": "application/sparql-results+json"},
        timeout=HTTP_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    body = response.json()
    results = body.get("results")
    if not isinstance(results, dict):
        raise ValueError("Jena response is missing results")
    bindings = results.get("bindings")
    if not isinstance(bindings, list):
        raise ValueError("Jena response is missing result bindings")
    return bindings


def _device_bindings(capability_uri: str) -> list[Binding]:
    capability_uri = _safe_iri(capability_uri, field="capabilityUri")
    query = f"""
PREFIX kide: <http://iiit.serc.com/ontologies/capability.owl#>
SELECT ?device ?sessionType WHERE {{
  ?device a kide:Device ;
          kide:hasCapability <{capability_uri}> .
  OPTIONAL {{ ?device kide:sessionType ?sessionType . }}
}}
ORDER BY ?device
"""
    return _select(query)


def _capability_session_type(capability_uri: str) -> str:
    capability_uri = _safe_iri(capability_uri, field="capabilityUri")
    rows = _select(
        f"""
PREFIX kide: <http://iiit.serc.com/ontologies/capability.owl#>
SELECT DISTINCT ?sessionType WHERE {{
  <{capability_uri}> kide:sessionType ?sessionType .
}}
ORDER BY ?sessionType
"""
    )
    session_types = sorted(
        {
            value
            for row in rows
            if isinstance(row, dict)
            for value in [_value(row, "sessionType")]
            if value is not None
        }
    )
    if not session_types:
        raise SessionTypeError(
            f"capability {capability_uri} has no declared session type in Jena",
        )
    if len(session_types) > 1:
        raise SessionTypeError(
            f"capability {capability_uri} declares multiple session types: "
            + ", ".join(session_types),
        )
    return session_types[0]


def _value(binding: Binding, key: str) -> str | None:
    item = binding.get(key)
    if not isinstance(item, dict):
        return None
    value = item.get("value")
    return value if isinstance(value, str) and value else None


def _required_string(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} is required")
    return value.strip()


def _string_list(value: Any, field: str, *, non_empty: bool = True) -> list[str]:
    if not isinstance(value, list):
        raise ValueError(f"{field} must be a list")
    result: list[str] = []
    seen: set[str] = set()
    for index, item in enumerate(value):
        text = _required_string(item, f"{field}[{index}]")
        if text in seen:
            raise ValueError(f"{field} contains duplicate value '{text}'")
        seen.add(text)
        result.append(text)
    if non_empty and not result:
        raise ValueError(f"{field} must be a non-empty list")
    return result


def _machine_definitions(
    payload: dict[str, Any],
    *,
    session_type_lookup: SessionTypeLookup,
) -> dict[str, dict[str, Any]]:
    raw_machines = payload.get("capabilityMachines")
    if not isinstance(raw_machines, list) or not raw_machines:
        raise ValueError("capabilityMachines must be a non-empty list")

    machines: dict[str, dict[str, Any]] = {}
    for index, raw in enumerate(raw_machines):
        if not isinstance(raw, dict):
            raise ValueError(f"capabilityMachines[{index}] must be an object")

        capability_uri = _safe_iri(
            _required_string(raw.get("capabilityUri"), f"capabilityMachines[{index}].capabilityUri"),
            field=f"capabilityMachines[{index}].capabilityUri",
        )
        if capability_uri in machines:
            raise ValueError(f"duplicate capability machine for {capability_uri}")

        raw_session_type = raw.get("sessionType")
        if raw_session_type is None:
            session_type = session_type_lookup(capability_uri)
        else:
            session_type = _safe_iri(
                _required_string(
                    raw_session_type,
                    f"capabilityMachines[{index}].sessionType",
                ),
                field=f"capabilityMachines[{index}].sessionType",
            )
        states = _string_list(raw.get("states"), f"capabilityMachines[{index}].states")
        start_states = _string_list(
            raw.get("startStates"),
            f"capabilityMachines[{index}].startStates",
        )
        end_states = _string_list(
            raw.get("endStates"),
            f"capabilityMachines[{index}].endStates",
        )
        state_set = set(states)

        for state in [*start_states, *end_states]:
            if state not in state_set:
                raise ValueError(
                    f"capability machine {capability_uri} references unknown state '{state}'",
                )

        raw_transitions = raw.get("transitions", [])
        if not isinstance(raw_transitions, list):
            raise ValueError(f"capabilityMachines[{index}].transitions must be a list")

        transitions: list[dict[str, str | None]] = []
        for transition_index, transition in enumerate(raw_transitions):
            if not isinstance(transition, dict):
                raise ValueError(
                    f"capabilityMachines[{index}].transitions[{transition_index}] must be an object",
                )
            source = _required_string(
                transition.get("source"),
                f"capabilityMachines[{index}].transitions[{transition_index}].source",
            )
            target = _required_string(
                transition.get("target"),
                f"capabilityMachines[{index}].transitions[{transition_index}].target",
            )
            if source not in state_set or target not in state_set:
                raise ValueError(
                    f"capability machine {capability_uri} transition references an unknown state",
                )
            event = transition.get("event")
            if event is not None:
                event = _required_string(
                    event,
                    f"capabilityMachines[{index}].transitions[{transition_index}].event",
                )
            transitions.append({"source": source, "target": target, "event": event})

        machines[capability_uri] = {
            "capabilityUri": capability_uri,
            "sessionType": session_type,
            "states": states,
            "startStates": start_states,
            "endStates": end_states,
            "transitions": transitions,
        }

    return machines


def _activities(payload: dict[str, Any]) -> list[dict[str, str]]:
    raw_activities = payload.get("activities")
    if not isinstance(raw_activities, list) or not raw_activities:
        raise ValueError("activities must be a non-empty list")

    activities: list[dict[str, str]] = []
    names: set[str] = set()
    for index, raw in enumerate(raw_activities):
        if not isinstance(raw, dict):
            raise ValueError(f"activity[{index}] must be an object")

        name = _required_string(raw.get("name"), f"activity[{index}].name")
        if name in names:
            raise ValueError(f"duplicate activity name '{name}'")
        names.add(name)

        capability_uri = _safe_iri(
            _required_string(raw.get("capabilityUri"), f"{name}.capabilityUri"),
            field=f"{name}.capabilityUri",
        )
        activities.append({"name": name, "capabilityUri": capability_uri})

    return activities


def _execution_plan(
    payload: dict[str, Any],
    activity_names: list[str],
) -> list[dict[str, Any]]:
    raw_plan = payload.get("executionPlan")
    if raw_plan is None or raw_plan == []:
        return [{"kind": "sequential", "activities": activity_names}]

    if not isinstance(raw_plan, list):
        raise ValueError("executionPlan must be a list")

    known = set(activity_names)
    covered: set[str] = set()
    sequential_pairs: set[frozenset[str]] = set()
    parallel_pairs: set[frozenset[str]] = set()
    plan: list[dict[str, Any]] = []

    for index, raw_group in enumerate(raw_plan):
        if not isinstance(raw_group, dict):
            raise ValueError(f"executionPlan[{index}] must be an object")

        kind = raw_group.get("kind")
        if kind not in {"sequential", "parallel"}:
            raise ValueError(f"executionPlan[{index}].kind must be sequential or parallel")

        names = _string_list(
            raw_group.get("activities"),
            f"executionPlan[{index}].activities",
        )
        if len(names) < 2:
            raise ValueError(f"executionPlan[{index}] must contain at least two activities")

        unknown = [name for name in names if name not in known]
        if unknown:
            raise ValueError(
                f"executionPlan[{index}] references unknown activities: {', '.join(unknown)}",
            )
        covered.update(names)

        pairs = (
            [frozenset((left, right)) for left, right in zip(names, names[1:])]
            if kind == "sequential"
            else [frozenset(pair) for pair in combinations(names, 2)]
        )
        target_set = sequential_pairs if kind == "sequential" else parallel_pairs
        target_set.update(pairs)
        plan.append({"kind": kind, "activities": names})

    missing = [name for name in activity_names if name not in covered]
    if missing:
        raise ValueError(
            f"executionPlan does not cover activities: {', '.join(missing)}",
        )

    conflicts = sequential_pairs.intersection(parallel_pairs)
    if conflicts:
        pair = sorted(next(iter(conflicts)))
        raise ValueError(
            f"activities '{pair[0]}' and '{pair[1]}' cannot be both sequential and parallel",
        )

    return plan


def _instantiate_machine(
    activity_name: str,
    machine: dict[str, Any],
) -> dict[str, Any]:
    prefix = f"{activity_name}::"
    state_map = {state: f"{prefix}{state}" for state in machine["states"]}
    return {
        "activity": activity_name,
        "capabilityUri": machine["capabilityUri"],
        "sessionType": machine["sessionType"],
        "states": [state_map[state] for state in machine["states"]],
        "startStates": [state_map[state] for state in machine["startStates"]],
        "endStates": [state_map[state] for state in machine["endStates"]],
        "transitions": [
            {
                "source": state_map[transition["source"]],
                "target": state_map[transition["target"]],
                "event": transition["event"],
                "kind": "capability",
            }
            for transition in machine["transitions"]
        ],
    }


def compose_machines(
    payload: dict[str, Any],
    *,
    device_lookup: DeviceLookup = _device_bindings,
    capability_session_lookup: SessionTypeLookup = _capability_session_type,
    progress: ProgressCallback | None = None,
) -> dict[str, Any]:
    """Compose capability machines into deterministic per-device controllers."""
    project_id = _required_string(payload.get("projectId"), "projectId")
    activities = _activities(payload)
    machines = _machine_definitions(
        payload,
        session_type_lookup=capability_session_lookup,
    )
    activity_names = [activity["name"] for activity in activities]
    execution_plan = _execution_plan(payload, activity_names)

    if progress:
        progress({"stage": "validation", "percent": 5})

    resolved: list[dict[str, Any]] = []
    instances: dict[str, dict[str, Any]] = {}

    for index, activity in enumerate(activities):
        name = activity["name"]
        capability_uri = activity["capabilityUri"]
        machine = machines.get(capability_uri)
        if machine is None:
            raise LookupError(f"{name}: no capability machine declared for {capability_uri}")

        candidates = device_lookup(capability_uri)
        candidate_rows = sorted(
            {
                (device, session_type)
                for candidate in candidates
                if isinstance(candidate, dict)
                for device in [_value(candidate, "device")]
                for session_type in [_value(candidate, "sessionType")]
                if device is not None
            },
            key=lambda candidate: (candidate[0], candidate[1] or ""),
        )
        if not candidate_rows:
            raise LookupError(f"{name}: no device offers {capability_uri}")

        expected_session = machine["sessionType"]
        compatible = [
            (device, session_type)
            for device, session_type in candidate_rows
            if session_type == expected_session
        ]
        if not compatible:
            available = ", ".join(
                sorted({session_type or "<missing>" for _, session_type in candidate_rows}),
            )
            raise SessionTypeError(
                f"{name}: requires session type {expected_session}; available: {available}",
            )

        device, session_type = compatible[0]
        instance = _instantiate_machine(name, machine)
        instance["deviceUri"] = device
        instances[name] = instance
        resolved.append(
            {
                "activity": name,
                "capabilityUri": capability_uri,
                "deviceUri": device,
                "sessionType": session_type,
            }
        )

        if progress:
            progress(
                {
                    "stage": "semantic-resolution",
                    "percent": min(
                        60,
                        10 + round(((index + 1) / len(activities)) * 50),
                    ),
                }
            )

    if progress:
        progress({"stage": "machine-instantiation", "percent": 70})

    controllers_by_device: dict[str, dict[str, Any]] = {}
    for binding in resolved:
        name = binding["activity"]
        device = binding["deviceUri"]
        instance = instances[name]
        controller = controllers_by_device.setdefault(
            device,
            {
                "deviceUri": device,
                "activities": [],
                "machines": [],
                "states": [],
                "startStates": [],
                "endStates": [],
                "transitions": [],
            },
        )
        controller["activities"].append(name)
        controller["machines"].append(instance)
        controller["states"].extend(instance["states"])
        controller["transitions"].extend(instance["transitions"])

    incoming_local: set[str] = set()
    outgoing_local: set[str] = set()
    coordination: list[dict[str, Any]] = []
    parallel_groups: list[dict[str, Any]] = []
    synthetic_transition_count = 0

    for group_index, group in enumerate(execution_plan):
        names = group["activities"]
        if group["kind"] == "parallel":
            parallel_groups.append(
                {
                    "groupId": f"parallel-{group_index + 1}",
                    "activities": names,
                    "devices": sorted({instances[name]["deviceUri"] for name in names}),
                }
            )
            continue

        for left_name, right_name in zip(names, names[1:]):
            left = instances[left_name]
            right = instances[right_name]
            if left["deviceUri"] == right["deviceUri"]:
                device = left["deviceUri"]
                outgoing_local.add(left_name)
                incoming_local.add(right_name)
                controller = controllers_by_device[device]
                for source in left["endStates"]:
                    for target in right["startStates"]:
                        controller["transitions"].append(
                            {
                                "source": source,
                                "target": target,
                                "event": None,
                                "kind": "sequential",
                                "fromActivity": left_name,
                                "toActivity": right_name,
                            }
                        )
                        synthetic_transition_count += 1
            else:
                coordination.append(
                    {
                        "kind": "sequential",
                        "fromActivity": left_name,
                        "toActivity": right_name,
                        "fromDeviceUri": left["deviceUri"],
                        "toDeviceUri": right["deviceUri"],
                        "fromStates": left["endStates"],
                        "toStates": right["startStates"],
                    }
                )

    if progress:
        progress({"stage": "composition", "percent": 90})

    controllers: list[dict[str, Any]] = []
    for device, controller in sorted(controllers_by_device.items()):
        controller["activities"].sort()
        controller["machines"].sort(key=lambda machine: machine["activity"])
        controller["states"] = sorted(set(controller["states"]))
        controller["transitions"].sort(
            key=lambda transition: (
                transition["source"],
                transition["target"],
                transition["kind"],
                transition.get("event") or "",
            )
        )
        controller["startStates"] = sorted(
            state
            for machine in controller["machines"]
            if machine["activity"] not in incoming_local
            for state in machine["startStates"]
        )
        controller["endStates"] = sorted(
            state
            for machine in controller["machines"]
            if machine["activity"] not in outgoing_local
            for state in machine["endStates"]
        )
        controllers.append(controller)

    coordination.sort(
        key=lambda item: (
            item["fromActivity"],
            item["toActivity"],
            item["fromDeviceUri"],
            item["toDeviceUri"],
        )
    )
    parallel_groups.sort(key=lambda item: item["groupId"])

    if progress:
        progress({"stage": "serialization", "percent": 100})

    return {
        "projectId": project_id,
        "status": "completed",
        "algorithm": "COMPOSEMACHINES-v2",
        "bindings": resolved,
        "controllers": controllers,
        "coordination": coordination,
        "parallelGroups": parallel_groups,
        "executionPlan": execution_plan,
        "evidence": {
            "semanticSource": JENA_QUERY_URL,
            "deterministicOrdering": True,
            "resolvedActivities": len(resolved),
            "sessionTypesValidated": len(resolved),
            "syntheticTransitions": synthetic_transition_count,
            "crossDeviceCoordinations": len(coordination),
            "parallelGroups": len(parallel_groups),
        },
    }


@celery_app.task(bind=True, name="kide.synthesize")
def synthesize(self: Any, payload: dict[str, Any]) -> dict[str, Any]:
    """Execute deterministic server-side KIDE machine composition."""
    return compose_machines(
        payload,
        progress=lambda meta: self.update_state(state="PROGRESS", meta=meta),
    )
