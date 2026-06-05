import { Router, type IRouter } from "express";
import { store } from "../store.js";
import { broadcastStateUpdate } from "../socket.js";
import {
  AddPlayersBody,
  UpdatePlayerParams,
  UpdatePlayerBody,
  DeletePlayerParams,
  RegisterViewerBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/players", (_req, res) => {
  res.json(store.getAllPlayers());
});

router.post("/players", (req, res) => {
  // 1. Support single player manual addition with optional steamId
  if (req.body && typeof req.body.name === "string") {
    const name = req.body.name.trim();
    if (!name) {
      res.status(400).json({ error: "Name erforderlich" });
      return;
    }
    const steamId = typeof req.body.steamId === "string" ? req.body.steamId.trim() : undefined;
    const player = store.addPlayer(name, "accepted", steamId || undefined);
    if (!player) {
      res.status(400).json({ error: `Maximum erreicht (${store.getAcceptedCount()}/15 Spieler). Entferne zuerst einen Spieler.` });
      return;
    }
    broadcastStateUpdate();
    res.status(201).json(player);
    return;
  }

  // 2. Fallback to bulk name import
  const parsed = AddPlayersBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const { names } = parsed.data;
  const added = names
    .map((n) => n.trim())
    .filter((n) => n.length > 0)
    .map((name) => store.addPlayer(name, "accepted"))
    .filter((p) => p !== null);
  broadcastStateUpdate();
  const skipped = names.length - added.length;
  if (skipped > 0 && added.length === 0) {
    res.status(400).json({ error: `Maximum erreicht (${store.getAcceptedCount()}/15 Spieler).` });
    return;
  }
  res.status(201).json(added);
});

router.patch("/players/:id", (req, res) => {
  const params = UpdatePlayerParams.safeParse(req.params);
  const body = UpdatePlayerBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const updates = { ...(body.data as any) };
  if ((req.body as any).steamId !== undefined) {
    updates.steamId = (req.body as any).steamId ? String((req.body as any).steamId).trim() : null;
  }
  const updated = store.updatePlayer(params.data.id, updates);
  if (updated === "limit") {
    res.status(400).json({ error: `Maximum erreicht (15/15 Spieler). Entferne zuerst einen Spieler.` });
    return;
  }
  if (!updated) {
    res.status(404).json({ error: "Player not found" });
    return;
  }
  broadcastStateUpdate();
  res.json(updated);
});

router.delete("/players/:id", (req, res) => {
  const params = DeletePlayerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const deleted = store.deletePlayer(params.data.id);
  if (!deleted) {
    res.status(404).json({ error: "Player not found" });
    return;
  }
  broadcastStateUpdate();
  res.json({ success: true, message: null });
});

router.get("/players/resolve-steam", async (req, res) => {
  const { input } = req.query as { input?: string };
  if (!input || !input.trim()) {
    res.status(400).json({ error: "Eingabe erforderlich." });
    return;
  }

  const query = input.trim();

  try {
    let steamId: string | null = null;
    let steamName: string | undefined = undefined;

    // 1. Check if it's already a direct 17-digit Steam64 ID
    if (/^\d{17}$/.test(query)) {
      steamId = query;
    }

    // 2. Check if it contains profiles/<steamid64>
    const profileMatch = query.match(/steamcommunity\.com\/profiles\/(\d{17})/i);
    if (profileMatch && profileMatch[1]) {
      steamId = profileMatch[1];
    }

    if (steamId) {
      // Fetch profile XML using profiles/ to verify and fetch nickname
      const steamUrl = `https://steamcommunity.com/profiles/${steamId}/?xml=1`;
      const response = await fetch(steamUrl);
      if (response.ok) {
        const text = await response.text();
        const id64Match = text.match(/<steamID64>(\d{17})<\/steamID64>/);
        if (id64Match && id64Match[1]) {
          const steamIDMatch = text.match(/<steamID><!\[CDATA\[(.*?)\]\]><\/steamID>/) || text.match(/<steamID>(.*?)<\/steamID>/);
          steamName = steamIDMatch ? steamIDMatch[1].trim() : undefined;
          res.json({ steamId: id64Match[1], steamName });
          return;
        }
      }
      res.json({ steamId });
      return;
    }

    // 3. Resolve vanity URL
    let vanityName = query;
    const idMatch = query.match(/steamcommunity\.com\/id\/([a-zA-Z0-9_-]+)/i);
    if (idMatch && idMatch[1]) {
      vanityName = idMatch[1];
    } else {
      // If it's a URL but didn't match the patterns, return error
      if (query.includes("steamcommunity.com")) {
        res.status(400).json({ error: "Ungültiges Steam-Profil-Format." });
        return;
      }
    }

    // Clean vanityName of any trailing slashes
    vanityName = vanityName.replace(/\/+$/, "");

    const steamUrl = `https://steamcommunity.com/id/${vanityName}/?xml=1`;
    const response = await fetch(steamUrl);
    if (!response.ok) {
      throw new Error(`Profile fetch failed: ${response.statusText}`);
    }
    const text = await response.text();
    const id64Match = text.match(/<steamID64>(\d{17})<\/steamID64>/);
    if (id64Match && id64Match[1]) {
      const steamIDMatch = text.match(/<steamID><!\[CDATA\[(.*?)\]\]><\/steamID>/) || text.match(/<steamID>(.*?)<\/steamID>/);
      steamName = steamIDMatch ? steamIDMatch[1].trim() : undefined;
      res.json({ steamId: id64Match[1], steamName });
      return;
    }
    
    // Also try as custom profiles fallback just in case the name itself was a custom profile URL suffix
    if (/^\d+$/.test(vanityName)) {
      const altUrl = `https://steamcommunity.com/profiles/${vanityName}/?xml=1`;
      const altResponse = await fetch(altUrl);
      if (altResponse.ok) {
        const altText = await altResponse.text();
        const altIdMatch = altText.match(/<steamID64>(\d{17})<\/steamID64>/);
        if (altIdMatch && altIdMatch[1]) {
          const steamIDMatch = altText.match(/<steamID><!\[CDATA\[(.*?)\]\]><\/steamID>/) || altText.match(/<steamID>(.*?)<\/steamID>/);
          steamName = steamIDMatch ? steamIDMatch[1].trim() : undefined;
          res.json({ steamId: altIdMatch[1], steamName });
          return;
        }
      }
    }

    res.status(404).json({ error: "Steam-ID konnte nicht aufgelöst werden. Bitte gib deine 17-stellige Steam64 ID direkt ein." });
  } catch (err: any) {
    console.error("Steam ID resolve error:", err);
    res.status(500).json({ error: `Verbindungsfehler zu Steam: ${err.message}` });
  }
});

router.post("/players/register", (req, res) => {
  const parsed = RegisterViewerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const { name, clientId } = parsed.data;
  const steamId = (req.body as any).steamId ? String((req.body as any).steamId).trim() : undefined;
  const player = store.addViewerPlayer(clientId, name.trim(), steamId);
  broadcastStateUpdate();
  res.status(201).json(player);
});

export default router;
