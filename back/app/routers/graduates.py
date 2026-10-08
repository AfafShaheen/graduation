from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.schemas.graduate import UserVerifyStep1, RegisterStep2Request, UserUpdate, GraduateUpdateAdmin
from app.services.graduate_service import (
    verify_step1_service,
    register_step2_service,
    update_graduate_self,
    update_graduate_admin,
)

router = APIRouter(prefix="/api/graduates", tags=["Graduates & Registration"])

@router.post("/verify-step1", status_code=status.HTTP_200_OK)
async def verify_step1_endpoint(data: UserVerifyStep1, db: AsyncSession = Depends(get_db)):
    return await verify_step1_service(db, data)

@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register_step2_endpoint(data: RegisterStep2Request, db: AsyncSession = Depends(get_db)):
    return await register_step2_service(db, data)

@router.patch("/me", status_code=status.HTTP_200_OK)
async def update_my_profile(
    graduate_id: int = Query(..., description="Graduate ID from authentication context"),
    data: UserUpdate = ...,
    db: AsyncSession = Depends(get_db),
):
    try:
        updated = await update_graduate_self(db, graduate_id, data)
        return {"message": "Profile updated successfully", "graduate": updated}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

@router.patch("/admin/{grad_id}", status_code=status.HTTP_200_OK)
async def admin_update_graduate(grad_id: int, data: GraduateUpdateAdmin, db: AsyncSession = Depends(get_db)):
    try:
        updated = await update_graduate_admin(db, grad_id, data)
        return {"message": "Graduate updated by admin", "graduate": updated}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
