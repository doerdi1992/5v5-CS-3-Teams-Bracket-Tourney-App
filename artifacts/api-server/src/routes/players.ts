import { Router, type IRouter } from "express";
import { store } from "../store.js";
import { broadcastStateUpdate } from "../socket.js";
import {
  AddPlayersBody,
  UpdatePlayerParams,
  UpdatePlayerBody,
  DeletePlayerParams,
  RegisterViewerBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/players", (_req, res) => {
  res.json(store.getAllPlayers());
});

router.post("/players", (req, res) => {
  const parsed = AddPlayersBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const { names } = parsed.data;
  const added = names
    .map((n) => n.trim())
    .filter((n) => n.length > 0)
    .map((name) => store.addPlayer(name, "accepted"));
  broadcastStateUpdate();
  res.status(201).json(added);
});

router.patch("/players/:id", (req, res) => {
  const params = UpdatePlayerParams.safeParse(req.params);
  const body = UpdatePlayerBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const updated = store.updatePlayer(params.data.id, body.data as any);
  if (!updated) {
    res.status(404).json({ error: "Player not found" });
    return;
  }
  broadcastStateUpdate();
  res.json(updated);
});

router.delete("/players/:id", (req, res) => {
  const params = DeletePlayerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const deleted = store.deletePlayer(params.data.id);
  if (!deleted) {
    res.status(404).json({ error: "Player not found" });
    return;
  }
  broadcastStateUpdate();
  res.json({ success: true, message: null });
});

router.post("/players/register", (req, res) => {
  const parsed = RegisterViewerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const { name, clientId } = parsed.data;
  const player = store.addViewerPlayer(clientId, name.trim());
  broadcastStateUpdate();
  res.status(201).json(player);
});

export default router;
