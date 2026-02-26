"""
Dividend Fantasy - FastAPI Backend
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
    title="Dividend Fantasy API",
    description="NBA Player Stock Market with Weekly Dividends",
    version="2.0.0",
)

ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,https://claude-foundation.vercel.app").split(",")

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
    return {"name": "Dividend Fantasy API", "version": "2.0.0", "status": "running"}


@app.get("/health")
async def health():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
