import os
import json
import shutil
import tempfile
import unittest

# Initialize a temporary directory for testing before importing app to avoid polluting the repo files
TEST_DIR = tempfile.mkdtemp()
TEST_DB_FILE = os.path.join(TEST_DIR, "used_matches_test.json")
TEST_REGISTRY_FILE = os.path.join(TEST_DIR, "map_registry_test.json")

os.environ["MATCHZY_DB_FILE"] = TEST_DB_FILE
os.environ["MAP_REGISTRY_FILE"] = TEST_REGISTRY_FILE

# Copy the original map registry to the temp directory if it exists
ORIGINAL_REGISTRY_PATH = os.path.join(os.path.dirname(__file__), "map_registry.json")
if os.path.exists(ORIGINAL_REGISTRY_PATH):
    shutil.copy(ORIGINAL_REGISTRY_PATH, TEST_REGISTRY_FILE)
else:
    with open(TEST_REGISTRY_FILE, "w") as f:
        json.dump({"default": "de_mirage", "mirage": "de_mirage", "cobblestone": "workshop/3329387648/de_cbble"}, f)

from fastapi.testclient import TestClient
from app import app

class TestMatchZyGenerator(unittest.TestCase):
    def setUp(self):
        # Initialize test client
        self.client = TestClient(app)
        # Clear persistent match database before each test
        if os.path.exists(TEST_DB_FILE):
            os.remove(TEST_DB_FILE)
        # Restore the map registry to its original state for consistency
        if os.path.exists(ORIGINAL_REGISTRY_PATH):
            shutil.copy(ORIGINAL_REGISTRY_PATH, TEST_REGISTRY_FILE)

    def tearDown(self):
        # Clear persistent database after tests
        if os.path.exists(TEST_DB_FILE):
            os.remove(TEST_DB_FILE)

    @classmethod
    def tearDownClass(cls):
        # Clean up the entire temporary directory
        shutil.rmtree(TEST_DIR, ignore_errors=True)

    def test_01_successful_post_match_creation(self):
        """Verify successful POST request generates valid MatchZy configuration."""
        payload = {
            "match_id": 201,
            "map_key": "cobblestone",
            "team1_data": {
                "name": "Team Orange",
                "players": {
                    "76561198000000001": "Spieler Eins",
                    "76561198000000002": "Spieler Zwei"
                }
            },
            "team2_data": {
                "name": "Team Cyan",
                "players": {
                    "76561198000000003": "Spieler Drei",
                    "76561198000000004": "Spieler Vier"
                }
            }
        }
        response = self.client.post("/match", json=payload)
        self.assertEqual(response.status_code, 201)
        
        data = response.json()
        # Verify schema logic
        self.assertEqual(data["matchid"], 201)
        self.assertEqual(data["num_maps"], 1)
        self.assertEqual(data["maplist"], ["workshop/3329387648/de_cbble"])  # cobblestone lookup path
        self.assertEqual(data["team1"]["name"], "Team Orange")
        self.assertEqual(data["team1"]["players"]["76561198000000001"], "Spieler Eins")
        self.assertEqual(data["team2"]["name"], "Team Cyan")

    def test_02_successful_get_match_creation(self):
        """Verify successful GET request generates valid MatchZy configuration."""
        params = {
            "match_id": 202,
            "map_key": "mirage",
            "team1_name": "Team A",
            "team1_players": "76561198000000001:SpielerA,76561198000000002:SpielerB",
            "team2_name": "Team B",
            "team2_players": "76561198000000003:SpielerC"
        }
        response = self.client.get("/match", params=params)
        self.assertEqual(response.status_code, 200)
        
        data = response.json()
        self.assertEqual(data["matchid"], 202)
        self.assertEqual(data["maplist"], ["de_mirage"])
        self.assertEqual(data["team1"]["name"], "Team A")
        self.assertEqual(data["team1"]["players"]["76561198000000001"], "SpielerA")
        self.assertEqual(data["team2"]["players"]["76561198000000003"], "SpielerC")

    def test_03_invalid_steam64_id(self):
        """Verify validation failure for invalid (non-17-digit) Steam64 ID."""
        payload = {
            "match_id": 203,
            "map_key": "mirage",
            "team1_data": {
                "name": "Team A",
                "players": {
                    "12345": "Invalid Player"  # Wrong digit count
                }
            },
            "team2_data": {
                "name": "Team B",
                "players": {
                    "76561198000000001": "Valid Player"
                }
            }
        }
        response = self.client.post("/match", json=payload)
        self.assertEqual(response.status_code, 422)  # Unprocessable Entity
        self.assertIn("17-digit numeric string", response.text)

    def test_04_empty_team_roster(self):
        """Verify validation failure for empty team rosters."""
        payload = {
            "match_id": 204,
            "map_key": "mirage",
            "team1_data": {
                "name": "Team A",
                "players": {}  # Empty roster
            },
            "team2_data": {
                "name": "Team B",
                "players": {
                    "76561198000000001": "Valid Player"
                }
            }
        }
        response = self.client.post("/match", json=payload)
        self.assertEqual(response.status_code, 422)
        self.assertIn("cannot be empty", response.text)

    def test_05_duplicate_match_id(self):
        """Verify that duplicate match IDs are rejected."""
        payload = {
            "match_id": 300,
            "map_key": "mirage",
            "team1_data": {
                "name": "Team A",
                "players": {"76561198000000001": "Player"}
            },
            "team2_data": {
                "name": "Team B",
                "players": {"76561198000000002": "Player"}
            }
        }
        # First request succeeds
        response1 = self.client.post("/match", json=payload)
        self.assertEqual(response1.status_code, 201)

        # Second request with same match_id fails
        response2 = self.client.post("/match", json=payload)
        self.assertEqual(response2.status_code, 422)
        self.assertIn("already in use", response2.text)

    def test_06_hot_reloading_map_registry(self):
        """Verify that map registry changes are reflected immediately at runtime."""
        # 1. Verify a temporary map key doesn't resolve to its path yet (resolves to default)
        temp_map_key = "temp_test_map"
        payload = {
            "match_id": 401,
            "map_key": temp_map_key,
            "team1_data": {
                "name": "Team A",
                "players": {"76561198000000001": "Player"}
            },
            "team2_data": {
                "name": "Team B",
                "players": {"76561198000000002": "Player"}
            }
        }
        response1 = self.client.post("/match", json=payload)
        self.assertEqual(response1.json()["maplist"], ["de_mirage"]) # Default map fallback

        # 2. Modify map_registry.json at runtime
        with open(TEST_REGISTRY_FILE, "r") as f:
            original_registry = json.load(f)

        updated_registry = original_registry.copy()
        updated_registry[temp_map_key] = "workshop/999999/de_temp_map"

        with open(TEST_REGISTRY_FILE, "w") as f:
            json.dump(updated_registry, f, indent=2)

        # 3. Request again with a new match_id and the same map key
        payload["match_id"] = 402
        response2 = self.client.post("/match", json=payload)
        self.assertEqual(response2.status_code, 201)
        
        # Verify new map path is returned instantly (hot-reloaded)
        self.assertEqual(response2.json()["maplist"], ["workshop/999999/de_temp_map"])

if __name__ == "__main__":
    unittest.main()
