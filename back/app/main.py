import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import graduates, auth, admin_graduates, admin_university_records, admin_auth, admin_events, graduate_auth

app = FastAPI(
    title="Graduation Ticket System API",
    description="API for issuing and scanning graduation ceremony tickets.",
    version="1.0.0",
)

_cors_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]

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
def health_check():
    return {"status": "healthy"}
