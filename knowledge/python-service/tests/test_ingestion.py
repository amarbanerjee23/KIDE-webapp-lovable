from datetime import datetime, timezone

from app.ingestion import IngestionRequest, normalize


def request(**overrides):
    payload = {
        "source": {
            "uri": "https://manufacturer.example/devices/robot-1",
            "publisher": "Example Robotics",
            "license": "CC-BY-4.0",
            "retrievedAt": datetime(2026, 10, 1, tzinfo=timezone.utc),
            "sourceType": "manufacturer",
            "version": "1.2",
        },
        "device": {
            "manufacturer": "Example Robotics",
            "model": "R1",
            "label": "Example R1",
            "capabilities": [
                {
                    "id": "move",
                    "label": "Move",
                    "interface": "Motion",
                    "behavior": "Translate",
                    "context": "IndoorCell",
                    "preconditions": ["Ready"],
                    "postconditions": ["Moved"],
                }
            ],
        },
        "confidence": 0.95,
    }
    payload.update(overrides)
    return IngestionRequest.model_validate(payload)


def test_complete_trusted_device_is_accepted() -> None:
    decision = normalize(request())
    assert decision.status == "accepted"
    assert decision.reasons == []
    device = decision.projection.nodes[0]
    assert device.properties["prov:hadPrimarySource"].startswith("https://manufacturer.example")
    assert device.properties["sourceLicense"] == "CC-BY-4.0"
    assert device.properties["confidence"] == 0.95


def test_incomplete_capability_is_quarantined() -> None:
    value = request().model_dump(mode="json")
    value["device"]["capabilities"][0]["postconditions"] = []
    decision = normalize(IngestionRequest.model_validate(value))
    assert decision.status == "quarantined"
    assert any("hasPostcondition" in reason for reason in decision.reasons)


def test_low_confidence_is_quarantined() -> None:
    value = request().model_dump(mode="json")
    value["confidence"] = 0.5
    decision = normalize(IngestionRequest.model_validate(value))
    assert decision.status == "quarantined"
    assert any("0.80" in reason for reason in decision.reasons)


def test_unknown_license_is_quarantined() -> None:
    value = request().model_dump(mode="json")
    value["source"]["license"] = "unknown"
    decision = normalize(IngestionRequest.model_validate(value))
    assert decision.status == "quarantined"


def test_normalization_is_deterministic() -> None:
    first = normalize(request())
    second = normalize(request())
    assert first.sourceFingerprint == second.sourceFingerprint
    assert first.projection.model_dump() == second.projection.model_dump()
