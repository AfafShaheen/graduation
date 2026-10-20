from pydantic import BaseModel, Field

class AdminLoginRequest(BaseModel):
    username: str = Field(..., min_length=3)
    password: str = Field(..., min_length=4)

class AdminTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    refresh_token: str
    refresh_expires_in: int

class RefreshRequest(BaseModel):
    refresh_token: str = Field(..., min_length=10)
