import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.v1.router import api_router
from app.mqtt.client import set_event_loop, start_mqtt, stop_mqtt

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("RE-Valid API starting up...")
    mqtt_client = None
    try:
        set_event_loop(asyncio.get_running_loop())
        mqtt_client = start_mqtt()
        logger.info("MQTT subscriber started")
    except Exception as exc:
        logger.warning("MQTT could not start (broker unreachable?): %s", exc)

    yield

    # Shutdown
    if mqtt_client is not None:
        stop_mqtt(mqtt_client)
    logger.info("RE-Valid API shut down")


app = FastAPI(
    title="RE-Valid API",
    description="REST API for RE-Valid WebGIS platform",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "RE-Valid API"}
