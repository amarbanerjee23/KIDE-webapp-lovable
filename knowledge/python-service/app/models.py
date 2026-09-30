from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, Field


KnowledgeScope = Literal["global", "project"]


class KnowledgeNode(BaseModel):
    id: str = Field(min_length=1)
    kind: str = Field(min_length=1)
    label: str = Field(min_length=1)
    scope: KnowledgeScope
    projectId: str | None = None
    sourcePath: str | None = None
    properties: dict[str, str | int | float | bool | list[str]] = Field(default_factory=dict)


class KnowledgeEdge(BaseModel):
    id: str = Field(min_length=1)
    kind: str = Field(min_length=1)
    from_: str = Field(alias="from", min_length=1)
    to: str = Field(min_length=1)
    scope: KnowledgeScope
    projectId: str | None = None
    properties: dict[str, str | int | float | bool | list[str]] = Field(default_factory=dict)

    model_config = {"populate_by_name": True}


class KnowledgeProjection(BaseModel):
    schemaVersion: Literal[1]
    ontologyIri: str
    scope: KnowledgeScope
    projectId: str | None = None
    generatedAt: str
    nodes: list[KnowledgeNode]
    edges: list[KnowledgeEdge]
    diagnostics: list[dict[str, Any]] = Field(default_factory=list)


class IngestResult(BaseModel):
    nodeCount: int
    edgeCount: int
    validationWarnings: list[str] = Field(default_factory=list)


class GraphEntity(BaseModel):
    semanticId: str
    kind: str
    displayName: str
    scope: str
    projectId: str | None = None
    sourcePath: str | None = None
    properties: dict[str, Any] = Field(default_factory=dict)
