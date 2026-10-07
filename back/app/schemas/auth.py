from pydantic import BaseModel, Field

class LoginRequest(BaseModel):
    username_or_email: str = Field(..., min_length=3)
    password: str = Field(..., min_length=8, description="Password must be at least 8 characters long.")

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
