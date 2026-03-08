from fastapi import APIRouter
from app.api.v1.endpoints import stations, measurements

api_router = APIRouter()

api_router.include_router(stations.router, prefix="/stations", tags=["Stations"])
api_router.include_router(measurements.router, prefix="/measurements", tags=["Measurements"])
