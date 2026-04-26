from fastapi import APIRouter
from app.api.v1.endpoints import auth, measurements, stations, analyze, atlas

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["Auth"])
api_router.include_router(stations.router, prefix="/stations", tags=["Stations"])
api_router.include_router(measurements.router, prefix="/measurements", tags=["Measurements"])
api_router.include_router(analyze.router, prefix="/analyze", tags=["Analyze"])
api_router.include_router(atlas.router, prefix="/atlas", tags=["Atlas"])
