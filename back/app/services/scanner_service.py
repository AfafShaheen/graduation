"""Admin management of scanner accounts (SRS FR-20).

A scanner account is a username + password bound to exactly one event; several
accounts may be bound to the same event. Passwords are hashed with bcrypt and
never returned. Every change is written to the audit log.
"""

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import messages
from app.core.security import get_password_hash
from app.models.event import EventModel
from app.models.scanner import ScannerModel
from app.schemas.scanner import ScannerCreate
from app.services.audit_log import ActorType, record_audit


def _serialize(scanner: ScannerModel) -> dict:
    """Return the public shape of a scanner (never the password or its hash)."""
    return {
        "id": scanner.id,
        "username": scanner.username,
        "event_id": scanner.event_id,
        "created_at": scanner.created_at,
    }


async def create_scanner_service(
    db: AsyncSession, data: ScannerCreate, admin: dict
) -> ScannerModel:
    """Create a scanner account bound to an event (FR-20)."""
    event = await db.get(EventModel, data.event_id)
    if event is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=messages.EVENT_NOT_FOUND
        )

    scanner = ScannerModel(
        username=data.username,
        password_hash=get_password_hash(data.password),
        created_by_admin_id=admin["admin_id"],
        event_id=data.event_id,
    )
    db.add(scanner)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=messages.SCANNER_USERNAME_TAKEN,
        )

    await record_audit(
        db,
        ActorType.ADMIN,
        admin["admin_id"],
        "SCANNER_CREATED",
        f"Scanner ID {scanner.id}",
        f"username={scanner.username}, event_id={scanner.event_id}",
        event_id=scanner.event_id,
    )
    await db.commit()
    await db.refresh(scanner)
    return scanner


async def list_scanners_service(
    db: AsyncSession, event_id: int | None = None
) -> list[dict]:
    """List scanner accounts, optionally filtered by event (FR-20)."""
    stmt = select(ScannerModel)
    if event_id is not None:
        stmt = stmt.where(ScannerModel.event_id == event_id)
    stmt = stmt.order_by(ScannerModel.id)

    result = await db.execute(stmt)
    return [_serialize(scanner) for scanner in result.scalars().all()]


async def delete_scanner_service(
    db: AsyncSession, scanner_id: int, admin: dict
) -> dict:
    """Revoke (delete) a scanner account; scan history is kept (FR-20)."""
    scanner = await db.get(ScannerModel, scanner_id)
    if scanner is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=messages.SCANNER_NOT_FOUND
        )

    username = scanner.username
    event_id = scanner.event_id
    await db.delete(scanner)
    await db.flush()

    await record_audit(
        db,
        ActorType.ADMIN,
        admin["admin_id"],
        "SCANNER_DELETED",
        f"Scanner ID {scanner_id}",
        f"username={username}",
        event_id=event_id,
    )
    await db.commit()
    return {"message": messages.SCANNER_DELETED}
