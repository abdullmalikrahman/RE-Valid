from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from celery.result import AsyncResult
from app.core.security import get_current_user
from app.workers.tasks import validate_station_mcp
from app.workers.celery_app import celery_app

router = APIRouter()


class AnalyzeRequest(BaseModel):
    station_id: str
    variable: str = "wind"   # "wind" | "solar"
    n: int = Field(14400, ge=10, le=100_000)  # batas: 10 ≤ n ≤ 100.000


@router.post("", summary="Jalankan analisis MCP / validasi GHI untuk satu stasiun")
def start_analysis(body: AnalyzeRequest, _=Depends(get_current_user)):
    if body.variable not in ("wind", "solar"):
        raise HTTPException(status_code=422, detail="variable harus 'wind' atau 'solar'")
    task = validate_station_mcp.delay(body.station_id, body.variable, body.n)
    return {"task_id": task.id, "status": "queued"}


@router.get("/{task_id}", summary="Cek status / hasil task analisis")
def get_analysis_result(task_id: str):
    result = AsyncResult(task_id, app=celery_app)
    if result.state == "PENDING":
        return {"task_id": task_id, "status": "pending"}
    if result.state == "STARTED":
        return {"task_id": task_id, "status": "started"}
    if result.state == "SUCCESS":
        return {"task_id": task_id, "status": "success", "result": result.result}
    if result.state == "FAILURE":
        return {"task_id": task_id, "status": "failed", "error": str(result.result)}
    return {"task_id": task_id, "status": result.state.lower()}
