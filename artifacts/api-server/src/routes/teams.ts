import { Router, type IRouter } from "express";
import { store } from "../store.js";
import { broadcastStateUpdate } from "../socket.js";

const router: IRouter = Router();

router.get("/teams", (_req, res) => {
  res.json(store.getTeams());
});

router.post("/teams/roll", (_req, res) => {
  const teams = store.rollTeams();
  broadcastStateUpdate();
  res.json(teams);
});

export default router;
