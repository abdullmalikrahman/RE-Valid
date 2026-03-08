from fastapi import APIRouter

router = APIRouter()


@router.get("/")
async def get_measurements():
    """Get timeseries measurements."""
    return {"measurements": []}
