from fastapi import FastAPI
from app.routers import graduates, auth, admin_graduates

app = FastAPI(
    title="Graduation Ticket System API",
    description="API for issuing and scanning graduation ceremony tickets.",
    version="1.0.0",
)

app.include_router(graduates.router)
app.include_router(auth.router)
app.include_router(admin_graduates.router)

@app.get("/")
def read_root():
    return {"message": "Welcome to the Graduation Ticket System API"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}
