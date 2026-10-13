from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.deps import get_current_graduate
from app.models.graduate import GraduateModel
from app.schemas.graduate import UserVerifyStep1, RegisterStep2Request
from app.schemas.ticket import (
    MyTicketResponse,
    PaymentInfoResponse,
    PaymentSubmitRequest,
    PaymentSubmitResponse,
    TicketOptionsResponse,
    TicketSelectRequest,
    TicketSummary,
)
from app.services.graduate_service import (
    verify_step1_service,
    register_step2_service,
)
from app.services.ticket_service import (
    get_my_ticket_service,
    get_payment_info_service,
    get_ticket_options_service,
    select_ticket_service,
    submit_payment_service,
)

router = APIRouter(prefix="/api/graduates", tags=["Graduates & Registration"])

@router.post("/verify-step1", status_code=status.HTTP_200_OK)
async def verify_step1_endpoint(data: UserVerifyStep1, db: AsyncSession = Depends(get_db)):
    return await verify_step1_service(db, data)

@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register_step2_endpoint(data: RegisterStep2Request, db: AsyncSession = Depends(get_db)):
    return await register_step2_service(db, data)


@router.get("/me/ticket-options", response_model=TicketOptionsResponse, status_code=status.HTTP_200_OK)
async def get_ticket_options(
    db: AsyncSession = Depends(get_db),
    graduate: GraduateModel = Depends(get_current_graduate),
):
    return await get_ticket_options_service(db, graduate)


@router.post("/me/ticket", response_model=TicketSummary, status_code=status.HTTP_201_CREATED)
async def select_ticket(
    data: TicketSelectRequest,
    db: AsyncSession = Depends(get_db),
    graduate: GraduateModel = Depends(get_current_graduate),
):
    return await select_ticket_service(db, graduate, data)


@router.get(
    "/me/payment-info",
    response_model=PaymentInfoResponse,
    response_model_exclude_none=True,
    status_code=status.HTTP_200_OK,
)
async def get_payment_info(
    db: AsyncSession = Depends(get_db),
    graduate: GraduateModel = Depends(get_current_graduate),
):
    return await get_payment_info_service(db, graduate)


@router.post("/me/payment", response_model=PaymentSubmitResponse, status_code=status.HTTP_201_CREATED)
async def submit_payment(
    data: PaymentSubmitRequest,
    db: AsyncSession = Depends(get_db),
    graduate: GraduateModel = Depends(get_current_graduate),
):
    return await submit_payment_service(db, graduate, data)


@router.get(
    "/me/ticket",
    response_model=MyTicketResponse,
    response_model_exclude_none=True,
    status_code=status.HTTP_200_OK,
)
async def get_my_ticket(
    db: AsyncSession = Depends(get_db),
    graduate: GraduateModel = Depends(get_current_graduate),
):
    return await get_my_ticket_service(db, graduate)
