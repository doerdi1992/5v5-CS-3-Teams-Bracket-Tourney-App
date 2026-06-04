import { Router, type IRouter } from "express";
import { store } from "../store.js";
import { checkAdminAuth } from "../middlewares/auth.js";

const router: IRouter = Router();

router.get("/state", (_req, res) => {
  res.json(store.getFullState());
});

router.get("/config/defaults", checkAdminAuth, (_req, res) => {
  res.json({
    connectionString: process.env["DEFAULT_SERVER_CONNECTION"] ?? "",
    rconHost: process.env["DEFAULT_RCON_HOST"] ?? "",
    rconPort: process.env["DEFAULT_RCON_PORT"] ?? "27015",
    rconPassword: process.env["DEFAULT_RCON_PASSWORD"] ?? "",
  });
});

export default router;
