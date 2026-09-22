from typing import Any, Literal

from celery.result import AsyncResult
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from .celery_app import celery_app
from .tasks import synthesize

app = FastAPI(title="KIDE Synthesis API", version="0.2.0")


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ActivitySpec(StrictModel):
    name: str = Field(min_length=1)
    capabilityUri: str = Field(min_length=1)


class TransitionSpec(StrictModel):
    source: str = Field(min_length=1)
    target: str = Field(min_length=1)
    event: str | None = None


class CapabilityMachineSpec(StrictModel):
    capabilityUri: str = Field(min_length=1)
    sessionType: str = Field(min_length=1)
    states: list[str] = Field(min_length=1)
    startStates: list[str] = Field(min_length=1)
    endStates: list[str] = Field(min_length=1)
    transitions: list[TransitionSpec] = Field(default_factory=list)


class ExecutionGroupSpec(StrictModel):
    kind: Literal["sequential", "parallel"]
    activities: list[str] = Field(min_length=2)


class SynthesisRequest(StrictModel):
    projectId: str = Field(min_length=1)
    activities: list[ActivitySpec] = Field(min_length=1)
    capabilityMachines: list[CapabilityMachineSpec] = Field(min_length=1)
    executionPlan: list[ExecutionGroupSpec] = Field(default_factory=list)


@app.get("/healthz")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/v1/synthesis", status_code=202)
def create_synthesis(request: SynthesisRequest) -> dict[str, str]:
    result = synthesize.delay(request.model_dump())
    return {"jobId": result.id, "status": "queued"}


@app.get("/api/v1/synthesis/{job_id}")
def get_synthesis(job_id: str) -> dict[str, Any]:
    result = AsyncResult(job_id, app=celery_app)
    body: dict[str, Any] = {"jobId": job_id, "status": result.state.lower()}

    if result.state == "PROGRESS":
        body["progress"] = result.info
    elif result.successful():
        body["result"] = result.result
    elif result.failed():
        body["error"] = str(result.result)

    return body


@app.get("/readyz")
def ready() -> dict[str, str]:
    inspection = celery_app.control.inspect(timeout=1.0)
    try:
        ping = inspection.ping()
    except Exception as exc:  # pragma: no cover - infrastructure boundary
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if not ping:
        raise HTTPException(status_code=503, detail="no synthesis workers available")
    return {"status": "ready"}
