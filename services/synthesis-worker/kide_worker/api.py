from typing import Any

from celery.result import AsyncResult
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from .celery_app import celery_app
from .tasks import synthesize

app = FastAPI(title="KIDE Synthesis API", version="0.1.0")


class SynthesisRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    projectId: str = Field(min_length=1)
    activities: list[dict[str, Any]] = Field(min_length=1)


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
