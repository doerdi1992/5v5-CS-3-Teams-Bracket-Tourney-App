import { randomUUID } from "crypto";

export type PlayerStatus = "pending" | "accepted" | "rejected";
export type TeamName = "A" | "B" | "C";

export interface Player {
  id: string;
  name: string;
  flagged: boolean;
  status: PlayerStatus;
  team: TeamName | null;
  socketId: string | null;
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
  };
}

class Store {
  playerPool: Map<string, Player> = new Map();
  bracketState: BracketState = freshBracket();
  activeServerDetails: string | null = null;

  addPlayer(name: string, status: PlayerStatus = "accepted"): Player {
    const id = randomUUID();
    const player: Player = { id, name, flagged: false, status, team: null, socketId: null };
    this.playerPool.set(id, player);
    return player;
  }

  addViewerPlayer(clientId: string, name: string): Player {
    const existing = Array.from(this.playerPool.values()).find(
      (p) => p.id === clientId
    );
    if (existing) return existing;
    const player: Player = {
      id: clientId,
      name,
      flagged: false,
      status: "pending",
      team: null,
      socketId: null,
    };
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
        const filler: Player = {
          id: randomUUID(),
          name: `Player ${this.playerPool.size + i + 1}`,
          flagged: false,
          status: "accepted",
          team: null,
          socketId: null,
        };
        this.playerPool.set(filler.id, filler);
        accepted.push(filler);
      }
    }

    const flagged = accepted.filter((p) => p.flagged);
    const unflagged = accepted.filter((p) => !p.flagged);

    const shuffle = <T>(arr: T[]): T[] =>
      arr
        .map((v) => ({ v, sort: Math.random() }))
        .sort((a, b) => a.sort - b.sort)
        .map(({ v }) => v);

    const shuffledFlagged = shuffle(flagged);
    const shuffledUnflagged = shuffle(unflagged);

    const teamA: Player[] = [];
    const teamB: Player[] = [];
    const teamC: Player[] = [];

    shuffledFlagged.forEach((p, i) => {
      const team = (["A", "B", "C"] as TeamName[])[i % 3];
      p.team = team;
      if (team === "A") teamA.push(p);
      else if (team === "B") teamB.push(p);
      else teamC.push(p);
    });

    const fillTeam = (team: Player[], name: TeamName) => {
      while (team.length < 5 && shuffledUnflagged.length > 0) {
        const p = shuffledUnflagged.shift()!;
        p.team = name;
        team.push(p);
      }
    };

    fillTeam(teamA, "A");
    fillTeam(teamB, "B");
    fillTeam(teamC, "C");

    while (shuffledUnflagged.length > 0) {
      const p = shuffledUnflagged.shift()!;
      if (teamA.length < 5) { p.team = "A"; teamA.push(p); }
      else if (teamB.length < 5) { p.team = "B"; teamB.push(p); }
      else if (teamC.length < 5) { p.team = "C"; teamC.push(p); }
    }

    this.bracketState = freshBracket();

    return { A: teamA, B: teamB, C: teamC };
  }

  setMatchWinner(winner: TeamName): BracketState {
    const b = this.bracketState;

    if (b.currentMatch === 1) {
      b.match1Winner = winner;
      if (winner === "A") {
        b.match2 = "B vs C";
        b.match3 = "A vs C";
      } else {
        b.match2 = "A vs C";
        b.match3 = "B vs C";
      }
      b.currentMatch = 2;
    } else if (b.currentMatch === 2) {
      b.match2Winner = winner;
      b.currentMatch = 3;
    } else if (b.currentMatch === 3) {
      b.match3Winner = winner;
      b.currentMatch = 4;
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
    this.bracketState.rolledMap = rolled;
    return rolled;
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

  getFullState() {
    return {
      players: this.getAllPlayers(),
      teams: this.getTeams(),
      bracket: this.bracketState,
    };
  }
}

export const store = new Store();
