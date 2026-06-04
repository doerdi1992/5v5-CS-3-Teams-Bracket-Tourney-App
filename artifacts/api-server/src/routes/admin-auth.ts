import { Router, type IRouter } from "express";

const router: IRouter = Router();

const ADMIN_PASSWORD = process.env["ADMIN_PASSWORD"] ?? "kmjfe0u273404r\u00df0";

router.post("/admin/auth", (req, res) => {
  const { password } = req.body as { password?: string };
  if (!password || password !== ADMIN_PASSWORD) {
    res.status(401).json({ success: false, message: "Falsches Passwort" });
    return;
  }
  res.json({ success: true });
});

export default router;
