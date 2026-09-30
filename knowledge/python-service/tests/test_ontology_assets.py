from pathlib import Path

import app.ontology as ontology
from app.config import Settings


def test_repository_ontology_and_shacl_assets_validate(monkeypatch) -> None:
    knowledge_dir = Path(__file__).resolve().parents[2]
    monkeypatch.setattr(
        ontology,
        "settings",
        Settings(
            arcadedb_url="http://unused:2480",
            arcadedb_database="kide",
            arcadedb_user="root",
            arcadedb_password="unused-password",
            ontology_path=str(knowledge_dir / "ontology" / "kide-capability.ttl"),
            shacl_path=str(knowledge_dir / "ontology" / "kide-capability.shacl.ttl"),
            request_timeout_seconds=1,
        ),
    )
    assert ontology.validate_ontology_assets() == []
