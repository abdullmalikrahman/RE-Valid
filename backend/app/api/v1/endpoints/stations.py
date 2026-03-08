from fastapi import APIRouter

router = APIRouter()


@router.get("/stations")
async def get_stations():
    """List all monitoring stations."""
    return {"stations": []}


@router.get("/stations/{station_id}")
async def get_station(station_id: int):
    """Get a single station by ID."""
    return {"station_id": station_id}
