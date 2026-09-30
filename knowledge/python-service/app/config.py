from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    arcadedb_url: str = os.getenv("KIDE_ARCADEDB_URL", "http://arcadedb:2480").rstrip("/")
    arcadedb_database: str = os.getenv("KIDE_ARCADEDB_DATABASE", "kide")
    arcadedb_user: str = os.getenv("KIDE_ARCADEDB_USER", "root")
    arcadedb_password: str = os.getenv("KIDE_ARCADEDB_PASSWORD", "kide-local-only")
    ontology_path: str = os.getenv("KIDE_ONTOLOGY_PATH", "/knowledge/ontology/kide-capability.ttl")
    shacl_path: str = os.getenv("KIDE_SHACL_PATH", "/knowledge/ontology/kide-capability.shacl.ttl")
    request_timeout_seconds: float = float(os.getenv("KIDE_ARCADEDB_TIMEOUT_SECONDS", "10"))


settings = Settings()
