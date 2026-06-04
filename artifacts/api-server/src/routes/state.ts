import { Router, type IRouter } from "express";
import { store } from "../store.js";

const router: IRouter = Router();

router.get("/state", (_req, res) => {
  res.json(store.getFullState());
});

export default router;
