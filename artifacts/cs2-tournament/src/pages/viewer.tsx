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
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Copy, Server, Play, Crown, Loader2 } from "lucide-react";

const getSteamUrl = (connStr: string | null): string => {
  if (!connStr) return "";
  let clean = connStr.trim();
  if (clean.toLowerCase().startsWith("connect ")) clean = clean.substring(8).trim();
  const parts = clean.split(";");
  const ipPort = parts[0].trim();
  let password = "";
  if (parts.length > 1) {
    const pwPart = parts[1].trim();
    if (pwPart.toLowerCase().startsWith("password ")) password = pwPart.substring(9).trim();
  }
  return password ? `steam://connect/${ipPort}/${password}` : `steam://connect/${ipPort}`;
};

export default function ViewerPage() {
  const { toast } = useToast();
  const [clientId, setClientId] = useState<string>("");
  const [playerName, setPlayerName] = useState<string>("");
  const [isRegistered, setIsRegistered] = useState(false);
  const [registerInput, setRegisterInput] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [lastRegisterTime, setLastRegisterTime] = useState<number>(0);
  const [connectionString, setConnectionString] = useState<string | null>(() =>
    localStorage.getItem("cs2_viewer_connection")
  );
  const [showConnectionModal, setShowConnectionModal] = useState(false);

  const { data: players } = useGetPlayers({ query: { queryKey: getGetPlayersQueryKey() } });
  const { data: bracketData } = useGetBracket({ query: { queryKey: getGetBracketQueryKey() } });
  const bracket = bracketData as any;
  const { data: mapImages = {} } = useGetMapImages({ query: { queryKey: getGetMapImagesQueryKey() } });

  useEffect(() => {
    let storedClientId = localStorage.getItem("cs2_client_id");
    if (!storedClientId) {
      storedClientId = crypto.randomUUID();
      localStorage.setItem("cs2_client_id", storedClientId);
    }
    setClientId(storedClientId);
    const storedName = localStorage.getItem("cs2_player_name");
    const storedSteamId = localStorage.getItem("cs2_steam_id");
    if (storedSteamId) setRegisterInput(storedSteamId);
    else if (storedName) setRegisterInput(storedName);
    if (storedName) {
      setPlayerName(storedName);
      setIsRegistered(true);
      socket.emit("register", { clientId: storedClientId });
    }
  }, []);

  useEffect(() => {
    const handleBroadcast = (payload: { connectionString: string; teams: string[] }) => {
      const me = players?.find((p) => p.id === clientId);
      if (me?.team && payload.teams.includes(me.team)) {
        setConnectionString(payload.connectionString);
        localStorage.setItem("cs2_viewer_connection", payload.connectionString);
        setShowConnectionModal(true);
      }
    };
    socket.on("server_broadcast", handleBroadcast);
    return () => { socket.off("server_broadcast", handleBroadcast); };
  }, [players, clientId]);

  useEffect(() => {
    if (isRegistered && players && clientId) {
      // Don't trigger rejection checks immediately after register to avoid race conditions
      if (Date.now() - lastRegisterTime < 4000) {
        return;
      }
      const me = players.find((p) => p.id === clientId);
      if (me?.status === "rejected" || !me) {
        localStorage.removeItem("cs2_player_name");
        localStorage.removeItem("cs2_steam_id");
        localStorage.removeItem("cs2_viewer_connection");
        localStorage.removeItem("cs2_client_id");

        setIsRegistered(false);
        setPlayerName("");
        setRegisterInput("");
        setConnectionString(null);

        const newId = crypto.randomUUID();
        localStorage.setItem("cs2_client_id", newId);
        setClientId(newId);

        toast({
          variant: "destructive",
          title: me?.status === "rejected" ? "Anmeldung abgelehnt" : "Registrierung entfernt",
          description: me?.status === "rejected"
            ? "Deine Anmeldung für das Turnier wurde abgelehnt. Du kannst dich jetzt erneut anmelden."
            : "Deine Registrierung wurde vom Admin entfernt. Du kannst dich jetzt erneut anmelden."
        });
      }
    }
  }, [players, clientId, isRegistered, lastRegisterTime, toast]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = registerInput.trim();
    if (!query) {
      toast({ variant: "destructive", title: "Eingabe erforderlich", description: "Bitte füge deinen Steam-Profil-Link ein." });
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
          }
        }
      } catch (err) {
        console.warn("Steam resolution failed", err);
      }
    }

    if (!resolvedSteamId) {
      if (query.includes("steamcommunity.com") || query.includes("http")) {
        toast({ variant: "destructive", title: "Profil nicht gefunden", description: "Steam-Link ungültig. Bitte prüfe den Link." });
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
      body: JSON.stringify({ name: finalName, clientId, steamId: resolvedSteamId || undefined }),
    })
      .then(async (res) => {
        if (!res.ok) { const errData = await res.json(); throw new Error(errData.error || "Serverfehler"); }
        return res.json();
      })
      .then(() => {
        localStorage.setItem("cs2_player_name", finalName);
        if (resolvedSteamId) localStorage.setItem("cs2_steam_id", resolvedSteamId);
        else localStorage.removeItem("cs2_steam_id");
        setPlayerName(finalName);
        setIsRegistered(true);
        setLastRegisterTime(Date.now());
        socket.emit("register", { clientId });
        toast({ title: "Angemeldet!", description: "Warte auf die Turnier-Zuteilung." });
      })
      .catch((err) => { toast({ variant: "destructive", title: "Fehler", description: err.message }); })
      .finally(() => { setIsRegistering(false); });
  };

  const copyConnectionString = () => {
    if (connectionString) {
      void navigator.clipboard.writeText(connectionString);
      toast({ title: "Kopiert!", description: "In die Zwischenablage kopiert." });
    }
  };

  const me = players?.find((p) => p.id === clientId);
  const rolledMap = bracket?.rolledMap ?? null;
  const mapImageUrl = rolledMap ? (mapImages[rolledMap] ?? null) : null;

  const currentTeams =
    bracket?.currentMatch === 1 ? ["A", "B"]
    : bracket?.currentMatch === 2 ? (bracket.match1Winner === "A" ? ["B", "C"] : ["A", "C"])
    : bracket?.currentMatch === 3 ? (bracket.match1Winner === "A" ? ["A", "C"] : ["B", "C"])
    : bracket?.currentMatch === 4 && bracket.match4 ? [bracket.match4.split(" ")[0], bracket.match4.split(" ")[2]]
    : [];

  const isMyMatchActive = me?.team && currentTeams.includes(me.team) && rolledMap;

  useEffect(() => {
    if (isRegistered && bracket && players) {
      if (!isMyMatchActive) {
        setConnectionString(null);
        localStorage.removeItem("cs2_viewer_connection");
      }
    }
  }, [isMyMatchActive, isRegistered, bracket, players]);

  // ─── REGISTRATION SCREEN ───────────────────────────────
  if (!isRegistered) {
    return (
      <div className="min-h-screen bg-[#0a0e1a] text-foreground flex items-center justify-center p-4 relative overflow-hidden">
        {/* Ambient background */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-primary/6 rounded-full blur-[150px] pointer-events-none" />

        <div className="w-full max-w-sm space-y-6 relative z-10 text-center">
          {/* Logo / Title */}
          <div className="space-y-2">
            <h1 className="text-2xl font-black tracking-[0.15em] font-mono uppercase text-white/90">
              Janaxf <span className="text-primary">5v5</span>
            </h1>
            <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground/50">
              CS2 Community Turnier
            </p>
          </div>

          {/* Simple registration form */}
          <form onSubmit={handleRegister} className="space-y-3">
            <Input
              value={registerInput}
              onChange={(e) => setRegisterInput(e.target.value)}
              placeholder="Steam-Profil-Link einfügen..."
              className="font-mono text-sm bg-white/[0.04] border-white/[0.08] h-12 text-center placeholder:text-muted-foreground/30 focus-visible:ring-primary/40 focus-visible:border-primary/30"
              autoFocus
            />
            <Button
              type="submit"
              className="w-full font-mono uppercase tracking-[0.15em] h-11 bg-gradient-to-r from-primary to-orange-600 hover:from-primary/90 hover:to-orange-500 text-white shadow-[0_4px_20px_rgba(249,115,22,0.25)] text-sm"
              disabled={!registerInput.trim() || isRegistering}
            >
              {isRegistering ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Verbinde...</>
              ) : (
                "Anmelden"
              )}
            </Button>
          </form>

          <p className="text-[9px] font-mono text-muted-foreground/30 leading-relaxed">
            z.B. https://steamcommunity.com/id/deinname
          </p>
        </div>
      </div>
    );
  }

  // ─── PLAYER DASHBOARD ──────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0a0e1a] text-foreground p-4 md:p-6 relative overflow-x-hidden">
      {/* Ambient */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[250px] bg-primary/5 rounded-full blur-[150px] pointer-events-none" />

      <div className="max-w-3xl mx-auto space-y-5 relative z-10">
        {/* Compact header */}
        <header className="flex items-center justify-between py-3">
          <div>
            <h1 className="text-lg font-black tracking-[0.1em] font-mono uppercase text-white/80">
              Janaxf <span className="text-primary">5v5</span>
            </h1>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground/40 hover:text-red-400 h-7"
            onClick={() => { setIsRegistered(false); localStorage.removeItem("cs2_player_name"); }}
          >
            Abmelden
          </Button>
        </header>

        {/* Player status card */}
        <Card className="bg-white/[0.03] border-white/[0.06] backdrop-blur-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/50">Spieler</p>
                <h2 className="text-xl font-bold font-mono text-white/90">{playerName}</h2>
                <Badge
                  variant={me?.status === "accepted" ? "default" : "secondary"}
                  className="uppercase text-[9px] mt-1"
                >
                  {me?.status === "accepted" ? "✓ Akzeptiert" : me?.status === "rejected" ? "Abgelehnt" : "Ausstehend..."}
                </Badge>
              </div>
              <div className="text-right">
                <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/50">Team</p>
                <div className={`text-4xl font-black font-mono ${
                  me?.team === "A" ? "text-orange-500" :
                  me?.team === "B" ? "text-cyan-400" :
                  me?.team === "C" ? "text-purple-400" :
                  "text-muted-foreground/20"
                }`}>
                  {me?.team ?? "–"}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Server connection */}
        {connectionString && (
          <Card className="bg-emerald-500/[0.04] border-emerald-500/20 animate-in fade-in slide-in-from-top-2 duration-300">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-emerald-500 animate-pulse" />
                <span className="font-mono text-xs uppercase tracking-wider text-emerald-500 font-bold">Match bereit</span>
              </div>
              <div className="p-2.5 bg-black/40 rounded border border-white/[0.06] flex items-center justify-between">
                <code className="text-cyan-400 font-mono text-xs break-all">{connectionString}</code>
                <Button variant="ghost" size="icon" onClick={copyConnectionString} className="ml-2 h-7 w-7 text-muted-foreground hover:text-white">
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
              <a href={getSteamUrl(connectionString)} className="block">
                <Button className="w-full font-mono uppercase tracking-wider bg-emerald-600 hover:bg-emerald-700 text-white gap-2 h-10 text-xs">
                  <Play className="w-3.5 h-3.5 fill-current" />
                  Server Beitreten
                </Button>
              </a>
            </CardContent>
          </Card>
        )}

        {/* Bracket overview */}
        {bracket && (
          <Card className="bg-white/[0.02] border-white/[0.05]">
            <CardContent className="p-5">
              {bracket.currentMatch === 5 && (
                <div className="mb-5 p-4 border border-yellow-500/20 rounded-lg bg-yellow-500/[0.03] text-center">
                  <Crown className="w-8 h-8 text-yellow-500 mx-auto mb-1" />
                  <p className="text-[9px] font-mono tracking-widest text-yellow-500/80 uppercase">Champion</p>
                  <p className="text-2xl font-black font-mono text-yellow-400 uppercase">
                    Team {bracket.match4Winner || bracket.match3Winner}
                  </p>
                </div>
              )}

              <div className="grid gap-3 md:grid-cols-3">
                {(() => {
                  const list = [
                    { label: "Partie 1", num: 1, left: "A", right: "B", winner: bracket.match1Winner, rounds: (bracket as any).match1Rounds },
                    { label: "Partie 2", num: 2, left: bracket.match2?.split(" ")[0] ?? "?", right: bracket.match2?.split(" ")[2] ?? "?", winner: bracket.match2Winner, rounds: (bracket as any).match2Rounds },
                    { label: "Finale", num: 3, left: bracket.match3?.split(" ")[0] ?? "?", right: bracket.match3?.split(" ")[2] ?? "?", winner: bracket.match3Winner, rounds: (bracket as any).match3Rounds },
                  ];
                  if (bracket.match4) list.push({
                    label: "Tiebreaker", num: 4,
                    left: bracket.match4.split(" ")[0], right: bracket.match4.split(" ")[2],
                    winner: bracket.match4Winner, rounds: (bracket as any).match4Rounds,
                  });
                  return list;
                })().map(({ label, num, left, right, winner, rounds }) => (
                  <div
                    key={num}
                    className={`p-3 rounded-lg border transition-all ${
                      bracket.currentMatch === num
                        ? "border-primary/30 bg-primary/[0.03] shadow-[0_0_12px_rgba(249,115,22,0.08)]"
                        : "border-white/[0.04] bg-white/[0.01]"
                    }`}
                  >
                    <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/50 mb-2">{label}</p>
                    <div className="flex justify-between items-center text-sm font-bold font-mono">
                      <span className={`${winner === left ? "text-primary" : "text-white/70"}`}>
                        {left} {rounds && <span className="text-[10px] text-muted-foreground/40 font-normal">({rounds.left})</span>}
                      </span>
                      <span className="text-muted-foreground/20 text-[10px]">vs</span>
                      <span className={`${winner === right ? "text-primary" : "text-white/70"}`}>
                        {rounds && <span className="text-[10px] text-muted-foreground/40 font-normal">({rounds.right})</span>} {right}
                      </span>
                    </div>
                    {winner && <p className="text-[9px] font-mono text-primary/70 text-center mt-1.5 uppercase">Sieger: {winner}</p>}
                  </div>
                ))}
              </div>

              {/* Current map */}
              {rolledMap && (
                <div className="mt-4 pt-4 border-t border-white/[0.04] flex items-center gap-4">
                  {mapImageUrl && (
                    <div className="w-24 h-14 rounded overflow-hidden border border-white/[0.06] flex-shrink-0">
                      <img src={mapImageUrl} alt={rolledMap} className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div>
                    <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/40">Aktuelle Karte</p>
                    <p className="font-mono font-black text-xl text-cyan-400 uppercase">{rolledMap}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Server popup modal */}
      <Dialog open={showConnectionModal} onOpenChange={setShowConnectionModal}>
        <DialogContent className="sm:max-w-md bg-[#0f1525] border-primary/20">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-mono text-xl text-primary">
              <Server className="w-5 h-5" />
              Match bereit
            </DialogTitle>
            <DialogDescription>Verbinde dich mit dem Server:</DialogDescription>
          </DialogHeader>
          <div className="p-3 bg-black/40 rounded border border-white/[0.06] flex items-center justify-between">
            <code className="text-cyan-400 font-mono text-sm break-all">{connectionString}</code>
            <Button variant="ghost" size="icon" onClick={copyConnectionString} className="ml-2 h-8 w-8">
              <Copy className="w-4 h-4" />
            </Button>
          </div>
          {connectionString && (
            <a href={getSteamUrl(connectionString)} className="block">
              <Button className="w-full font-mono uppercase tracking-wider bg-emerald-600 hover:bg-emerald-700 text-white gap-2 h-10">
                <Play className="w-4 h-4 fill-current" />
                Server Beitreten
              </Button>
            </a>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
