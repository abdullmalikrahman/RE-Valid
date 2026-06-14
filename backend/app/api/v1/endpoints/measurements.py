import csv
import io
import json
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.crud.measurement import bulk_insert_measurements, get_latest_per_station, get_measurements
from app.crud.station import get_station_by_id
from app.schemas.measurement import MeasurementResponse

router = APIRouter()

# Required CSV columns
_REQUIRED_COLS = {"measured_at"}
_NUMERIC_COLS = {"wind_speed", "wind_dir", "ghi", "dni", "temperature", "humidity", "pressure"}
_ALL_COLS = _REQUIRED_COLS | _NUMERIC_COLS


@router.post("/upload", status_code=status.HTTP_200_OK)
async def upload_measurements(
    station_id: str,
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user),
):
    """Upload a CSV or JSON file of measurements for a given station.

    Required column/key: measured_at (ISO-8601)
    Optional numeric columns: wind_speed, wind_dir, ghi, dni, temperature, humidity, pressure
    """
    # Validate station exists
    station = await get_station_by_id(db, station_id)
    if not station:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stasiun tidak ditemukan")

    # Read file content
    filename = file.filename.lower() if file.filename else ""
    is_csv = filename.endswith(".csv")
    is_json = filename.endswith(".json")
    if not is_csv and not is_json:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File harus berformat .csv atau .json")

    content = await file.read()
    try:
        text = content.decode("utf-8-sig")  # handle BOM from Excel exports
    except UnicodeDecodeError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File harus berencoding UTF-8")

    rows: list[dict] = []
    errors: list[str] = []

    def parse_row(row: dict[str, Any], row_label: str) -> dict | None:
        try:
            measured_raw = str(row["measured_at"]).strip()
            measured_at = datetime.fromisoformat(measured_raw)
        except (ValueError, KeyError):
            errors.append(f"{row_label}: format measured_at tidak valid (gunakan ISO-8601, misal '2024-01-01T00:00:00')")
            return None

        record: dict = {"station_id": station_id, "measured_at": measured_at}
        for col in _NUMERIC_COLS:
            raw_value = row.get(col)
            if isinstance(raw_value, str):
                raw_value = raw_value.strip()
            if raw_value is None or raw_value == "":
                continue
            try:
                record[col] = float(raw_value)
            except (TypeError, ValueError):
                errors.append(f"{row_label}: nilai '{col}' tidak valid ({raw_value!r})")
                return None
        return record

    if is_csv:
        reader = csv.DictReader(io.StringIO(text))
        if reader.fieldnames is None or "measured_at" not in reader.fieldnames:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="CSV harus memiliki kolom 'measured_at'",
            )

        for i, row in enumerate(reader, start=2):  # start=2 because row 1 is header
            parsed = parse_row(row, f"Baris {i}")
            if parsed is not None:
                rows.append(parsed)
    else:
        try:
            payload = json.loads(text)
        except json.JSONDecodeError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"JSON tidak valid: {exc.msg}",
            )

        if isinstance(payload, dict):
            payload_rows = None
            for key in ("measurements", "rows", "data"):
                if key in payload:
                    payload_rows = payload[key]
                    break
            if payload_rows is None and "measured_at" in payload:
                payload_rows = [payload]
        else:
            payload_rows = payload

        if not isinstance(payload_rows, list):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="JSON harus berupa object measurement, array objek, atau object dengan key 'measurements', 'rows', atau 'data'",
            )

        for i, row in enumerate(payload_rows, start=1):
            if not isinstance(row, dict):
                errors.append(f"Item {i}: harus berupa object")
                continue
            parsed = parse_row(row, f"Item {i}")
            if parsed is not None:
                rows.append(parsed)

    file_type = "JSON" if is_json else "CSV"

    if errors and not rows:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"message": f"{file_type} tidak dapat diproses", "errors": errors[:10]},
        )

    result = await bulk_insert_measurements(db, rows)
    return {
        "station_id": station_id,
        "file_type": file_type.lower(),
        "rows_parsed": len(rows),
        "inserted": result["inserted"],
        "skipped": result["skipped"],
        "parse_errors": errors[:10],
    }


@router.get("/latest", response_model=list[MeasurementResponse])
async def latest_measurements(db: AsyncSession = Depends(get_db)):
    return await get_latest_per_station(db)


@router.get("", response_model=list[MeasurementResponse])
async def list_measurements(
    station_id: str,
    start: datetime | None = Query(None),
    end: datetime | None = Query(None),
    limit: int = Query(1000, ge=1, le=20000),
    db: AsyncSession = Depends(get_db),
):
    return await get_measurements(db, station_id, start, end, limit)
