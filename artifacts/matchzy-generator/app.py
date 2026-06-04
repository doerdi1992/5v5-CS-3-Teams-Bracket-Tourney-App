import os
import re
import json
import tempfile
from typing import Dict
from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel, Field, field_validator

app = FastAPI(title="MatchZy JSON Automation Pipeline")

def get_writable_db_file() -> str:
    env_path = os.getenv("MATCHZY_DB_FILE")
    if env_path:
        return env_path

    default_path = os.path.join(os.path.dirname(__file__), "used_matches.json")
    try:
        # Check if we can write to the default path or directory
        if os.path.exists(default_path):
            with open(default_path, "a"):
                pass
        else:
            with open(default_path, "w") as f:
                json.dump([], f)
        return default_path
    except (IOError, PermissionError):
        fallback_path = os.path.join(tempfile.gettempdir(), "matchzy_used_matches.json")
        print(f"Warning: Default database path '{default_path}' is not writable. Falling back to: {fallback_path}")
        return fallback_path

DB_FILE = get_writable_db_file()
REGISTRY_FILE = os.getenv("MAP_REGISTRY_FILE", os.path.join(os.path.dirname(__file__), "map_registry.json"))

# ─── Data Access & Uniqueness Check ──────────────────────────────────────────

def get_used_match_ids() -> set[int]:
    """Load used match IDs from a persistent JSON file at runtime."""
    if not os.path.exists(DB_FILE):
        return set()
    try:
        with open(DB_FILE, "r") as f:
            data = json.load(f)
            return set(data)
    except Exception as e:
        print(f"Error loading used matches: {e}")
        return set()

def save_used_match_id(match_id: int) -> None:
    """Save a newly used match ID to the persistent JSON file."""
    used = get_used_match_ids()
    used.add(match_id)
    try:
        with open(DB_FILE, "w") as f:
            json.dump(list(used), f, indent=2)
    except Exception as e:
        print(f"Error saving used match ID: {e}")

# ─── Map Registry Dynamic Runtime Lookup ──────────────────────────────────────

def resolve_map(map_key: str) -> str:
    """Read the map registry file at runtime for hot-reloading support."""
    if not os.path.exists(REGISTRY_FILE):
        print(f"Warning: map_registry.json not found. Falling back to de_mirage.")
        return "de_mirage"
    try:
        with open(REGISTRY_FILE, "r") as f:
            registry = json.load(f)
    except Exception as e:
        print(f"Error parsing map_registry.json: {e}. Falling back to de_mirage.")
        return "de_mirage"

    # Support a "default" map configured in the registry, or fall back to de_mirage
    default_map = registry.get("default", "de_mirage")
    resolved = registry.get(map_key)
    if resolved is None:
        print(f"Map key '{map_key}' not found in registry. Using default '{default_map}'.")
        return default_map
    return resolved

# ─── Validation Schemas ──────────────────────────────────────────────────────

class TeamData(BaseModel):
    name: str = Field(..., min_length=1, description="Team name")
    players: Dict[str, str] = Field(..., description="Dictionary mapping Steam64 ID to player name")

    @field_validator("players")
    @classmethod
    def validate_players(cls, v: Dict[str, str]) -> Dict[str, str]:
        # Ensure team rosters are not empty
        if not v:
            raise ValueError("Team roster cannot be empty.")
        # Verify that steam64 IDs are valid strings (17-digit format)
        for steam_id in v.keys():
            if not isinstance(steam_id, str) or not re.match(r"^\d{17}$", steam_id):
                raise ValueError(f"Steam64 ID '{steam_id}' is invalid. It must be exactly a 17-digit numeric string.")
        return v

class GenerateMatchRequest(BaseModel):
    match_id: int = Field(..., description="Unique ID for the match")
    map_key: str = Field(..., description="Key mapping to a workshop map path or name")
    team1_data: TeamData
    team2_data: TeamData

    @field_validator("match_id")
    @classmethod
    def validate_match_id(cls, v: int) -> int:
        used_ids = get_used_match_ids()
        if v in used_ids:
            raise ValueError(f"match_id {v} is already in use. It must be unique.")
        return v

# ─── API Endpoints ───────────────────────────────────────────────────────────

@app.post("/match", status_code=status.HTTP_201_CREATED)
def generate_match_post(payload: GenerateMatchRequest):
    """
    POST endpoint to generate a valid MatchZy configuration JSON.
    Accepts match_id, map_key, team1_data, and team2_data.
    """
    map_path = resolve_map(payload.map_key)
    
    # Save the match ID to preserve uniqueness across requests
    save_used_match_id(payload.match_id)

    # Strictly follow the MatchZy JSON configuration schema
    match_config = {
        "matchid": payload.match_id,
        "num_maps": 1,
        "maplist": [map_path],
        "team1": {
            "name": payload.team1_data.name,
            "players": payload.team1_data.players
        },
        "team2": {
            "name": payload.team2_data.name,
            "players": payload.team2_data.players
        }
    }

    # Debug / Logging statement matching requirements
    print(f"Generated match {payload.match_id} with map {map_path}")
    return match_config

@app.get("/match")
def generate_match_get(
    match_id: int,
    map_key: str,
    team1_name: str,
    team1_players: str,
    team2_name: str,
    team2_players: str
):
    """
    GET endpoint to generate a valid MatchZy configuration JSON.
    Receives parameters via query string.
    team1_players and team2_players must be formatted as 'steam64id:name,steam64id:name'
    """
    # Parse players string to dict
    try:
        t1_players = {}
        for item in team1_players.split(","):
            if ":" in item:
                k, v = item.split(":", 1)
                t1_players[k.strip()] = v.strip()
        t2_players = {}
        for item in team2_players.split(","):
            if ":" in item:
                k, v = item.split(":", 1)
                t2_players[k.strip()] = v.strip()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to parse players query. Format: 'steam64id:name,steam64id:name'. Error: {e}"
        )

    # Perform parsing and validations using the same GenerateMatchRequest schema
    try:
        payload = GenerateMatchRequest(
            match_id=match_id,
            map_key=map_key,
            team1_data=TeamData(name=team1_name, players=t1_players),
            team2_data=TeamData(name=team2_name, players=t2_players)
        )
    except ValueError as e:
        # Extract the validation error message
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Validation Error: {str(e)}"
        )

    map_path = resolve_map(payload.map_key)
    save_used_match_id(payload.match_id)

    match_config = {
        "matchid": payload.match_id,
        "num_maps": 1,
        "maplist": [map_path],
        "team1": {
            "name": payload.team1_data.name,
            "players": payload.team1_data.players
        },
        "team2": {
            "name": payload.team2_data.name,
            "players": payload.team2_data.players
        }
    }

    print(f"Generated match {payload.match_id} with map {map_path}")
    return match_config

@app.post("/reset")
def reset_used_matches():
    """Admin/Testing helper endpoint to clear persistent match IDs list."""
    try:
        if os.path.exists(DB_FILE):
            os.remove(DB_FILE)
        return {"success": True, "message": "Match ID uniqueness cache cleared."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete database: {e}")

if __name__ == "__main__":
    import uvicorn
    # Start the server locally
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)
