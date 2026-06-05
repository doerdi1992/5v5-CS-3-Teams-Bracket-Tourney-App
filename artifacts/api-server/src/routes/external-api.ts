import { Router, type IRouter } from "express";
import { store } from "../store.js";
import { Rcon } from "../lib/rcon.js";
import { saveMatch } from "../lib/sqlite-db.js";
import { resolveMapPath } from "./matchzy.js";
import { checkApiKeyAuth } from "../middlewares/api-key-auth.js";

const router: IRouter = Router();

/**
 * POST /api/create-match
 * Protected by X-API-Key
 * Generates a MatchZy compliant JSON configuration, saves it to SQLite database,
 * and returns the public configuration URL.
 */
router.post("/create-match", checkApiKeyAuth, (req, res) => {
  try {
    const payload = req.body;

    // Validate required objects
    if (!payload.team1 || typeof payload.team1 !== "object" || !payload.team2 || typeof payload.team2 !== "object") {
      res.status(400).json({ error: "Validation Error: team1 and team2 are required objects." });
      return;
    }

    const team1Name = typeof payload.team1.name === "string" && payload.team1.name.trim() ? payload.team1.name.trim() : "Team 1";
    const team1Players = payload.team1.players;
    const team2Name = typeof payload.team2.name === "string" && payload.team2.name.trim() ? payload.team2.name.trim() : "Team 2";
    const team2Players = payload.team2.players;

    if (!team1Players || typeof team1Players !== "object" || Object.keys(team1Players).length === 0) {
      res.status(400).json({ error: "Validation Error: team1.players cannot be empty." });
      return;
    }
    if (!team2Players || typeof team2Players !== "object" || Object.keys(team2Players).length === 0) {
      res.status(400).json({ error: "Validation Error: team2.players cannot be empty." });
      return;
    }

    // Verify SteamID64 formats (exactly 17-digit numeric string)
    const steamIdRegex = /^\d{17}$/;
    for (const steamId of Object.keys(team1Players)) {
      if (!steamIdRegex.test(steamId)) {
        res.status(400).json({ error: `Validation Error: Steam64 ID '${steamId}' in team1 is invalid. It must be exactly a 17-digit numeric string.` });
        return;
      }
    }
    for (const steamId of Object.keys(team2Players)) {
      if (!steamIdRegex.test(steamId)) {
        res.status(400).json({ error: `Validation Error: Steam64 ID '${steamId}' in team2 is invalid. It must be exactly a 17-digit numeric string.` });
        return;
      }
    }

    // Resolve maps to workshop paths if needed
    const rawMaplist = Array.isArray(payload.maplist) ? payload.maplist : [];
    if (rawMaplist.length === 0) {
      res.status(400).json({ error: "Validation Error: maplist is required and cannot be empty." });
      return;
    }
    const resolvedMaplist = rawMaplist.map((m: any) => resolveMapPath(String(m)));

    // Parameters with fallbacks
    const matchId = payload.match_id ? String(payload.match_id).trim() : `match_${Date.now()}`;
    const numMaps = Number(payload.num_maps) || resolvedMaplist.length || 1;
    const playersPerTeam = Number(payload.players_per_team) || 5;
    const clinchSeries = payload.clinch_series !== undefined ? Boolean(payload.clinch_series) : true;
    
    // map_sides fallback: repeat "knife" for numMaps times
    const mapSides = Array.isArray(payload.map_sides) ? payload.map_sides : Array(numMaps).fill("knife");

    // CVars validation
    const cvars = payload.cvars && typeof payload.cvars === "object" ? payload.cvars : {};
    if (!cvars.hostname) {
      cvars.hostname = "MatchZy 5v5 CS2 Match";
    }

    // Build the final MatchZy configuration compliant with schema
    const matchConfig = {
      matchid: matchId,
      num_maps: numMaps,
      maplist: resolvedMaplist,
      skip_veto: true,
      players_per_team: playersPerTeam,
      min_players_to_ready: 2,
      min_spectators_to_ready: 0,
      series_can_clinch: clinchSeries,
      map_sides: mapSides,
      team1: {
        name: team1Name,
        players: team1Players
      },
      team2: {
        name: team2Name,
        players: team2Players
      },
      cvars: cvars
    };

    // Save to SQLite
    saveMatch(matchId, JSON.stringify(matchConfig, null, 2));

    // Resolve public link URL
    const settings = store.getServerSettings(false);
    const appUrl = settings.appUrl || `${req.protocol}://${req.get("host")}`;
    const configUrl = `${appUrl}/match/${matchId}`;

    console.log(`[MatchZy Engine] Created match config for MatchID: ${matchId}`);

    res.status(201).json({
      success: true,
      matchId: matchId,
      configUrl: configUrl
    });
  } catch (e: any) {
    res.status(500).json({ error: `Server error during match creation: ${e.message}` });
  }
});

/**
 * POST /api/rcon
 * Protected by X-API-Key
 * Forwards administrative commands to the CS2 server using RCON.
 */
router.post("/rcon", checkApiKeyAuth, async (req, res) => {
  try {
    const { command } = req.body as { command?: string };
    if (!command || !command.trim()) {
      res.status(400).json({ error: "Validation Error: command is required." });
      return;
    }

    const settings = store.getServerSettings(false);
    const host = settings.rconHost;
    const port = Number(settings.rconPort);
    const password = settings.rconPassword || "";

    if (!host || !port || !password) {
      res.status(400).json({ error: "RCON server details are not configured on the server." });
      return;
    }

    let finalHost = host.trim();
    if (finalHost.includes(":")) {
      finalHost = finalHost.split(":")[0];
    }

    console.log(`[RCON Tool] Forwarding command: ${command}`);
    const output = await Rcon.send(finalHost, port, password, command);

    res.json({
      success: true,
      output: output
    });
  } catch (e: any) {
    res.status(500).json({ error: `RCON command failed: ${e.message}` });
  }
});

/**
 * POST /api/load-match
 * Protected by X-API-Key
 * Instructs the CS2 server via RCON to load the match configuration for matchId.
 */
router.post("/load-match", checkApiKeyAuth, async (req, res) => {
  try {
    const { matchId } = req.body as { matchId?: string };
    if (!matchId || !matchId.trim()) {
      res.status(400).json({ error: "Validation Error: matchId is required." });
      return;
    }

    const settings = store.getServerSettings(false);
    const host = settings.rconHost;
    const port = Number(settings.rconPort);
    const password = settings.rconPassword || "";

    if (!host || !port || !password) {
      res.status(400).json({ error: "RCON server details are not configured on the server." });
      return;
    }

    let finalHost = host.trim();
    if (finalHost.includes(":")) {
      finalHost = finalHost.split(":")[0];
    }

    // Resolve public configuration URL
    const appUrl = settings.appUrl || `${req.protocol}://${req.get("host")}`;
    const configUrl = `${appUrl}/match/${matchId.trim()}`;

    const loadCmd = `matchzy_loadmatch_url "${configUrl}"`;
    console.log(`[MatchZy Engine] Executing RCON load command: ${loadCmd}`);
    const output = await Rcon.send(finalHost, port, password, loadCmd);

    res.json({
      success: true,
      command: loadCmd,
      output: output
    });
  } catch (e: any) {
    res.status(500).json({ error: `Load match failed: ${e.message}` });
  }
});

export default router;
