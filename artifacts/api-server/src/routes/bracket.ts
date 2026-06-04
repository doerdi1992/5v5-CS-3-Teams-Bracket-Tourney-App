import { Router, type IRouter } from "express";
import { store } from "../store.js";
import { broadcastStateUpdate } from "../socket.js";
import { SetMatchWinnerBody, RollMapBody } from "@workspace/api-zod";
import type { TeamName } from "../store.js";
import { Rcon } from "../lib/rcon.js";
import path from "path";
import fs from "fs";

const router: IRouter = Router();

router.get("/bracket", (_req, res) => {
  res.json(store.bracketState);
});

router.post("/bracket/winner", (req, res) => {
  const parsed = SetMatchWinnerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const bracket = store.setMatchWinner(parsed.data.winner as TeamName);
  broadcastStateUpdate();
  res.json(bracket);
});

router.post("/bracket/reset", (_req, res) => {
  const bracket = store.resetBracket();
  broadcastStateUpdate();
  res.json(bracket);
});

router.post("/bracket/finale-format", (req, res) => {
  const { bestOf } = req.body as { bestOf?: number };
  if (bestOf !== 1 && bestOf !== 3) {
    res.status(400).json({ error: "bestOf must be 1 or 3" });
    return;
  }
  store.setFinaleBestOf(bestOf);
  broadcastStateUpdate();
  res.json({ success: true, finaleBestOf: bestOf });
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

// Helper to resolve RCON retry on server boot
async function sendRconWithRetry(host: string, port: number, pw: string, cmd: string, retries = 12, delay = 3000) {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`Attempting RCON command (Attempt ${i + 1}/${retries}): ${cmd}`);
      await Rcon.send(host, port, pw, cmd);
      console.log(`RCON command succeeded: ${cmd}`);
      return;
    } catch (e: any) {
      console.warn(`RCON attempt ${i + 1} failed: ${e.message}. Retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  console.error(`RCON command failed after ${retries} attempts: ${cmd}`);
}

router.post("/maps/confirm-roll", async (req, res) => {
  const { map } = req.body as { map?: string };
  if (!map) {
    res.status(400).json({ error: "map is required" });
    return;
  }
  store.setRolledMap(map);
  broadcastStateUpdate();

  // Automatically trigger RCON map change and MatchZy match load if configured
  const host = process.env["DEFAULT_RCON_HOST"];
  const port = process.env["DEFAULT_RCON_PORT"];
  const password = process.env["DEFAULT_RCON_PASSWORD"];

  if (host && port && password) {
    try {
      let finalHost = host.trim();
      if (finalHost.includes(":")) {
        finalHost = finalHost.split(":")[0];
      }

      // Resolve map path using registry
      let resolvedMap = map;
      try {
        const registryPath = path.resolve(process.cwd(), "artifacts/matchzy-generator/map_registry.json");
        if (fs.existsSync(registryPath)) {
          const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
          const key = map.toLowerCase().trim();
          resolvedMap = registry[key] || registry["default"] || map;
        }
      } catch (e) {
        console.error("Error resolving map path on confirm-roll:", e);
      }

      const appUrl = `${req.protocol}://${req.get("host")}`;
      const configUrl = `${appUrl}/api/matchzy/active-match.json`;

      // 1. Force immediately change level to restart map
      const cmd = `changelevel "${resolvedMap}"`;
      console.log(`Sending RCON confirm-roll changelevel to ${finalHost}:${port}: ${cmd}`);
      await Rcon.send(finalHost, Number(port), password, cmd);

      // 2. Schedule match config load to retry until server completes loading level
      setTimeout(() => {
        const loadCmd = `matchzy_loadmatch_url "${configUrl}"`;
        void sendRconWithRetry(finalHost, Number(port), password, loadCmd);
      }, 5000);

    } catch (err: any) {
      console.error("Auto RCON map change on confirm-roll failed:", err);
    }
  }

  res.json({ success: true, rolledMap: map });
});

export default router;
