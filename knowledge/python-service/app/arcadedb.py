from __future__ import annotations

import json
import time
from contextlib import contextmanager
from typing import Any, Iterator

import httpx

from .config import settings
from .models import GraphEntity, KnowledgeProjection


class ArcadeDBError(RuntimeError):
    pass


class ArcadeDB:
    def __init__(self) -> None:
        self._auth = (settings.arcadedb_user, settings.arcadedb_password)
        self._timeout = settings.request_timeout_seconds

    @contextmanager
    def _client(self) -> Iterator[httpx.Client]:
        with httpx.Client(
            base_url=settings.arcadedb_url,
            auth=self._auth,
            timeout=self._timeout,
        ) as client:
            yield client

    def _server_command(self, command: str) -> dict[str, Any]:
        with self._client() as client:
            response = client.post("/api/v1/server", json={"command": command})
            response.raise_for_status()
            return response.json()

    def _db_request(
        self,
        operation: str,
        command: str,
        *,
        language: str = "sql",
        params: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        with self._client() as client:
            response = client.post(
                f"/api/v1/{operation}/{settings.arcadedb_database}",
                json={
                    "language": language,
                    "command": command,
                    "params": params or {},
                },
            )
            if response.status_code >= 400:
                raise ArcadeDBError(
                    f"ArcadeDB {operation} failed ({response.status_code}): {response.text[:500]}"
                )
            return response.json()

    def ensure_database(self) -> None:
        try:
            self._db_request("query", "SELECT 1")
            return
        except Exception:
            pass
        try:
            self._server_command(f"create database {settings.arcadedb_database}")
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code not in {400, 409, 500}:
                raise

    def ensure_schema(self) -> None:
        commands = [
            "CREATE VERTEX TYPE KideEntity IF NOT EXISTS",
            "CREATE PROPERTY KideEntity.semanticId IF NOT EXISTS STRING",
            "CREATE PROPERTY KideEntity.kind IF NOT EXISTS STRING",
            "CREATE PROPERTY KideEntity.displayName IF NOT EXISTS STRING",
            "CREATE PROPERTY KideEntity.scope IF NOT EXISTS STRING",
            "CREATE PROPERTY KideEntity.projectId IF NOT EXISTS STRING",
            "CREATE PROPERTY KideEntity.sourcePath IF NOT EXISTS STRING",
            "CREATE PROPERTY KideEntity.propertiesJson IF NOT EXISTS STRING",
            "CREATE INDEX IF NOT EXISTS ON KideEntity (semanticId) UNIQUE",
            "CREATE EDGE TYPE SemanticRelation IF NOT EXISTS",
            "CREATE PROPERTY SemanticRelation.semanticId IF NOT EXISTS STRING",
            "CREATE PROPERTY SemanticRelation.kind IF NOT EXISTS STRING",
            "CREATE PROPERTY SemanticRelation.scope IF NOT EXISTS STRING",
            "CREATE PROPERTY SemanticRelation.projectId IF NOT EXISTS STRING",
            "CREATE PROPERTY SemanticRelation.propertiesJson IF NOT EXISTS STRING",
        ]
        for command in commands:
            self._db_request("command", command)

    def server_ready(self) -> bool:
        try:
            with self._client() as client:
                response = client.get("/api/v1/ready")
                return response.is_success
        except Exception:
            return False

    def initialize(self, attempts: int = 60, delay_seconds: float = 1.0) -> None:
        for attempt in range(attempts):
            if self.server_ready():
                self.ensure_database()
                self.ensure_schema()
                return
            if attempt + 1 < attempts:
                time.sleep(delay_seconds)
        raise ArcadeDBError("ArcadeDB did not become ready before the semantic service startup deadline.")

    def ping(self) -> bool:
        try:
            self._db_request("query", "SELECT 1")
            return True
        except Exception:
            return False

    def replace_projection(self, projection: KnowledgeProjection) -> tuple[int, int]:
        self.ensure_database()
        self.ensure_schema()

        scope = projection.scope
        project_id = projection.projectId or ""

        if scope == "project":
            self._db_request(
                "command",
                "DELETE FROM KideEntity WHERE scope = :scope AND projectId = :projectId",
                params={"scope": scope, "projectId": project_id},
            )

        for node in projection.nodes:
            payload = {
                "semanticId": node.id,
                "kind": node.kind,
                "displayName": node.label,
                "scope": node.scope,
                "projectId": node.projectId or project_id,
                "sourcePath": node.sourcePath or "",
                "propertiesJson": json.dumps(node.properties, separators=(",", ":")),
            }
            self._db_request(
                "command",
                (
                    "UPDATE KideEntity SET kind = :kind, displayName = :displayName, "
                    "scope = :scope, projectId = :projectId, sourcePath = :sourcePath, "
                    "propertiesJson = :propertiesJson, semanticId = :semanticId "
                    "UPSERT WHERE semanticId = :semanticId"
                ),
                params=payload,
            )

        for edge in projection.edges:
            params = {
                "semanticId": edge.id,
                "kind": edge.kind,
                "scope": edge.scope,
                "projectId": edge.projectId or project_id,
                "propertiesJson": json.dumps(edge.properties, separators=(",", ":")),
                "fromId": edge.from_,
                "toId": edge.to,
            }
            self._db_request(
                "command",
                (
                    "CREATE EDGE SemanticRelation "
                    "FROM (SELECT FROM KideEntity WHERE semanticId = :fromId) "
                    "TO (SELECT FROM KideEntity WHERE semanticId = :toId) "
                    "IF NOT EXISTS "
                    "SET semanticId = :semanticId, kind = :kind, scope = :scope, "
                    "projectId = :projectId, propertiesJson = :propertiesJson"
                ),
                params=params,
            )

        return len(projection.nodes), len(projection.edges)

    def entities(self, kind: str, limit: int = 100) -> list[GraphEntity]:
        result = self._db_request(
            "query",
            "SELECT FROM KideEntity WHERE kind = :kind LIMIT :limit",
            params={"kind": kind, "limit": limit},
        )
        rows = result.get("result", [])
        entities: list[GraphEntity] = []
        for row in rows:
            raw_properties = row.get("propertiesJson") or "{}"
            try:
                properties = json.loads(raw_properties)
            except json.JSONDecodeError:
                properties = {}
            entities.append(
                GraphEntity(
                    semanticId=row["semanticId"],
                    kind=row["kind"],
                    displayName=row.get("displayName") or row["semanticId"],
                    scope=row.get("scope") or "global",
                    projectId=row.get("projectId") or None,
                    sourcePath=row.get("sourcePath") or None,
                    properties=properties,
                )
            )
        return entities

    def devices_for_capability(self, capability_id: str, limit: int = 100) -> list[GraphEntity]:
        result = self._db_request(
            "query",
            (
                "MATCH {type: KideEntity, as: cap, where: (semanticId = :capabilityId)}"
                ".(inE('SemanticRelation'){where: (kind = 'hasCapability')}.outV())"
                "{as: device, where: (kind = 'Device')} "
                "RETURN device LIMIT :limit"
            ),
            params={"capabilityId": capability_id, "limit": limit},
        )
        rows = result.get("result", [])
        entities: list[GraphEntity] = []
        for wrapper in rows:
            row = wrapper.get("device", wrapper)
            raw_properties = row.get("propertiesJson") or "{}"
            entities.append(
                GraphEntity(
                    semanticId=row["semanticId"],
                    kind=row["kind"],
                    displayName=row.get("displayName") or row["semanticId"],
                    scope=row.get("scope") or "global",
                    projectId=row.get("projectId") or None,
                    sourcePath=row.get("sourcePath") or None,
                    properties=json.loads(raw_properties),
                )
            )
        return entities
