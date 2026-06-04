import type { Request, Response, NextFunction } from "express";

const ADMIN_PASSWORD = process.env["ADMIN_PASSWORD"] ?? "kmjfe0u273404r\u00df0";

export function checkAdminAuth(req: Request, res: Response, next: NextFunction): void {
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

  if (token === ADMIN_PASSWORD) {
    next();
  } else {
    res.status(401).json({ error: "Unauthorized: Admin-Passwort erforderlich." });
  }
}
