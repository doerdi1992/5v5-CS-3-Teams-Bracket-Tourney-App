import { Router, type IRouter } from "express";
import { store } from "../store.js";
import { broadcastServerToTeams } from "../socket.js";
import { BroadcastServerBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/server/broadcast", (req, res) => {
  const parsed = BroadcastServerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const { connectionString } = parsed.data;
  const teams = store.getCurrentMatchTeams();
  store.activeServerDetails = connectionString;
  broadcastServerToTeams(connectionString, teams);
  res.json({ success: true, message: `Broadcasted to teams: ${teams.join(", ")}` });
});

export default router;
