import { Router, type IRouter } from "express";
import { store } from "../store.js";

const router: IRouter = Router();

const STREAMER_PASSWORD = process.env["ADMIN_PASSWORD"] ?? "kmjfe0u273404r\u00df0";

router.post("/admin/auth", (req, res) => {
  const { password } = req.body as { password?: string };
  if (!password) {
    res.status(401).json({ success: false, message: "Passwort erforderlich" });
    return;
  }

  const settings = store.getServerSettings(false);
  const adminPassword = settings.adminPassword || "ztjhfts3425ghgd";

  if (password === adminPassword) {
    res.json({ success: true, role: "admin" });
  } else if (password === STREAMER_PASSWORD) {
    res.json({ success: true, role: "streamer" });
  } else {
    res.status(401).json({ success: false, message: "Falsches Passwort" });
  }
});

export default router;
