import { Router, type IRouter } from "express";
import { store } from "../store.js";
import { broadcastStateUpdate, broadcastServerToTeams } from "../socket.js";
import { SetMatchWinnerBody, RollMapBody } from "@workspace/api-zod";
import type { TeamName } from "../store.js";

const router: IRouter = Router();

router.get("/bracket", (_req, res) => {
  const tiebreaker = store.getTiebreakerWinner();
  res.json({
    ...store.bracketState,
    tiebreakerWinner: tiebreaker ? tiebreaker.team : null,
    tiebreakerRounds: tiebreaker ? tiebreaker.rounds : null,
    activeServerDetails: store.activeServerDetails,
  });
});

router.post("/bracket/winner", (req, res) => {
  const parsed = SetMatchWinnerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const rounds = req.body.rounds as { left: number; right: number } | undefined;
  const bracket = store.setMatchWinner(parsed.data.winner as TeamName, rounds);
  broadcastStateUpdate();
  
  const tiebreaker = store.getTiebreakerWinner();
  res.json({
    ...bracket,
    tiebreakerWinner: tiebreaker ? tiebreaker.team : null,
    tiebreakerRounds: tiebreaker ? tiebreaker.rounds : null,
  });
});

router.post("/bracket/reset", (_req, res) => {
  const bracket = store.resetBracket();
  broadcastStateUpdate();
  res.json(bracket);
});

// BO3 toggle is only available for the tiebreaker match (Match 4)
// This endpoint was removed — use /bracket/tiebreaker-format instead

router.post("/bracket/tiebreaker-format", (req, res) => {
  const { bestOf } = req.body as { bestOf?: number };
  if (bestOf !== 1 && bestOf !== 3) {
    res.status(400).json({ error: "bestOf must be 1 or 3" });
    return;
  }
  store.setTiebreakerBestOf(bestOf);
  broadcastStateUpdate();
  res.json({ success: true, tiebreakerBestOf: bestOf });
});

router.post("/maps/roll", (req, res) => {
  const parsed = RollMapBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const map = store.rollMap(parsed.data.maps);
  broadcastStateUpdate();
  res.json({ map });
});

import { runMatchzyStartSequence, generateMatchConfig } from "./matchzy.js";
import { FtpClient } from "../lib/ftp.js";

router.post("/maps/confirm-roll", async (req, res) => {
  const { map } = req.body as { map?: string };
  if (!map) {
    res.status(400).json({ error: "map is required" });
    return;
  }
  store.setRolledMap(map);
  broadcastStateUpdate();

  const settings = store.getServerSettings(false);
  let matchSetupResult = { ftpUploaded: false, rconSent: false, inviteSent: false, error: "" };

  // Step 1: Generate MatchZy JSON
  let matchConfig;
  try {
    matchConfig = generateMatchConfig();
    console.log(`[Match Setup] Config generated → MatchID: ${matchConfig.matchId}, Map: ${matchConfig.resolvedMap}`);
  } catch (err: any) {
    console.error(`[Match Setup] Config generation failed:`, err.message);
    matchSetupResult.error = `Config-Fehler: ${err.message}`;
    res.json({ success: true, rolledMap: map, matchSetup: matchSetupResult });
    return;
  }

  // Step 2: Upload JSON via FTP (if loadMethod is ftp)
  if (settings.loadMethod === "ftp" && settings.ftpUser && settings.ftpPassword) {
    const ftpHost = settings.ftpHost || settings.rconHost || "";
    const ftpPort = settings.ftpPort || 21;
    const remoteDir = settings.ftpDir || "p3611/cfg/MatchZy/";
    const fileName = `match_${matchConfig.matchId}.json`;
    const remotePath = remoteDir.endsWith("/") ? `${remoteDir}${fileName}` : `${remoteDir}/${fileName}`;
    const content = JSON.stringify(matchConfig.config, null, 2);

    try {
      console.log(`[Match Setup] FTP uploading ${fileName} to ${ftpHost}:${ftpPort}...`);
      await FtpClient.upload(
        { host: ftpHost, port: ftpPort, user: settings.ftpUser, pass: settings.ftpPassword },
        remotePath,
        content
      );
      matchSetupResult.ftpUploaded = true;
      console.log(`[Match Setup] ✅ FTP upload success: ${remotePath}`);

      // Derive RCON-relative path for logging/display
      let rconPath = fileName;
      const p3611Idx = remoteDir.indexOf("p3611/");
      if (p3611Idx !== -1) {
        const subPath = remoteDir.substring(p3611Idx + 6);
        rconPath = subPath.endsWith("/") ? `${subPath}${fileName}` : `${subPath}/${fileName}`;
      }
      console.log(`[Match Setup] RCON command: matchzy_loadmatch "${rconPath}"`);
    } catch (err: any) {
      console.error(`[Match Setup] ❌ FTP upload failed:`, err.message);
      matchSetupResult.error = `FTP-Fehler: ${err.message}`;
    }
  }

  // Step 3: Try RCON if configured (changelevel + matchzy_loadmatch)
  if (settings.autoStartMatch && settings.rconHost && settings.rconPassword) {
    try {
      console.log(`[Match Setup] Sending RCON commands...`);
      const result = await runMatchzyStartSequence(map);
      matchSetupResult.rconSent = true;
      console.log(`[Match Setup] ✅ RCON success: ${result.command}`);
    } catch (err: any) {
      console.error(`[Match Setup] ⚠️ RCON failed (file still on server via FTP): ${err.message}`);
      // Don't overwrite FTP error, just log
      if (!matchSetupResult.error) {
        matchSetupResult.error = `RCON-Fehler (JSON ist trotzdem auf dem Server): ${err.message}`;
      }
    }
  }

  // Step 4: Auto-broadcast server invite to players
  if (settings.autoSend && settings.connectionString && settings.connectionString.trim()) {
    try {
      const teams = store.getCurrentMatchTeams();
      store.activeServerDetails = settings.connectionString;
      broadcastServerToTeams(settings.connectionString, teams);
      matchSetupResult.inviteSent = true;
      console.log(`[Match Setup] ✅ Server invite sent to teams: ${teams.join(", ")}`);
    } catch (err: any) {
      console.error(`[Match Setup] ⚠️ Broadcast failed:`, err.message);
    }
  }

  // Broadcast updated state (includes match setup status)
  broadcastStateUpdate();

  res.json({ success: true, rolledMap: map, matchSetup: matchSetupResult });
});

export default router;

