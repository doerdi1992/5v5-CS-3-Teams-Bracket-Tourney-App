import { useState, useEffect } from "react";
import {
  useGetPlayers,
  useRegisterViewer,
  getGetPlayersQueryKey,
  useGetBracket,
  getGetBracketQueryKey,
  useGetMapImages,
  getGetMapImagesQueryKey,
} from "@workspace/api-client-react";
import { socket } from "@/lib/socket";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Copy, Server, Play, ExternalLink, Tv, Crown } from "lucide-react";

const getSteamUrl = (connStr: string | null): string => {
  if (!connStr) return "";
  let clean = connStr.trim();
  if (clean.toLowerCase().startsWith("connect ")) {
    clean = clean.substring(8).trim();
  }
  const parts = clean.split(";");
  const ipPort = parts[0].trim();
  let password = "";
  if (parts.length > 1) {
    const pwPart = parts[1].trim();
    if (pwPart.toLowerCase().startsWith("password ")) {
      password = pwPart.substring(9).trim();
    }
  }
  if (password) {
    return `steam://connect/${ipPort}/${password}`;
  }
  return `steam://connect/${ipPort}`;
};

export default function ViewerPage() {
  const { toast } = useToast();
  const [clientId, setClientId] = useState<string>("");
  const [playerName, setPlayerName] = useState<string>("");
  const [isRegistered, setIsRegistered] = useState(false);
  const [registerInput, setRegisterInput] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [connectionString, setConnectionString] = useState<string | null>(() =>
    localStorage.getItem("cs2_viewer_connection")
  );
  const [showConnectionModal, setShowConnectionModal] = useState(false);

  const { data: players } = useGetPlayers({ query: { queryKey: getGetPlayersQueryKey() } });
  const { data: bracketData } = useGetBracket({ query: { queryKey: getGetBracketQueryKey() } });
  const bracket = bracketData as any;
  const { data: mapImages = {} } = useGetMapImages({ query: { queryKey: getGetMapImagesQueryKey() } });

  const registerMutation = useRegisterViewer();

  useEffect(() => {
    let storedClientId = localStorage.getItem("cs2_client_id");
    if (!storedClientId) {
      storedClientId = crypto.randomUUID();
      localStorage.setItem("cs2_client_id", storedClientId);
    }
    setClientId(storedClientId);
    const storedName = localStorage.getItem("cs2_player_name");
    const storedSteamId = localStorage.getItem("cs2_steam_id");
    if (storedSteamId) {
      setRegisterInput(storedSteamId);
    } else if (storedName) {
      setRegisterInput(storedName);
    }
    if (storedName) {
      setPlayerName(storedName);
      setIsRegistered(true);
      socket.emit("register", { clientId: storedClientId });
    }
  }, []);

  useEffect(() => {
    const handleBroadcast = (payload: { connectionString: string; teams: string[] }) => {
      const me = players?.find((p) => p.name === playerName);
      if (me?.team && payload.teams.includes(me.team)) {
        setConnectionString(payload.connectionString);
        localStorage.setItem("cs2_viewer_connection", payload.connectionString);
        setShowConnectionModal(true);
      }
    };
    socket.on("server_broadcast", handleBroadcast);
    return () => { socket.off("server_broadcast", handleBroadcast); };
  }, [players, playerName]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = registerInput.trim();
    if (!query) {
      toast({
        variant: "destructive",
        title: "Eingabe erforderlich",
        description: "Bitte gib dein Steam-Profil, deine SteamID oder deinen Wunschnamen ein.",
      });
      return;
    }

    setIsRegistering(true);
    let resolvedSteamId = "";
    let finalName = "";

    const mightBeSteam = /^(https?:\/\/)?(www\.)?steamcommunity\.com/i.test(query) || 
                         /^\d{17}$/.test(query) || 
                         /^[a-zA-Z0-9_-]{3,32}$/.test(query);

    if (mightBeSteam) {
      try {
        const res = await fetch(`/api/players/resolve-steam?input=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json() as { steamId?: string; steamName?: string };
          if (data.steamId) {
            resolvedSteamId = data.steamId;
            finalName = data.steamName || query;
            toast({
              title: "Steam-Profil geladen",
              description: `Profil verifiziert: ${finalName}`,
            });
          }
        }
      } catch (err) {
        console.warn("Steam resolution failed, using input as custom name", err);
      }
    }

    if (!resolvedSteamId) {
      if (query.includes("steamcommunity.com") || query.includes("http")) {
        toast({
          variant: "destructive",
          title: "Ungültiges Profil",
          description: "Dein Steam-Profil konnte nicht geladen werden. Bitte korrigiere den Link oder gib einen Namen ein.",
        });
        setIsRegistering(false);
        return;
      }

      if (/^\d{17}$/.test(query)) {
        resolvedSteamId = query;
        finalName = `Spieler_${query.slice(-4)}`;
      } else {
        finalName = query;
      }
    }

    fetch("/api/players/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: finalName,
        clientId,
        steamId: resolvedSteamId || undefined,
      }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || "Serverfehler");
        }
        return res.json();
      })
      .then(() => {
        localStorage.setItem("cs2_player_name", finalName);
        if (resolvedSteamId) {
          localStorage.setItem("cs2_steam_id", resolvedSteamId);
        } else {
          localStorage.removeItem("cs2_steam_id");
        }
        setPlayerName(finalName);
        setIsRegistered(true);
        socket.emit("register", { clientId });
        toast({ title: "Erfolgreich angemeldet", description: "Warte auf Admin-Freigabe." });
      })
      .catch((err) => {
        toast({ variant: "destructive", title: "Anmeldung fehlgeschlagen", description: err.message });
      })
      .finally(() => {
        setIsRegistering(false);
      });
  };

  const copyConnectionString = () => {
    if (connectionString) {
      void navigator.clipboard.writeText(connectionString);
      toast({ title: "Kopiert!", description: "Verbindungsstring in Zwischenablage kopiert." });
    }
  };

  const me = players?.find((p) => p.name === playerName);
  const rolledMap = bracket?.rolledMap ?? null;
  const mapImageUrl = rolledMap ? (mapImages[rolledMap] ?? null) : null;

  const currentTeams =
    bracket?.currentMatch === 1 ? ["A", "B"]
    : bracket?.currentMatch === 2 ? (bracket.match1Winner === "A" ? ["B", "C"] : ["A", "C"])
    : bracket?.currentMatch === 3 ? (bracket.match1Winner === "A" ? ["A", "C"] : ["B", "C"])
    : bracket?.currentMatch === 4 && bracket.match4 ? [bracket.match4.split(" ")[0], bracket.match4.split(" ")[2]]
    : [];

  const isMyMatchActive = me?.team && currentTeams.includes(me.team) && rolledMap;

  // Clear connection string if the match is no longer active
  useEffect(() => {
    if (isRegistered && bracket && players) {
      if (!isMyMatchActive) {
        setConnectionString(null);
        localStorage.removeItem("cs2_viewer_connection");
      }
    }
  }, [isMyMatchActive, isRegistered, bracket, players]);

  return (
    <div className="min-h-screen bg-background text-foreground p-6 flex flex-col items-center relative overflow-x-hidden">
      {/* Decorative ambient background glows */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[250px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-0 right-1/4 w-[500px] h-[250px] bg-secondary/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-4xl w-full space-y-8 relative z-10">
        <header className="relative w-full rounded-2xl glass p-6 md:p-8 mb-6 border border-primary/20 overflow-hidden shadow-[0_4px_30px_rgba(0,0,0,0.4)]">
          {/* Subtle top accent line */}
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
          
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
            {/* Title Block */}
            <div className="text-center md:text-left space-y-2">
              <div className="flex items-center justify-center md:justify-start gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse shadow-[0_0_10px_#22c55e]" />
                <span className="text-[10px] font-mono tracking-widest text-green-500 uppercase font-black">Portal Aktiv</span>
              </div>
              <h1 className="text-3xl md:text-5xl font-black tracking-tighter bg-gradient-to-r from-primary via-orange-400 to-primary bg-clip-text text-transparent uppercase drop-shadow-[0_0_15px_rgba(249,115,22,0.2)] font-mono">
                Janaxf 5v5 CS2 Turnier
              </h1>
              <p className="text-muted-foreground text-[10px] md:text-xs font-mono uppercase tracking-[0.2em] pl-0.5">
                Spieler- & Match-Dashboard
              </p>
            </div>
            
            {/* Decorative tactical brackets/badge */}
            <div className="flex items-center gap-3 bg-black/40 border border-white/5 px-4 py-2.5 rounded-xl backdrop-blur-sm">
              <Tv className="w-4 h-4 text-primary animate-pulse" />
              <div className="text-left font-mono">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground leading-tight">Plattform</div>
                <div className="text-xs font-bold text-secondary tracking-widest">CS2 MATCH ENGINE</div>
              </div>
            </div>
          </div>
          
          {/* Decorative grid pattern in background */}
          <div className="absolute right-4 bottom-0 opacity-[0.03] pointer-events-none select-none text-[80px] font-mono font-black tracking-tighter leading-none select-none">
            CS2
          </div>
        </header>

        {!isRegistered ? (
          <Card className="max-w-md mx-auto border-primary/20 bg-card/50 backdrop-blur shadow-[0_0_30px_rgba(249,115,22,0.1)]">
            <CardHeader>
              <CardTitle className="font-mono text-xl uppercase text-primary tracking-wider">Warteschlange beitreten</CardTitle>
              <CardDescription className="text-xs">Gib dein Steam-Profil (Link/Name), deine SteamID oder einen Wunschnamen ein.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Steam-Profil, SteamID oder Name</label>
                  <Input
                    value={registerInput}
                    onChange={(e) => setRegisterInput(e.target.value)}
                    placeholder="Steam-Link, SteamID oder Kampfname..."
                    className="font-mono bg-background/50"
                  />
                  <div className="flex flex-col gap-1 mt-2.5 px-0.5">
                    <p className="text-[9px] font-mono text-muted-foreground leading-relaxed">
                      💡 <strong>Tipp:</strong> Mit deinem Steam-Profil wird dein Kampfname automatisch ausgefüllt.
                    </p>
                    <a
                      href="https://steamcommunity.com/my/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[9px] font-mono text-primary hover:underline flex items-center gap-0.5 transition-colors self-start mt-1"
                    >
                      <ExternalLink className="w-2.5 h-2.5" />
                      Mein Steam-Profil für Link kopieren
                    </a>
                  </div>
                </div>
                <Button type="submit" className="w-full font-mono uppercase tracking-widest mt-2" disabled={isRegistering}>
                  {isRegistering ? "Verbinde..." : "Anmelden"}
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            {/* Player status */}
            <Card className="border-primary/20 bg-card/50 backdrop-blur">
              <CardContent className="p-6">
                <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                  <div className="space-y-1 text-center md:text-left">
                    <p className="text-sm font-mono text-muted-foreground uppercase">Dein Kampfname</p>
                    <h2 className="text-3xl font-bold font-mono">{playerName}</h2>
                    <div className="mt-2 flex gap-2 items-center justify-center md:justify-start flex-wrap">
                      <Badge variant={me?.status === "accepted" ? "default" : "secondary"} className="uppercase">
                        {me?.status === "accepted" ? "Akzeptiert" : me?.status === "rejected" ? "Abgelehnt" : "Ausstehend"}
                      </Badge>
                      {me?.flagged && <Badge variant="destructive" className="uppercase">GOAT</Badge>}
                      <Button
                        variant="link"
                        size="sm"
                        className="text-xs text-muted-foreground hover:text-primary font-mono h-auto p-0 ml-2"
                        onClick={() => setIsRegistered(false)}
                      >
                        (Ändern)
                      </Button>
                    </div>
                  </div>
                  <div className="text-center md:text-right border border-border p-4 rounded-lg bg-background/50 min-w-[200px]">
                    <p className="text-sm font-mono text-muted-foreground uppercase mb-1">Team-Zuweisung</p>
                    <div className="text-5xl font-black text-primary drop-shadow-[0_0_8px_rgba(249,115,22,0.5)]">
                      {me?.team ? `TEAM ${me.team}` : "--"}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Server connection card */}
            {connectionString && (
              <Card className="border-green-500/30 bg-green-500/5 animate-in fade-in slide-in-from-top-4 duration-300">
                <CardHeader className="pb-2">
                  <CardTitle className="font-mono text-lg text-green-500 flex items-center gap-2">
                    <Server className="w-5 h-5 animate-pulse" />
                    SPIEL BEREIT — SERVER VERBINDUNG
                  </CardTitle>
                  <CardDescription className="text-xs uppercase font-mono tracking-wider text-muted-foreground">Dein Team wurde zugewiesen. Tritt dem Server bei:</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="p-3 bg-black/40 rounded border border-border flex items-center justify-between">
                    <code className="text-secondary font-mono text-sm break-all">{connectionString}</code>
                    <Button variant="ghost" size="icon" onClick={copyConnectionString} className="ml-2 hover:text-primary h-8 w-8 flex-shrink-0">
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                  <a href={getSteamUrl(connectionString)} className="w-full block">
                    <Button className="w-full font-mono uppercase tracking-widest bg-green-600 hover:bg-green-700 text-white gap-2 h-10">
                      <Play className="w-4 h-4 fill-current" />
                      Server Beitreten (CS2)
                    </Button>
                  </a>
                </CardContent>
              </Card>
            )}

            {/* Live Bracket */}
            <Card className="border-border/50 bg-card/30">
              <CardHeader>
                <CardTitle className="font-mono text-xl uppercase text-secondary">Live-Bracket</CardTitle>
              </CardHeader>
              <CardContent>
                {bracket ? (
                  <>
                    {bracket.currentMatch === 5 && (
                      <div className="mb-6 p-5 border border-yellow-500/30 rounded-xl bg-yellow-500/5 text-center flex flex-col items-center gap-2 animate-in fade-in slide-in-from-top-4 duration-300">
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

                    <div className="grid gap-4 md:grid-cols-3 mb-6">
                      {(() => {
                        const list = [
                          { label: "Partie 1", num: 1, left: "TEAM A", right: "TEAM B", winner: bracket.match1Winner, lTeam: "A", rTeam: "B", rounds: (bracket as any).match1Rounds },
                          { label: "Partie 2", num: 2, left: bracket.match2 ? `TEAM ${bracket.match2.split(" ")[0]}` : "?", right: bracket.match2 ? `TEAM ${bracket.match2.split(" ")[2]}` : "?", winner: bracket.match2Winner, lTeam: bracket.match2?.split(" ")[0] ?? null, rTeam: bracket.match2?.split(" ")[2] ?? null, rounds: (bracket as any).match2Rounds },
                          { label: "Finale", num: 3, left: bracket.match3 ? `TEAM ${bracket.match3.split(" ")[0]}` : "?", right: bracket.match3 ? `TEAM ${bracket.match3.split(" ")[2]}` : "?", winner: bracket.match3Winner, lTeam: bracket.match3?.split(" ")[0] ?? null, rTeam: bracket.match3?.split(" ")[2] ?? null, rounds: (bracket as any).match3Rounds },
                        ];
                        if (bracket.match4) {
                          list.push({
                            label: "Tiebreaker",
                            num: 4,
                            left: `TEAM ${bracket.match4.split(" ")[0]}`,
                            right: `TEAM ${bracket.match4.split(" ")[2]}`,
                            winner: bracket.match4Winner,
                            lTeam: bracket.match4.split(" ")[0],
                            rTeam: bracket.match4.split(" ")[2],
                            rounds: (bracket as any).match4Rounds,
                          });
                        }
                        return list;
                      })().map(({ label, num, left, right, winner, lTeam, rTeam, rounds }) => (
                        <div key={label} className={`p-4 border rounded-lg ${bracket.currentMatch === num ? "border-primary shadow-[0_0_15px_rgba(249,115,22,0.2)]" : "border-border"}`}>
                          <h3 className="font-mono text-sm text-muted-foreground mb-2 uppercase">{label}</h3>
                          <div className="flex justify-between items-center text-lg font-bold">
                            <span className={winner === lTeam && winner ? "text-primary" : ""}>
                              {left} {rounds && <span className="text-xs text-muted-foreground font-normal font-mono">({rounds.left})</span>}
                            </span>
                            <span className="text-muted-foreground text-xs font-normal px-2">VS</span>
                            <span className={winner === rTeam && winner ? "text-primary" : ""}>
                              {rounds && <span className="text-xs text-muted-foreground font-normal font-mono">({rounds.right})</span>} {right}
                            </span>
                          </div>
                          {winner && <div className="mt-2 text-center text-xs font-mono text-primary">SIEGER: TEAM {winner}</div>}
                        </div>
                      ))}
                    </div>

                    {/* Rolled Map */}
                    {rolledMap && (
                      <div className="border-t border-border/40 pt-5">
                        <p className="font-mono text-xs text-muted-foreground uppercase tracking-widest mb-3">Aktuelle Karte</p>
                        <div className="flex items-center gap-5">
                          {mapImageUrl && (
                            <div className="w-36 h-20 rounded-lg overflow-hidden border border-secondary/30 flex-shrink-0">
                              <img src={mapImageUrl} alt={rolledMap} className="w-full h-full object-cover" />
                            </div>
                          )}
                          <div>
                            <p className="font-mono font-black text-3xl text-secondary uppercase tracking-widest drop-shadow-[0_0_10px_rgba(20,184,166,0.4)]">
                              {rolledMap}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-muted-foreground text-center font-mono">Kein aktives Bracket</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Server connection modal */}
      <Dialog open={showConnectionModal} onOpenChange={setShowConnectionModal}>
        <DialogContent className="sm:max-w-md border-primary shadow-[0_0_30px_rgba(249,115,22,0.15)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-mono text-2xl text-primary">
              <Server className="w-6 h-6" />
              MATCH BEREIT
            </DialogTitle>
            <DialogDescription className="text-base">Dein Match startet. Verbinde dich mit dem Server:</DialogDescription>
          </DialogHeader>
          <div className="p-4 bg-black/50 rounded-md border border-border mt-2 flex items-center justify-between">
            <code className="text-secondary font-mono text-sm break-all">{connectionString}</code>
            <Button variant="ghost" size="icon" onClick={copyConnectionString} className="ml-2 hover:text-primary">
              <Copy className="w-4 h-4" />
            </Button>
          </div>
          {connectionString && (
            <a href={getSteamUrl(connectionString)} className="w-full block mt-3">
              <Button className="w-full font-mono uppercase tracking-widest bg-green-600 hover:bg-green-700 text-white gap-2 h-10">
                <Play className="w-4 h-4 fill-current" />
                Server Beitreten (CS2)
              </Button>
            </a>
          )}
          <Button onClick={() => setShowConnectionModal(false)} className="w-full mt-2 font-mono uppercase tracking-widest" variant="outline">Bestätigen</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
