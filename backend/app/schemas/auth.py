from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str
    role: str
    expires_in: int  # detik sampai token expire (= ACCESS_TOKEN_EXPIRE_MINUTES × 60)
