"""Admin management of scanner accounts (SRS FR-20).

A scanner account is a username + password bound to exactly one event; several
accounts may be bound to the same event. Passwords are hashed with bcrypt and
never returned. Every change is written to the audit log.
"""

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import messages
import secrets

from app.core.secret_box import decrypt_text, encrypt_text
from app.core.security import get_password_hash
from app.services import refresh_token_service as refresh_store
from app.models.event import EventModel
from app.models.scanner import ScannerModel
from app.schemas.scanner import ScannerCreate
from app.services.audit_log import ActorType, record_audit


def _serialize(scanner: ScannerModel) -> dict:
    """The shape the admin sees: the password is shown as it is (decrypted copy), or None when this
    scanner was made before copies were kept (a reset gives it one). The hash never leaves."""
    return {
        "id": scanner.id,
        "username": scanner.username,
        "event_id": scanner.event_id,
        "created_at": scanner.created_at,
        "password": decrypt_text(scanner.password_enc),
    }


_PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ"
_PASSWORD_DIGITS = "23456789"


def generate_scanner_password(length: int = 10) -> str:
    """A password a volunteer can read and type: no look-alike characters, letters and digits both."""
    chars = [secrets.choice(_PASSWORD_ALPHABET) for _ in range(length - 3)]
    chars += [secrets.choice(_PASSWORD_DIGITS) for _ in range(3)]
    secrets.SystemRandom().shuffle(chars)
    return "".join(chars)


async def create_scanner_service(
    db: AsyncSession, data: ScannerCreate, admin: dict
) -> ScannerModel:
    """Create a scanner account bound to an event (FR-20)."""
    event = await db.get(EventModel, data.event_id)
    if event is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=messages.EVENT_NOT_FOUND
        )

    # "Gate1" and "gate1" are the same name at the door: refuse the second one on the same event
    clash = await db.scalar(
        select(ScannerModel.id).where(
            ScannerModel.event_id == data.event_id,
            func.lower(ScannerModel.username) == data.username.lower(),
        )
    )
    if clash is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=messages.SCANNER_USERNAME_TAKEN,
        )

    scanner = ScannerModel(
        username=data.username,
        password_hash=get_password_hash(data.password),
        password_enc=encrypt_text(data.password),
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
    return _serialize(scanner)


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


async def reset_scanner_password_service(
    db: AsyncSession, scanner_id: int, admin: dict, new_password: str | None = None
) -> dict:
    """A new password for a scanner (generated unless one is given), shown to the admin as it is.

    The scanner's refresh sessions end, so the old password stops being the one in use; the log
    records the reset but never the password.
    """
    scanner = await db.get(ScannerModel, scanner_id)
    if scanner is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=messages.SCANNER_NOT_FOUND
        )
    password = new_password or generate_scanner_password()
    scanner.password_hash = get_password_hash(password)
    scanner.password_enc = encrypt_text(password)
    db.add(scanner)
    await db.flush()
    await record_audit(
        db,
        ActorType.ADMIN,
        admin["admin_id"],
        "SCANNER_PASSWORD_RESET",
        f"Scanner ID {scanner_id}",
        f"username={scanner.username}",
        event_id=scanner.event_id,
    )
    await db.commit()
    await db.refresh(scanner)
    try:
        await refresh_store.revoke_subject(str(scanner_id), "scanner")
    except Exception:  # Redis down: the new password still works, the old sessions just expire by themselves
        pass
    return _serialize(scanner)


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
