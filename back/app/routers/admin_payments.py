from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_admin
from app.models.ticket import TicketStatusEnum
from app.schemas.ticket import PaymentRejectRequest
from app.services.payment_review_service import (
    confirm_payment_service,
    get_admin_ticket_service,
    get_event_payments_summary_service,
    list_event_payments_service,
    reject_payment_service,
)

router = APIRouter(prefix="/api/admin", tags=["Admin Payment Review"])


@router.get("/events/{event_id}/payments", status_code=status.HTTP_200_OK)
async def list_event_payments(
    event_id: int,
    status_filter: TicketStatusEnum = Query(TicketStatusEnum.PROCESSING, alias="status"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    return await list_event_payments_service(db, event_id, status_filter, limit, offset)


@router.get("/events/{event_id}/payments/summary", status_code=status.HTTP_200_OK)
async def get_event_payments_summary(
    event_id: int,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    return await get_event_payments_summary_service(db, event_id)


@router.get("/tickets/{ticket_id}", status_code=status.HTTP_200_OK)
async def get_admin_ticket(
    ticket_id: int,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    return await get_admin_ticket_service(db, ticket_id)


@router.post("/tickets/{ticket_id}/confirm", status_code=status.HTTP_200_OK)
async def confirm_payment(
    ticket_id: int,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    return await confirm_payment_service(db, ticket_id, admin)


@router.post("/tickets/{ticket_id}/reject", status_code=status.HTTP_200_OK)
async def reject_payment(
    ticket_id: int,
    data: PaymentRejectRequest,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    return await reject_payment_service(db, ticket_id, data.reason, admin)
