import os
import unittest
from unittest.mock import Mock, patch

os.environ.setdefault("CELERY_BROKER_URL", "memory://")

from kide_worker.tasks import _select, compose_machines


def binding(device: str, session_type: str | None = None) -> dict:
    result = {"device": {"type": "uri", "value": device}}
    if session_type is not None:
        result["sessionType"] = {"type": "uri", "value": session_type}
    return result


class ComposeMachinesTests(unittest.TestCase):
    def test_rejects_missing_project(self) -> None:
        with self.assertRaisesRegex(ValueError, "projectId is required"):
            compose_machines({"activities": [{"name": "Move", "capabilityUri": "urn:move"}]})

    def test_rejects_empty_activities(self) -> None:
        with self.assertRaisesRegex(ValueError, "non-empty list"):
            compose_machines({"projectId": "p1", "activities": []})

    def test_rejects_missing_capability(self) -> None:
        with self.assertRaisesRegex(ValueError, "capabilityUri is required"):
            compose_machines({"projectId": "p1", "activities": [{"name": "Move"}]})

    def test_fails_closed_when_no_device_offers_capability(self) -> None:
        with self.assertRaisesRegex(LookupError, "no device offers"):
            compose_machines(
                {"projectId": "p1", "activities": [{"name": "Move", "capabilityUri": "urn:move"}]},
                device_lookup=lambda _: [],
            )

    def test_deterministically_selects_lexicographically_first_device(self) -> None:
        result = compose_machines(
            {"projectId": "p1", "activities": [{"name": "Move", "capabilityUri": "urn:move"}]},
            device_lookup=lambda _: [binding("urn:device:z"), binding("urn:device:a")],
        )
        self.assertEqual(result["bindings"][0]["deviceUri"], "urn:device:a")
        self.assertTrue(result["evidence"]["deterministicOrdering"])

    def test_groups_activities_by_device_and_reports_progress(self) -> None:
        progress: list[dict] = []
        result = compose_machines(
            {
                "projectId": "p1",
                "activities": [
                    {"name": "Move", "capabilityUri": "urn:move"},
                    {"name": "Stop", "capabilityUri": "urn:stop"},
                ],
            },
            device_lookup=lambda _: [binding("urn:device:robot", "urn:session:sync")],
            progress=progress.append,
        )
        self.assertEqual(
            result["controllers"],
            [{"deviceUri": "urn:device:robot", "activities": ["Move", "Stop"]}],
        )
        self.assertEqual(progress[0], {"stage": "semantic-resolution", "percent": 10})
        self.assertEqual(progress[-1], {"stage": "composition", "percent": 100})
        self.assertTrue(all(0 <= item["percent"] <= 100 for item in progress))


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

    @patch("kide_worker.tasks.requests.post")
    def test_select_rejects_malformed_jena_response(self, post: Mock) -> None:
        response = Mock()
        response.json.return_value = {"unexpected": True}
        post.return_value = response

        with self.assertRaisesRegex(ValueError, "missing results"):
            _select("SELECT * WHERE { ?s ?p ?o }")


if __name__ == "__main__":
    unittest.main()
