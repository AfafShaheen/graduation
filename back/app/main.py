import os
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.redis import redis_client
from app.routers import graduates, auth, admin_graduates, admin_university_records, admin_auth, admin_events, graduate_auth

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
app.include_router(graduate_auth.router)

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
        healthy = False
        details["database"] = "error"
    try:
        await redis_client.ping()
    except Exception:
        healthy = False
        details["redis"] = "error"
    if not healthy:
        return JSONResponse(status_code=503, content={"status": "unhealthy", "details": details})
    return {"status": "healthy", "details": details}
