from collections import defaultdict
from time import time
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import create_access_token, verify_password
from app.models.user import User
from app.schemas.auth import LoginRequest, TokenResponse

router = APIRouter()

# ── Rate limiting (in-memory, per IP) ────────────────────────────────────────
# Maksimal 5 percobaan login per 60 detik per IP.
# Menggunakan list timestamp — entri lama otomatis diabaikan saat window bergeser.
_RATE_LIMIT_MAX    = 5   # maks percobaan
_RATE_LIMIT_WINDOW = 60  # detik
_login_attempts: dict[str, list[float]] = defaultdict(list)

def _check_rate_limit(ip: str) -> None:
    """Raise 429 jika IP sudah melebihi batas percobaan login."""
    now  = time()
    hits = _login_attempts[ip]
    # Hapus entri di luar window
    _login_attempts[ip] = [t for t in hits if now - t < _RATE_LIMIT_WINDOW]
    if len(_login_attempts[ip]) >= _RATE_LIMIT_MAX:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Terlalu banyak percobaan login. Coba lagi dalam {_RATE_LIMIT_WINDOW} detik.",
        )
    _login_attempts[ip].append(now)

def _get_client_ip(request: Request) -> str:
    """Ambil IP asli client, mendukung proxy/Nginx (X-Forwarded-For)."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"

# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    # Cek rate limit sebelum query DB (mencegah brute force & enumeration)
    _check_rate_limit(_get_client_ip(request))

    result = await db.execute(select(User).where(User.username == body.username))
    user = result.scalar_one_or_none()

    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Username atau password salah",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Akun dinonaktifkan",
        )

    # Login berhasil — hapus catatan percobaan IP ini
    _login_attempts.pop(_get_client_ip(request), None)

    token = create_access_token({"sub": user.username, "role": user.role})
    return TokenResponse(
        access_token=token,
        username=user.username,
        role=user.role,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(HTTPBearer())],
    db: AsyncSession = Depends(get_db),
):
    """Perbarui access token yang masih valid dengan token baru.

    Frontend memanggil endpoint ini saat token mendekati kedaluwarsa
    (< 5 menit tersisa) agar sesi tidak terputus.
    Token lama HARUS masih valid — jika sudah expire, user harus login ulang.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token tidak valid atau sudah kedaluwarsa",
    )
    try:
        payload  = jwt.decode(
            credentials.credentials,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
        username: str | None = payload.get("sub")
        if not username:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    result = await db.execute(select(User).where(User.username == username))
    user   = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise credentials_exception

    new_token = create_access_token({"sub": user.username, "role": user.role})
    return TokenResponse(
        access_token=new_token,
        username=user.username,
        role=user.role,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )
