import { Router, type IRouter } from "express";
import { store } from "../store.js";
import { Rcon } from "../lib/rcon.js";
import { FtpClient } from "../lib/ftp.js";
import fs from "fs";
import path from "path";
import { checkAdminAuth, checkStreamerAuth } from "../middlewares/auth.js";

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

// Generate the configuration JSON compliant with MatchZy documentation schema
export function generateMatchConfig() {
  const b = store.bracketState;
  const currentTeams = store.getCurrentMatchTeams();

  if (currentTeams.length < 2) {
    throw new Error("Keine aktive Partie gefunden.");
  }

  const teams = store.getTeams();
  const t1Letter = currentTeams[0];
  const t2Letter = currentTeams[1];

  const t1Players = teams[t1Letter] || [];
  const t2Players = teams[t2Letter] || [];

  const rolledMap = b.rolledMap || "mirage";
  const resolvedMap = resolveMapPath(rolledMap);

  const team1PlayersMap: Record<string, string> = {};
  t1Players.forEach((p, idx) => {
    const sId = p.steamId && p.steamId.trim().length === 17 
      ? p.steamId 
      : `765611980000001${idx.toString().padStart(2, "0")}`;
    team1PlayersMap[sId] = p.name;
  });

  const team2PlayersMap: Record<string, string> = {};
  t2Players.forEach((p, idx) => {
    const sId = p.steamId && p.steamId.trim().length === 17 
      ? p.steamId 
      : `765611980000002${idx.toString().padStart(2, "0")}`;
    team2PlayersMap[sId] = p.name;
  });

  const matchId = 1000 + b.currentMatch + Math.floor(Math.random() * 1000);

  return {
    matchId,
    resolvedMap,
    config: {
      matchid: matchId,
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
    }
  };
}

/**
 * GET /api/matchzy/active-match.json
 * Serves the JSON configuration for the current active match according to MatchZy schema
 */
router.get("/matchzy/active-match.json", (_req, res) => {
  try {
    const { config } = generateMatchConfig();
    res.json(config);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * GET /api/config/server
 * Retrieves current server settings with masked passwords
 */
router.get("/config/server", checkAdminAuth, (_req, res) => {
  try {
    const settings = store.getServerSettings(true);
    res.json(settings);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/config/server
 * Updates server settings in server_config.json
 */
router.post("/config/server", checkAdminAuth, (req, res) => {
  try {
    store.saveServerSettings(req.body);
    const settings = store.getServerSettings(true);
    res.json({ success: true, settings });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/config/defaults
 * Legacy endpoint to fetch connection configuration
 */
router.get("/config/defaults", checkAdminAuth, (_req, res) => {
  try {
    const settings = store.getServerSettings(false);
    res.json({
      connectionString: settings.connectionString || "",
      rconHost: settings.rconHost || "",
      rconPort: settings.rconPort || 27015,
      rconPassword: settings.rconPassword || ""
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Helper for RCON retries (useful during map changes)
async function sendRconWithRetry(host: string, port: number, pw: string, cmd: string, retries = 10, delay = 3000): Promise<string> {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`[RCON] Sende Befehl (Versuch ${i + 1}/${retries}): ${cmd}`);
      const output = await Rcon.send(host, port, pw, cmd);
      return output;
    } catch (e: any) {
      console.warn(`[RCON] Versuch ${i + 1} fehlgeschlagen: ${e.message}. Erneuter Versuch in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error(`RCON-Befehl nach ${retries} Versuchen fehlgeschlagen: ${cmd}`);
}

/**
 * Execute a unified start match sequence using RCON and FTP upload.
 * Resolves map changes, uploads configs, and triggers the MatchZy start commands.
 */
export async function runMatchzyStartSequence(rolledMapName?: string): Promise<{ success: boolean; command: string; output: string }> {
  const settings = store.getServerSettings(false); // get raw credentials
  const host = settings.rconHost;
  const port = Number(settings.rconPort);
  const password = settings.rconPassword || "";

  if (!host || !port || !password) {
    throw new Error("RCON-Zugangsdaten (Server IP, Port und RCON-Passwort) sind nicht konfiguriert.");
  }

  let finalHost = host.trim();
  if (finalHost.includes(":")) {
    finalHost = finalHost.split(":")[0];
  }

  const { matchId, resolvedMap, config } = generateMatchConfig();
  
  // Decide target map (explicit parameter or default map from match configuration)
  const targetMap = rolledMapName ? resolveMapPath(rolledMapName) : resolvedMap;
  
  // Align config's maplist with our map choice
  config.maplist = [targetMap];

  const content = JSON.stringify(config, null, 2);
  console.log(`[MatchZy Pipeline] JSON erstellt -> MatchID ${matchId}, Map: ${targetMap}`);

  const method = settings.loadMethod || "url";

  if (method === "ftp") {
    if (!settings.ftpUser || !settings.ftpPassword) {
      throw new Error("FTP-Benutzername und -Passwort sind im FTP-Modus erforderlich.");
    }
    const ftpHost = settings.ftpHost || finalHost;
    const ftpPort = settings.ftpPort || 21;
    const remoteDir = settings.ftpDir || "game/csgo/MatchZy/";
    const remotePath = remoteDir.endsWith("/") ? `${remoteDir}match_${matchId}.json` : `${remoteDir}/match_${matchId}.json`;

    // Determine the path relative to the csgo/ folder for the RCON command
    let relativeMatchPath = `match_${matchId}.json`;
    const csgoIndex = remoteDir.indexOf("csgo/");
    if (csgoIndex !== -1) {
      const subPath = remoteDir.substring(csgoIndex + 5);
      relativeMatchPath = subPath.endsWith("/") ? `${subPath}match_${matchId}.json` : `${subPath}/match_${matchId}.json`;
    } else {
      relativeMatchPath = remoteDir.endsWith("/") ? `${remoteDir}match_${matchId}.json` : `${remoteDir}/match_${matchId}.json`;
    }
    // Clean any leading slashes
    if (relativeMatchPath.startsWith("/")) {
      relativeMatchPath = relativeMatchPath.substring(1);
    }

    console.log(`[MatchZy Pipeline] Upload gestartet -> match_${matchId}.json zu ${ftpHost}:${ftpPort}`);
    try {
      await FtpClient.upload({
        host: ftpHost,
        port: ftpPort,
        user: settings.ftpUser,
        pass: settings.ftpPassword
      }, remotePath, content);
      console.log(`[MatchZy Pipeline] Upload beendet.`);
    } catch (err: any) {
      console.error(`[MatchZy Pipeline] Upload fehlgeschlagen:`, err);
      throw new Error(`FTP Upload fehlgeschlagen: ${err.message}`);
    }

    // Connect to RCON to change map first, allowing fresh load
    console.log(`[MatchZy Pipeline] RCON verbunden -> Mapchange-Befehl senden`);
    const changeCmd = `changelevel "${targetMap}"`;
    try {
      await Rcon.send(finalHost, port, password, changeCmd);
    } catch (e: any) {
      console.log(`[MatchZy Pipeline] RCON Mapchange gesendet (Socket-Abbruch erwartet): ${e.message}`);
    }

    // Wait for server map reboot to complete
    console.log(`[MatchZy Pipeline] Warte 6 Sekunden auf Server-Neustart...`);
    await new Promise((resolve) => setTimeout(resolve, 6000));

    // Connect and execute MatchZy loadmatch command
    const loadCmd = `matchzy_loadmatch "${relativeMatchPath}"`;
    console.log(`[MatchZy Pipeline] Sende Befehl -> ${loadCmd}`);
    const output = await sendRconWithRetry(finalHost, port, password, loadCmd);

    // Run matchzy_restart to ensure team sorting acts immediately
    console.log(`[MatchZy Pipeline] Sende Befehl -> matchzy_restart`);
    try {
      await sendRconWithRetry(finalHost, port, password, "matchzy_restart", 3, 2000);
    } catch (e: any) {
      console.warn(`[MatchZy Pipeline] Restart-Befehl fehlgeschlagen (nicht kritisch): ${e.message}`);
    }

    return { success: true, command: loadCmd, output };
  } else {
    // URL load method
    const appUrl = settings.appUrl || `http://localhost:${process.env.PORT || 3000}`;
    const configUrl = `${appUrl}/api/matchzy/active-match.json`;

    // Mapchange level first
    console.log(`[MatchZy Pipeline] RCON verbunden -> Mapchange-Befehl senden`);
    const changeCmd = `changelevel "${targetMap}"`;
    try {
      await Rcon.send(finalHost, port, password, changeCmd);
    } catch (e: any) {
      console.log(`[MatchZy Pipeline] RCON Mapchange gesendet (Socket-Abbruch erwartet): ${e.message}`);
    }

    console.log(`[MatchZy Pipeline] Warte 6 Sekunden auf Server-Neustart...`);
    await new Promise((resolve) => setTimeout(resolve, 6000));

    const loadCmd = `matchzy_loadmatch_url "${configUrl}"`;
    console.log(`[MatchZy Pipeline] Sende Befehl -> ${loadCmd}`);
    const output = await sendRconWithRetry(finalHost, port, password, loadCmd);

    return { success: true, command: loadCmd, output };
  }
}

/**
 * POST /api/matchzy/start
 * Connects to the CS2 server RCON and sends the command to pull match configuration
 */
router.post("/matchzy/start", checkStreamerAuth, async (_req, res) => {
  try {
    const result = await runMatchzyStartSequence();
    res.json(result);
  } catch (e: any) {
    console.error("Match Start Error:", e);
    res.status(500).json({ error: `Fehler beim Match-Start: ${e.message}` });
  }
});

export default router;
