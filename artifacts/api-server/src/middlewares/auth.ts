import type { Request, Response, NextFunction } from "express";
import { store } from "../store.js";

const STREAMER_PASSWORD = process.env["ADMIN_PASSWORD"] ?? "kmjfe0u273404r\u00df0";

function getToken(req: Request): string {
  const authHeader = req.headers["authorization"] || req.headers["x-admin-password"];
  let token = "";

  if (authHeader) {
    const headerStr = Array.isArray(authHeader) ? authHeader[0] : authHeader;
    if (headerStr.startsWith("Bearer ")) {
      token = headerStr.substring(7);
    } else {
      token = headerStr;
    }
  }
  return token;
}

// Allows full Admin access (Settings and Players)
export function checkAdminAuth(req: Request, res: Response, next: NextFunction): void {
  const token = getToken(req);
  const settings = store.getServerSettings(false);
  const adminPassword = settings.adminPassword || "ztjhfts3425ghgd";

  if (token === adminPassword) {
    next();
  } else {
    res.status(401).json({ error: "Unauthorized: Admin-Passwort erforderlich." });
  }
}

// Allows Streamer or Admin access (Bracket, map rolls, matchzy control)
export function checkStreamerAuth(req: Request, res: Response, next: NextFunction): void {
  const token = getToken(req);
  const settings = store.getServerSettings(false);
  const adminPassword = settings.adminPassword || "ztjhfts3425ghgd";

  if (token === adminPassword || token === STREAMER_PASSWORD) {
    next();
  } else {
    res.status(401).json({ error: "Unauthorized: Streamer- oder Admin-Passwort erforderlich." });
  }
}
