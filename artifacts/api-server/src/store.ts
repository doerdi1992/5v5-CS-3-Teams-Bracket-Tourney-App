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
  adminPassword?: string;
  apiKey?: string;
  adminSteamId?: string;
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
  match4: string | null;
  match1Winner: string | null;
  match2Winner: string | null;
  match3Winner: string | null;
  match4Winner: string | null;
  rolledMap: string | null;

  match4BestOf: 1 | 3;
  match4Score: { left: number; right: number };
  match1Rounds?: { left: number; right: number } | null;
  match2Rounds?: { left: number; right: number } | null;
  match3Rounds?: { left: number; right: number } | null;
  match4Rounds?: { left: number; right: number } | null;
}

function freshBracket(): BracketState {
  return {
    currentMatch: 1,
    match1: "A vs B",
    match2: null,
    match3: null,
    match4: null,
    match1Winner: null,
    match2Winner: null,
    match3Winner: null,
    match4Winner: null,
    rolledMap: null,

    match4BestOf: 1,
    match4Score: { left: 0, right: 0 },
    match1Rounds: null,
    match2Rounds: null,
    match3Rounds: null,
    match4Rounds: null,
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

    // Default settings: pre-filled with verified janaxF default FSHost server settings
    return {
      rconHost: process.env["DEFAULT_RCON_HOST"] || "185.194.236.142",
      rconPort: Number(process.env["DEFAULT_RCON_PORT"]) || 30045,
      rconPassword: process.env["DEFAULT_RCON_PASSWORD"] || "FetchingJealous1",
      loadMethod: "ftp",
      ftpHost: "de35.fsho.st",
      ftpPort: 21,
      ftpUser: "343263",
      ftpPassword: "tZWNVrJ4CKUz",
      ftpDir: "p3611/cfg/MatchZy/",
      connectionString: process.env["DEFAULT_SERVER_CONNECTION"] || "connect 185.194.236.142:30045; password janaxfcommunity",
      autoSend: true,
      autoStartMatch: true,
      appUrl: "https://esports-bracket-flow--buffinger1.replit.app",
      adminPassword: "ztjhfts3425ghgd",
      apiKey: process.env["API_KEY"] || "sk_live_janaxF",
      adminSteamId: "",
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
      } else if (key === "adminPassword") {
        if (val && val !== "********") {
          merged.adminPassword = val as string;
        }
      } else if (key === "apiKey") {
        if (val && val !== "********") {
          merged.apiKey = val as string;
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
      adminPassword: this.serverSettings.adminPassword ? "********" : "",
      apiKey: this.serverSettings.apiKey ? "********" : "",
    };
  }

  // 3 teams × 5 players = 15 max
  static readonly MAX_ACCEPTED_PLAYERS = 15;

  getAcceptedCount(): number {
    return Array.from(this.playerPool.values()).filter(p => p.status === "accepted").length;
  }

  addPlayer(name: string, status: PlayerStatus = "accepted", steamId?: string): Player | null {
    // Enforce limit when adding as accepted
    if (status === "accepted" && this.getAcceptedCount() >= Store.MAX_ACCEPTED_PLAYERS) {
      return null;
    }
    const id = randomUUID();
    const player: Player = { id, name, flagged: false, status, team: null, socketId: null, steamId };
    this.playerPool.set(id, player);
    return player;
  }

  addViewerPlayer(clientId: string, name: string, steamId?: string): Player {
    // Clean up any existing rejected players with the same steamId or name
    if (steamId) {
      const duplicate = Array.from(this.playerPool.values()).find(
        (p) => p.steamId === steamId && p.status === "rejected"
      );
      if (duplicate) {
        this.playerPool.delete(duplicate.id);
      }
    } else {
      const duplicate = Array.from(this.playerPool.values()).find(
        (p) => p.name.toLowerCase() === name.toLowerCase() && p.status === "rejected"
      );
      if (duplicate) {
        this.playerPool.delete(duplicate.id);
      }
    }

    const existing = Array.from(this.playerPool.values()).find((p) => p.id === clientId);
    if (existing) {
      existing.name = name;
      existing.status = "pending"; // Reset to pending if they apply again
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

  updatePlayer(id: string, updates: Partial<Player>): Player | undefined | "limit" {
    const player = this.playerPool.get(id);
    if (!player) return undefined;
    // Enforce limit when changing status to accepted
    if (updates.status === "accepted" && player.status !== "accepted") {
      if (this.getAcceptedCount() >= Store.MAX_ACCEPTED_PLAYERS) {
        return "limit";
      }
    }
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

  setMatchWinner(winner: TeamName, rounds?: { left: number; right: number }): BracketState {
    const b = this.bracketState;
    if (b.currentMatch === 1) {
      b.match1Winner = winner;
      b.match1Rounds = rounds || null;
      if (winner === "A") { b.match2 = "B vs C"; b.match3 = "A vs C"; }
      else { b.match2 = "A vs C"; b.match3 = "B vs C"; }
      b.currentMatch = 2;
    } else if (b.currentMatch === 2) {
      b.match2Winner = winner;
      b.match2Rounds = rounds || null;
      b.currentMatch = 3;
    } else if (b.currentMatch === 3) {
      // Match 3 is always BO1
      b.match3Winner = winner;
      b.match3Rounds = rounds || null;
      this.evaluatePostMatch3(b);
    } else if (b.currentMatch === 4) {
      if (b.match4BestOf === 3) {
        // BO3 for Tiebreaker
        const tiebreakerTeams = this.getTiebreakerTeams();
        if (winner === tiebreakerTeams[0]) {
          b.match4Score.left++;
        } else {
          b.match4Score.right++;
        }
        if (rounds) {
          b.match4Rounds = {
            left: (b.match4Rounds?.left || 0) + rounds.left,
            right: (b.match4Rounds?.right || 0) + rounds.right,
          };
        }
        if (b.match4Score.left >= 2 || b.match4Score.right >= 2) {
          b.match4Winner = winner;
          b.currentMatch = 5; // Finished
        }
      } else {
        b.match4Winner = winner;
        b.match4Rounds = rounds || null;
        b.currentMatch = 5; // Finished
      }
    }
    return b;
  }

  evaluatePostMatch3(b: BracketState) {
    const wins = { A: 0, B: 0, C: 0 };
    if (b.match1Winner) wins[b.match1Winner as TeamName]++;
    if (b.match2Winner) wins[b.match2Winner as TeamName]++;
    if (b.match3Winner) wins[b.match3Winner as TeamName]++;

    if (wins.A === 1 && wins.B === 1 && wins.C === 1) {
      // Three-way tie!
      // Find the two teams with the most rounds across matches 1, 2, and 3
      const rounds = { A: 0, B: 0, C: 0 };
      const addMatchRounds = (matchStr: string | null, roundsObj: { left: number; right: number } | null | undefined) => {
        if (!matchStr || !roundsObj) return;
        const parts = matchStr.split(" ");
        if (parts.length >= 3) {
          const leftTeam = parts[0] as TeamName;
          const rightTeam = parts[2] as TeamName;
          rounds[leftTeam] += roundsObj.left;
          rounds[rightTeam] += roundsObj.right;
        }
      };

      addMatchRounds(b.match1, b.match1Rounds);
      addMatchRounds(b.match2, b.match2Rounds);
      addMatchRounds(b.match3, b.match3Rounds);

      const sorted = (["A", "B", "C"] as TeamName[]).sort((x, y) => rounds[y] - rounds[x]);
      const team1 = sorted[0];
      const team2 = sorted[1];
      b.match4 = `${team1} vs ${team2}`;
      b.currentMatch = 4; // Move to tiebreaker match
    } else {
      b.currentMatch = 5; // Finished
    }
  }

  resetBracket(): BracketState {
    this.bracketState = freshBracket();
    this.activeServerDetails = null;
    return this.bracketState;
  }

  resetActiveMatch(): void {
    const b = this.bracketState;
    
    // Case 1: If there is a rolled map or active server details, clear them first
    if (b.rolledMap || this.activeServerDetails) {
      b.rolledMap = null;
      this.activeServerDetails = null;
      return;
    }

    // Case 2: If we are at the finished state, go back to the last match and clear winner
    if (b.currentMatch === 5) {
      if (b.match4) {
        b.currentMatch = 4;
        b.match4Winner = null;
        b.match4Rounds = null;
        b.match4Score = { left: 0, right: 0 };
      } else {
        b.currentMatch = 3;
        b.match3Winner = null;
        b.match3Rounds = null;
      }
      return;
    }

    // Case 3: If current match has no rolled map but we are on match > 1, go back one match and clear its winner
    if (b.currentMatch === 4) {
      b.currentMatch = 3;
      b.match3Winner = null;
      b.match3Rounds = null;
      b.rolledMap = null;
      this.activeServerDetails = null;
    } else if (b.currentMatch === 3) {
      b.currentMatch = 2;
      b.match2Winner = null;
      b.match2Rounds = null;
      b.rolledMap = null;
      this.activeServerDetails = null;
    } else if (b.currentMatch === 2) {
      b.currentMatch = 1;
      b.match1Winner = null;
      b.match1Rounds = null;
      b.rolledMap = null;
      this.activeServerDetails = null;
    } else if (b.currentMatch === 1) {
      b.match1Winner = null;
      b.match1Rounds = null;
      b.rolledMap = null;
      this.activeServerDetails = null;
    }
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
    if (b.currentMatch === 4) {
      return this.getTiebreakerTeams();
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

  getTiebreakerTeams(): TeamName[] {
    const b = this.bracketState;
    if (b.match4) {
      const parts = b.match4.split(" ");
      if (parts.length >= 3) return [parts[0] as TeamName, parts[2] as TeamName];
    }
    return [];
  }

  // BO3 option is only available for the tiebreaker (Match 4)
  // It can only be activated after all 3 matches are played with a 3-way tie

  setTiebreakerBestOf(value: 1 | 3): void {
    this.bracketState.match4BestOf = value;
    this.bracketState.match4Score = { left: 0, right: 0 };
  }

  getTiebreakerWinner(): { team: TeamName; rounds: Record<TeamName, number> } | null {
    const b = this.bracketState;
    // Tiebreaker calculation is active if the matches 1, 2, and 3 are completed and we have a 3-way tie.
    if (b.match1Winner && b.match2Winner && b.match3Winner) {
      const wins = { A: 0, B: 0, C: 0 };
      wins[b.match1Winner as TeamName]++;
      wins[b.match2Winner as TeamName]++;
      wins[b.match3Winner as TeamName]++;

      if (wins.A === 1 && wins.B === 1 && wins.C === 1) {
        const rounds = { A: 0, B: 0, C: 0 };
        const addMatchRounds = (matchStr: string | null, roundsObj: { left: number; right: number } | null | undefined) => {
          if (!matchStr || !roundsObj) return;
          const parts = matchStr.split(" ");
          if (parts.length >= 3) {
            const leftTeam = parts[0] as TeamName;
            const rightTeam = parts[2] as TeamName;
            rounds[leftTeam] += roundsObj.left;
            rounds[rightTeam] += roundsObj.right;
          }
        };

        addMatchRounds(b.match1, b.match1Rounds);
        addMatchRounds(b.match2, b.match2Rounds);
        addMatchRounds(b.match3, b.match3Rounds);

        return { team: b.match4Winner as TeamName, rounds };
      }
    }
    return null;
  }

  getFullState() {
    const tiebreaker = this.getTiebreakerWinner();
    return {
      players: this.getAllPlayers(),
      teams: this.getTeams(),
      bracket: {
        ...this.bracketState,
        tiebreakerWinner: tiebreaker ? tiebreaker.team : null,
        tiebreakerRounds: tiebreaker ? tiebreaker.rounds : null,
        activeServerDetails: this.activeServerDetails,
      },
      mapImages: this.getMapImages(),
    };
  }
}

export const store = new Store();
