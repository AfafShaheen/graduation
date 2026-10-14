"""Thin adapter between the HTTP scan endpoint and ``qr_service`` (FR-25).

The heavy lifting (locking, decision order, audit trail) lives in
``app.services.qr_service``. This module only turns the domain ``ScanResult``
into the JSON contract mandated by D13: always HTTP 200 with a ``valid`` flag
and never any personal data of the graduate.
"""

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import messages
from app.models.scanner import ScannerModel
from app.services.qr_service import ScanDecision, ScannerNotFoundError, scan_qr_code


async def scan_service(db: AsyncSession, code: str, scanner: ScannerModel) -> dict:
    try:
        result = await scan_qr_code(db, code, scanner.id)
    except ScannerNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=messages.SCANNER_NOT_FOUND,
        )

    return {
        "valid": result.decision == ScanDecision.SUCCESS,
        "decision": result.decision.value,
        "message": result.message,
        "code_type": result.code_type.value if result.code_type else None,
    }
