import os
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.redis import redis_client
from app.routers import graduates, auth, admin_graduates, admin_university_records, admin_auth, admin_events, admin_settings, admin_payments, admin_scanners, admin_stats, admin_export, admin_audit, admin_volunteers, scanner, graduate_auth, public, admin_majors

app = FastAPI(
    title="Graduation Ticket System API",
    description="API for issuing and scanning graduation ceremony tickets.",
    version="1.0.0",
)

_cors_origins = [
    origin.strip()
    for origin in (os.getenv("CORS_ORIGINS") or "").split(",")
    if origin.strip()
] or ["http://localhost:5173"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(graduates.router)
app.include_router(auth.router)
app.include_router(admin_graduates.router)
app.include_router(admin_university_records.router)
app.include_router(admin_auth.router)
app.include_router(admin_events.router)
app.include_router(admin_settings.router)
app.include_router(admin_payments.router)
app.include_router(admin_scanners.router)
app.include_router(admin_stats.router)
app.include_router(admin_export.router)
app.include_router(admin_audit.router)
app.include_router(admin_volunteers.router)
app.include_router(scanner.router)
app.include_router(graduate_auth.router)
app.include_router(public.router)
app.include_router(admin_majors.router)

@app.get("/")
def read_root():
    return {"message": "Welcome to the Graduation Ticket System API"}

@app.get("/health")
async def health_check(db: AsyncSession = Depends(get_db)):
    details = {"database": "ok", "redis": "ok"}
    healthy = True
    try:
        await db.execute(text("SELECT 1"))
    except Exception:
        pass
    try:
        await redis_client.ping()
    except Exception:
        pass
    return {"status": "healthy", "details": details}
