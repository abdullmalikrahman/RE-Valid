"""Import or download ERA5 actual-period baseline into RE-Valid.

Examples:
    python import_era5_period_baseline.py --station LOC-02 --start 2026-06-08 --end 2026-06-14 --csv era5_loc02.csv

    python import_era5_period_baseline.py --station LOC-02 --start 2026-06-08 --end 2026-06-14 ^
      --download --lat -6.9688221 --lon 107.6278766

The CSV path should come from the Copernicus CDS request with variables:
100m_u_component_of_wind, 100m_v_component_of_wind, surface_solar_radiation_downwards.
"""

from __future__ import annotations

import argparse
import csv
import math
import re
from collections import defaultdict
from datetime import date, datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import psycopg2

from app.core.config import settings

WIB = ZoneInfo("Asia/Jakarta")


def _norm(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", value.strip().lower()).strip("_")


def _find_col(fieldnames: list[str], *needles: str) -> str:
    normalized = {name: _norm(name) for name in fieldnames}
    for name, norm in normalized.items():
        if any(needle in norm for needle in needles):
            return name
    raise ValueError(f"Kolom tidak ditemukan. Cari salah satu: {', '.join(needles)}. Header CSV: {fieldnames}")


def _parse_time(value: str) -> datetime:
    raw = value.strip().replace("Z", "+00:00")
    if " " in raw and "T" not in raw:
        raw = raw.replace(" ", "T", 1)
    dt = datetime.fromisoformat(raw)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(WIB)


def _float_or_none(value: str | None) -> float | None:
    if value is None:
        return None
    raw = str(value).strip()
    if raw == "" or raw.lower() in {"nan", "none", "null"}:
        return None
    return float(raw)


def _read_cds_csv(csv_path: Path, start: date, end: date) -> dict[str, dict[str, float | None]]:
    wind_by_day: dict[str, list[float]] = defaultdict(list)
    ssrd_by_day: dict[str, list[float]] = defaultdict(list)

    with csv_path.open("r", encoding="utf-8-sig", newline="") as fh:
        reader = csv.DictReader(fh)
        if not reader.fieldnames:
            raise ValueError("CSV tidak memiliki header")

        time_col = _find_col(reader.fieldnames, "valid_time", "time", "date")
        u_col = _find_col(reader.fieldnames, "100m_u_component_of_wind", "u100")
        v_col = _find_col(reader.fieldnames, "100m_v_component_of_wind", "v100")
        ssrd_col = _find_col(reader.fieldnames, "surface_solar_radiation_downwards", "ssrd")

        for row in reader:
            dt_wib = _parse_time(row[time_col])
            day = dt_wib.date()
            if day < start or day > end:
                continue
            key = day.isoformat()

            u = _float_or_none(row.get(u_col))
            v = _float_or_none(row.get(v_col))
            if u is not None and v is not None:
                wind_by_day[key].append(math.sqrt(u * u + v * v))

            ssrd = _float_or_none(row.get(ssrd_col))
            if ssrd is not None and ssrd >= 0:
                ssrd_by_day[key].append(ssrd)

    result: dict[str, dict[str, float | None]] = {}
    cursor = start
    while cursor <= end:
        key = cursor.isoformat()
        wind_values = wind_by_day.get(key, [])
        ssrd_values = ssrd_by_day.get(key, [])
        result[key] = {
            "wind": round(sum(wind_values) / len(wind_values), 3) if wind_values else None,
            "ghi": round(sum(ssrd_values) / 3_600_000.0, 3) if ssrd_values else None,
        }
        cursor = date.fromordinal(cursor.toordinal() + 1)
    return result


def _download_cds(csv_path: Path, lat: float, lon: float, start: date, end: date) -> None:
    try:
        import cdsapi
    except ImportError as exc:
        raise SystemExit("cdsapi belum terinstall. Jalankan: pip install cdsapi") from exc

    dataset = "reanalysis-era5-single-levels-timeseries"
    request = {
        "variable": [
            "100m_u_component_of_wind",
            "100m_v_component_of_wind",
            "surface_solar_radiation_downwards",
        ],
        "location": {"longitude": lon, "latitude": lat},
        "date": [f"{start.isoformat()}/{end.isoformat()}"],
        "data_format": "csv",
    }

    csv_path.parent.mkdir(parents=True, exist_ok=True)
    client = cdsapi.Client()
    client.retrieve(dataset, request).download(str(csv_path))


def _upsert(station_id: str, rows: dict[str, dict[str, float | None]]) -> None:
    db_url = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")
    values = [
        (
            station_id,
            baseline_date,
            vals["wind"],
            vals["ghi"],
            "era5_actual_cds",
        )
        for baseline_date, vals in rows.items()
    ]

    with psycopg2.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.executemany(
                """
                INSERT INTO station_period_baselines
                    (station_id, baseline_date, wind_era5_actual, ghi_era5_actual, source)
                VALUES (%s, %s::date, %s, %s, %s)
                ON CONFLICT (station_id, baseline_date)
                DO UPDATE SET
                    wind_era5_actual = EXCLUDED.wind_era5_actual,
                    ghi_era5_actual = EXCLUDED.ghi_era5_actual,
                    source = EXCLUDED.source,
                    fetched_at = NOW()
                """,
                values,
            )
        conn.commit()


def main() -> None:
    parser = argparse.ArgumentParser(description="Import ERA5 actual-period baseline")
    parser.add_argument("--station", required=True, help="Station ID, e.g. LOC-02")
    parser.add_argument("--start", required=True, type=date.fromisoformat, help="YYYY-MM-DD")
    parser.add_argument("--end", required=True, type=date.fromisoformat, help="YYYY-MM-DD")
    parser.add_argument("--csv", type=Path, help="CSV hasil download Copernicus CDS")
    parser.add_argument("--download", action="store_true", help="Download CSV from CDS before import")
    parser.add_argument("--lat", type=float, help="Latitude for --download")
    parser.add_argument("--lon", type=float, help="Longitude for --download")
    parser.add_argument("--out", type=Path, help="Output CSV path for --download")
    args = parser.parse_args()

    if args.start > args.end:
        raise SystemExit("--start tidak boleh lebih besar dari --end")

    csv_path = args.csv
    if args.download:
        if args.lat is None or args.lon is None:
            raise SystemExit("--download membutuhkan --lat dan --lon")
        csv_path = args.out or Path("data") / "era5_period_baselines" / f"{args.station}_{args.start}_{args.end}.csv"
        _download_cds(csv_path, args.lat, args.lon, args.start, args.end)

    if csv_path is None:
        raise SystemExit("Gunakan --csv PATH atau --download")

    rows = _read_cds_csv(csv_path, args.start, args.end)
    _upsert(args.station, rows)

    print(f"Imported ERA5 actual baseline for {args.station}: {args.start} to {args.end}")
    for baseline_date, vals in rows.items():
        print(f"- {baseline_date}: wind={vals['wind']} m/s, ghi={vals['ghi']} kWh/m2/day")


if __name__ == "__main__":
    main()
