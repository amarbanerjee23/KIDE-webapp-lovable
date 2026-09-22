import asyncio
import json
from collections.abc import AsyncIterator
from typing import Any, Literal

from celery.result import AsyncResult
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field

from .celery_app import celery_app
from .tasks import synthesize

app = FastAPI(title="KIDE Synthesis API", version="0.3.0")


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
    sessionType: str | None = None
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


def _job_snapshot(result: AsyncResult) -> dict[str, Any]:
    state = result.state.upper()
    body: dict[str, Any] = {
        "jobId": result.id,
        "status": state.lower(),
    }

    if state == "PROGRESS":
        body["progress"] = result.info
    elif state == "SUCCESS":
        body["status"] = "completed"
        body["result"] = result.result
    elif state in {"FAILURE", "REVOKED"}:
        body["status"] = "failed"
        body["error"] = str(result.result)
    return body


def _sse_payload(snapshot: dict[str, Any]) -> str:
    return f"data: {json.dumps(snapshot, separators=(',', ':'))}\n\n"


async def _job_events(
    job_id: str,
    *,
    poll_interval_seconds: float = 0.5,
) -> AsyncIterator[str]:
    last_payload: str | None = None
    while True:
        snapshot = _job_snapshot(AsyncResult(job_id, app=celery_app))
        payload = _sse_payload(snapshot)
        if payload != last_payload:
            yield payload
            last_payload = payload

        if snapshot["status"] in {"completed", "failed"}:
            return

        await asyncio.sleep(poll_interval_seconds)


@app.get("/healthz")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/v1/synthesis", status_code=202)
def create_synthesis(request: SynthesisRequest) -> dict[str, str]:
    result = synthesize.delay(request.model_dump())
    return {"jobId": result.id, "status": "queued"}


@app.get("/api/v1/synthesis/{job_id}")
def get_synthesis(job_id: str) -> dict[str, Any]:
    return _job_snapshot(AsyncResult(job_id, app=celery_app))


@app.get("/api/v1/synthesis/{job_id}/events")
def synthesis_events(job_id: str) -> StreamingResponse:
    return StreamingResponse(
        _job_events(job_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


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
