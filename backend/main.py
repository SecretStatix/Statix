"""
Statix - FastAPI Backend
NBA athlete stock market with weekly dividends.
"""

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from routes.players import router as players_router
from routes.trading import router as trading_router
from routes.dividends import router as dividends_router
from routes.admin import router as admin_router

app = FastAPI(
    title="Statix API",
    description="NBA Athlete Stock Market with Weekly Dividends",
    version="2.0.0",
)

_raw_origins = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,https://claude-foundation.vercel.app",
).split(",")
# Strip whitespace so "https://a.com, https://b.com" matches browser Origin exactly.
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(players_router, prefix="/api/players", tags=["Players"])
app.include_router(trading_router, prefix="/api/trading", tags=["Trading"])
app.include_router(dividends_router, prefix="/api/dividends", tags=["Dividends"])
app.include_router(admin_router, prefix="/api/admin", tags=["Admin"])


@app.get("/")
async def root():
    return {"name": "Statix API", "version": "2.0.0", "status": "running"}


@app.get("/health")
async def health():
    return {"status": "healthy"}


@app.get("/health/db")
async def health_db():
    """Check Supabase connectivity and table access."""
    from db import get_supabase

    sb = get_supabase()
    if sb is None:
        return {
            "status": "degraded",
            "supabase": False,
            "detail": "Supabase not configured — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
        }

    checks = {}
    tables = ["profiles", "transactions", "dividend_claims"]

    for table in tables:
        try:
            res = sb.table(table).select("*", count="exact").limit(0).execute()
            checks[table] = {"ok": True, "row_count": res.count}
        except Exception as e:
            checks[table] = {"ok": False, "error": str(e)}

    all_ok = all(c["ok"] for c in checks.values())

    return {
        "status": "healthy" if all_ok else "degraded",
        "supabase": True,
        "tables": checks,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
