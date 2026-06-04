import { useState, useRef, useCallback } from "react";
import {
  useGetBracket,
  useSetMatchWinner,
  useResetBracket,
  useRollMap,
  useBroadcastServer,
  getGetBracketQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Send, Trophy, Eye, EyeOff, Dices } from "lucide-react";

// ─── Case-opening animation constants ────────────────────────────────────────
const WINNER_IDX = 72;        // where the winner tile lands
const ITEM_WIDTH = 196;       // px per tile (including gap)
const DURATION = 11500;       // ms — total spin duration
const ITEMS_TOTAL = 100;      // total tiles in the strip
// CSS easing that mimics CS:GO case spin: rocket start → agonising crawl
const EASING = "cubic-bezier(0.04, 0.0, 0.04, 1.0)";

// ─── Web-Audio tick synthesiser ───────────────────────────────────────────────
function playTick(ctx: AudioContext, volume: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = "triangle";
  osc.frequency.setValueAtTime(1400, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.04);
  gain.gain.setValueAtTime(Math.min(volume, 1), ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.08);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.08);
}

function playReveal(ctx: AudioContext) {
  // deep thud
  const o1 = ctx.createOscillator();
  const g1 = ctx.createGain();
  o1.connect(g1); g1.connect(ctx.destination);
  o1.type = "sine";
  o1.frequency.setValueAtTime(220, ctx.currentTime);
  o1.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.6);
  g1.gain.setValueAtTime(0.7, ctx.currentTime);
  g1.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
  o1.start(ctx.currentTime); o1.stop(ctx.currentTime + 0.6);

  // bright chime
  const o2 = ctx.createOscillator();
  const g2 = ctx.createGain();
  o2.connect(g2); g2.connect(ctx.destination);
  o2.type = "sine";
  o2.frequency.setValueAtTime(1760, ctx.currentTime + 0.05);
  g2.gain.setValueAtTime(0.0001, ctx.currentTime);
  g2.gain.linearRampToValueAtTime(0.35, ctx.currentTime + 0.08);
  g2.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.2);
  o2.start(ctx.currentTime); o2.stop(ctx.currentTime + 1.2);

  // shimmer
  const o3 = ctx.createOscillator();
  const g3 = ctx.createGain();
  o3.connect(g3); g3.connect(ctx.destination);
  o3.type = "sine";
  o3.frequency.setValueAtTime(2200, ctx.currentTime + 0.1);
  g3.gain.setValueAtTime(0.0001, ctx.currentTime);
  g3.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.14);
  g3.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9);
  o3.start(ctx.currentTime); o3.stop(ctx.currentTime + 0.9);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function parseMaps(raw: string): string[] {
  return raw.split(/[,\n]+/).map((m) => m.trim()).filter((m) => m.length > 0);
}

function buildStrip(maps: string[], winner: string): string[] {
  const items: string[] = [];
  for (let i = 0; i < ITEMS_TOTAL; i++) {
    items.push(maps[Math.floor(Math.random() * maps.length)]);
  }
  items[WINNER_IDX] = winner;
  return items;
}

// Inverse of quintic ease-out: given normalised position 0→1, returns time fraction 0→1
function easeInverse(p: number): number {
  return 1 - Math.pow(Math.max(0, 1 - p), 0.2);
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function BracketMapRoll() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: bracket } = useGetBracket({ query: { queryKey: getGetBracketQueryKey() } });

  const [mapPool, setMapPool] = useState(
    "Mirage\nInferno\nDust2\nNuke\nOverpass\nAnubis\nVertigo\nAncient"
  );
  const [connectionString, setConnectionString] = useState("");
  const [showConnection, setShowConnection] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const [stripItems, setStripItems] = useState<string[]>([]);
  const [revealed, setRevealed] = useState(false);

  const stripRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const tickTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const setWinnerMut = useSetMatchWinner();
  const resetBracketMut = useResetBracket();
  const rollMapMut = useRollMap();
  const broadcastMut = useBroadcastServer();

  const getAudioCtx = useCallback((): AudioContext => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    if (audioCtxRef.current.state === "suspended") {
      void audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  const handleSetWinner = (winner: "A" | "B" | "C") => {
    setWinnerMut.mutate(
      { data: { winner } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetBracketQueryKey() }) }
    );
  };

  const handleResetBracket = () => {
    resetBracketMut.mutate(undefined, {
      onSuccess: () => {
        toast({ title: "Bracket zurückgesetzt", description: "Turnier-Status gelöscht." });
        queryClient.invalidateQueries({ queryKey: getGetBracketQueryKey() });
      },
    });
  };

  const handleRollMap = () => {
    const maps = parseMaps(mapPool);
    if (maps.length === 0) return;

    // Clear any prior ticks
    tickTimeoutsRef.current.forEach(clearTimeout);
    tickTimeoutsRef.current = [];
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
          const finalX = -(WINNER_IDX * ITEM_WIDTH - containerWidth / 2 + ITEM_WIDTH / 2);

          const totalScroll = Math.abs(finalX);
          const ctx = getAudioCtx();

          // Schedule ticks — each fires when its tile crosses the centre marker
          for (let i = 1; i <= WINNER_IDX; i++) {
            const pos = i * ITEM_WIDTH;
            const progress = Math.min(pos / totalScroll, 1);
            const tickAt = DURATION * easeInverse(progress);
            // Volume ramps up as wheel slows (more tension at the end)
            const vol = 0.15 + 0.55 * (i / WINNER_IDX);
            const id = setTimeout(() => playTick(ctx, vol), tickAt);
            tickTimeoutsRef.current.push(id);
          }

          // Reset strip position instantly, then animate
          if (stripRef.current) {
            stripRef.current.style.transition = "none";
            stripRef.current.style.transform = "translateX(0px)";
            // Force reflow so the browser applies the reset before the transition
            void stripRef.current.offsetWidth;
            stripRef.current.style.transition = `transform ${DURATION}ms ${EASING}`;
            stripRef.current.style.transform = `translateX(${finalX}px)`;
          }

          // Reveal
          setTimeout(() => {
            setIsSpinning(false);
            setRevealed(true);
            playReveal(getAudioCtx());
            queryClient.invalidateQueries({ queryKey: getGetBracketQueryKey() });
          }, DURATION + 100);
        },
        onError: () => setIsSpinning(false),
      }
    );
  };

  const handleBroadcast = () => {
    if (!connectionString.trim()) return;
    broadcastMut.mutate(
      { data: { connectionString } },
      {
        onSuccess: () => {
          toast({
            title: "Gesendet",
            description: "Server-Verbindungsdaten an aktive Teams übertragen.",
          });
        },
      }
    );
  };

  const getMatchTeams = (matchString: string | null | undefined): string[] => {
    if (!matchString) return [];
    const parts = matchString.split(" ");
    if (parts.length >= 3) return [parts[0], parts[2]];
    return [];
  };

  const currentTeams =
    bracket?.currentMatch === 1
      ? getMatchTeams(bracket?.match1)
      : bracket?.currentMatch === 2
      ? getMatchTeams(bracket?.match2)
      : bracket?.currentMatch === 3
      ? getMatchTeams(bracket?.match3)
      : [];

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
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetBracket}
              disabled={resetBracketMut.isPending}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              RESET
            </Button>
          </CardHeader>
          <CardContent>
            {bracket ? (
              <div className="space-y-4">
                {/* Match 1 */}
                <div
                  className={`p-4 border rounded-md relative overflow-hidden ${
                    bracket.currentMatch === 1
                      ? "border-primary bg-primary/5"
                      : "border-border/50"
                  }`}
                >
                  {bracket.currentMatch === 1 && (
                    <div className="absolute top-0 left-0 w-1 h-full bg-primary animate-pulse" />
                  )}
                  <div className="flex justify-between items-center font-mono mb-2">
                    <span className="text-muted-foreground text-xs uppercase">Partie 1</span>
                    {bracket.match1Winner && (
                      <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/30">
                        SIEGER: TEAM {bracket.match1Winner}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-xl font-black font-mono">
                    <span className={bracket.match1Winner === "A" ? "text-primary" : ""}>TEAM A</span>
                    <span className="text-muted-foreground text-sm">VS</span>
                    <span className={bracket.match1Winner === "B" ? "text-primary" : ""}>TEAM B</span>
                  </div>
                </div>

                {/* Match 2 */}
                <div
                  className={`p-4 border rounded-md relative overflow-hidden ${
                    bracket.currentMatch === 2
                      ? "border-primary bg-primary/5"
                      : "border-border/50"
                  }`}
                >
                  {bracket.currentMatch === 2 && (
                    <div className="absolute top-0 left-0 w-1 h-full bg-primary animate-pulse" />
                  )}
                  <div className="flex justify-between items-center font-mono mb-2">
                    <span className="text-muted-foreground text-xs uppercase">Partie 2</span>
                    {bracket.match2Winner && (
                      <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/30">
                        SIEGER: TEAM {bracket.match2Winner}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-xl font-black font-mono">
                    <span
                      className={
                        bracket.match2Winner === bracket.match2?.split(" ")[0]
                          ? "text-primary"
                          : ""
                      }
                    >
                      {bracket.match2 ? `TEAM ${bracket.match2.split(" ")[0]}` : "?"}
                    </span>
                    <span className="text-muted-foreground text-sm">VS</span>
                    <span
                      className={
                        bracket.match2Winner === bracket.match2?.split(" ")[2]
                          ? "text-primary"
                          : ""
                      }
                    >
                      {bracket.match2 ? `TEAM ${bracket.match2.split(" ")[2]}` : "?"}
                    </span>
                  </div>
                </div>

                {/* Match 3 */}
                <div
                  className={`p-4 border rounded-md relative overflow-hidden ${
                    bracket.currentMatch === 3
                      ? "border-primary bg-primary/5"
                      : "border-border/50"
                  }`}
                >
                  {bracket.currentMatch === 3 && (
                    <div className="absolute top-0 left-0 w-1 h-full bg-primary animate-pulse" />
                  )}
                  <div className="flex justify-between items-center font-mono mb-2">
                    <span className="text-muted-foreground text-xs uppercase">Finale</span>
                    {bracket.match3Winner && (
                      <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/30">
                        SIEGER: TEAM {bracket.match3Winner}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-xl font-black font-mono">
                    <span
                      className={
                        bracket.match3Winner === bracket.match3?.split(" ")[0]
                          ? "text-primary"
                          : ""
                      }
                    >
                      {bracket.match3 ? `TEAM ${bracket.match3.split(" ")[0]}` : "?"}
                    </span>
                    <span className="text-muted-foreground text-sm">VS</span>
                    <span
                      className={
                        bracket.match3Winner === bracket.match3?.split(" ")[2]
                          ? "text-primary"
                          : ""
                      }
                    >
                      {bracket.match3 ? `TEAM ${bracket.match3.split(" ")[2]}` : "?"}
                    </span>
                  </div>
                </div>

                {bracket.currentMatch <= 3 && currentTeams.length > 0 && (
                  <div className="pt-4 border-t border-border">
                    <p className="font-mono text-xs text-muted-foreground mb-3 uppercase">
                      Aktive Partie auflösen
                    </p>
                    <div className="flex gap-2">
                      {currentTeams.map((t) => (
                        <Button
                          key={t}
                          className="flex-1 font-mono uppercase"
                          variant="outline"
                          disabled={setWinnerMut.isPending}
                          onClick={() => handleSetWinner(t as "A" | "B" | "C")}
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

      {/* ── Right: Map Roll + Server Broadcast ── */}
      <div className="space-y-6">
        {/* Map Selector */}
        <Card className="border-border/50 border-t-secondary border-t-2">
          <CardHeader>
            <CardTitle className="font-mono text-secondary flex items-center gap-2">
              <Dices className="w-5 h-5" />
              KARTEN-AUSWAHL
            </CardTitle>
            <CardDescription className="font-mono text-xs">
              Karten-Pool (eine pro Zeile oder kommagetrennt)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              value={mapPool}
              onChange={(e) => setMapPool(e.target.value)}
              className="font-mono text-sm bg-background/50 min-h-[100px] resize-none"
              disabled={isSpinning}
            />

            {/* ── Reel container ── */}
            <div
              ref={containerRef}
              className="relative w-full h-28 overflow-hidden rounded-lg border border-border/60 bg-black/60"
              style={{ cursor: isSpinning ? "not-allowed" : "default" }}
            >
              {/* Centre selector arrow (top + bottom) */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
                <div
                  className="w-0 h-0"
                  style={{
                    borderLeft: "8px solid transparent",
                    borderRight: "8px solid transparent",
                    borderTop: "10px solid #f97316",
                  }}
                />
              </div>
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
                <div
                  className="w-0 h-0"
                  style={{
                    borderLeft: "8px solid transparent",
                    borderRight: "8px solid transparent",
                    borderBottom: "10px solid #f97316",
                  }}
                />
              </div>
              {/* Vertical centre line */}
              <div className="absolute top-0 bottom-0 left-1/2 -translate-x-px w-0.5 bg-primary/40 z-10 pointer-events-none" />

              {/* Strip */}
              {stripItems.length > 0 ? (
                <div
                  ref={stripRef}
                  className="absolute top-0 left-0 flex items-center h-full"
                  style={{ willChange: "transform" }}
                >
                  {stripItems.map((map, i) => {
                    const isWinner = revealed && i === WINNER_IDX;
                    return (
                      <div
                        key={i}
                        className="flex-shrink-0 flex items-center justify-center rounded font-mono font-black text-sm uppercase tracking-wider transition-colors"
                        style={{
                          width: ITEM_WIDTH - 8,
                          height: 84,
                          marginRight: 8,
                          background: isWinner
                            ? "rgba(249,115,22,0.18)"
                            : "rgba(255,255,255,0.04)",
                          border: isWinner
                            ? "1.5px solid rgba(249,115,22,0.8)"
                            : "1px solid rgba(255,255,255,0.07)",
                          color: isWinner ? "#f97316" : "#94a3b8",
                          boxShadow: isWinner
                            ? "0 0 18px rgba(249,115,22,0.35)"
                            : "none",
                        }}
                      >
                        {map}
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
                    <span className="font-mono text-sm text-muted-foreground tracking-widest uppercase">
                      Noch keine Karte
                    </span>
                  )}
                </div>
              )}

              {/* Vignette overlay */}
              <div
                className="absolute inset-0 pointer-events-none z-10"
                style={{
                  background:
                    "linear-gradient(to right, rgba(8,12,22,0.85) 0%, transparent 18%, transparent 82%, rgba(8,12,22,0.85) 100%)",
                }}
              />
            </div>

            {/* Revealed map name */}
            {revealed && bracket?.rolledMap && (
              <div className="text-center py-2">
                <p className="font-mono text-xs text-muted-foreground uppercase tracking-widest mb-1">Ausgewählte Karte</p>
                <p className="font-mono font-black text-3xl text-primary drop-shadow-[0_0_14px_rgba(249,115,22,0.5)] uppercase tracking-widest animate-in fade-in zoom-in-95 duration-300">
                  {bracket.rolledMap}
                </p>
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

        {/* Server Broadcast */}
        <Card className="border-border/50 bg-destructive/5 border-destructive/20">
          <CardHeader>
            <CardTitle className="font-mono text-destructive flex items-center gap-2">
              <Send className="w-5 h-5" />
              SERVER SENDEN
            </CardTitle>
            <CardDescription className="font-mono text-xs">
              Verbindungsdaten an aktive Teams übertragen
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Input
                type={showConnection ? "text" : "password"}
                placeholder="connect 192.168.1.1:27015; password xyz"
                value={connectionString}
                onChange={(e) => setConnectionString(e.target.value)}
                className="font-mono font-bold text-sm bg-black/50 border-destructive/30 focus-visible:ring-destructive pr-10"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowConnection((v) => !v)}
                tabIndex={-1}
              >
                {showConnection ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
            <Button
              variant="destructive"
              className="w-full font-mono font-bold tracking-widest"
              onClick={handleBroadcast}
              disabled={!connectionString.trim() || broadcastMut.isPending}
            >
              AN SPIELER ÜBERTRAGEN
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
