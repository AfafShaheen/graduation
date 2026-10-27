from typing import Literal

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_admin
from app.schemas.roster import RosterResponse
from app.services.roster_service import (
    CONTENT_TYPE,
    RosterFilters,
    export_roster,
    list_roster,
)

router = APIRouter(prefix="/api/admin", tags=["Admin Roster"])

Registration = Literal["not_registered", "unverified", "verified"]
TopRank = Literal["none", "any", "1", "2", "3"]
Ticket = Literal["none", "awaiting_payment", "processing", "confirmed", "rejected"]
Payment = Literal["none", "pending", "confirmed", "rejected", "mismatch"]
Entry = Literal["entered", "not_entered"]
TicketType = Literal["two", "three"]


@router.get("/roster", response_model=RosterResponse, status_code=status.HTTP_200_OK)
async def get_roster(
    search: str | None = Query(None, max_length=100),
    file_id: int | None = Query(None),
    event_id: int | None = Query(None),
    college_id: int | None = Query(None),
    registration: Registration | None = Query(None),
    top_rank: TopRank | None = Query(None),
    ticket: Ticket | None = Query(None),
    payment: Payment | None = Query(None),
    entry: Entry | None = Query(None),
    ticket_type: TicketType | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    filters = RosterFilters(
        search=search,
        file_id=file_id,
        event_id=event_id,
        college_id=college_id,
        registration=registration,
        top_rank=top_rank,
        ticket=ticket,
        payment=payment,
        entry=entry,
        ticket_type=ticket_type,
    )
    return await list_roster(db, filters, skip, limit)


@router.get("/roster/export", status_code=status.HTTP_200_OK)
async def export_roster_xlsx(
    search: str | None = Query(None, max_length=100),
    file_id: int | None = Query(None),
    event_id: int | None = Query(None),
    college_id: int | None = Query(None),
    registration: Registration | None = Query(None),
    top_rank: TopRank | None = Query(None),
    ticket: Ticket | None = Query(None),
    payment: Payment | None = Query(None),
    entry: Entry | None = Query(None),
    ticket_type: TicketType | None = Query(None),
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    filters = RosterFilters(
        search=search,
        file_id=file_id,
        event_id=event_id,
        college_id=college_id,
        registration=registration,
        top_rank=top_rank,
        ticket=ticket,
        payment=payment,
        entry=entry,
        ticket_type=ticket_type,
    )
    content, filename = await export_roster(db, filters, admin)
    return Response(
        content=content,
        media_type=CONTENT_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
