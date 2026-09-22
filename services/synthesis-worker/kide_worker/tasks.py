import os
from collections import defaultdict
from collections.abc import Callable
from typing import Any

import requests

from .celery_app import celery_app

JENA_QUERY_URL = os.getenv("JENA_QUERY_URL", "http://jena:3030/kide/query")
HTTP_TIMEOUT_SECONDS = float(os.getenv("HTTP_TIMEOUT_SECONDS", "5"))

Binding = dict[str, Any]
DeviceLookup = Callable[[str], list[Binding]]
ProgressCallback = Callable[[dict[str, Any]], None]


class SessionTypeError(ValueError):
    """Raised when adjacent capability interaction contracts are incompatible."""


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


def _value(binding: Binding, key: str) -> str | None:
    item = binding.get(key)
    if not isinstance(item, dict):
        return None
    value = item.get("value")
    return value if isinstance(value, str) and value else None


def compose_machines(
    payload: dict[str, Any],
    *,
    device_lookup: DeviceLookup = _device_bindings,
    progress: ProgressCallback | None = None,
) -> dict[str, Any]:
    """Resolve activity capabilities into a deterministic per-device controller plan."""
    project_id = str(payload.get("projectId") or "").strip()
    activities = payload.get("activities")
    if not project_id:
        raise ValueError("projectId is required")
    if not isinstance(activities, list) or not activities:
        raise ValueError("activities must be a non-empty list")

    if progress:
        progress({"stage": "semantic-resolution", "percent": 10})

    resolved: list[dict[str, Any]] = []
    by_device: dict[str, list[str]] = defaultdict(list)

    for index, activity in enumerate(activities):
        if not isinstance(activity, dict):
            raise ValueError(f"activity[{index}] must be an object")

        name = str(activity.get("name") or f"activity-{index + 1}").strip()
        capability_uri = str(activity.get("capabilityUri") or "").strip()
        if not capability_uri:
            raise ValueError(f"{name}: capabilityUri is required")

        candidates = device_lookup(capability_uri)
        valid_candidates = [
            (_value(candidate, "device"), _value(candidate, "sessionType"))
            for candidate in candidates
            if isinstance(candidate, dict)
        ]
        valid_candidates = [
            (device, session_type)
            for device, session_type in valid_candidates
            if device is not None
        ]
        if not valid_candidates:
            raise LookupError(f"{name}: no device offers {capability_uri}")

        device, session_type = min(valid_candidates, key=lambda candidate: candidate[0])
        resolved.append(
            {
                "activity": name,
                "capabilityUri": capability_uri,
                "deviceUri": device,
                "sessionType": session_type,
            }
        )
        by_device[device].append(name)

        if progress:
            progress(
                {
                    "stage": "semantic-resolution",
                    "percent": min(
                        80,
                        10 + round(((index + 1) / len(activities)) * 70),
                    ),
                }
            )

    controllers = [
        {"deviceUri": device, "activities": names}
        for device, names in sorted(by_device.items(), key=lambda item: item[0])
    ]

    if progress:
        progress({"stage": "composition", "percent": 100})

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


@celery_app.task(bind=True, name="kide.synthesize")
def synthesize(self: Any, payload: dict[str, Any]) -> dict[str, Any]:
    """
    Execute the Phase-1 server-side composition boundary.

    Full sequential/parallel SACE state-machine construction and session
    contract checking are intentionally reserved for the next phase.
    """
    return compose_machines(
        payload,
        progress=lambda meta: self.update_state(state="PROGRESS", meta=meta),
    )
