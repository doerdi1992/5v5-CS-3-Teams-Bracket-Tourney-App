import { Router, type IRouter } from "express";
import { store } from "../store.js";
import { Rcon } from "../lib/rcon.js";
import fs from "fs";
import path from "path";

const router: IRouter = Router();

// Helper to resolve map keys using the map_registry.json
function resolveMapPath(mapKey: string): string {
  try {
    const registryPath = path.resolve(process.cwd(), "artifacts/matchzy-generator/map_registry.json");
    if (fs.existsSync(registryPath)) {
      const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
      const key = mapKey.toLowerCase().trim();
      return registry[key] || registry["default"] || mapKey;
    }
  } catch (e) {
    console.error("Error loading map registry in Node:", e);
  }
  return mapKey;
}

/**
 * GET /api/matchzy/active-match.json
 * Serves the JSON configuration for the current active match according to MatchZy schema
 */
router.get("/matchzy/active-match.json", (_req, res) => {
  const b = store.bracketState;
  const currentTeams = store.getCurrentMatchTeams();

  if (currentTeams.length < 2) {
    res.status(400).json({ error: "Keine aktive Partie gefunden." });
    return;
  }

  const teams = store.getTeams();
  const t1Letter = currentTeams[0];
  const t2Letter = currentTeams[1];

  const t1Players = teams[t1Letter] || [];
  const t2Players = teams[t2Letter] || [];

  const rolledMap = b.rolledMap || "mirage";
  const resolvedMap = resolveMapPath(rolledMap);

  // Generate steamID map (steamId -> name) for players in Team 1
  const team1PlayersMap: Record<string, string> = {};
  t1Players.forEach((p, idx) => {
    // Use actual SteamID if provided, else assign a temporary one for validation safety
    const sId = p.steamId && p.steamId.trim().length === 17 
      ? p.steamId 
      : `765611980000001${idx.toString().padStart(2, "0")}`;
    team1PlayersMap[sId] = p.name;
  });

  // Generate steamID map for players in Team 2
  const team2PlayersMap: Record<string, string> = {};
  t2Players.forEach((p, idx) => {
    const sId = p.steamId && p.steamId.trim().length === 17 
      ? p.steamId 
      : `765611980000002${idx.toString().padStart(2, "0")}`;
    team2PlayersMap[sId] = p.name;
  });

  // MatchZy compliant JSON config
  const matchConfig = {
    matchid: 1000 + b.currentMatch + Math.floor(Math.random() * 1000),
    num_maps: 1,
    maplist: [resolvedMap],
    team1: {
      name: `TEAM ${t1Letter}`,
      players: team1PlayersMap
    },
    team2: {
      name: `TEAM ${t2Letter}`,
      players: team2PlayersMap
    }
  };

  res.json(matchConfig);
});

/**
 * POST /api/matchzy/start
 * Connects to the CS2 server RCON and sends the command to pull match configuration
 */
router.post("/matchzy/start", async (req, res) => {
  const { host, port, password, appUrl } = req.body as {
    host?: string;
    port?: number;
    password?: string;
    appUrl?: string;
  };

  if (!host || !port || !password) {
    res.status(400).json({ error: "Host, Port und RCON-Passwort sind Pflichtfelder." });
    return;
  }

  // Determine host URL (fallback to request headers)
  const finalAppUrl = appUrl || `${req.protocol}://${req.get("host")}`;
  const configUrl = `${finalAppUrl}/api/matchzy/active-match.json`;
  const cmd = `matchzy_loadmatch_url "${configUrl}"`;

  console.log(`Sending RCON command to ${host}:${port}: ${cmd}`);

  try {
    const output = await Rcon.send(host, Number(port), password, cmd);
    res.json({ success: true, command: cmd, output });
  } catch (e: any) {
    console.error("RCON Error:", e);
    res.status(500).json({ error: `RCON Fehler: ${e.message}` });
  }
});

export default router;
