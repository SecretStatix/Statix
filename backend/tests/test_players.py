"""
API tests for /api/players routes.
Run through:
    cd backend
    python -m pytest tests/ -v
"""



from unittest.mock import patch


REQUIRED_PLAYER_FIELDS = [
    "index", "id", "name", "team", "symbol", "nba_id",
    "position", "avg_fantasy_points", "weekly_projection",
    "season_projection", "avg_stats",
]


class TestListPlayers:
    """GET /api/players/"""

    def test_returns_200(self, client):
        response = client.get("/api/players/")
        assert response.status_code == 200

    def test_returns_array(self, client):
        response = client.get("/api/players/")
        data = response.json()
        assert isinstance(data, list)

    def test_returns_50_players(self, client):
        response = client.get("/api/players/")
        data = response.json()
        assert len(data) == 50

    def test_each_player_has_required_fields(self, client):
        response = client.get("/api/players/")
        data = response.json()
        for player in data:
            for field in REQUIRED_PLAYER_FIELDS:
                assert field in player, f"Missing field '{field}' in player {player.get('id')}"

    def test_players_have_valid_structure(self, client):
        response = client.get("/api/players/")
        data = response.json()
        first = data[0]
        assert isinstance(first["index"], int)
        assert isinstance(first["id"], str)
        assert isinstance(first["name"], str)
        assert isinstance(first["nba_id"], int)
        assert isinstance(first["avg_stats"], dict)


class TestGetPlayer:
    """GET /api/players/{player_id}"""

    def test_get_by_id_returns_200(self, client):
        response = client.get("/api/players/shai_gilgeous_alexander")
        assert response.status_code == 200

    def test_get_by_id_returns_player(self, client):
        response = client.get("/api/players/shai_gilgeous_alexander")
        data = response.json()
        assert data["id"] == "shai_gilgeous_alexander"
        assert data["name"] == "Shai Gilgeous-Alexander"
        assert "team" in data

    def test_get_by_index_returns_200(self, client):
        response = client.get("/api/players/0")
        assert response.status_code == 200

    def test_get_by_index_returns_same_player(self, client):
        by_id = client.get("/api/players/shai_gilgeous_alexander").json()
        by_index = client.get("/api/players/0").json()
        assert by_id["id"] == by_index["id"]
        assert by_id["index"] == by_index["index"]

    def test_nonexistent_player_returns_404(self, client):
        response = client.get("/api/players/nonexistent_player_xyz")
        assert response.status_code == 404
        assert "detail" in response.json()


class TestGetPlayerGames:
    """GET /api/players/{player_id}/games"""

    @patch("routes.players.fetch_player_game_log")
    def test_returns_200_with_mock_games(self, mock_fetch, client):
        mock_fetch.return_value = [
            {"date": "Jan 1, 2025", "matchup": "OKC vs LAL", "fantasy_points": 45.2},
        ]
        response = client.get("/api/players/shai_gilgeous_alexander/games")
        assert response.status_code == 200

    @patch("routes.players.fetch_player_game_log")
    def test_returns_player_id_and_games(self, mock_fetch, client):
        mock_games = [
            {"date": "Jan 1, 2025", "matchup": "OKC vs LAL", "fantasy_points": 45.2},
        ]
        mock_fetch.return_value = mock_games
        response = client.get("/api/players/shai_gilgeous_alexander/games")
        data = response.json()
        assert data["player_id"] == "shai_gilgeous_alexander"
        assert data["games"] == mock_games

    @patch("routes.players.fetch_player_game_log")
    def test_passes_last_n_query_param(self, mock_fetch, client):
        mock_fetch.return_value = []
        client.get("/api/players/shai_gilgeous_alexander/games?last_n=5")
        mock_fetch.assert_called_once()
        call_kwargs = mock_fetch.call_args[1]
        assert call_kwargs.get("last_n_games") == 5

    def test_nonexistent_player_returns_404(self, client):
        response = client.get("/api/players/nonexistent_player_xyz/games")
        assert response.status_code == 404

    def test_invalid_last_n_returns_422(self, client):
        response = client.get("/api/players/shai_gilgeous_alexander/games?last_n=200")
        assert response.status_code == 422
