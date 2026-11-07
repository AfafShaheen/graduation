from datetime import UTC, datetime, timedelta
from decimal import Decimal
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select
from fastapi import HTTPException, status
from app.models.graduate import GraduateModel
from app.models.university_record import UniversityRecordModel
from app.models.college import CollegeModel
from app.models.event import EventModel
from app.models.major import MajorModel
from app.schemas.graduate import UserVerifyStep1, RegisterStep2Request
from app.services.email_service import OtpPurpose
from app.services.auth_service import issue_and_send_otp
from app.services.graduate_audit import audit_graduate
from app.services.ranking_service import compute_top_rank
from sqlalchemy.exc import IntegrityError
from app.core import messages
from app.core.redis import redis_client
from app.core.names import clean_typed_name, name_key, normalize_arabic as _normalize_arabic
from app.core.security import secret_key, create_verification_token
from app.services.settings_service import get_setting, CONTACT_PHONE
from app.services.registration_window import get_college_event, ensure_registration_open
import bcrypt
import re
from jose import jwt, JWTError
import logging

logger = logging.getLogger(__name__)

ALGORITHM = "HS256"
TOKEN_EXPIRE_MINUTES = 15
_VERIFICATION_FIELD = "verification" + "_token"


async def _generic_verify_fail(db: AsyncSession) -> str:
    phone = await get_setting(db, CONTACT_PHONE)
    return messages.append_contact_phone(messages.GENERIC_VERIFY_FAIL, phone)


async def _register_fail(db: AsyncSession) -> str:
    phone = await get_setting(db, CONTACT_PHONE)
    return messages.append_contact_phone(messages.REGISTER_FAIL, phone)


async def _email_already_used(db: AsyncSession) -> str:
    phone = await get_setting(db, CONTACT_PHONE)
    return messages.append_contact_phone(messages.EMAIL_ALREADY_USED, phone)


async def _no_event_for_college(db: AsyncSession) -> str:
    phone = await get_setting(db, CONTACT_PHONE)
    return messages.append_contact_phone(messages.NO_EVENT_FOR_COLLEGE, phone)


# the spelling rules live in app/core/names.py (matching is loose, what is typed is what is stored)
normalize_arabic = _normalize_arabic


_TOP_ANY = "ANY"


def _names_match(record: UniversityRecordModel, data: UserVerifyStep1) -> bool:
    """Compare the graduate names, supporting both the split and legacy layouts."""
    if data.first_name is not None and data.last_name is not None:
        if record.first_name is not None and record.last_name is not None:
            return (
                name_key(record.first_name) == name_key(data.first_name)
                and name_key(record.last_name) == name_key(data.last_name)
            )
        composed = f"{data.first_name} {data.last_name}"
        return name_key(composed) == name_key(record.full_name)

    # Legacy payload: a single full name.
    if record.first_name is not None and record.last_name is not None:
        composed = f"{record.first_name} {record.last_name}"
        return name_key(data.full_name or "") == name_key(composed)
    return name_key(data.full_name or "") == name_key(record.full_name)


def _top_rank_error(code: str, message: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={"message": message, "code": code},
    )


def create_registration_token(data: dict) -> str:
    expire = datetime.now(UTC) + timedelta(minutes=TOKEN_EXPIRE_MINUTES)
    to_encode = data.copy()
    to_encode.update({"exp": expire, "purpose": "registration"})
    return jwt.encode(to_encode, secret_key, algorithm=ALGORITHM)


def decode_registration_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, secret_key, algorithms=[ALGORITHM])
        if payload.get("purpose") != "registration":
            raise JWTError("invalid token purpose")
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="انتهت جلسة التسجيل. يرجى إعادة الخطوة الأولى."
        )


# Verification attempts. One person (one address) may try 10 times in 5 minutes for a university id;
# all addresses together may try 60 times. So nobody can lock another student out of registering
# from his own phone, and a distributed guess is still stopped.
STEP1_ATTEMPTS_PER_ADDRESS = 10
STEP1_ATTEMPTS_PER_ID = 60
STEP1_WINDOW_SECONDS = 300


async def check_step1_rate_limit(university_id: str, client_ip: str | None = None) -> None:
    per_address = f"rate_limit:step1:{university_id}:{client_ip or 'unknown'}"
    per_id = f"rate_limit:step1:{university_id}"
    try:
        for key, limit in ((per_address, STEP1_ATTEMPTS_PER_ADDRESS), (per_id, STEP1_ATTEMPTS_PER_ID)):
            attempts = await redis_client.get(key)
            if attempts and int(attempts) >= limit:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=messages.VERIFY_RATE_LIMITED,
                )
        for key in (per_address, per_id):
            # the window starts at the first attempt and is never pushed back by later ones
            await redis_client.set(key, 0, ex=STEP1_WINDOW_SECONDS, nx=True)
            await redis_client.incr(key)
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Redis step1 rate-limit check failed (%s); failing open", exc)


async def verify_step1_service(db: AsyncSession, data: UserVerifyStep1, client_ip: str | None = None) -> dict:
    await check_step1_rate_limit(data.university_id, client_ip)

    event = await get_college_event(db, data.college_id)
    if event is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=await _generic_verify_fail(db)
        )
    await ensure_registration_open(event)

    uni_record_result = await db.execute(
        select(UniversityRecordModel).where(
            UniversityRecordModel.university_id == data.university_id,
            UniversityRecordModel.college_id == data.college_id,
            # the ceremony of this college now: an older ceremony may still hold a stale copy
            UniversityRecordModel.event_id == event.id,
        )
    )
    uni_record = uni_record_result.scalar_one_or_none()

    if not uni_record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=await _generic_verify_fail(db)
        )

    if not _names_match(uni_record, data):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=await _generic_verify_fail(db)
        )

    if (
        name_key(uni_record.father_name) != name_key(data.father_name) or
        name_key(uni_record.mother_name) != name_key(data.mother_name) or
        normalize_arabic(uni_record.gender) != normalize_arabic(data.gender)
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=await _generic_verify_fail(db)
        )

    # 1. If major_id is given, it must belong to data.college_id.
    if data.major_id is not None:
        major = await db.get(MajorModel, data.major_id)
        if not major or major.college_id != data.college_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=await _generic_verify_fail(db)
            )

    # 2. data.major_id == uni_record.major_id (None == None is a match).
    if data.major_id != uni_record.major_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=await _generic_verify_fail(db)
        )

    # The file GPA and phone are never matched (D2). They are stored only.

    # 3. Top-student status (D3/D11). The file column is authoritative when
    #    present; otherwise the dense ranking by GPA is the fallback.
    if uni_record.top_rank_from_file is None:
        expected_top: int | str | None = await compute_top_rank(db, uni_record)
    elif uni_record.top_rank_from_file == -1:
        expected_top = _TOP_ANY
    elif uni_record.top_rank_from_file == 0:
        expected_top = None
    else:
        expected_top = uni_record.top_rank_from_file

    if expected_top == _TOP_ANY:
        if data.top_rank is None:
            raise _top_rank_error(
                "TOP_RANK_SHOULD_BE_HONOR", messages.TOP_RANK_SHOULD_BE_HONOR
            )
    elif expected_top is None:
        if data.top_rank is not None:
            raise _top_rank_error(
                "TOP_RANK_NOT_HONOR", messages.TOP_RANK_NOT_HONOR
            )
    else:
        if data.top_rank is None:
            raise _top_rank_error(
                "TOP_RANK_SHOULD_BE_HONOR", messages.TOP_RANK_SHOULD_BE_HONOR
            )
        if data.top_rank != expected_top:
            raise _top_rank_error(
                "TOP_RANK_MISMATCH", messages.TOP_RANK_MISMATCH
            )

    # The graduate's GPA is optional; when absent the authoritative record GPA
    # is carried forward (D2).
    if data.gpa is not None:
        gpa_to_store = data.gpa
    else:
        gpa_to_store = uni_record.gpa

    # Already-registered check runs LAST: the specific message is reachable
    # only after the caller proved knowledge of the full university record,
    # so it cannot be used to probe which university ids are registered.
    existing_grad = (
        await db.execute(
            select(GraduateModel).where(GraduateModel.university_id == data.university_id)
        )
    ).scalar_one_or_none()
    if existing_grad is not None:
        # Unverified account: do not issue a new registration token; guide login + OTP.
        if not existing_grad.email_verified:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "ACCOUNT_UNVERIFIED",
                    "message": messages.ACCOUNT_UNVERIFIED,
                },
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=messages.UNIVERSITY_ID_ALREADY_REGISTERED,
        )

    token_payload = {
        "university_record_id": uni_record.id,
        "university_id": data.university_id,
        "college_id": data.college_id,
        "gpa": str(gpa_to_store) if gpa_to_store is not None else None,
        "top_rank": data.top_rank,
        # what he typed (cleaned) is what the account keeps and what is printed; the file's
        # spelling is only used to recognise him
        "typed_first_name": clean_typed_name(data.first_name) or None,
        "typed_last_name": clean_typed_name(data.last_name) or None,
        "typed_father_name": clean_typed_name(data.father_name) or None,
        "typed_mother_name": clean_typed_name(data.mother_name) or None,
    }
    registration_token = create_registration_token(token_payload)

    return {
        "valid": True,
        "registration_token": registration_token
    }


async def register_step2_service(db: AsyncSession, data: RegisterStep2Request) -> dict:
    payload = decode_registration_token(data.registration_token)
    university_id = payload.get("university_id")
    college_id = payload.get("college_id")
    full_name = payload.get("full_name")
    first_name = payload.get("first_name")
    last_name = payload.get("last_name")
    gender = payload.get("gender")
    father_name = payload.get("father_name")
    mother_name = payload.get("mother_name")
    major_id = payload.get("major_id")
    gpa_str = payload.get("gpa")
    top_rank = payload.get("top_rank")
    gpa_val = Decimal(gpa_str) if gpa_str is not None else None

    record_id = payload.get("university_record_id")
    if record_id is not None:
        record = await db.get(UniversityRecordModel, int(record_id))
        if (
            record is None
            or record.university_id != university_id
            or record.college_id != college_id
        ):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="انتهت جلسة التسجيل. يرجى إعادة الخطوة الأولى."
            )
        full_name = record.full_name
        first_name = record.first_name
        last_name = record.last_name
        gender = record.gender
        father_name = record.father_name
        mother_name = record.mother_name
        major_id = record.major_id

    # the names he typed replace the file's spelling (a token from before this rule has none)
    typed_first = payload.get("typed_first_name")
    typed_last = payload.get("typed_last_name")
    if typed_first and typed_last:
        first_name = typed_first
        last_name = typed_last
        full_name = f"{typed_first} {typed_last}"
    if payload.get("typed_father_name"):
        father_name = payload["typed_father_name"]
    if payload.get("typed_mother_name"):
        mother_name = payload["typed_mother_name"]

    if not university_id or not college_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="انتهت جلسة التسجيل. يرجى إعادة الخطوة الأولى."
        )

    # One account per graduate: a step-1 token can be reused (it stays in the
    # browser), so re-check here that no account exists for this university id
    # (any college) before creating one with a different email.
    existing_grad = (
        await db.execute(
            select(GraduateModel).where(GraduateModel.university_id == university_id)
        )
    ).scalar_one_or_none()
    if existing_grad is not None:
        if not existing_grad.email_verified:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "ACCOUNT_UNVERIFIED",
                    "message": messages.ACCOUNT_UNVERIFIED,
                },
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=messages.UNIVERSITY_ID_ALREADY_REGISTERED,
        )

    event = await get_college_event(db, college_id)
    if event is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=await _no_event_for_college(db)
        )
    await ensure_registration_open(event)

    normalized_email = str(data.email).strip().lower()
    email_check = await db.execute(
        select(GraduateModel).where(func.lower(GraduateModel.email) == normalized_email)
    )
    if email_check.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=await _email_already_used(db)
        )

    password_hash = bcrypt.hashpw(data.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    new_graduate = GraduateModel(
        full_name=full_name,
        first_name=first_name,
        last_name=last_name,
        gender=gender,
        college_id=college_id,
        email=normalized_email,
        phone=data.phone,
        email_verified=False,
        father_name=father_name,
        mother_name=mother_name,
        password_hash=password_hash,
        university_id=university_id,
        major_id=major_id,
        gpa=gpa_val,
        top_rank=top_rank,
    )
    try:
        db.add(new_graduate)
        await db.flush()
        await db.refresh(new_graduate)
        await audit_graduate(db, new_graduate, "ACCOUNT_CREATED", "تم إنشاء الحساب من بيانات سجل جامعي.", event_id=event.id)
    except IntegrityError:
        # Race between two concurrent registrations (unique email/university id).
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=await _register_fail(db)
        )

    sent = await issue_and_send_otp(db, new_graduate, OtpPurpose.EMAIL_VERIFICATION, new_graduate.email)

    message = (
        "تم إنشاء الحساب بنجاح. يرجى إدخال رمز التحقق المرسل إلى بريدك الإلكتروني لتفعيله."
        if sent
        else messages.REGISTER_PARTIAL
    )

    return {
        "status": "success",
        "message": message,
        "graduate_id": new_graduate.id,
        "otp_sent": sent,
        _VERIFICATION_FIELD: create_verification_token(new_graduate.id),
    }


async def fetch_graduate(db: AsyncSession, graduate_id: int) -> GraduateModel | None:
    stmt = select(GraduateModel).where(GraduateModel.id == graduate_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_graduate_me_service(db: AsyncSession, graduate: GraduateModel) -> dict:
    college = await db.get(CollegeModel, graduate.college_id)
    college_name = college.name if college else ""
    major_name = None
    if graduate.major_id:
        major = await db.get(MajorModel, graduate.major_id)
        if major:
            major_name = major.name
    return {
        "full_name": graduate.full_name,
        "university_id": graduate.university_id,
        "college_name": college_name,
        "major_name": major_name,
        "gpa": graduate.gpa,
        "top_rank": graduate.top_rank,
        "unique_graduate_code": graduate.unique_graduate_code
    }
