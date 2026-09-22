import os
import unittest
from unittest.mock import Mock

os.environ.setdefault("CELERY_BROKER_URL", "memory://")

from kide_worker.api import _job_snapshot, _sse_payload


class SynthesisEventTests(unittest.TestCase):
    def result(self, state: str, *, info=None, value=None) -> Mock:
        result = Mock()
        result.id = "job-1"
        result.state = state
        result.info = info
        result.result = value
        return result

    def test_progress_snapshot_preserves_worker_metadata(self) -> None:
        snapshot = _job_snapshot(
            self.result("PROGRESS", info={"stage": "composition", "percent": 90})
        )
        self.assertEqual(snapshot["status"], "progress")
        self.assertEqual(snapshot["progress"]["percent"], 90)

    def test_success_snapshot_uses_completed_status(self) -> None:
        snapshot = _job_snapshot(
            self.result("SUCCESS", value={"controllers": [{"deviceUri": "urn:device:1"}]})
        )
        self.assertEqual(snapshot["status"], "completed")
        self.assertEqual(len(snapshot["result"]["controllers"]), 1)

    def test_failure_snapshot_does_not_serialize_exception_objects(self) -> None:
        snapshot = _job_snapshot(self.result("FAILURE", value=RuntimeError("boom")))
        self.assertEqual(snapshot, {
            "jobId": "job-1",
            "status": "failed",
            "error": "boom",
        })

    def test_sse_payload_is_single_json_data_event(self) -> None:
        payload = _sse_payload({"jobId": "job-1", "status": "queued"})
        self.assertEqual(
            payload,
            'data: {"jobId":"job-1","status":"queued"}\n\n',
        )


if __name__ == "__main__":
    unittest.main()
