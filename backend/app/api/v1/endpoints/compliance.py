from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.crud.station import get_station_by_id
from app.models.regulatory import RegulatoryFeature, RegulatoryLayer

router = APIRouter()

StatusRule = Literal["allowed", "conditional", "restricted", "review", "informational"]
ComplianceStatus = Literal[
    "terverifikasi",
    "ok",
    "perlu_tinjau",
    "tidak_sesuai",
    "belum_data_resmi",
    "belum_dokumen",
]

_VALID_STATUS_RULES: set[str] = {
    "allowed",
    "conditional",
    "restricted",
    "review",
    "informational",
}

_STATUS_LABELS: dict[str, str] = {
    "terverifikasi": "Terverifikasi",
    "ok": "Sesuai Data Tersedia",
    "perlu_tinjau": "Perlu Tinjau",
    "tidak_sesuai": "Tidak Sesuai",
    "belum_data_resmi": "Belum Ada Data Resmi",
    "belum_dokumen": "Belum Ada Dokumen",
}

_SPATIAL_CHECKS = [
    {
        "key": "kkpr_rdtr",
        "label": "KKPR/RDTR/RTRW",
        "categories": ["kkpr", "rdtr", "rtrw"],
        "no_layer_status": "belum_data_resmi",
        "no_hit_status": "belum_data_resmi",
        "no_hit_message": "Belum ada polygon tata ruang resmi yang mencakup titik ini.",
    },
    {
        "key": "protected_area",
        "label": "Kawasan Lindung/Hutan",
        "categories": ["kawasan_lindung", "kawasan_hutan", "konservasi"],
        "no_layer_status": "belum_data_resmi",
        "no_hit_status": "ok",
        "no_hit_message": "Tidak beririsan dengan layer pembatas yang tersedia.",
    },
    {
        "key": "disaster_risk",
        "label": "Risiko Bencana",
        "categories": ["bencana", "risiko_bencana"],
        "no_layer_status": "belum_data_resmi",
        "no_hit_status": "ok",
        "no_hit_message": "Tidak beririsan dengan layer risiko yang tersedia.",
    },
    {
        "key": "land_status",
        "label": "Status Tanah",
        "categories": ["tanah", "status_tanah"],
        "no_layer_status": "belum_data_resmi",
        "no_hit_status": "belum_data_resmi",
        "no_hit_message": "Belum ada layer status tanah yang mencakup titik ini.",
    },
    {
        "key": "grid_interconnection",
        "label": "Interkoneksi Jaringan",
        "categories": ["grid", "interkoneksi", "transmisi"],
        "no_layer_status": "belum_data_resmi",
        "no_hit_status": "perlu_tinjau",
        "no_hit_message": "Tidak ada layer jaringan/interkoneksi yang dekat atau mencakup titik ini.",
    },
]


class ComplianceLayerImport(BaseModel):
    code: str = Field(..., min_length=2, max_length=80)
    name: str = Field(..., min_length=2, max_length=200)
    category: str = Field(..., min_length=2, max_length=40)
    source: str | None = None
    source_url: str | None = None
    source_date: str | None = None
    is_official: bool = True
    geojson: dict[str, Any]
    name_property: str = "name"
    rule_code_property: str | None = None
    status_property: str | None = None
    message_property: str | None = None
    default_status_rule: StatusRule = "review"
    status_map: dict[str, StatusRule] = Field(default_factory=dict)
    replace: bool = True


def _normalize_category(value: str) -> str:
    return value.strip().lower().replace(" ", "_").replace("-", "_")


def _normalize_status_rule(value: str | None, default: StatusRule) -> StatusRule:
    if not value:
        return default
    normalized = value.strip().lower().replace(" ", "_").replace("-", "_")
    return normalized if normalized in _VALID_STATUS_RULES else default  # type: ignore[return-value]


def _features_from_geojson(geojson: dict[str, Any]) -> list[dict[str, Any]]:
    geo_type = geojson.get("type")
    if geo_type == "FeatureCollection":
        features = geojson.get("features")
        if isinstance(features, list):
            return [f for f in features if isinstance(f, dict)]
    if geo_type == "Feature":
        return [geojson]
    if geo_type in {"Polygon", "MultiPolygon", "LineString", "MultiLineString", "Point", "MultiPoint"}:
        return [{"type": "Feature", "properties": {}, "geometry": geojson}]
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="GeoJSON harus berupa FeatureCollection, Feature, atau geometry valid.",
    )


def _status_from_features(features: list[RegulatoryFeature], no_hit_status: str) -> str:
    if not features:
        return no_hit_status
    rules = {feature.status_rule for feature in features}
    if "restricted" in rules:
        return "tidak_sesuai"
    if "conditional" in rules or "review" in rules:
        return "perlu_tinjau"
    return "ok"


def _overall_status(checks: list[dict[str, Any]]) -> str:
    statuses = [check["status"] for check in checks]
    if "tidak_sesuai" in statuses:
        return "tidak_sesuai"
    if all(status == "belum_data_resmi" for status in statuses):
        return "belum_data_resmi"
    if any(status in {"perlu_tinjau", "belum_data_resmi", "belum_dokumen"} for status in statuses):
        return "perlu_tinjau"
    return "terverifikasi"


async def _count_layers(db: AsyncSession, categories: list[str]) -> int:
    stmt = select(func.count(RegulatoryLayer.id)).where(RegulatoryLayer.category.in_(categories))
    result = await db.execute(stmt)
    return int(result.scalar_one() or 0)


async def _intersecting_features(
    db: AsyncSession,
    lat: float,
    lon: float,
    categories: list[str],
) -> list[tuple[RegulatoryFeature, RegulatoryLayer]]:
    point = func.ST_SetSRID(func.ST_MakePoint(lon, lat), 4326)
    stmt = (
        select(RegulatoryFeature, RegulatoryLayer)
        .join(RegulatoryLayer, RegulatoryFeature.layer_id == RegulatoryLayer.id)
        .where(RegulatoryLayer.category.in_(categories))
        .where(func.ST_Intersects(RegulatoryFeature.geom, point))
        .limit(12)
    )
    result = await db.execute(stmt)
    return list(result.all())


@router.get("/stations/{station_id}")
async def check_station_compliance(
    station_id: str,
    db: AsyncSession = Depends(get_db),
):
    station = await get_station_by_id(db, station_id)
    if not station:
        raise HTTPException(status_code=404, detail="Stasiun tidak ditemukan")

    lat, lon = float(station.lat), float(station.lon)
    checks: list[dict[str, Any]] = []
    sources: dict[int, dict[str, Any]] = {}

    for definition in _SPATIAL_CHECKS:
        categories = definition["categories"]
        layer_count = await _count_layers(db, categories)
        if layer_count == 0:
            checks.append(
                {
                    "key": definition["key"],
                    "label": definition["label"],
                    "status": definition["no_layer_status"],
                    "status_label": _STATUS_LABELS[definition["no_layer_status"]],
                    "message": "Layer resmi belum diimpor ke database RE-Valid.",
                    "matches": [],
                }
            )
            continue

        rows = await _intersecting_features(db, lat, lon, categories)
        features = [feature for feature, _layer in rows]
        status_value = _status_from_features(features, definition["no_hit_status"])
        matches = []
        for feature, layer in rows:
            sources[layer.id] = {
                "id": layer.id,
                "name": layer.name,
                "category": layer.category,
                "source": layer.source,
                "source_url": layer.source_url,
                "source_date": layer.source_date,
                "is_official": layer.is_official,
            }
            matches.append(
                {
                    "layer": layer.name,
                    "feature": feature.name,
                    "rule_code": feature.rule_code,
                    "status_rule": feature.status_rule,
                    "message": feature.message,
                }
            )

        checks.append(
            {
                "key": definition["key"],
                "label": definition["label"],
                "status": status_value,
                "status_label": _STATUS_LABELS[status_value],
                "message": (
                    f"Ditemukan {len(matches)} fitur resmi yang beririsan."
                    if matches
                    else definition["no_hit_message"]
                ),
                "matches": matches,
            }
        )

    checks.append(
        {
            "key": "environmental_approval",
            "label": "Persetujuan Lingkungan",
            "status": "belum_dokumen",
            "status_label": _STATUS_LABELS["belum_dokumen"],
            "message": "Belum ada nomor/dokumen AMDAL, UKL-UPL, atau SPPL yang diverifikasi di sistem.",
            "matches": [],
        }
    )

    overall = _overall_status(checks)
    missing = [
        check["label"]
        for check in checks
        if check["status"] in {"belum_data_resmi", "belum_dokumen"}
    ]

    return {
        "station_id": station_id,
        "lat": lat,
        "lon": lon,
        "overall_status": overall,
        "overall_label": _STATUS_LABELS[overall],
        "verified": overall == "terverifikasi",
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "summary": (
            "Terverifikasi terhadap layer/dokumen resmi yang tersedia."
            if overall == "terverifikasi"
            else "Hasil otomatis masih membutuhkan data/dokumen resmi tambahan."
        ),
        "missing_requirements": missing,
        "checks": checks,
        "sources": list(sources.values()),
    }


@router.post("/layers/import-geojson")
async def import_compliance_geojson(
    payload: ComplianceLayerImport,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user),
):
    features = _features_from_geojson(payload.geojson)
    category = _normalize_category(payload.category)

    layer_stmt = select(RegulatoryLayer).where(RegulatoryLayer.code == payload.code)
    layer = (await db.execute(layer_stmt)).scalar_one_or_none()
    if layer is None:
        layer = RegulatoryLayer(code=payload.code, name=payload.name, category=category)
        db.add(layer)
        await db.flush()

    layer.name = payload.name
    layer.category = category
    layer.source = payload.source
    layer.source_url = payload.source_url
    layer.source_date = payload.source_date
    layer.is_official = payload.is_official

    if payload.replace:
        await db.execute(delete(RegulatoryFeature).where(RegulatoryFeature.layer_id == layer.id))

    inserted = 0
    for feature in features:
        geometry = feature.get("geometry")
        if not geometry:
            continue
        properties = feature.get("properties") if isinstance(feature.get("properties"), dict) else {}
        raw_status = (
            properties.get(payload.status_property)
            if payload.status_property
            else None
        )
        mapped_status = (
            payload.status_map.get(str(raw_status).strip().lower())
            if raw_status is not None
            else None
        )
        status_rule = mapped_status or _normalize_status_rule(
            str(raw_status) if raw_status is not None else None,
            payload.default_status_rule,
        )

        db.add(
            RegulatoryFeature(
                layer_id=layer.id,
                name=properties.get(payload.name_property),
                rule_code=properties.get(payload.rule_code_property) if payload.rule_code_property else None,
                status_rule=status_rule,
                message=properties.get(payload.message_property) if payload.message_property else None,
                properties=properties,
                geom=func.ST_SetSRID(func.ST_GeomFromGeoJSON(json.dumps(geometry)), 4326),
            )
        )
        inserted += 1

    await db.commit()
    return {
        "layer_id": layer.id,
        "code": layer.code,
        "category": layer.category,
        "inserted_features": inserted,
        "replaced": payload.replace,
    }
