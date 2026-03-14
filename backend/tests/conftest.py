"""
Pytest fixtures for API tests.
"""

import pytest
from fastapi.testclient import TestClient

from main import app


@pytest.fixture
def client() -> TestClient:
    """FastAPI TestClient - runs app in-process, no server needed."""
    return TestClient(app)
