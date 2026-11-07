"""Audit rows for what a graduate does himself (the graduate is the actor).

These answer "I paid", "I never registered", "I did not change my package" with times. They sit
in the same transaction as the change they describe (the caller commits), and never hold
secrets: no password, no code and no e-mail address.
"""
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.graduate import GraduateModel
from app.services.audit_log import ActorType, record_audit
from app.services.registration_window import get_college_event


async def audit_graduate(
    db: AsyncSession,
    graduate: GraduateModel,
    action: str,
    details: str,
    *,
    ticket_id: int | None = None,
    event_id: int | None = None,
) -> None:
    if event_id is None and graduate.college_id:
        event = await get_college_event(db, graduate.college_id)
        event_id = event.id if event is not None else None
    await record_audit(
        db,
        ActorType.GRADUATE,
        graduate.id,
        action,
        f"Graduate ID {graduate.id}",
        details,
        event_id=event_id,
        graduate_id=graduate.id,
        ticket_id=ticket_id,
    )
