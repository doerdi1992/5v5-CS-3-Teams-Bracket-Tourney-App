import { useState, useRef, useCallback, useEffect } from "react";
import {
  useGetFullState,
  getGetFullStateQueryKey,
  useSetMatchWinner,
  useResetBracket,
  useRollMap,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Send, Trophy, Eye, EyeOff, Dices, Zap, Save, Crown } from "lucide-react";

// ─── Animation constants ─────────────────────────────────────────────────────
const WINNER_IDX = 68;        // winner tile index in the strip
const ITEM_WIDTH = 196;       // px per tile (width + gap)
const DURATION = 7500;        // ms total spin duration
const VOLUME = 0.10;          // locked audio volume (10%)

// ─── Audio Buffer Player ──────────────────────────────────────────────────────
function playBuffer(ctx: AudioContext, buffer: AudioBuffer | null, vol: number) {
  if (!buffer || vol <= 0) return;
  try {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gainNode = ctx.createGain();
    gainNode.gain.value = vol;
    source.connect(gainNode);
    gainNode.connect(ctx.destination);
    source.start(0);
  } catch (err) {
    console.warn("Failed to play audio buffer:", err);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function parseMaps(raw: string): string[] {
  return raw.split(/[,\n]+/).map((m) => m.trim()).filter((m) => m.length > 0);
}

function buildStrip(maps: string[], winner: string): string[] {
  const items: string[] = [];
  for (let i = 0; i < 100; i++) {
    items.push(maps[Math.floor(Math.random() * maps.length)]);
  }
  items[WINNER_IDX] = winner;
  return items;
}

// ─── Extended bracket type (includes BO3 fields from our backend) ────────────
interface ExtendedBracket {
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

  match4BestOf?: 1 | 3;
  match4Score?: { left: number; right: number };
  match1Rounds?: { left: number; right: number } | null;
  match2Rounds?: { left: number; right: number } | null;
  match3Rounds?: { left: number; right: number } | null;
  match4Rounds?: { left: number; right: number } | null;
  tiebreakerWinner?: string | null;
  tiebreakerRounds?: Record<string, number> | null;
  activeServerDetails?: string | null;
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function BracketMapRoll() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: fullState } = useGetFullState({ query: { queryKey: getGetFullStateQueryKey() } });
  const bracket = fullState?.bracket as ExtendedBracket | undefined;
  const mapImages = fullState?.mapImages || {};
  const teams = fullState?.teams || { A: [], B: [], C: [] };

  // ── localStorage-backed state ──────────────────────────────────────────────
  const [mapPool, setMapPool] = useState(() =>
    localStorage.getItem("cs2_map_pool") ?? "Mirage\nCache\nCobblestone"
  );

  const [isSpinning, setIsSpinning] = useState(false);
  const [stripItems, setStripItems] = useState<string[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [leftScore, setLeftScore] = useState<number>(0);
  const [rightScore, setRightScore] = useState<number>(0);
  const [selectedWinner, setSelectedWinner] = useState<"A" | "B" | "C" | null>(null);

  // Persist to localStorage on change
  useEffect(() => { localStorage.setItem("cs2_map_pool", mapPool); }, [mapPool]);

  // ── Refs ────────────────────────────────────────────────────────────────────
  const stripRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const prevScrollRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const containerWidthRef = useRef(800);
  const tickBufferRef = useRef<AudioBuffer | null>(null);
  const revealBufferRef = useRef<AudioBuffer | null>(null);

  // ── Mutations ──────────────────────────────────────────────────────────────
  const setWinnerMut = useSetMatchWinner();
  const resetBracketMut = useResetBracket();
  const rollMapMut = useRollMap();
  // broadcastMut removed — server-side confirm-roll handles broadcast after RCON

  const getAudioCtx = useCallback((): AudioContext => {
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
    if (audioCtxRef.current.state === "suspended") void audioCtxRef.current.resume();
    return audioCtxRef.current;
  }, []);

  // Preload sound files
  useEffect(() => {
    let active = true;
    const ctx = getAudioCtx();

    async function loadSound(url: string, ref: React.MutableRefObject<AudioBuffer | null>) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const arrayBuffer = await res.arrayBuffer();
        ctx.decodeAudioData(
          arrayBuffer,
          (buffer) => {
            if (active) {
              ref.current = buffer;
            }
          },
          (err) => {
            console.error("Error decoding audio data for:", url, err);
          }
        );
      } catch (err) {
        console.error("Error loading sound:", url, err);
      }
    }

    void loadSound("/sounds/csgo_ui_crate_item_scroll.wav", tickBufferRef);
    void loadSound("/sounds/csgo_ui_crate_open.wav", revealBufferRef);

    return () => {
      active = false;
    };
  }, [getAudioCtx]);

  // ── rAF animation loop ────────────────────────────────────────────────────
  const startAnimation = useCallback((totalScroll: number, ctx: AudioContext, winner: string) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    prevScrollRef.current = 0;
    if (stripRef.current) stripRef.current.style.transform = "translateX(0px)";

    const cw = containerWidthRef.current;
    const startTime = performance.now();

    const tick = () => {
      const elapsed = performance.now() - startTime;
      const t = Math.min(elapsed / DURATION, 1);
      // Quartic ease-out: slightly faster deceleration tail
      const eased = 1 - Math.pow(1 - t, 4);
      const scrollPos = eased * totalScroll;

      if (stripRef.current) {
        stripRef.current.style.transform = `translateX(${-scrollPos}px)`;
      }

      // Edge-aligned tick sounds: fire when tile edges cross the selector line
      const selectorPos = cw / 2;
      const prevAdjusted = prevScrollRef.current + selectorPos;
      const curAdjusted = scrollPos + selectorPos;
      const prevTile = Math.floor(prevAdjusted / ITEM_WIDTH);
      const curTile = Math.floor(curAdjusted / ITEM_WIDTH);
      for (let i = prevTile + 1; i <= curTile; i++) {
        // Volume ramps up as animation slows (more tension near the end)
        const vol = (0.10 + 0.65 * t) * VOLUME;
        playBuffer(ctx, tickBufferRef.current, vol);
      }
      prevScrollRef.current = scrollPos;

      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        if (stripRef.current) {
          stripRef.current.style.transform = `translateX(${-totalScroll}px)`;
        }
        setIsSpinning(false);
        setRevealed(true);
        playBuffer(ctx, revealBufferRef.current, VOLUME);

        // Save the rolled map on the server and broadcast the update to viewers
        fetch("/api/maps/confirm-roll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ map: winner }),
        })
          .then((r) => {
            if (!r.ok) throw new Error(`Server: ${r.status}`);
            queryClient.invalidateQueries({ queryKey: getGetFullStateQueryKey() });
            // Server broadcast + RCON handled in backend background pipeline
          })
          .catch((err) => {
            console.error("[confirm-roll] failed:", err);
            toast({ title: "Fehler", description: `Kartenbestätigung fehlgeschlagen: ${err.message}`, variant: "destructive" });
          });
      }
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [queryClient, toast]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleSetWinner = (winner: "A" | "B" | "C") => {
    setWinnerMut.mutate(
      { data: { winner, rounds: { left: leftScore, right: rightScore } } as any },
      {
        onSuccess: () => {
          setLeftScore(0);
          setRightScore(0);
          setSelectedWinner(null);
          queryClient.invalidateQueries({ queryKey: getGetFullStateQueryKey() });
        }
      }
    );
  };

  const handleResetBracket = () => {
    resetBracketMut.mutate(undefined, {
      onSuccess: () => {
        toast({ title: "Bracket zurückgesetzt", description: "Turnier-Status gelöscht." });
        setSelectedWinner(null);
        queryClient.invalidateQueries({ queryKey: getGetFullStateQueryKey() });
      },
    });
  };

  const handleRollMap = () => {
    const maps = parseMaps(mapPool);
    if (maps.length === 0) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setRevealed(false);

    rollMapMut.mutate(
      { data: { maps } },
      {
        onSuccess: (data) => {
          const winner = data.map;
          const items = buildStrip(maps, winner);
          setStripItems(items);
          setIsSpinning(true);
          const containerWidth = containerRef.current?.offsetWidth ?? 800;
          containerWidthRef.current = containerWidth;

          // Random landing offset — like a real case opening, not always dead center
          const randomOffset = (Math.random() - 0.5) * (ITEM_WIDTH * 0.8);
          const totalScroll = WINNER_IDX * ITEM_WIDTH - containerWidth / 2 + ITEM_WIDTH / 2 + randomOffset;

          const ctx = getAudioCtx();
          // Wait one frame for React to render the strip items, then start animation
          setTimeout(() => startAnimation(totalScroll, ctx, winner), 50);
        },
        onError: () => setIsSpinning(false),
      }
    );
  };




  const handleSetTiebreakerFormat = (bestOf: 1 | 3) => {
    fetch("/api/bracket/tiebreaker-format", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bestOf }),
    }).then(() => {
      queryClient.invalidateQueries({ queryKey: getGetFullStateQueryKey() });
      toast({ title: `Tiebreaker: Best of ${bestOf}`, description: bestOf === 3 ? "Tiebreaker ist jetzt BO3." : "Tiebreaker ist jetzt BO1." });
    });
  };

  // ── Derived state ──────────────────────────────────────────────────────────
  const getMatchTeams = (matchString: string | null | undefined): string[] => {
    if (!matchString) return [];
    const parts = matchString.split(" ");
    return parts.length >= 3 ? [parts[0], parts[2]] : [];
  };

  const currentTeams =
    bracket?.currentMatch === 1 ? getMatchTeams(bracket?.match1)
    : bracket?.currentMatch === 2 ? getMatchTeams(bracket?.match2)
    : bracket?.currentMatch === 3 ? getMatchTeams(bracket?.match3)
    : bracket?.currentMatch === 4 ? getMatchTeams(bracket?.match4)
    : [];



  // ── Team color helper ──────────────────────────────────────────────────────
  const teamColor = (team: string | null): string => {
    if (team === "A") return "hsl(var(--team-a))";
    if (team === "B") return "hsl(var(--team-b))";
    if (team === "C") return "hsl(var(--team-c))";
    return "hsl(var(--primary))";
  };

  const teamColorClass = (team: string | null): string => {
    if (team === "A") return "text-orange-500";
    if (team === "B") return "text-cyan-400";
    if (team === "C") return "text-purple-400";
    return "text-primary";
  };

  const getTeamPlayersString = (teamLetter: string | null): string => {
    if (!teamLetter || !teams || !teams[teamLetter as keyof typeof teams]) return "";
    const list = teams[teamLetter as keyof typeof teams] || [];
    return list.map((p: any) => p.name).join(", ");
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* ── Left: Bracket ── */}
      <div className="space-y-6">
        <Card className="border-border/50">
          <CardHeader className="flex flex-row justify-between items-center">
            <CardTitle className="font-mono text-primary flex items-center gap-2">
              <Trophy className="w-5 h-5" />
              TURNIER-BRACKET
            </CardTitle>
            <Button variant="outline" size="sm" onClick={handleResetBracket} disabled={resetBracketMut.isPending}>
              <RefreshCw className="w-4 h-4 mr-2" />
              RESET
            </Button>
          </CardHeader>
          <CardContent>
            {bracket ? (
              <div className="space-y-4">
                {bracket.currentMatch === 5 && (
                  <div className="p-5 border border-yellow-500/30 rounded-xl bg-yellow-500/5 text-center flex flex-col items-center gap-2 animate-in fade-in slide-in-from-top-4 duration-300">
                    <Crown className="w-10 h-10 text-yellow-500 animate-bounce" />
                    <h2 className="text-[10px] font-mono tracking-widest text-yellow-500 uppercase font-black">Turnier-Champion</h2>
                    <h1 className="text-3xl font-mono tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-amber-200 to-yellow-500 uppercase font-black mt-1">
                      TEAM {bracket.match4Winner || bracket.match3Winner}
                    </h1>
                    {bracket.match4Winner && (
                      <p className="text-xs font-mono text-muted-foreground uppercase mt-1 max-w-md">
                        Gewonnen durch Tiebreaker-Spiel (Meiste Runden der ersten 3 Spiele: A: {bracket.tiebreakerRounds?.A}, B: {bracket.tiebreakerRounds?.B}, C: {bracket.tiebreakerRounds?.C})
                      </p>
                    )}
                  </div>
                )}

                {(() => {
                  const list = [
                    { label: "Partie 1", matchNum: 1, left: "TEAM A", right: "TEAM B", winner: bracket.match1Winner, leftTeam: "A", rightTeam: "B", match: bracket.match1, rounds: bracket.match1Rounds },
                    { label: "Partie 2", matchNum: 2, left: bracket.match2 ? `TEAM ${bracket.match2.split(" ")[0]}` : "?", right: bracket.match2 ? `TEAM ${bracket.match2.split(" ")[2]}` : "?", winner: bracket.match2Winner, leftTeam: bracket.match2?.split(" ")[0] ?? null, rightTeam: bracket.match2?.split(" ")[2] ?? null, match: bracket.match2, rounds: bracket.match2Rounds },
                    { label: "Finale", matchNum: 3, left: bracket.match3 ? `TEAM ${bracket.match3.split(" ")[0]}` : "?", right: bracket.match3 ? `TEAM ${bracket.match3.split(" ")[2]}` : "?", winner: bracket.match3Winner, leftTeam: bracket.match3?.split(" ")[0] ?? null, rightTeam: bracket.match3?.split(" ")[2] ?? null, match: bracket.match3, rounds: bracket.match3Rounds },
                  ];
                  if (bracket.match4) {
                    list.push({
                      label: "Tiebreaker",
                      matchNum: 4,
                      left: `TEAM ${bracket.match4.split(" ")[0]}`,
                      right: `TEAM ${bracket.match4.split(" ")[2]}`,
                      winner: bracket.match4Winner,
                      leftTeam: bracket.match4.split(" ")[0] as "A" | "B" | "C",
                      rightTeam: bracket.match4.split(" ")[2] as "A" | "B" | "C",
                      match: bracket.match4,
                      rounds: bracket.match4Rounds,
                    });
                  }
                  return list;
                })().map(({ label, matchNum, left, right, winner, leftTeam, rightTeam, rounds }) => {
                  const isActive = bracket.currentMatch === matchNum;
                  return (
                    <div
                      key={label}
                      className={`relative overflow-hidden transition-all duration-300 ease-in-out ${
                        isActive
                          ? "p-5 border-2 border-primary bg-primary/10 rounded-xl shadow-[0_0_20px_rgba(249,115,22,0.15)] scale-100 z-10"
                          : "p-3 border border-border/30 bg-background/20 rounded-lg opacity-60 hover:opacity-90 scale-[0.96] blur-[0.2px]"
                      }`}
                    >
                      {isActive && (
                        <div className="absolute top-0 left-0 w-1.5 h-full bg-primary animate-pulse" />
                      )}
                      <div className="flex justify-between items-center font-mono mb-2">
                        <span className={`uppercase font-bold ${isActive ? "text-primary text-xs" : "text-muted-foreground/50 text-[10px]"}`}>
                          {label}
                        </span>
                        <div className="flex items-center gap-2">
                          {matchNum === 4 && (
                            <div className="flex items-center gap-1.5">
                              <span className={`text-[10px] font-mono uppercase tracking-wider ${(bracket.match4BestOf ?? 1) === 1 ? "text-foreground" : "text-muted-foreground/50"}`}>BO1</span>
                              <Switch
                                checked={(bracket.match4BestOf ?? 1) === 3}
                                onCheckedChange={(checked) => handleSetTiebreakerFormat(checked ? 3 : 1)}
                                className="scale-75"
                                disabled={!!bracket.match4Winner}
                              />
                              <span className={`text-[10px] font-mono uppercase tracking-wider ${(bracket.match4BestOf ?? 1) === 3 ? "text-foreground" : "text-muted-foreground/50"}`}>BO3</span>
                            </div>
                          )}
                          {winner && (
                            <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                              SIEGER: TEAM {winner}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className={`flex items-center justify-between font-mono ${isActive ? "text-3xl font-black tracking-tight" : "text-lg font-bold"}`}>
                        <div className="flex flex-col items-start w-2/5">
                          <div className="flex items-center gap-2">
                            <span className={winner === leftTeam && winner ? teamColorClass(leftTeam) : ""}>{left}</span>
                            {rounds && (
                              <span className={`font-bold ${isActive ? "text-base text-muted-foreground" : "text-xs text-muted-foreground/50"}`}>
                                ({rounds.left})
                              </span>
                            )}
                          </div>
                          {isActive && (
                            <span className="text-sm text-muted-foreground/70 font-normal mt-1 truncate w-full" title={getTeamPlayersString(leftTeam)}>
                              {getTeamPlayersString(leftTeam) || "Keine Spieler"}
                            </span>
                          )}
                        </div>
                        <span className={`text-muted-foreground ${isActive ? "text-sm" : "text-xs opacity-50"}`}>VS</span>
                        <div className="flex flex-col items-end w-2/5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {rounds && (
                              <span className={`font-bold ${isActive ? "text-base text-muted-foreground" : "text-xs text-muted-foreground/50"}`}>
                                ({rounds.right})
                              </span>
                            )}
                            <span className={winner === rightTeam && winner ? teamColorClass(rightTeam) : ""}>{right}</span>
                          </div>
                          {isActive && (
                            <span className="text-sm text-muted-foreground/70 font-normal mt-1 truncate w-full" title={getTeamPlayersString(rightTeam)}>
                              {getTeamPlayersString(rightTeam) || "Keine Spieler"}
                            </span>
                          )}
                        </div>
                      </div>

                      {matchNum === 4 && (bracket.match4BestOf ?? 1) === 3 && bracket.match4 && !bracket.match4Winner && (
                        <div className={`flex items-center justify-center gap-6 mt-3 pt-3 border-t border-border/30 ${isActive ? "" : "scale-90 opacity-70"}`}>
                          <div className="flex items-center gap-1.5">
                            <span className={`text-xs font-mono uppercase ${teamColorClass(leftTeam)}`}>
                              TEAM {leftTeam ?? "?"}
                            </span>
                            <div className="flex gap-1">
                              {[0, 1].map((i) => (
                                <div
                                  key={`l${i}`}
                                  className="w-2.5 h-2.5 rounded-full border"
                                  style={{
                                    backgroundColor: i < (bracket.match4Score?.left ?? 0) ? teamColor(leftTeam) : "transparent",
                                    borderColor: teamColor(leftTeam),
                                    opacity: i < (bracket.match4Score?.left ?? 0) ? 1 : 0.3,
                                  }}
                                />
                              ))}
                            </div>
                          </div>
                          <span className="text-muted-foreground text-xs font-mono">{(bracket.match4Score?.left ?? 0)} — {(bracket.match4Score?.right ?? 0)}</span>
                          <div className="flex items-center gap-1.5">
                            <div className="flex gap-1">
                              {[0, 1].map((i) => (
                                <div
                                  key={`r${i}`}
                                  className="w-2.5 h-2.5 rounded-full border"
                                  style={{
                                    backgroundColor: i < (bracket.match4Score?.right ?? 0) ? teamColor(rightTeam) : "transparent",
                                    borderColor: teamColor(rightTeam),
                                    opacity: i < (bracket.match4Score?.right ?? 0) ? 1 : 0.3,
                                  }}
                                />
                              ))}
                            </div>
                            <span className={`text-xs font-mono uppercase ${teamColorClass(rightTeam)}`}>
                              TEAM {rightTeam ?? "?"}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {bracket.currentMatch <= 4 && currentTeams.length > 0 && (
                  <div className="pt-4 border-t border-border space-y-3">
                    <p className="font-mono text-xs text-muted-foreground mb-1 uppercase">
                      {bracket.currentMatch === 4 && (bracket.match4BestOf ?? 1) === 3
                        ? `Tiebreaker Partie ${(bracket.match4Score?.left ?? 0) + (bracket.match4Score?.right ?? 0) + 1} von max. 3 — Sieger wählen`
                        : "Aktive Partie auflösen"
                      }
                    </p>

                    <div className="flex gap-2">
                      {currentTeams.map((t) => {
                        const isSelected = selectedWinner === t;
                        return (
                          <Button
                            key={t}
                            className={`flex-1 font-mono uppercase transition-all duration-300 ${
                              isSelected
                                ? "bg-primary/10 border-primary text-primary"
                                : "border-border/40 hover:bg-white/5"
                            }`}
                            variant="outline"
                            disabled={setWinnerMut.isPending}
                            onClick={() => {
                              setSelectedWinner(isSelected ? null : (t as "A" | "B" | "C"));
                              setLeftScore(0);
                              setRightScore(0);
                            }}
                            style={{ 
                              borderColor: isSelected ? teamColor(t) : undefined, 
                              color: isSelected ? teamColor(t) : undefined 
                            }}
                          >
                            Team {t} gewinnt
                          </Button>
                        );
                      })}
                    </div>

                    {selectedWinner && (
                      <div className="bg-background/40 p-4 rounded-xl border border-border/40 animate-in fade-in slide-in-from-top-2 duration-300 space-y-3">
                        <div className="flex gap-4 items-center">
                          <div className="flex-1 space-y-1">
                            <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                              Runden TEAM {currentTeams[0]}
                            </label>
                            <Input
                              type="number"
                              min={0}
                              value={leftScore || ""}
                              onChange={(e) => setLeftScore(Number(e.target.value))}
                              placeholder="z.B. 13"
                              className="font-mono bg-background/50 h-9 text-sm"
                              autoFocus
                            />
                          </div>
                          <div className="text-muted-foreground text-xs font-mono self-end pb-2.5">:</div>
                          <div className="flex-1 space-y-1">
                            <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground text-right block">
                              Runden TEAM {currentTeams[1]}
                            </label>
                            <Input
                              type="number"
                              min={0}
                              value={rightScore || ""}
                              onChange={(e) => setRightScore(Number(e.target.value))}
                              placeholder="z.B. 8"
                              className="font-mono bg-background/50 h-9 text-sm text-right"
                            />
                          </div>
                        </div>

                        <div className="flex gap-2 pt-1">
                          <Button
                            className="flex-1 font-mono uppercase bg-primary hover:bg-primary/95 text-white text-xs h-9"
                            disabled={setWinnerMut.isPending}
                            onClick={() => handleSetWinner(selectedWinner)}
                          >
                            Bestätigen
                          </Button>
                          <Button
                            className="font-mono uppercase text-xs h-9 text-muted-foreground hover:text-foreground"
                            variant="ghost"
                            onClick={() => {
                              setSelectedWinner(null);
                              setLeftScore(0);
                              setRightScore(0);
                            }}
                          >
                            Abbrechen
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground font-mono text-sm">Bracket nicht verfügbar.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Right: Map Roll + Server ── */}
      <div className="space-y-6">
        <Card className="border-border/50 border-t-secondary border-t-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="font-mono text-secondary flex items-center gap-2">
                <Dices className="w-5 h-5" />
                KARTEN-AUSWAHL
              </CardTitle>
              <span className="flex items-center gap-1.5 text-[10px] font-mono text-green-500/70 uppercase tracking-wider">
                <Save className="w-3 h-3" />
                Auto-gespeichert
              </span>
            </div>
            <CardDescription className="font-mono text-xs">Pool (eine pro Zeile oder kommagetrennt)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              value={mapPool}
              onChange={(e) => setMapPool(e.target.value)}
              className="font-mono text-sm bg-background/50 min-h-[80px] resize-none"
              disabled={isSpinning}
            />

            {/* Reel container */}
            <div
              ref={containerRef}
              className="relative w-full h-28 overflow-hidden rounded-lg border border-border/60 bg-black/70"
            >
              {/* Centre selector arrows */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
                <div className="w-0 h-0" style={{ borderLeft: "8px solid transparent", borderRight: "8px solid transparent", borderTop: "10px solid #f97316" }} />
              </div>
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
                <div className="w-0 h-0" style={{ borderLeft: "8px solid transparent", borderRight: "8px solid transparent", borderBottom: "10px solid #f97316" }} />
              </div>
              {/* Centre line */}
              <div className="absolute top-0 bottom-0 left-1/2 -translate-x-px w-0.5 bg-primary/50 z-10 pointer-events-none" />

              {stripItems.length > 0 ? (
                <div ref={stripRef} className="absolute top-0 left-0 flex items-center h-full" style={{ willChange: "transform" }}>
                  {stripItems.map((map, i) => {
                    const isWinner = revealed && i === WINNER_IDX;
                    const imgUrl = mapImages[map];
                    return (
                      <div
                        key={i}
                        className="flex-shrink-0 relative flex items-center justify-center rounded overflow-hidden font-mono font-black text-xs uppercase tracking-wider"
                        style={{
                          width: ITEM_WIDTH - 12,
                          height: 84,
                          marginRight: 12,
                          border: isWinner ? "1.5px solid rgba(249,115,22,0.9)" : "1px solid rgba(255,255,255,0.07)",
                          boxShadow: isWinner ? "0 0 20px rgba(249,115,22,0.45)" : "none",
                          background: "rgba(8,12,22,0.8)",
                        }}
                      >
                        {/* Map image background */}
                        {imgUrl && (
                          <div
                            className="absolute inset-0 bg-cover bg-center"
                            style={{ backgroundImage: `url(${imgUrl})`, opacity: isWinner ? 0.5 : 0.28 }}
                          />
                        )}
                        {/* Colour tint overlay */}
                        <div
                          className="absolute inset-0"
                          style={{ background: isWinner ? "rgba(249,115,22,0.12)" : "rgba(8,12,22,0.45)" }}
                        />
                        {/* Map name */}
                        <span
                          className="relative z-10 text-center px-1 leading-tight"
                          style={{
                            color: isWinner ? "#f97316" : "#94a3b8",
                            textShadow: isWinner ? "0 0 10px rgba(249,115,22,0.7)" : "none",
                            fontSize: "0.72rem",
                          }}
                        >
                          {map}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  {bracket?.rolledMap ? (
                    <span className="font-mono font-black text-2xl uppercase tracking-widest text-primary drop-shadow-[0_0_12px_rgba(249,115,22,0.6)]">
                      {bracket.rolledMap}
                    </span>
                  ) : (
                    <span className="font-mono text-sm text-muted-foreground tracking-widest uppercase">Noch keine Karte</span>
                  )}
                </div>
              )}
              {/* Vignette */}
              <div
                className="absolute inset-0 pointer-events-none z-10"
                style={{ background: "linear-gradient(to right, rgba(5,8,18,0.9) 0%, transparent 15%, transparent 85%, rgba(5,8,18,0.9) 100%)" }}
              />
            </div>

            {/* Revealed map name + image */}
            {(revealed || (!isSpinning && bracket?.rolledMap && stripItems.length === 0)) && bracket?.rolledMap && (
              <div className="flex items-center gap-4 py-2 border-t border-border/30 mt-2">
                {mapImages[bracket.rolledMap] && (
                  <div className="w-24 h-14 rounded overflow-hidden border border-primary/30 flex-shrink-0">
                    <img src={mapImages[bracket.rolledMap]} alt={bracket.rolledMap} className="w-full h-full object-cover" />
                  </div>
                )}
                <div>
                  <p className="font-mono text-xs text-muted-foreground uppercase tracking-widest">Ausgewählte Karte</p>
                  <p className="font-mono font-black text-2xl text-primary drop-shadow-[0_0_12px_rgba(249,115,22,0.45)] uppercase tracking-widest animate-in fade-in zoom-in-95 duration-300">
                    {bracket.rolledMap}
                  </p>
                </div>
              </div>
            )}

            <Button
              className="w-full font-mono text-base h-12 uppercase tracking-widest"
              onClick={handleRollMap}
              disabled={isSpinning || rollMapMut.isPending}
            >
              <Dices className="w-5 h-5 mr-2" />
              {isSpinning ? "Dreht..." : "Karte drehen"}
            </Button>
          </CardContent>
        </Card>


      </div>
    </div>
  );
}
