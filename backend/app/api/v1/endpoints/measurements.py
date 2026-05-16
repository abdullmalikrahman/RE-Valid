import csv
import io
from datetime import datetime

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
async def upload_measurements_csv(
    station_id: str,
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user),
):
    """Upload a CSV file of measurements for a given station.

    Required CSV columns: measured_at (ISO-8601)
    Optional numeric columns: wind_speed, wind_dir, ghi, dni, temperature, humidity, pressure
    """
    # Validate station exists
    station = await get_station_by_id(db, station_id)
    if not station:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stasiun tidak ditemukan")

    # Read file content
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File harus berformat .csv")

    content = await file.read()
    try:
        text = content.decode("utf-8-sig")  # handle BOM from Excel exports
    except UnicodeDecodeError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File harus berencoding UTF-8")

    reader = csv.DictReader(io.StringIO(text))
    if reader.fieldnames is None or "measured_at" not in reader.fieldnames:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="CSV harus memiliki kolom 'measured_at'",
        )

    rows: list[dict] = []
    errors: list[str] = []

    for i, row in enumerate(reader, start=2):  # start=2 because row 1 is header
        try:
            measured_at = datetime.fromisoformat(row["measured_at"].strip())
        except (ValueError, KeyError):
            errors.append(f"Baris {i}: format measured_at tidak valid (gunakan ISO-8601, misal '2024-01-01T00:00:00')")
            continue

        record: dict = {"station_id": station_id, "measured_at": measured_at}
        for col in _NUMERIC_COLS:
            raw = row.get(col, "").strip()
            if raw:
                try:
                    record[col] = float(raw)
                except ValueError:
                    errors.append(f"Baris {i}: nilai '{col}' tidak valid ({raw!r})")
                    continue
        rows.append(record)

    if errors and not rows:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"message": "CSV tidak dapat diproses", "errors": errors[:10]},
        )

    result = await bulk_insert_measurements(db, rows)
    return {
        "station_id": station_id,
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
