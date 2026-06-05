import type { Request, Response, NextFunction } from "express";
import { store } from "../store.js";

export function checkApiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const apiKeyHeader = req.headers["x-api-key"];
  const apiKey = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;

  if (!apiKey) {
    res.status(401).json({ error: "Unauthorized: Missing X-API-Key header." });
    return;
  }

  // Get current configured API Key from settings or environment
  const settings = store.getServerSettings(false);
  const expectedApiKey = settings.apiKey || process.env.API_KEY || "sk_live_janaxF";

  if (apiKey === expectedApiKey) {
    next();
  } else {
    res.status(401).json({ error: "Unauthorized: Invalid X-API-Key." });
  }
}
