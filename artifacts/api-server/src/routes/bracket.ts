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

import { runMatchzyStartSequence } from "./matchzy.js";

router.post("/maps/confirm-roll", (req, res) => {
  const { map } = req.body as { map?: string };
  if (!map) {
    res.status(400).json({ error: "map is required" });
    return;
  }

  // ── Immediate: persist rolled map ──────────────────────────
  store.setRolledMap(map);
  broadcastStateUpdate();
  console.log(`[Match Setup] Map confirmed: "${map}"`);

  const settings = store.getServerSettings(false);

  // ── Respond to admin IMMEDIATELY — don't block on RCON ─────
  res.json({ success: true, rolledMap: map });

  // ── Background: RCON pipeline → then broadcast to players ──
  if (settings.autoStartMatch && settings.rconHost && settings.rconPassword) {
    console.log(`[Match Setup] Starting background RCON pipeline...`);

    runMatchzyStartSequence(map)
      .then((result) => {
        console.log(`[Match Setup] ✅ Server ready: ${result.command}`);

        // Server is now ready — broadcast invite to active teams
        if (settings.autoSend && settings.connectionString && settings.connectionString.trim()) {
          const teams = store.getCurrentMatchTeams();
          store.activeServerDetails = settings.connectionString;
          broadcastServerToTeams(settings.connectionString, teams);
          broadcastStateUpdate();
          console.log(`[Match Setup] ✅ Server invite sent to teams: ${teams.join(", ")}`);
        } else {
          broadcastStateUpdate();
        }
      })
      .catch((err) => {
        console.error(`[Match Setup] ⚠️ RCON pipeline failed: ${err.message}`);
        // Even if RCON fails, still broadcast server details so players can join manually
        if (settings.autoSend && settings.connectionString && settings.connectionString.trim()) {
          const teams = store.getCurrentMatchTeams();
          store.activeServerDetails = settings.connectionString;
          broadcastServerToTeams(settings.connectionString, teams);
          broadcastStateUpdate();
          console.log(`[Match Setup] Server invite sent despite RCON failure`);
        }
      });
  } else if (settings.autoSend && settings.connectionString && settings.connectionString.trim()) {
    // No RCON configured, but auto-send is on — broadcast immediately
    const teams = store.getCurrentMatchTeams();
    store.activeServerDetails = settings.connectionString;
    broadcastServerToTeams(settings.connectionString, teams);
    broadcastStateUpdate();
    console.log(`[Match Setup] ✅ Server invite sent (no RCON): ${teams.join(", ")}`);
  }
});

export default router;
