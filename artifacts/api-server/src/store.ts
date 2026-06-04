import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

export type PlayerStatus = "pending" | "accepted" | "rejected";
export type TeamName = "A" | "B" | "C";

export interface ServerSettings {
  rconHost: string;
  rconPort: number;
  rconPassword?: string;
  loadMethod: "url" | "ftp";
  ftpHost?: string;
  ftpPort?: number;
  ftpUser?: string;
  ftpPassword?: string;
  ftpDir?: string;
  connectionString?: string;
  autoSend: boolean;
  autoStartMatch: boolean;
  appUrl?: string;
}

export interface Player {
  id: string;
  name: string;
  flagged: boolean;
  status: PlayerStatus;
  team: TeamName | null;
  socketId: string | null;
  steamId?: string;
}

export interface Teams {
  A: Player[];
  B: Player[];
  C: Player[];
}

export interface BracketState {
  currentMatch: number;
  match1: string | null;
  match2: string | null;
  match3: string | null;
  match1Winner: string | null;
  match2Winner: string | null;
  match3Winner: string | null;
  rolledMap: string | null;
  finaleBestOf: 1 | 3;
  finaleScore: { left: number; right: number };
}

function freshBracket(): BracketState {
  return {
    currentMatch: 1,
    match1: "A vs B",
    match2: null,
    match3: null,
    match1Winner: null,
    match2Winner: null,
    match3Winner: null,
    rolledMap: null,
    finaleBestOf: 1,
    finaleScore: { left: 0, right: 0 },
  };
}

class Store {
  playerPool: Map<string, Player> = new Map();
  bracketState: BracketState = freshBracket();
  activeServerDetails: string | null = null;
  mapImages: Map<string, string> = new Map([
    ["Cache", "https://static.wikia.nocookie.net/cswikia/images/5/5b/De_cache_cs2.png/revision/latest?cb=20260429100503"],
    ["Cobblestone", "https://static.wikia.nocookie.net/cswikia/images/b/bc/De_cbble_s2.png/revision/latest?cb=20230701154412"],
    ["Mirage", "https://static.wikia.nocookie.net/cswikia/images/f/f5/De_mirage_cs2.png/revision/latest?cb=20230807124319"]
  ]);

  serverSettings: ServerSettings = this.loadServerSettings();

  loadServerSettings(): ServerSettings {
    const configPath = path.resolve(process.cwd(), "artifacts/api-server/server_config.json");
    try {
      if (fs.existsSync(configPath)) {
        const data = fs.readFileSync(configPath, "utf8");
        return JSON.parse(data);
      }
    } catch (e) {
      console.error("Failed to load server settings from file, using env defaults:", e);
    }

    // Default settings from environment or fallbacks
    return {
      rconHost: process.env["DEFAULT_RCON_HOST"] || "",
      rconPort: Number(process.env["DEFAULT_RCON_PORT"]) || 27015,
      rconPassword: process.env["DEFAULT_RCON_PASSWORD"] || "",
      loadMethod: "url",
      ftpHost: "",
      ftpPort: 21,
      ftpUser: "",
      ftpPassword: "",
      ftpDir: "game/csgo/MatchZy/",
      connectionString: process.env["DEFAULT_SERVER_CONNECTION"] || "",
      autoSend: true,
      autoStartMatch: true,
      appUrl: "",
    };
  }

  saveServerSettings(settings: Partial<ServerSettings>): void {
    const current = this.serverSettings;
    const merged = { ...current };

    // Update fields, handling masked passwords
    for (const key of Object.keys(settings) as Array<keyof ServerSettings>) {
      const val = settings[key];
      if (key === "rconPassword") {
        if (val && val !== "********") {
          merged.rconPassword = val as string;
        }
      } else if (key === "ftpPassword") {
        if (val && val !== "********") {
          merged.ftpPassword = val as string;
        }
      } else {
        (merged as any)[key] = val;
      }
    }

    this.serverSettings = merged;

    const configPath = path.resolve(process.cwd(), "artifacts/api-server/server_config.json");
    try {
      // Ensure the directory exists
      const dir = path.dirname(configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(configPath, JSON.stringify(merged, null, 2), "utf8");
      console.log(`[Store] Server settings saved to ${configPath}`);
    } catch (e) {
      console.error("Failed to write server settings to file:", e);
    }
  }

  getServerSettings(maskPasswords = true): ServerSettings {
    if (!maskPasswords) {
      return this.serverSettings;
    }
    return {
      ...this.serverSettings,
      rconPassword: this.serverSettings.rconPassword ? "********" : "",
      ftpPassword: this.serverSettings.ftpPassword ? "********" : "",
    };
  }

  addPlayer(name: string, status: PlayerStatus = "accepted", steamId?: string): Player {
    const id = randomUUID();
    const player: Player = { id, name, flagged: false, status, team: null, socketId: null, steamId };
    this.playerPool.set(id, player);
    return player;
  }

  addViewerPlayer(clientId: string, name: string, steamId?: string): Player {
    const existing = Array.from(this.playerPool.values()).find((p) => p.id === clientId);
    if (existing) {
      existing.name = name;
      if (steamId) existing.steamId = steamId;
      return existing;
    }
    const player: Player = { id: clientId, name, flagged: false, status: "pending", team: null, socketId: null, steamId };
    this.playerPool.set(clientId, player);
    return player;
  }

  getPlayer(id: string): Player | undefined {
    return this.playerPool.get(id);
  }

  updatePlayer(id: string, updates: Partial<Player>): Player | undefined {
    const player = this.playerPool.get(id);
    if (!player) return undefined;
    Object.assign(player, updates);
    return player;
  }

  deletePlayer(id: string): boolean {
    return this.playerPool.delete(id);
  }

  getAllPlayers(): Player[] {
    return Array.from(this.playerPool.values());
  }

  getTeams(): Teams {
    const accepted = this.getAllPlayers().filter((p) => p.status === "accepted");
    return {
      A: accepted.filter((p) => p.team === "A"),
      B: accepted.filter((p) => p.team === "B"),
      C: accepted.filter((p) => p.team === "C"),
    };
  }

  rollTeams(): Teams {
    const accepted = this.getAllPlayers().filter((p) => p.status === "accepted");
    if (accepted.length < 15) {
      const needed = 15 - accepted.length;
      for (let i = 0; i < needed; i++) {
        const filler: Player = { id: randomUUID(), name: `Spieler ${this.playerPool.size + i + 1}`, flagged: false, status: "accepted", team: null, socketId: null };
        this.playerPool.set(filler.id, filler);
        accepted.push(filler);
      }
    }
    const flagged = accepted.filter((p) => p.flagged);
    const unflagged = accepted.filter((p) => !p.flagged);
    const shuffle = <T>(arr: T[]): T[] => arr.map((v) => ({ v, sort: Math.random() })).sort((a, b) => a.sort - b.sort).map(({ v }) => v);
    const sf = shuffle(flagged);
    const su = shuffle(unflagged);
    const tA: Player[] = [], tB: Player[] = [], tC: Player[] = [];
    const slots: TeamName[] = [];
    for (let i = 0; i < sf.length; i += 3) {
      const chunk = shuffle(["A", "B", "C"] as TeamName[]);
      slots.push(...chunk);
    }
    sf.forEach((p, i) => {
      const t = slots[i];
      p.team = t;
      if (t === "A") tA.push(p); else if (t === "B") tB.push(p); else tC.push(p);
    });
    const fill = (t: Player[], n: TeamName) => { while (t.length < 5 && su.length > 0) { const p = su.shift()!; p.team = n; t.push(p); } };
    fill(tA, "A"); fill(tB, "B"); fill(tC, "C");
    while (su.length > 0) {
      const p = su.shift()!;
      if (tA.length < 5) { p.team = "A"; tA.push(p); } else if (tB.length < 5) { p.team = "B"; tB.push(p); } else if (tC.length < 5) { p.team = "C"; tC.push(p); }
    }
    this.bracketState = freshBracket();
    return { A: tA, B: tB, C: tC };
  }

  setMatchWinner(winner: TeamName): BracketState {
    const b = this.bracketState;
    if (b.currentMatch === 1) {
      b.match1Winner = winner;
      if (winner === "A") { b.match2 = "A vs B"; b.match3 = "A vs C"; }
      else { b.match2 = "A vs C"; b.match3 = "B vs C"; }
      // Correct logic: if A wins Match1: M2 = B vs C, M3 = A vs (winner of M2)
      // Re-implementing per spec: if A wins: M2=B vs C, M3=A vs C; if B wins: M2=A vs C, M3=B vs C
      if (winner === "A") { b.match2 = "B vs C"; b.match3 = "A vs C"; }
      else { b.match2 = "A vs C"; b.match3 = "B vs C"; }
      b.currentMatch = 2;
    } else if (b.currentMatch === 2) {
      b.match2Winner = winner;
      b.currentMatch = 3;
    } else if (b.currentMatch === 3) {
      if (b.finaleBestOf === 3) {
        // BO3: determine which side this winner is on
        const finaleTeams = this.getFinaleTeams();
        if (winner === finaleTeams[0]) {
          b.finaleScore.left++;
        } else {
          b.finaleScore.right++;
        }
        // Check if someone reached 2 wins
        if (b.finaleScore.left >= 2 || b.finaleScore.right >= 2) {
          b.match3Winner = winner;
          b.currentMatch = 4;
        }
        // Otherwise stay on match 3 for next sub-game
      } else {
        b.match3Winner = winner;
        b.currentMatch = 4;
      }
    }
    return b;
  }

  resetBracket(): BracketState {
    this.bracketState = freshBracket();
    return this.bracketState;
  }

  rollMap(maps: string[]): string {
    if (maps.length === 0) return "Mirage";
    const rolled = maps[Math.floor(Math.random() * maps.length)];
    this.bracketState.rolledMap = null; // Clear map state during spin so users don't see it early
    return rolled;
  }

  setRolledMap(map: string): void {
    this.bracketState.rolledMap = map;
  }

  getMapImages(): Record<string, string> {
    return Object.fromEntries(this.mapImages);
  }

  setMapImage(map: string, imageUrl: string): void {
    this.mapImages.set(map, imageUrl);
  }

  deleteMapImage(map: string): boolean {
    return this.mapImages.delete(map);
  }

  getCurrentMatchTeams(): TeamName[] {
    const b = this.bracketState;
    if (b.currentMatch === 1) return ["A", "B"];
    if (b.currentMatch === 2) {
      if (b.match1Winner === "A") return ["B", "C"];
      return ["A", "C"];
    }
    if (b.currentMatch === 3) {
      if (b.match1Winner === "A") return ["A", "C"];
      return ["B", "C"];
    }
    return [];
  }

  getFinaleTeams(): TeamName[] {
    const b = this.bracketState;
    if (b.match3) {
      const parts = b.match3.split(" ");
      if (parts.length >= 3) return [parts[0] as TeamName, parts[2] as TeamName];
    }
    return this.getCurrentMatchTeams();
  }

  setFinaleBestOf(value: 1 | 3): void {
    this.bracketState.finaleBestOf = value;
    this.bracketState.finaleScore = { left: 0, right: 0 };
    // Don't reset match3Winner if already set
  }

  getFullState() {
    return {
      players: this.getAllPlayers(),
      teams: this.getTeams(),
      bracket: this.bracketState,
      mapImages: this.getMapImages(),
    };
  }
}

export const store = new Store();
