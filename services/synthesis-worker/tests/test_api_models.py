import os
import unittest

os.environ.setdefault("CELERY_BROKER_URL", "memory://")

from pydantic import ValidationError

from kide_worker.api import SynthesisRequest


class SynthesisRequestModelTests(unittest.TestCase):
    def valid_request(self) -> dict:
        return {
            "projectId": "project-1",
            "activities": [
                {"name": "Move", "capabilityUri": "urn:capability:move"},
                {"name": "Stop", "capabilityUri": "urn:capability:stop"},
            ],
            "capabilityMachines": [
                {
                    "capabilityUri": "urn:capability:move",
                    "sessionType": "urn:session:sync",
                    "states": ["idle", "done"],
                    "startStates": ["idle"],
                    "endStates": ["done"],
                    "transitions": [
                        {"source": "idle", "target": "done", "event": "finish"}
                    ],
                },
                {
                    "capabilityUri": "urn:capability:stop",
                    "sessionType": "urn:session:sync",
                    "states": ["idle", "done"],
                    "startStates": ["idle"],
                    "endStates": ["done"],
                    "transitions": [],
                },
            ],
            "executionPlan": [
                {"kind": "sequential", "activities": ["Move", "Stop"]}
            ],
        }

    def test_accepts_typed_composemachines_request(self) -> None:
        request = SynthesisRequest.model_validate(self.valid_request())
        self.assertEqual(request.activities[0].name, "Move")
        self.assertEqual(request.executionPlan[0].kind, "sequential")

    def test_rejects_unknown_fields(self) -> None:
        request = self.valid_request()
        request["unexpected"] = True
        with self.assertRaises(ValidationError):
            SynthesisRequest.model_validate(request)

    def test_rejects_invalid_execution_kind(self) -> None:
        request = self.valid_request()
        request["executionPlan"][0]["kind"] = "sometimes"
        with self.assertRaises(ValidationError):
            SynthesisRequest.model_validate(request)

    def test_requires_capability_machine_definitions(self) -> None:
        request = self.valid_request()
        request["capabilityMachines"] = []
        with self.assertRaises(ValidationError):
            SynthesisRequest.model_validate(request)

    def test_allows_server_resolved_session_type(self) -> None:
        request = self.valid_request()
        request["capabilityMachines"][0].pop("sessionType")
        model = SynthesisRequest.model_validate(request)
        self.assertIsNone(model.capabilityMachines[0].sessionType)


if __name__ == "__main__":
    unittest.main()
