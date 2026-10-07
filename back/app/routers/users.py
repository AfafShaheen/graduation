from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.schemas.user import UserVerifyStep1, UserCompleteStep2
from app.services.user_service import verify_graduate_step1, complete_graduate_registration_step2

router = APIRouter(prefix="/users", tags=["Users & Registration"])

@router.post("/register/step1", status_code=status.HTTP_200_OK)
async def register_step1(data: UserVerifyStep1, db: AsyncSession = Depends(get_db)):
    try:
        result = await verify_graduate_step1(db, data)
        return result
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.post("/register/step2", status_code=status.HTTP_201_CREATED)
async def register_step2(data: UserCompleteStep2, db: AsyncSession = Depends(get_db)):
    try:
        result = await complete_graduate_registration_step2(db, data)
        return result
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
