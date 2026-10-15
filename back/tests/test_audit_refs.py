"""Audit-log structured references (item 3.5.1).

Verifies the shared ``record_audit`` helper persists the new
``event_id`` / ``graduate_id`` / ``ticket_id`` columns, that a real audited
action fills them, and that the duplicated legacy ``write_audit_log`` helpers
are gone from ``app/``.
"""

from pathlib import Path

from sqlalchemy import select

from app.models.audit_log import AuditLogModel
from app.services.admin_graduate_service import revert_payment_service
from app.services.audit_log import ActorType, record_audit


def _app_sources() -> str:
    app_dir = Path(__file__).resolve().parents[1] / "app"
    return "\n".join(p.read_text(encoding="utf-8") for p in app_dir.rglob("*.py"))


def test_legacy_write_audit_log_helper_is_gone():
    assert "write_audit_log" not in _app_sources()


async def test_record_audit_persists_refs(db):
    await record_audit(
        db,
        ActorType.ADMIN,
        1,
        "TEST_ACTION",
        "target",
        "details",
        event_id=11,
        graduate_id=22,
        ticket_id=33,
    )
    await db.commit()

    row = (
        await db.execute(
            select(AuditLogModel).where(AuditLogModel.action == "TEST_ACTION")
        )
    ).scalar_one()
    assert (row.event_id, row.graduate_id, row.ticket_id) == (11, 22, 33)


async def test_record_audit_refs_default_to_null(db):
    await record_audit(db, ActorType.ADMIN, 1, "TEST_ACTION_NULL", "target")
    await db.commit()

    row = (
        await db.execute(
            select(AuditLogModel).where(AuditLogModel.action == "TEST_ACTION_NULL")
        )
    ).scalar_one()
    assert row.event_id is None
    assert row.graduate_id is None
    assert row.ticket_id is None


async def test_revert_payment_audit_has_refs(
    db, make_event, make_college, make_graduate, make_ticket, make_admin
):
    admin = await make_admin()
    event = await make_event()
    college = await make_college(event.id)
    graduate = await make_graduate(college.id)
    ticket = await make_ticket(graduate.id, event.id)

    await revert_payment_service(db, ticket.id, {"admin_id": admin.id})

    row = (
        await db.execute(
            select(AuditLogModel).where(AuditLogModel.action == "REVERT_PAYMENT")
        )
    ).scalar_one()
    assert row.event_id == event.id
    assert row.graduate_id == graduate.id
    assert row.ticket_id == ticket.id
