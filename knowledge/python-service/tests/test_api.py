from fastapi.testclient import TestClient

import app.main as main
from app.arcadedb import ArcadeDBError


class FakeDb:
    def __init__(self) -> None:
        self.projection = None

    def ping(self) -> bool:
        return True

    def replace_projection(self, projection):
        self.projection = projection
        return len(projection.nodes), len(projection.edges)

    def entities(self, kind: str, limit: int = 100):
        return []

    def devices_for_capability(self, capability_id: str, limit: int = 100):
        return []


class FailingDb(FakeDb):
    def replace_projection(self, projection):
        raise ArcadeDBError("backend unavailable")


def valid_projection():
    return {
        "schemaVersion": 1,
        "ontologyIri": "https://kide.dev/ontology/capability",
        "scope": "global",
        "generatedAt": "2026-09-30T00:00:00Z",
        "nodes": [
            {"id": "device", "kind": "Device", "label": "Robot", "scope": "global"},
            {"id": "cap", "kind": "Capability", "label": "Move", "scope": "global"},
        ],
        "edges": [
            {
                "id": "edge",
                "kind": "hasCapability",
                "from": "device",
                "to": "cap",
                "scope": "global",
            }
        ],
    }


def test_health_reports_projection_backend(monkeypatch) -> None:
    monkeypatch.setattr(main, "db", FakeDb())
    monkeypatch.setattr(main, "validate_ontology_assets", lambda: [])
    with TestClient(main.app) as client:
        response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["projectionBackend"] == "arcadedb"
    assert response.json()["arcadeDbReady"] is True


def test_ingest_returns_counts_and_contract_warnings(monkeypatch) -> None:
    fake = FakeDb()
    monkeypatch.setattr(main, "db", fake)
    monkeypatch.setattr(main, "validate_ontology_assets", lambda: [])
    with TestClient(main.app) as client:
        response = client.post("/v1/projections", json=valid_projection())
    assert response.status_code == 200
    body = response.json()
    assert body["nodeCount"] == 2
    assert body["edgeCount"] == 1
    assert body["validationWarnings"]
    assert fake.projection is not None


def test_ingest_maps_backend_failure_to_422(monkeypatch) -> None:
    monkeypatch.setattr(main, "db", FailingDb())
    monkeypatch.setattr(main, "validate_ontology_assets", lambda: [])
    with TestClient(main.app) as client:
        response = client.post("/v1/projections", json=valid_projection())
    assert response.status_code == 422
    assert "backend unavailable" in response.json()["detail"]


def test_invalid_projection_is_rejected_before_storage(monkeypatch) -> None:
    fake = FakeDb()
    monkeypatch.setattr(main, "db", fake)
    monkeypatch.setattr(main, "validate_ontology_assets", lambda: [])
    payload = valid_projection()
    payload["ontologyIri"] = "https://example.invalid"
    with TestClient(main.app) as client:
        response = client.post("/v1/projections", json=payload)
    assert response.status_code == 422
    assert fake.projection is None
