import { useGetFullState, getGetFullStateQueryKey } from "@workspace/api-client-react";
import { useEffect, useState } from "react";
import { socket } from "@/lib/socket";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Trophy, Crown, Users, MapPin, CheckCircle2, Tv, Star } from "lucide-react";

// Helpers
const getMatchTeams = (matchString: string | null | undefined): string[] => {
  if (!matchString) return [];
  const parts = matchString.split(" ");
  return parts.length >= 3 ? [parts[0], parts[2]] : [];
};

const getTeamColor = (team: string | null | undefined): string => {
  if (team === "A") return "#f97316"; // Orange
  if (team === "B") return "#06b6d4"; // Cyan
  if (team === "C") return "#a855f7"; // Purple
  return "#94a3b8"; // Slate
};

const getTeamTextColor = (team: string | null | undefined): string => {
  if (team === "A") return "text-orange-500";
  if (team === "B") return "text-cyan-400";
  if (team === "C") return "text-purple-400";
  return "text-muted-foreground";
};

const getTeamBgClass = (team: string | null | undefined): string => {
  if (team === "A") return "bg-orange-500/5 border-orange-500/20";
  if (team === "B") return "bg-cyan-500/5 border-cyan-500/20";
  if (team === "C") return "bg-purple-500/5 border-purple-500/20";
  return "bg-card/30 border-border/40";
};

const getTeamGlowClass = (team: string | null | undefined): string => {
  if (team === "A") return "shadow-[0_0_30px_rgba(249,115,22,0.15)] border-orange-500/40";
  if (team === "B") return "shadow-[0_0_30px_rgba(6,182,212,0.15)] border-cyan-500/40";
  if (team === "C") return "shadow-[0_0_30px_rgba(168,85,247,0.15)] border-purple-500/40";
  return "shadow-none border-border/20";
};

const padRoster = (players: any[]) => {
  const list = [...players];
  while (list.length < 5) {
    list.push({ id: `placeholder-${list.length}`, name: "—" });
  }
  return list.slice(0, 5);
};

const Confetti = () => {
  const pieces = Array.from({ length: 60 });
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-50">
      {pieces.map((_, i) => {
        const left = Math.random() * 100;
        const delay = Math.random() * 5;
        const duration = 3 + Math.random() * 3;
        const size = 6 + Math.random() * 8;
        const colors = ["#f97316", "#06b6d4", "#a855f7", "#eab308", "#ef4444"];
        const color = colors[Math.floor(Math.random() * colors.length)];
        return (
          <div
            key={i}
            className="absolute top-0 rounded-sm opacity-80"
            style={{
              left: `${left}%`,
              width: `${size}px`,
              height: `${size}px`,
              backgroundColor: color,
              animation: `confetti-fall ${duration}s linear infinite`,
              animationDelay: `${delay}s`,
            }}
          />
        );
      })}
    </div>
  );
};

interface MatchCardProps {
  label: string;
  matchNum: number;
  currentMatch: number;
  left: string;
  right: string;
  winner: string | null | undefined;
  leftTeam: string | null;
  rightTeam: string | null;
  finaleBestOf?: number;
  finaleScore?: { left: number; right: number };
}

function MatchCard({
  label,
  matchNum,
  currentMatch,
  left,
  right,
  winner,
  leftTeam,
  rightTeam,
  finaleBestOf = 1,
  finaleScore = { left: 0, right: 0 },
}: MatchCardProps) {
  const isActive = currentMatch === matchNum;
  const isFinished = currentMatch > matchNum || !!winner;

  return (
    <div
      className={`glass px-4 py-3.5 rounded-xl border relative overflow-hidden transition-all duration-500 ${
        isActive
          ? "border-primary bg-primary/5 shadow-[0_0_30px_rgba(249,115,22,0.15)] scale-[1.01]"
          : isFinished
          ? "border-border/30 bg-card/10 opacity-75"
          : "border-border/10 bg-card/5 opacity-40"
      }`}
    >
      {/* Active Pulse Bar */}
      {isActive && (
        <div className="absolute top-0 left-0 w-1.5 h-full bg-primary animate-pulse" />
      )}

      {/* Top Header */}
      <div className="flex justify-between items-center mb-2 font-mono text-[10px]">
        <div className="flex items-center gap-1.5">
          {matchNum === 3 ? (
            <Crown className={`w-3.5 h-3.5 ${isActive ? "text-yellow-500 animate-bounce" : "text-yellow-500/60"}`} />
          ) : (
            <Trophy className="w-3.5 h-3.5 text-muted-foreground/60" />
          )}
          <span className={`uppercase tracking-widest font-black ${isActive ? "text-primary" : "text-muted-foreground"}`}>
            {label}
          </span>
        </div>

        {isActive && (
          <span className="flex items-center gap-1 bg-red-500/10 border border-red-500/20 text-red-500 text-[9px] font-bold px-2 py-0.5 rounded-full animate-live-pulse uppercase tracking-wider">
            Live
          </span>
        )}

        {winner && (
          <span className="flex items-center gap-1 bg-primary/10 border border-primary/20 text-primary text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
            Sieger: Team {winner}
          </span>
        )}
      </div>

      {/* Team Names and VS */}
      <div className="flex items-center justify-between text-xl font-black font-mono tracking-tight">
        <div className="flex flex-col items-start w-2/5">
          <span className={`${winner === leftTeam && winner ? "text-primary drop-shadow-[0_0_10px_rgba(249,115,22,0.5)] font-black" : getTeamTextColor(leftTeam)} truncate w-full`}>
            {left}
          </span>
        </div>

        <span className="text-muted-foreground/30 text-xs font-normal px-2">VS</span>

        <div className="flex flex-col items-end w-2/5 text-right">
          <span className={`${winner === rightTeam && winner ? "text-primary drop-shadow-[0_0_10px_rgba(249,115,22,0.5)] font-black" : getTeamTextColor(rightTeam)} truncate w-full`}>
            {right}
          </span>
        </div>
      </div>

      {/* BO3 Score Dots inside Match Card */}
      {matchNum === 3 && finaleBestOf === 3 && leftTeam && rightTeam && !winner && (
        <div className="flex items-center justify-center gap-6 mt-2.5 pt-2 border-t border-white/5">
          <div className="flex items-center gap-1">
            <div className="flex gap-1">
              {[0, 1].map((i) => (
                <div
                  key={`l${i}`}
                  className="w-2 h-2 rounded-full border transition-all duration-300"
                  style={{
                    backgroundColor: i < finaleScore.left ? getTeamColor(leftTeam) : "transparent",
                    borderColor: getTeamColor(leftTeam),
                    boxShadow: i < finaleScore.left ? `0 0 8px ${getTeamColor(leftTeam)}` : "none",
                  }}
                />
              ))}
            </div>
          </div>
          <span className="text-muted-foreground/60 text-[10px] font-mono font-bold">{finaleScore.left} — {finaleScore.right}</span>
          <div className="flex items-center gap-1">
            <div className="flex gap-1">
              {[0, 1].map((i) => (
                <div
                  key={`r${i}`}
                  className="w-2 h-2 rounded-full border transition-all duration-300"
                  style={{
                    backgroundColor: i < finaleScore.right ? getTeamColor(rightTeam) : "transparent",
                    borderColor: getTeamColor(rightTeam),
                    boxShadow: i < finaleScore.right ? `0 0 8px ${getTeamColor(rightTeam)}` : "none",
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function StreamerPage() {
  const queryClient = useQueryClient();
  const { data: fullState, isLoading } = useGetFullState({ query: { queryKey: getGetFullStateQueryKey() } });
  const [showGuide, setShowGuide] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("live") === "true") {
      setShowGuide(false);
    }
  }, []);

  useEffect(() => {
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: getGetFullStateQueryKey() });
    };
    socket.on("state_update", refresh);
    return () => {
      socket.off("state_update", refresh);
    };
  }, [queryClient]);

  if (isLoading || !fullState) {
    return (
      <div className="h-screen w-screen bg-slate-950 flex flex-col items-center justify-center font-mono text-foreground select-none">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-4 border-t-primary border-r-transparent border-b-transparent border-l-transparent animate-spin" />
          <span className="text-xs text-muted-foreground uppercase tracking-widest animate-pulse">Lade Streamer-Ansicht...</span>
        </div>
      </div>
    );
  }

  const { bracket, teams = { A: [], B: [], C: [] }, mapImages = {} } = fullState as {
    bracket: {
      currentMatch: number;
      match1: string | null;
      match2: string | null;
      match3: string | null;
      match1Winner: string | null;
      match2Winner: string | null;
      match3Winner: string | null;
      rolledMap: string | null;
      finaleBestOf?: 1 | 3;
      finaleScore?: { left: number; right: number };
    };
    teams: { A: any[]; B: any[]; C: any[] };
    mapImages: Record<string, string>;
  };

  const currentMatch = bracket.currentMatch;
  const rolledMap = bracket.rolledMap ?? null;
  const mapImageUrl = rolledMap ? (mapImages[rolledMap] ?? null) : null;
  const finaleBestOf = bracket.finaleBestOf ?? 1;
  const finaleScore = bracket.finaleScore ?? { left: 0, right: 0 };

  const currentTeams =
    currentMatch === 1 ? ["A", "B"]
    : currentMatch === 2 ? getMatchTeams(bracket.match2)
    : currentMatch === 3 ? getMatchTeams(bracket.match3)
    : [];

  const teamAPlayers = teams[currentTeams[0] as keyof typeof teams] || [];
  const teamBPlayers = teams[currentTeams[1] as keyof typeof teams] || [];

  return (
    <div className={`h-screen w-screen ${showGuide ? "bg-slate-950" : "bg-transparent"} text-foreground flex flex-col relative overflow-hidden font-sans select-none`}>
      {/* Moving background gradient mesh */}
      {showGuide && (
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-orange-500/10 via-slate-950 to-purple-500/10 opacity-70 pointer-events-none animate-gradient" />
      )}

      {/* Header */}
      <header className="flex items-center justify-between px-8 py-3.5 border-b border-white/5 relative z-20 glass-light">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-black font-mono tracking-tighter text-primary drop-shadow-[0_0_12px_rgba(249,115,22,0.4)]">
            Janaxf 5v5 CS2 Turnier
          </h1>
          <div className="h-4 w-px bg-white/10" />
          <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Streamer HUD</span>
        </div>

        {/* Match progress step indicator */}
        {currentMatch <= 3 && (
          <div className="flex items-center gap-4 bg-black/40 px-4 py-1.5 rounded-full border border-white/5">
            <div className={`flex items-center gap-1.5 text-[9px] font-mono tracking-widest font-black transition-all duration-300 ${
              currentMatch === 1 ? "text-primary" : "text-muted-foreground/40"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${currentMatch === 1 ? "bg-primary animate-pulse" : "bg-muted-foreground/20"}`} />
              PARTIE 1
            </div>
            <div className="w-4 h-px bg-white/10" />
            <div className={`flex items-center gap-1.5 text-[9px] font-mono tracking-widest font-black transition-all duration-300 ${
              currentMatch === 2 ? "text-primary" : "text-muted-foreground/40"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${currentMatch === 2 ? "bg-primary animate-pulse" : "bg-muted-foreground/20"}`} />
              PARTIE 2
            </div>
            <div className="w-4 h-px bg-white/10" />
            <div className={`flex items-center gap-1.5 text-[9px] font-mono tracking-widest font-black transition-all duration-300 ${
              currentMatch === 3 ? "text-primary" : "text-muted-foreground/40"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${currentMatch === 3 ? "bg-primary animate-pulse" : "bg-muted-foreground/20"}`} />
              FINALE {finaleBestOf === 3 ? "(BO3)" : "(BO1)"}
            </div>
          </div>
        )}

        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowGuide(!showGuide)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-[9px] font-mono uppercase tracking-wider text-foreground/80 hover:text-white transition-all cursor-pointer animate-pulse"
          >
            <Tv className="w-3.5 h-3.5" />
            {showGuide ? "Guide ausblenden" : "Guide einblenden"}
          </button>

          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_#22c55e]" />
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Live Feed</span>
          </div>
        </div>
      </header>

      {/* Main Grid View */}
      <div className="flex-1 grid grid-cols-12 gap-6 p-6 overflow-hidden relative z-10">
        {/* Left Side - 7 columns: Streamer Camera Placeholder Zone */}
        <div className="col-span-7 flex items-center justify-center p-4 h-full">
          {showGuide ? (
            <div className="w-full h-full border border-dashed border-white/10 rounded-3xl flex flex-col items-center justify-center relative bg-black/20 backdrop-blur-[1px]">
              {/* High-tech corner bracket accents */}
              <div className="absolute top-4 left-4 w-4 h-4 border-t-2 border-l-2 border-white/20" />
              <div className="absolute top-4 right-4 w-4 h-4 border-t-2 border-r-2 border-white/20" />
              <div className="absolute bottom-4 left-4 w-4 h-4 border-b-2 border-l-2 border-white/20" />
              <div className="absolute bottom-4 right-4 w-4 h-4 border-b-2 border-r-2 border-white/20" />
              
              <Tv className="w-8 h-8 text-white/10 animate-pulse mb-2" />
              <span className="font-mono text-[9px] uppercase tracking-[0.3em] text-white/25">Streamer Kamera-Bereich (OBS Overlay)</span>
              <span className="font-mono text-[8px] text-white/15 mt-2 max-w-xs text-center leading-relaxed">
                Füge "?live=true" zur URL hinzu oder klicke oben auf "Guide ausblenden", um die Hilfslinien zu deaktivieren.
              </span>
            </div>
          ) : (
            <div className="w-full h-full" />
          )}
        </div>

        {/* Right Side - 5 columns: Map, Bracket & Rosters */}
        <div className="col-span-5 flex flex-col justify-between h-full gap-3 overflow-hidden pr-2">
          {/* 1. Map Section */}
          <div className="w-full">
            {rolledMap ? (
              <motion.div
                key={rolledMap}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                className="w-full h-[136px] relative rounded-2xl overflow-hidden border border-white/10 shadow-[0_0_30px_rgba(0,0,0,0.5)] bg-slate-950"
              >
                {mapImageUrl ? (
                  <motion.img
                    initial={{ scale: 1.12 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 15, ease: "linear" }}
                    src={mapImageUrl}
                    alt={rolledMap}
                    className="w-full h-full object-cover opacity-60"
                  />
                ) : (
                  <div className="w-full h-full bg-slate-900/50" />
                )}

                {/* Dark gradient mask */}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />

                {/* Centered Map Name Overlay */}
                <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center z-10">
                  <span className="font-mono text-[9px] uppercase tracking-[0.3em] text-primary/80 font-black mb-1">Gewählte Map</span>
                  <h2 className="font-mono font-black text-4xl md:text-5xl uppercase tracking-widest text-white drop-shadow-[0_0_20px_rgba(249,115,22,0.8)]">
                    {rolledMap}
                  </h2>
                </div>

                {/* Top left tactical tag */}
                <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded-full border border-white/10 text-[8px] font-mono tracking-widest text-primary uppercase">
                  <MapPin className="w-2.5 h-2.5" />
                  MAP
                </div>
              </motion.div>
            ) : (
              <div className="w-full h-[136px] rounded-2xl border border-dashed border-white/10 flex flex-col items-center justify-center bg-slate-900/20 text-center p-4 gap-1">
                <Tv className="w-4 h-4 text-muted-foreground/40 animate-pulse" />
                <div>
                  <p className="font-mono text-muted-foreground text-[10px] uppercase tracking-wider">Karten-Auswahl ausstehend</p>
                  <p className="font-mono text-[8px] text-muted-foreground/30 mt-0.5 uppercase tracking-widest">Warte auf Map-Roll...</p>
                </div>
              </div>
            )}
          </div>

          {/* 2. Tournament Bracket (Turnier Verlauf) */}
          <div className="flex-1 flex flex-col gap-2.5 justify-center">
            <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground font-black pl-1 mb-0.5 block">
              Turnier Verlauf
            </span>

            <MatchCard
              label="Partie 1"
              matchNum={1}
              currentMatch={currentMatch}
              left="TEAM A"
              right="TEAM B"
              winner={bracket.match1Winner}
              leftTeam="A"
              rightTeam="B"
            />

            <MatchCard
              label="Partie 2"
              matchNum={2}
              currentMatch={currentMatch}
              left={bracket.match2 ? `TEAM ${bracket.match2.split(" ")[0]}` : "TBD"}
              right={bracket.match2 ? `TEAM ${bracket.match2.split(" ")[2]}` : "TBD"}
              winner={bracket.match2Winner}
              leftTeam={bracket.match2?.split(" ")[0] ?? null}
              rightTeam={bracket.match2?.split(" ")[2] ?? null}
            />

            <MatchCard
              label="Finale"
              matchNum={3}
              currentMatch={currentMatch}
              left={bracket.match3 ? `TEAM ${bracket.match3.split(" ")[0]}` : "TBD"}
              right={bracket.match3 ? `TEAM ${bracket.match3.split(" ")[2]}` : "TBD"}
              winner={bracket.match3Winner}
              leftTeam={bracket.match3?.split(" ")[0] ?? null}
              rightTeam={bracket.match3?.split(" ")[2] ?? null}
              finaleBestOf={finaleBestOf}
              finaleScore={finaleScore}
            />
          </div>

          {/* 3. Rosters (Active) */}
          {currentMatch <= 3 && currentTeams.length >= 2 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-2 pt-2 border-t border-white/5"
            >
              <div className="grid grid-cols-2 gap-3">
                {/* Team Left */}
                <div className={`p-3 rounded-xl border ${getTeamBgClass(currentTeams[0])} ${getTeamGlowClass(currentTeams[0])}`}>
                  <div className="flex items-center justify-between mb-1.5 border-b border-white/5 pb-1">
                    <span className={`font-mono text-[10px] font-black uppercase ${getTeamTextColor(currentTeams[0])}`}>
                      TEAM {currentTeams[0]}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {padRoster(teamAPlayers).map((p, idx) => (
                      <div key={p.id || idx} className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-black/20 border border-white/5 h-6">
                        <span className="font-mono text-[8px] text-muted-foreground/30">0{idx + 1}</span>
                        <span className="font-mono text-[10px] font-bold text-foreground/80 truncate">{p.name}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Team Right */}
                <div className={`p-3 rounded-xl border ${getTeamBgClass(currentTeams[1])} ${getTeamGlowClass(currentTeams[1])}`}>
                  <div className="flex items-center justify-between mb-1.5 border-b border-white/5 pb-1">
                    <span className={`font-mono text-[10px] font-black uppercase ${getTeamTextColor(currentTeams[1])}`}>
                      TEAM {currentTeams[1]}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {padRoster(teamBPlayers).map((p, idx) => (
                      <div key={p.id || idx} className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-black/20 border border-white/5 h-6">
                        <span className="font-mono text-[8px] text-muted-foreground/30">0{idx + 1}</span>
                        <span className="font-mono text-[10px] font-bold text-foreground/80 truncate">{p.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* Victory Showcase if match3Winner is set and currentMatch is 4 */}
      {currentMatch === 4 && bracket.match3Winner && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8 }}
          className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/95 backdrop-blur-md z-40 p-12 overflow-hidden"
        >
          <Confetti />
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="flex flex-col items-center gap-6 text-center max-w-2xl relative z-10 glass p-10 rounded-3xl border border-yellow-500/30 shadow-[0_0_50px_rgba(234,179,8,0.15)]"
          >
            <Crown className="w-20 h-20 text-yellow-500 animate-bounce" />
            <div>
              <h2 className="text-xs font-mono tracking-widest text-yellow-500 uppercase font-black">Turnier Beendet</h2>
              <h1 className="text-5xl font-mono tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-amber-200 to-yellow-500 drop-shadow-[0_0_30px_rgba(234,179,8,0.5)] uppercase font-black mt-2">
                CHAMPION
              </h1>
              <h2 className={`text-4xl font-mono font-black mt-4 uppercase ${getTeamTextColor(bracket.match3Winner)} drop-shadow-[0_0_20px_rgba(255,255,255,0.1)]`}>
                TEAM {bracket.match3Winner}
              </h2>
            </div>

            <div className="w-full mt-6 space-y-3">
              <p className="font-mono text-xs text-muted-foreground uppercase tracking-widest flex items-center justify-center gap-1.5">
                <Users className="w-4 h-4" /> MEISTER ROSTER
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                {padRoster(teams[bracket.match3Winner as keyof typeof teams] || []).map((p, idx) => (
                  p.name !== "—" && (
                    <div key={p.id || idx} className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-black/40 border border-white/5 shadow-inner">
                      <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
                      <span className="font-mono text-sm font-bold text-foreground/90">{p.name}</span>
                    </div>
                  )
                ))}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
