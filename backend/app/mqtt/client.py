"""
MQTT subscriber untuk RE-Valid.

Topic format: stations/{station_id}/data
Payload format (JSON):
{
  "measured_at": "2026-04-12T10:00:00",   # opsional, default = now()
  "wind_speed": 5.2,
  "wind_dir": 180.0,
  "ghi": 350.5,
  "dni": 290.0,
  "temperature": 25.3,
  "humidity": 78.0,
  "pressure": 1012.5
}
"""

import asyncio
import json
import logging
import re
from datetime import datetime, timezone, timedelta

# WIB = UTC+7 — zona waktu DS3231 RTC pada ESP32 (disetel ke waktu lokal Indonesia)
_WIB = timezone(timedelta(hours=7))

import paho.mqtt.client as mqtt
from sqlalchemy import select, text

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.measurement import Measurement

logger = logging.getLogger("mqtt")

_TOPIC_RE = re.compile(r"^stations/([^/]+)/data$")
_NUMERIC_FIELDS = {"wind_speed", "wind_dir", "ghi", "dni", "temperature", "humidity", "pressure"}

# Will be set to the FastAPI event loop during startup
_main_loop: asyncio.AbstractEventLoop | None = None


def set_event_loop(loop: asyncio.AbstractEventLoop) -> None:
    global _main_loop
    _main_loop = loop


def _parse_payload(topic: str, raw: str) -> dict | None:
    """Parse MQTT payload into a measurement dict. Returns None on error."""
    match = _TOPIC_RE.match(topic)
    if not match:
        return None
    station_id = match.group(1)

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("MQTT: invalid JSON on topic %s: %r", topic, raw)
        return None

    # Parse timestamp — always produce timezone-aware datetime.
    # ESP32 mengirim timestamp naif (tanpa offset) dari RTC DS3231 yang
    # disetel ke WIB (UTC+7). Jika tidak ada offset, asumsikan WIB.
    raw_ts = data.get("measured_at")
    if raw_ts:
        try:
            measured_at = datetime.fromisoformat(str(raw_ts))
            if measured_at.tzinfo is None:
                # RTC DS3231 pada ESP32 disetel ke WIB — tambah +07:00
                measured_at = measured_at.replace(tzinfo=_WIB)
        except ValueError:
            logger.warning("MQTT: invalid measured_at %r, using now", raw_ts)
            measured_at = datetime.now(_WIB)
    else:
        measured_at = datetime.now(_WIB)

    record: dict = {"station_id": station_id, "measured_at": measured_at}
    for field in _NUMERIC_FIELDS:
        if field in data and data[field] is not None:
            try:
                record[field] = float(data[field])
            except (TypeError, ValueError):
                pass  # skip bad numeric values

    return record


def _store_measurement(record: dict) -> None:
    """Fire-and-forget coroutine to insert a measurement row."""
    async def _do() -> None:
        async with AsyncSessionLocal() as session:
            # Deduplicate: skip if same station_id + measured_at already exists
            dup = await session.execute(
                select(Measurement.id).where(
                    Measurement.station_id == record["station_id"],
                    Measurement.measured_at == record["measured_at"],
                ).limit(1)
            )
            if dup.scalar() is not None:
                logger.debug(
                    "MQTT: duplicate skipped station=%s at=%s",
                    record["station_id"],
                    record["measured_at"].isoformat(),
                )
                return

            obj = Measurement(
                station_id=record["station_id"],
                measured_at=record["measured_at"],
                wind_speed=record.get("wind_speed"),
                wind_dir=record.get("wind_dir"),
                ghi=record.get("ghi"),
                dni=record.get("dni"),
                temperature=record.get("temperature"),
                humidity=record.get("humidity"),
                pressure=record.get("pressure"),
            )
            session.add(obj)

            # Also update stations.last_update (and current sensor values) so
            # the peta/analisis pages show live data without running full analysis.
            set_parts = ["last_update = NOW()"]
            params: dict = {"station_id": record["station_id"]}
            if record.get("wind_speed") is not None:
                set_parts.append("wind_speed = :wind_speed")
                params["wind_speed"] = record["wind_speed"]
            if record.get("ghi") is not None:
                # Convert instantaneous W/m² to kWh/m²/day (24h equivalent)
                set_parts.append("irradiation = :irradiation")
                params["irradiation"] = round(record["ghi"] * 24 / 1000, 2)
            await session.execute(
                text(f"UPDATE stations SET {', '.join(set_parts)} WHERE id = :station_id"),
                params,
            )

            await session.commit()
        logger.info(
            "MQTT stored: station=%s at=%s",
            record["station_id"],
            record["measured_at"].isoformat(),
        )

    # Run the coroutine in the FastAPI event loop (set at startup).
    # Paho callbacks run in a dedicated thread, so we cannot call
    # get_event_loop() — instead we schedule onto the stored loop.
    if _main_loop is not None and _main_loop.is_running():
        future = asyncio.run_coroutine_threadsafe(_do(), _main_loop)
        future.add_done_callback(
            lambda f: logger.error("MQTT store error: %s", f.exception())
            if not f.cancelled() and f.exception() is not None
            else None
        )
    else:
        logger.warning("MQTT: no event loop available, dropping measurement for %s", record.get("station_id"))


def on_connect(client: mqtt.Client, userdata, flags, rc, properties=None) -> None:
    if rc == 0:
        logger.info("MQTT connected to %s:%s", settings.MQTT_BROKER, settings.MQTT_PORT)
        client.subscribe("stations/+/data")
        logger.info("MQTT subscribed to stations/+/data")
    else:
        logger.error("MQTT connection failed with code %d", rc)


def on_message(client: mqtt.Client, userdata, msg: mqtt.MQTTMessage) -> None:
    topic = msg.topic
    logger.debug("MQTT on_message: topic=%s", topic)
    try:
        raw = msg.payload.decode("utf-8")
    except UnicodeDecodeError:
        logger.warning("MQTT: non-UTF-8 payload on %s", topic)
        return

    record = _parse_payload(topic, raw)
    if record is None:
        return

    _store_measurement(record)


def on_disconnect(client: mqtt.Client, userdata, disconnect_flags, rc, properties=None) -> None:
    if rc != 0:
        logger.warning("MQTT: unexpected disconnect (rc=%d), will auto-reconnect", rc)


def create_mqtt_client() -> mqtt.Client:
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    if settings.MQTT_USERNAME:
        client.username_pw_set(settings.MQTT_USERNAME, settings.MQTT_PASSWORD)
    client.on_connect = on_connect
    client.on_message = on_message
    client.on_disconnect = on_disconnect
    # Enable auto-reconnect
    client.reconnect_delay_set(min_delay=2, max_delay=60)
    return client


def start_mqtt() -> mqtt.Client:
    client = create_mqtt_client()
    client.connect(settings.MQTT_BROKER, settings.MQTT_PORT, keepalive=60)
    client.loop_start()
    return client


def stop_mqtt(client: mqtt.Client) -> None:
    client.loop_stop()
    client.disconnect()
    logger.info("MQTT client stopped")
