from fastapi import Header, HTTPException, status

async def get_current_admin(authorization: str = Header(None)) -> dict:
    """Dependency to protect admin endpoints (FR-22)."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="غير مصرح، يجب تسجيل دخول المسؤول."
        )
    return {"admin_id": 1, "username": "admin"}
