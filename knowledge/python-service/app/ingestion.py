from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any, Literal
from urllib.parse import urlparse

from pydantic import BaseModel, Field, HttpUrl

from .models import KnowledgeEdge, KnowledgeNode, KnowledgeProjection
from .ontology import CAPABILITY_TUPLE_EDGES, validate_projection


class SourceDescriptor(BaseModel):
    uri: HttpUrl
    publisher: str = Field(min_length=1)
    license: str = Field(min_length=1)
    retrievedAt: datetime
    sourceType: Literal["manufacturer", "standard", "registry", "curated"]
    version: str | None = None


class DeviceCapabilityInput(BaseModel):
    id: str = Field(min_length=1)
    label: str = Field(min_length=1)
    interface: str | None = None
    behavior: str | None = None
    context: str | None = None
    preconditions: list[str] = Field(default_factory=list)
    postconditions: list[str] = Field(default_factory=list)
    properties: dict[str, str | int | float | bool | list[str]] = Field(default_factory=dict)


class DeviceKnowledgeInput(BaseModel):
    manufacturer: str = Field(min_length=1)
    model: str = Field(min_length=1)
    label: str = Field(min_length=1)
    capabilities: list[DeviceCapabilityInput] = Field(default_factory=list)
    properties: dict[str, str | int | float | bool | list[str]] = Field(default_factory=dict)


class IngestionRequest(BaseModel):
    source: SourceDescriptor
    device: DeviceKnowledgeInput
    confidence: float = Field(ge=0, le=1)
    adapter: Literal["manufacturer-json-v1"] = "manufacturer-json-v1"


class IngestionDecision(BaseModel):
    status: Literal["accepted", "quarantined"]
    reasons: list[str] = Field(default_factory=list)
    canonicalDeviceId: str
    sourceFingerprint: str
    projection: KnowledgeProjection


def _slug(value: str) -> str:
    return "".join(char.lower() if char.isalnum() else "-" for char in value).strip("-")


def _source_fingerprint(request: IngestionRequest) -> str:
    payload = request.model_dump(mode="json")
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _provenance_properties(request: IngestionRequest) -> dict[str, Any]:
    parsed = urlparse(str(request.source.uri))
    return {
        "prov:hadPrimarySource": str(request.source.uri),
        "prov:wasAttributedTo": request.source.publisher,
        "prov:generatedAtTime": request.source.retrievedAt.astimezone(timezone.utc).isoformat(),
        "sourceHost": parsed.hostname or "",
        "sourceType": request.source.sourceType,
        "sourceLicense": request.source.license,
        "sourceVersion": request.source.version or "",
        "confidence": request.confidence,
    }


def normalize(request: IngestionRequest) -> IngestionDecision:
    fingerprint = _source_fingerprint(request)
    device_id = f"urn:kide:device:{_slug(request.device.manufacturer)}:{_slug(request.device.model)}"
    provenance = _provenance_properties(request)

    nodes: list[KnowledgeNode] = [
        KnowledgeNode(
            id=device_id,
            kind="Device",
            label=request.device.label,
            scope="global",
            properties={
                **request.device.properties,
                "manufacturer": request.device.manufacturer,
                "model": request.device.model,
                **provenance,
                "sourceFingerprint": fingerprint,
            },
        )
    ]
    edges: list[KnowledgeEdge] = []
    reasons: list[str] = []

    for capability in request.device.capabilities:
        cap_id = f"{device_id}:capability:{_slug(capability.id)}"
        nodes.append(
            KnowledgeNode(
                id=cap_id,
                kind="Capability",
                label=capability.label,
                scope="global",
                properties={
                    **capability.properties,
                    **provenance,
                    "sourceFingerprint": fingerprint,
                },
            )
        )
        edges.append(
            KnowledgeEdge(
                id=f"{device_id}:hasCapability:{_slug(capability.id)}",
                kind="hasCapability",
                **{"from": device_id},
                to=cap_id,
                scope="global",
            )
        )

        contract: list[tuple[str, str, str | None | list[str]]] = [
            ("hasInterface", "Interface", capability.interface),
            ("hasBehavior", "Behavior", capability.behavior),
            ("hasContext", "Context", capability.context),
            ("hasPrecondition", "Precondition", capability.preconditions),
            ("hasPostcondition", "Postcondition", capability.postconditions),
        ]
        present: set[str] = set()
        for edge_kind, node_kind, raw in contract:
            values = raw if isinstance(raw, list) else ([raw] if raw else [])
            for index, value in enumerate(values):
                semantic_id = f"{cap_id}:{_slug(edge_kind)}:{_slug(value)}:{index}"
                nodes.append(
                    KnowledgeNode(
                        id=semantic_id,
                        kind=node_kind,
                        label=value,
                        scope="global",
                        properties={**provenance, "sourceFingerprint": fingerprint},
                    )
                )
                edges.append(
                    KnowledgeEdge(
                        id=f"{cap_id}:{_slug(edge_kind)}:{index}",
                        kind=edge_kind,
                        **{"from": cap_id},
                        to=semantic_id,
                        scope="global",
                    )
                )
                present.add(edge_kind)

        missing = sorted(CAPABILITY_TUPLE_EDGES - present)
        if missing:
            reasons.append(
                f"Capability {capability.id} is incomplete: missing " + ", ".join(missing)
            )

    if not request.device.capabilities:
        reasons.append("Device has no capabilities.")
    if request.confidence < 0.8:
        reasons.append("Confidence is below the promotion threshold of 0.80.")
    if request.source.license.strip().lower() in {"unknown", "unlicensed", "none"}:
        reasons.append("Source license is not acceptable for promotion.")

    projection = KnowledgeProjection(
        schemaVersion=1,
        ontologyIri="https://kide.dev/ontology/capability",
        scope="global",
        generatedAt=request.source.retrievedAt.astimezone(timezone.utc).isoformat(),
        nodes=nodes,
        edges=edges,
        diagnostics=[],
    )
    reasons.extend(validate_projection(projection))
    return IngestionDecision(
        status="accepted" if not reasons else "quarantined",
        reasons=sorted(set(reasons)),
        canonicalDeviceId=device_id,
        sourceFingerprint=fingerprint,
        projection=projection,
    )
