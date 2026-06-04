import { useState, useRef, useCallback, useEffect } from "react";
import {
  useGetFullState,
  getGetFullStateQueryKey,
  useSetMatchWinner,
  useResetBracket,
  useRollMap,
  useBroadcastServer,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Send, Trophy, Eye, EyeOff, Dices, Zap, Save } from "lucide-react";

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
  match1Winner: string | null;
  match2Winner: string | null;
  match3Winner: string | null;
  rolledMap: string | null;
  finaleBestOf?: 1 | 3;
  finaleScore?: { left: number; right: number };
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
  const broadcastMut = useBroadcastServer();

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
        }).then(() => {
          queryClient.invalidateQueries({ queryKey: getGetFullStateQueryKey() });

          // Auto-broadcast server if enabled and connection string is set
          const lsAutoSend = localStorage.getItem("cs2_auto_send") === "1";
          const lsConnectionString = localStorage.getItem("cs2_connection_string") ?? "";
          if (lsAutoSend && lsConnectionString.trim()) {
            broadcastMut.mutate(
              { data: { connectionString: lsConnectionString } },
              {
                onSuccess: () => {
                  toast({ title: "Server automatisch gesendet", description: "Verbindungsdaten an aktive Teams übertragen." });
                },
              }
            );
          }

          // Note: Automatic MatchZy start is now handled securely on the backend
          // inside /api/maps/confirm-roll according to the serverSettings.autoStartMatch config.
        });
      }
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [queryClient, broadcastMut, toast]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleSetWinner = (winner: "A" | "B" | "C") => {
    setWinnerMut.mutate(
      { data: { winner } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetFullStateQueryKey() }) }
    );
  };

  const handleResetBracket = () => {
    resetBracketMut.mutate(undefined, {
      onSuccess: () => {
        toast({ title: "Bracket zurückgesetzt", description: "Turnier-Status gelöscht." });
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


  const handleSetFinaleFormat = (bestOf: 1 | 3) => {
    fetch("/api/bracket/finale-format", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bestOf }),
    }).then(() => {
      queryClient.invalidateQueries({ queryKey: getGetFullStateQueryKey() });
      toast({ title: `Finale: Best of ${bestOf}`, description: bestOf === 3 ? "Finale ist jetzt BO3." : "Finale ist jetzt BO1." });
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
    : [];

  const finaleBestOf = bracket?.finaleBestOf ?? 1;
  const finaleScore = bracket?.finaleScore ?? { left: 0, right: 0 };
  const finaleTeams = getMatchTeams(bracket?.match3);

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
                {[
                  { label: "Partie 1", matchNum: 1, left: "TEAM A", right: "TEAM B", winner: bracket.match1Winner, leftTeam: "A", rightTeam: "B", match: bracket.match1 },
                  { label: "Partie 2", matchNum: 2, left: bracket.match2 ? `TEAM ${bracket.match2.split(" ")[0]}` : "?", right: bracket.match2 ? `TEAM ${bracket.match2.split(" ")[2]}` : "?", winner: bracket.match2Winner, leftTeam: bracket.match2?.split(" ")[0] ?? null, rightTeam: bracket.match2?.split(" ")[2] ?? null, match: bracket.match2 },
                  { label: "Finale", matchNum: 3, left: bracket.match3 ? `TEAM ${bracket.match3.split(" ")[0]}` : "?", right: bracket.match3 ? `TEAM ${bracket.match3.split(" ")[2]}` : "?", winner: bracket.match3Winner, leftTeam: bracket.match3?.split(" ")[0] ?? null, rightTeam: bracket.match3?.split(" ")[2] ?? null, match: bracket.match3 },
                ].map(({ label, matchNum, left, right, winner, leftTeam, rightTeam }) => (
                  <div
                    key={label}
                    className={`p-4 border rounded-md relative overflow-hidden ${bracket.currentMatch === matchNum ? "border-primary bg-primary/5" : "border-border/50"}`}
                  >
                    {bracket.currentMatch === matchNum && (
                      <div className="absolute top-0 left-0 w-1 h-full bg-primary animate-pulse" />
                    )}
                    <div className="flex justify-between items-center font-mono mb-2">
                      <span className="text-muted-foreground text-xs uppercase">{label}</span>
                      <div className="flex items-center gap-2">
                        {/* BO3 toggle — only on Finale */}
                        {matchNum === 3 && (
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[10px] font-mono uppercase tracking-wider ${finaleBestOf === 1 ? "text-foreground" : "text-muted-foreground/50"}`}>BO1</span>
                            <Switch
                              checked={finaleBestOf === 3}
                              onCheckedChange={(checked) => handleSetFinaleFormat(checked ? 3 : 1)}
                              className="scale-75"
                              disabled={!!bracket.match3Winner}
                            />
                            <span className={`text-[10px] font-mono uppercase tracking-wider ${finaleBestOf === 3 ? "text-foreground" : "text-muted-foreground/50"}`}>BO3</span>
                          </div>
                        )}
                        {winner && (
                          <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/30">
                            SIEGER: TEAM {winner}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xl font-black font-mono">
                      <div className="flex flex-col items-start w-2/5">
                        <span className={winner === leftTeam && winner ? teamColorClass(leftTeam) : ""}>{left}</span>
                        <span className="text-[10px] text-muted-foreground/60 font-normal mt-0.5 truncate w-full" title={getTeamPlayersString(leftTeam)}>
                          {getTeamPlayersString(leftTeam) || "Keine Spieler"}
                        </span>
                      </div>
                      <span className="text-muted-foreground text-sm">VS</span>
                      <div className="flex flex-col items-end w-2/5 text-right">
                        <span className={winner === rightTeam && winner ? teamColorClass(rightTeam) : ""}>{right}</span>
                        <span className="text-[10px] text-muted-foreground/60 font-normal mt-0.5 truncate w-full" title={getTeamPlayersString(rightTeam)}>
                          {getTeamPlayersString(rightTeam) || "Keine Spieler"}
                        </span>
                      </div>
                    </div>

                    {/* BO3 score display */}
                    {matchNum === 3 && finaleBestOf === 3 && bracket.match3 && !bracket.match3Winner && (
                      <div className="flex items-center justify-center gap-6 mt-3 pt-3 border-t border-border/30">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-xs font-mono uppercase ${teamColorClass(finaleTeams[0] ?? null)}`}>
                            TEAM {finaleTeams[0] ?? "?"}
                          </span>
                          <div className="flex gap-1">
                            {[0, 1].map((i) => (
                              <div
                                key={`l${i}`}
                                className="w-2.5 h-2.5 rounded-full border"
                                style={{
                                  backgroundColor: i < finaleScore.left ? teamColor(finaleTeams[0] ?? null) : "transparent",
                                  borderColor: teamColor(finaleTeams[0] ?? null),
                                  opacity: i < finaleScore.left ? 1 : 0.3,
                                }}
                              />
                            ))}
                          </div>
                        </div>
                        <span className="text-muted-foreground text-xs font-mono">{finaleScore.left} — {finaleScore.right}</span>
                        <div className="flex items-center gap-1.5">
                          <div className="flex gap-1">
                            {[0, 1].map((i) => (
                              <div
                                key={`r${i}`}
                                className="w-2.5 h-2.5 rounded-full border"
                                style={{
                                  backgroundColor: i < finaleScore.right ? teamColor(finaleTeams[1] ?? null) : "transparent",
                                  borderColor: teamColor(finaleTeams[1] ?? null),
                                  opacity: i < finaleScore.right ? 1 : 0.3,
                                }}
                              />
                            ))}
                          </div>
                          <span className={`text-xs font-mono uppercase ${teamColorClass(finaleTeams[1] ?? null)}`}>
                            TEAM {finaleTeams[1] ?? "?"}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {bracket.currentMatch <= 3 && currentTeams.length > 0 && (
                  <div className="pt-4 border-t border-border">
                    <p className="font-mono text-xs text-muted-foreground mb-3 uppercase">
                      {bracket.currentMatch === 3 && finaleBestOf === 3
                        ? `Partie ${finaleScore.left + finaleScore.right + 1} von max. 3 — Sieger wählen`
                        : "Aktive Partie auflösen"
                      }
                    </p>
                    <div className="flex gap-2">
                      {currentTeams.map((t) => (
                        <Button
                          key={t}
                          className="flex-1 font-mono uppercase"
                          variant="outline"
                          disabled={setWinnerMut.isPending}
                          onClick={() => handleSetWinner(t as "A" | "B" | "C")}
                          style={{ borderColor: `${teamColor(t)}33`, color: teamColor(t) }}
                        >
                          Team {t} gewinnt
                        </Button>
                      ))}
                    </div>
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
