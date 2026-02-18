"""
Players API - NBA player data and stats
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import httpx

router = APIRouter()


# ============== MODELS ==============

class Player(BaseModel):
    id: str
    name: str
    team: str
    position: str
    projected_points: float  # Season projection
    current_points: float    # Actual points so far
    games_played: int
    token_address: Optional[str] = None
    amm_address: Optional[str] = None
    price: Optional[float] = None  # Current AMM price


class PlayerPerformance(BaseModel):
    player_id: str
    week: int
    projected_points: float  # Weekly projection
    actual_points: float     # Actual points this week
    outperformance: float    # (actual - projected) / projected


class WeeklyStats(BaseModel):
    points: float
    rebounds: float
    assists: float
    steals: float
    blocks: float
    turnovers: float
    minutes: float
    fantasy_points: float  # Calculated fantasy points


# ============== MOCK DATA (Replace with real NBA API) ==============

MOCK_PLAYERS = {
    "lebron_james": Player(
        id="lebron_james",
        name="LeBron James",
        team="LAL",
        position="SF",
        projected_points=1500,
        current_points=450,
        games_played=25,
        token_address="0x...",
        amm_address="0x...",
        price=10.0
    ),
    "stephen_curry": Player(
        id="stephen_curry",
        name="Stephen Curry",
        team="GSW",
        position="PG",
        projected_points=1600,
        current_points=520,
        games_played=26,
        price=12.0
    ),
    "giannis_antetokounmpo": Player(
        id="giannis_antetokounmpo",
        name="Giannis Antetokounmpo",
        team="MIL",
        position="PF",
        projected_points=1700,
        current_points=560,
        games_played=27,
        price=14.0
    ),
    "luka_doncic": Player(
        id="luka_doncic",
        name="Luka Doncic",
        team="DAL",
        position="PG",
        projected_points=1650,
        current_points=510,
        games_played=25,
        price=13.0
    ),
    "nikola_jokic": Player(
        id="nikola_jokic",
        name="Nikola Jokic",
        team="DEN",
        position="C",
        projected_points=1800,
        current_points=600,
        games_played=28,
        price=15.0
    ),
}

MOCK_WEEKLY_PERFORMANCE = {
    "lebron_james": {
        1: PlayerPerformance(player_id="lebron_james", week=1, projected_points=88, actual_points=95, outperformance=0.08),
        2: PlayerPerformance(player_id="lebron_james", week=2, projected_points=88, actual_points=102, outperformance=0.16),
        3: PlayerPerformance(player_id="lebron_james", week=3, projected_points=88, actual_points=78, outperformance=-0.11),
    },
    "stephen_curry": {
        1: PlayerPerformance(player_id="stephen_curry", week=1, projected_points=94, actual_points=110, outperformance=0.17),
        2: PlayerPerformance(player_id="stephen_curry", week=2, projected_points=94, actual_points=88, outperformance=-0.06),
        3: PlayerPerformance(player_id="stephen_curry", week=3, projected_points=94, actual_points=105, outperformance=0.12),
    },
}


# ============== FANTASY POINTS CALCULATION ==============

def calculate_fantasy_points(stats: WeeklyStats) -> float:
    """
    Calculate fantasy points using standard scoring:
    - Points: 1 pt
    - Rebounds: 1.2 pts
    - Assists: 1.5 pts
    - Steals: 3 pts
    - Blocks: 3 pts
    - Turnovers: -1 pt
    """
    return (
        stats.points * 1.0 +
        stats.rebounds * 1.2 +
        stats.assists * 1.5 +
        stats.steals * 3.0 +
        stats.blocks * 3.0 +
        stats.turnovers * -1.0
    )


def calculate_outperformance(actual: float, projected: float) -> float:
    """Calculate outperformance ratio"""
    if projected == 0:
        return 0
    return (actual - projected) / projected


# ============== ENDPOINTS ==============

@router.get("/", response_model=List[Player])
async def list_players():
    """Get all available players"""
    return list(MOCK_PLAYERS.values())


@router.get("/{player_id}", response_model=Player)
async def get_player(player_id: str):
    """Get player details by ID"""
    if player_id not in MOCK_PLAYERS:
        raise HTTPException(status_code=404, detail="Player not found")
    return MOCK_PLAYERS[player_id]


@router.get("/{player_id}/performance", response_model=List[PlayerPerformance])
async def get_player_performance(player_id: str):
    """Get player's weekly performance history"""
    if player_id not in MOCK_PLAYERS:
        raise HTTPException(status_code=404, detail="Player not found")

    performances = MOCK_WEEKLY_PERFORMANCE.get(player_id, {})
    return list(performances.values())


@router.get("/{player_id}/performance/{week}", response_model=PlayerPerformance)
async def get_player_week_performance(player_id: str, week: int):
    """Get player's performance for a specific week"""
    if player_id not in MOCK_PLAYERS:
        raise HTTPException(status_code=404, detail="Player not found")

    performances = MOCK_WEEKLY_PERFORMANCE.get(player_id, {})
    if week not in performances:
        raise HTTPException(status_code=404, detail="Week not found")

    return performances[week]


@router.get("/outperformers/{week}")
async def get_week_outperformers(week: int):
    """Get all players who outperformed their projection in a given week"""
    outperformers = []

    for player_id, weeks in MOCK_WEEKLY_PERFORMANCE.items():
        if week in weeks:
            perf = weeks[week]
            if perf.outperformance > 0:
                outperformers.append({
                    "player_id": player_id,
                    "player_name": MOCK_PLAYERS[player_id].name,
                    "outperformance": perf.outperformance,
                    "actual_points": perf.actual_points,
                    "projected_points": perf.projected_points
                })

    # Sort by outperformance descending
    outperformers.sort(key=lambda x: x["outperformance"], reverse=True)
    return outperformers


# ============== NBA API INTEGRATION (Future) ==============

async def fetch_nba_stats(player_id: str, season: str = "2024-25"):
    """
    Fetch real NBA stats from NBA API
    TODO: Implement real API integration

    NBA Stats API: https://stats.nba.com/stats/
    Alternative: https://www.balldontlie.io/api/v1/
    """
    # This would be the real implementation
    # async with httpx.AsyncClient() as client:
    #     response = await client.get(
    #         f"https://stats.nba.com/stats/playergamelog",
    #         params={"PlayerID": player_id, "Season": season}
    #     )
    #     return response.json()
    pass
