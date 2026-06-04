import { Router, type IRouter } from "express";
import { store } from "../store.js";
import { broadcastStateUpdate } from "../socket.js";
import { SetMatchWinnerBody, RollMapBody } from "@workspace/api-zod";
import type { TeamName } from "../store.js";

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

router.post("/maps/confirm-roll", (req, res) => {
  const { map } = req.body as { map?: string };
  if (!map) {
    res.status(400).json({ error: "map is required" });
    return;
  }
  store.setRolledMap(map);
  broadcastStateUpdate();
  res.json({ success: true, rolledMap: map });
});

export default router;
