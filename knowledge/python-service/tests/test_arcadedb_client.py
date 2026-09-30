import json

import httpx

import app.arcadedb as module
from app.arcadedb import ArcadeDB
from app.config import Settings


def test_entities_decodes_properties(monkeypatch) -> None:
    db = ArcadeDB()
    monkeypatch.setattr(
        db,
        "_db_request",
        lambda *args, **kwargs: {
            "result": [
                {
                    "semanticId": "urn:device:1",
                    "kind": "Device",
                    "displayName": "Robot",
                    "scope": "global",
                    "projectId": "",
                    "sourcePath": "",
                    "propertiesJson": json.dumps({"vendor": "Acme"}),
                }
            ]
        },
    )
    entities = db.entities("Device")
    assert entities[0].semanticId == "urn:device:1"
    assert entities[0].properties == {"vendor": "Acme"}


def test_ping_fails_closed(monkeypatch) -> None:
    db = ArcadeDB()

    def fail(*args, **kwargs):
        raise httpx.ConnectError("offline")

    monkeypatch.setattr(db, "_db_request", fail)
    assert db.ping() is False


def test_settings_use_explicit_arcadedb_endpoint() -> None:
    settings = Settings(
        arcadedb_url="http://graph:2480",
        arcadedb_database="kide",
        arcadedb_user="root",
        arcadedb_password="not-a-real-secret",
        ontology_path="/tmp/ontology.ttl",
        shacl_path="/tmp/shacl.ttl",
        request_timeout_seconds=5,
    )
    assert settings.arcadedb_url == "http://graph:2480"
