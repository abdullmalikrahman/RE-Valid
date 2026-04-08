from fastapi import APIRouter
from app.api.v1.endpoints import auth, measurements, stations

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["Auth"])
api_router.include_router(stations.router, prefix="/stations", tags=["Stations"])
api_router.include_router(measurements.router, prefix="/measurements", tags=["Measurements"])
