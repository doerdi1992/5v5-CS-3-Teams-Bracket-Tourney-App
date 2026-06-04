import { Router, type IRouter } from "express";
import { store } from "../store.js";
import { broadcastStateUpdate } from "../socket.js";
import { SetMapImageBody, DeleteMapImageParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/maps/images", (_req, res) => {
  res.json(store.getMapImages());
});

router.post("/maps/images", (req, res) => {
  const parsed = SetMapImageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  store.setMapImage(parsed.data.map, parsed.data.imageUrl);
  broadcastStateUpdate();
  res.json({ success: true, message: null });
});

router.delete("/maps/images/:mapName", (req, res) => {
  const params = DeleteMapImageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }
  store.deleteMapImage(params.data.mapName);
  broadcastStateUpdate();
  res.json({ success: true, message: null });
});

export default router;
