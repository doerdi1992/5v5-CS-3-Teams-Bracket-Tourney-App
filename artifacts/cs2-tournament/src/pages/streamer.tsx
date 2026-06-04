import { useGetBracket, getGetBracketQueryKey, useGetMapImages, getGetMapImagesQueryKey } from "@workspace/api-client-react";
import { useEffect } from "react";
import { socket } from "@/lib/socket";
import { useQueryClient } from "@tanstack/react-query";

function MatchCard({
  label,
  matchNum,
  currentMatch,
  left,
  right,
  winner,
  leftTeam,
  rightTeam,
}: {
  label: string;
  matchNum: number;
  currentMatch: number;
  left: string;
  right: string;
  winner: string | null | undefined;
  leftTeam: string | null;
  rightTeam: string | null;
}) {
  const isActive = currentMatch === matchNum;
  return (
    <div
      className={`p-5 rounded-xl border relative overflow-hidden transition-all ${
        isActive
          ? "border-primary bg-primary/8 shadow-[0_0_24px_rgba(249,115,22,0.18)]"
          : "border-border/40 bg-card/30"
      }`}
    >
      {isActive && (
        <div className="absolute top-0 left-0 w-1.5 h-full bg-primary animate-pulse rounded-l-xl" />
      )}
      <div className="flex justify-between items-center mb-3 font-mono">
        <span className={`text-xs uppercase tracking-widest ${isActive ? "text-primary" : "text-muted-foreground"}`}>
          {label}
        </span>
        {winner && (
          <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/30">
            SIEGER: TEAM {winner}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between text-3xl font-black font-mono">
        <span className={winner === leftTeam && winner ? "text-primary drop-shadow-[0_0_8px_rgba(249,115,22,0.5)]" : "text-foreground/80"}>
          {left}
        </span>
        <span className="text-muted-foreground/50 text-base font-normal px-4">VS</span>
        <span className={winner === rightTeam && winner ? "text-primary drop-shadow-[0_0_8px_rgba(249,115,22,0.5)]" : "text-foreground/80"}>
          {right}
        </span>
      </div>
    </div>
  );
}

export default function StreamerPage() {
  const queryClient = useQueryClient();
  const { data: bracket } = useGetBracket({ query: { queryKey: getGetBracketQueryKey() } });
  const { data: mapImages = {} } = useGetMapImages({ query: { queryKey: getGetMapImagesQueryKey() } });

  useEffect(() => {
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: getGetBracketQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getGetMapImagesQueryKey() });
    };
    socket.on("state_update", refresh);
    return () => { socket.off("state_update", refresh); };
  }, [queryClient]);

  const rolledMap = bracket?.rolledMap ?? null;
  const mapImageUrl = rolledMap ? (mapImages[rolledMap] ?? null) : null;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-4 border-b border-border/30">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-black font-mono tracking-tighter text-primary">CS2_TURNIER</h1>
          <div className="h-4 w-px bg-border/50" />
          <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Streamer-Ansicht</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs font-mono text-muted-foreground">Live</span>
        </div>
      </header>

      {/* Main */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Bracket */}
        <div className="flex-1 flex flex-col justify-center p-8 space-y-4 border-r border-border/20">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-2">Turnier-Bracket</p>

          {bracket ? (
            <>
              <MatchCard
                label="Partie 1"
                matchNum={1}
                currentMatch={bracket.currentMatch}
                left="TEAM A"
                right="TEAM B"
                winner={bracket.match1Winner}
                leftTeam="A"
                rightTeam="B"
              />
              <MatchCard
                label="Partie 2"
                matchNum={2}
                currentMatch={bracket.currentMatch}
                left={bracket.match2 ? `TEAM ${bracket.match2.split(" ")[0]}` : "—"}
                right={bracket.match2 ? `TEAM ${bracket.match2.split(" ")[2]}` : "—"}
                winner={bracket.match2Winner}
                leftTeam={bracket.match2?.split(" ")[0] ?? null}
                rightTeam={bracket.match2?.split(" ")[2] ?? null}
              />
              <MatchCard
                label="Finale"
                matchNum={3}
                currentMatch={bracket.currentMatch}
                left={bracket.match3 ? `TEAM ${bracket.match3.split(" ")[0]}` : "—"}
                right={bracket.match3 ? `TEAM ${bracket.match3.split(" ")[2]}` : "—"}
                winner={bracket.match3Winner}
                leftTeam={bracket.match3?.split(" ")[0] ?? null}
                rightTeam={bracket.match3?.split(" ")[2] ?? null}
              />
            </>
          ) : (
            <p className="text-muted-foreground font-mono text-sm">Bracket nicht verfügbar.</p>
          )}
        </div>

        {/* Right: Rolled Map */}
        <div className="w-[420px] flex flex-col items-center justify-center p-8 gap-6">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Aktuelle Karte</p>

          {rolledMap ? (
            <>
              {/* Map image */}
              <div className="w-full aspect-video rounded-xl overflow-hidden border border-border/40 relative bg-card/50">
                {mapImageUrl ? (
                  <img
                    src={mapImageUrl}
                    alt={rolledMap}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-muted/20">
                    <span className="font-mono text-muted-foreground text-sm uppercase tracking-widest">Kein Bild</span>
                  </div>
                )}
                {/* Gradient overlay at bottom */}
                <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-background/80 to-transparent" />
              </div>

              {/* Map name */}
              <div className="text-center">
                <p className="font-mono font-black text-5xl uppercase tracking-widest text-primary drop-shadow-[0_0_20px_rgba(249,115,22,0.5)]">
                  {rolledMap}
                </p>
              </div>
            </>
          ) : (
            <div className="w-full aspect-video rounded-xl border border-border/30 flex items-center justify-center bg-card/20">
              <p className="font-mono text-muted-foreground text-sm uppercase tracking-widest">Noch keine Karte</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
