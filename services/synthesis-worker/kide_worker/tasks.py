import os
from collections import defaultdict
from typing import Any

import requests

from .celery_app import celery_app

JENA_QUERY_URL = os.getenv("JENA_QUERY_URL", "http://jena:3030/kide/query")
HTTP_TIMEOUT_SECONDS = float(os.getenv("HTTP_TIMEOUT_SECONDS", "5"))


class SessionTypeError(ValueError):
    """Raised when adjacent capability interaction contracts are incompatible."""


def _select(query: str) -> list[dict[str, Any]]:
    response = requests.post(
        JENA_QUERY_URL,
        data={"query": query},
        headers={"Accept": "application/sparql-results+json"},
        timeout=HTTP_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    return response.json().get("results", {}).get("bindings", [])


def _device_bindings(capability_uri: str) -> list[dict[str, Any]]:
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


def _value(binding: dict[str, Any], key: str) -> str | None:
    item = binding.get(key)
    return item.get("value") if isinstance(item, dict) else None


@celery_app.task(bind=True, name="kide.synthesize")
def synthesize(self: Any, payload: dict[str, Any]) -> dict[str, Any]:
    """
    Phase-1 server-side composition boundary.

    The task resolves every requested capability against Jena, groups selected
    machines deterministically, and returns evidence suitable for the web UI.
    Sequential/parallel SACE state-machine construction is added in Phase 2.
    """
    project_id = str(payload.get("projectId") or "").strip()
    activities = payload.get("activities")
    if not project_id:
        raise ValueError("projectId is required")
    if not isinstance(activities, list) or not activities:
        raise ValueError("activities must be a non-empty list")

    self.update_state(state="PROGRESS", meta={"stage": "semantic-resolution", "percent": 10})

    resolved: list[dict[str, Any]] = []
    by_device: dict[str, list[str]] = defaultdict(list)

    for index, activity in enumerate(activities):
        if not isinstance(activity, dict):
            raise ValueError(f"activity[{index}] must be an object")
        name = str(activity.get("name") or f"activity-{index + 1}")
        capability_uri = str(activity.get("capabilityUri") or "").strip()
        if not capability_uri:
            raise ValueError(f"{name}: capabilityUri is required")

        candidates = _device_bindings(capability_uri)
        if not candidates:
            raise LookupError(f"{name}: no device offers {capability_uri}")

        chosen = candidates[0]
        device = _value(chosen, "device")
        if not device:
            raise LookupError(f"{name}: Jena returned a device without a URI")

        session_type = _value(chosen, "sessionType")
        resolved.append(
            {
                "activity": name,
                "capabilityUri": capability_uri,
                "deviceUri": device,
                "sessionType": session_type,
            }
        )
        by_device[device].append(name)
        self.update_state(
            state="PROGRESS",
            meta={
                "stage": "semantic-resolution",
                "percent": 10 + round(((index + 1) / len(activities)) * 70),
            },
        )

    controllers = [
        {"deviceUri": device, "activities": names}
        for device, names in sorted(by_device.items(), key=lambda item: item[0])
    ]

    return {
        "projectId": project_id,
        "status": "completed",
        "algorithm": "COMPOSEMACHINES-phase1",
        "bindings": resolved,
        "controllers": controllers,
        "evidence": {
            "semanticSource": JENA_QUERY_URL,
            "deterministicOrdering": True,
            "resolvedActivities": len(resolved),
        },
    }
