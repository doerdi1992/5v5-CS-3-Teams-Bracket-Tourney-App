import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Eye, EyeOff, Lock, Settings, Users, Swords, LogOut, Loader2, User, Link2, Check, Play } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { useGetFullState, getGetFullStateQueryKey } from "@workspace/api-client-react";
import PlayerManagement from "@/components/player-management";
import BracketMapRoll from "@/components/bracket-map-roll";
import MapSetup from "@/components/map-setup";

const AUTH_KEY = "cs2_admin_auth";

function StreamerSteamLink({ activeServerDetails, isStreamerPlaying, getSteamUrl }: { activeServerDetails?: string | null; isStreamerPlaying: boolean; getSteamUrl: (connStr: string | null) => string }) {
  const { toast } = useToast();
  const [steamId, setSteamId] = useState<string>(() => localStorage.getItem("cs2_streamer_steam_id") || "");
  const [steamName, setSteamName] = useState<string>(() => localStorage.getItem("cs2_streamer_name") || "");
  const [inputVal, setInputVal] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLink = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = inputVal.trim();
    if (!query) return;

    setLoading(true);
    let resolvedId = "";
    let resolvedName = "Streamer";

    try {
      const res = await fetch(`/api/players/resolve-steam?input=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json() as { steamId?: string; steamName?: string };
        if (data.steamId) {
          resolvedId = data.steamId;
          resolvedName = data.steamName || "Streamer";
        }
      }
    } catch (err) {
      console.warn("Failed to resolve steam id", err);
    }

    if (!resolvedId) {
      if (/^\d{17}$/.test(query)) {
        resolvedId = query;
        resolvedName = "Streamer";
      } else {
        toast({
          variant: "destructive",
          title: "Fehler",
          description: "Steam-Profil-Link oder 17-stellige SteamID64 ungültig."
        });
        setLoading(false);
        return;
      }
    }

    try {
      const res = await fetch("/api/players/verify-streamer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steamId: resolvedId, name: resolvedName })
      });
      if (res.ok) {
        localStorage.setItem("cs2_streamer_steam_id", resolvedId);
        localStorage.setItem("cs2_streamer_name", resolvedName);
        setSteamId(resolvedId);
        setSteamName(resolvedName);
        setInputVal("");
        toast({
          title: "Erfolgreich verknüpft!",
          description: `Du bist jetzt als spielender Streamer (${resolvedName}) registriert.`
        });
      } else {
        const err = await res.json() as { error?: string };
        toast({
          variant: "destructive",
          title: "Fehler",
          description: err.error || "Flaggen als Streamer fehlgeschlagen."
        });
      }
    } catch {
      toast({
        variant: "destructive",
        title: "Verbindungsfehler",
        description: "Die Verbindung zum Server ist fehlgeschlagen."
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUnlink = () => {
    localStorage.removeItem("cs2_streamer_steam_id");
    localStorage.removeItem("cs2_streamer_name");
    setSteamId("");
    setSteamName("");
    toast({
      title: "Verbindung getrennt",
      description: "Deine Steam-ID wurde lokal entfernt."
    });
  };

  return (
    <Card className="bg-[#0f1525]/60 backdrop-blur-xl border-white/[0.06] p-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-[0_4px_30px_rgba(0,0,0,0.2)]">
      {steamId ? (
        <>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30">
              <User className="w-5 h-5 text-primary" />
            </div>
            <div className="font-mono">
              <div className="flex items-center gap-2">
                <span className="font-bold text-white/95">{steamName}</span>
                <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20 uppercase">Streamer & Spieler</span>
                {isStreamerPlaying && activeServerDetails && (
                  <a href={getSteamUrl(activeServerDetails)}>
                    <Button size="sm" className="h-6 font-mono text-[9px] uppercase tracking-wider bg-emerald-600 hover:bg-emerald-700 text-white py-0.5 px-2.5 ml-2 gap-1 flex items-center">
                      <Play className="w-2.5 h-2.5 fill-current" />
                      Server Beitreten
                    </Button>
                  </a>
                )}
              </div>
              <p className="text-xs text-muted-foreground/60">{steamId}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleUnlink} className="font-mono text-xs uppercase text-red-400 hover:text-red-300 hover:bg-red-500/5 h-9">
            Trennen
          </Button>
        </>
      ) : (
        <form onSubmit={handleLink} className="flex flex-col sm:flex-row items-center gap-3 w-full">
          <div className="flex-shrink-0 text-center sm:text-left">
            <h4 className="font-mono text-sm font-bold text-white/90">Spielst du selbst mit?</h4>
            <p className="font-mono text-[10px] text-muted-foreground/50">Trage deine Steam-ID ein, um dem Server beizutreten</p>
          </div>
          <div className="flex items-center gap-2 flex-1 w-full">
            <Input
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              placeholder="Steam-Profil-Link oder SteamID64..."
              className="font-mono bg-black/40 border-white/[0.06] h-10 flex-1 text-sm placeholder:text-muted-foreground/30 focus-visible:ring-primary/40 focus-visible:border-primary/30"
            />
            <Button type="submit" disabled={loading || !inputVal.trim()} className="font-mono uppercase text-xs h-10 px-4 bg-primary hover:bg-primary/90">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verbinden"}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [role, setRole] = useState<"admin" | "streamer">("streamer");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { data: fullState } = useGetFullState({ query: { queryKey: getGetFullStateQueryKey(), enabled: authed } });
  const bracket = fullState?.bracket as any;
  const players = (fullState as any)?.players || [];
  const activeServerDetails = bracket?.activeServerDetails;
  const streamerSteamId = localStorage.getItem("cs2_streamer_steam_id");

  const currentTeams =
    bracket?.currentMatch === 1 ? ["A", "B"]
    : bracket?.currentMatch === 2 ? (bracket.match1Winner === "A" ? ["B", "C"] : ["A", "C"])
    : bracket?.currentMatch === 3 ? (bracket.match1Winner === "A" ? ["A", "C"] : ["B", "C"])
    : bracket?.currentMatch === 4 && bracket.match4 ? [bracket.match4.split(" ")[0], bracket.match4.split(" ")[2]]
    : [];

  const streamerPlayer = streamerSteamId ? players.find((p: any) => p.steamId === streamerSteamId) : null;
  const isStreamerPlaying = !!(streamerPlayer?.team && currentTeams.includes(streamerPlayer.team));

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

  const showHeaderJoinButton = activeServerDetails && (role === "admin" || (role === "streamer" && isStreamerPlaying));

  useEffect(() => {
    if (sessionStorage.getItem(AUTH_KEY) === "1") {
      setAuthed(true);
      setRole((sessionStorage.getItem("cs2_admin_role") as "admin" | "streamer") || "streamer");
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        const data = await res.json() as { role: "admin" | "streamer" };
        sessionStorage.setItem(AUTH_KEY, "1");
        sessionStorage.setItem("cs2_admin_password", password);
        sessionStorage.setItem("cs2_admin_role", data.role);
        setRole(data.role);
        setAuthed(true);
      } else {
        const data = await res.json() as { message?: string };
        setError(data.message ?? "Falsches Passwort");
      }
    } catch {
      setError("Verbindungsfehler");
    } finally {
      setLoading(false);
    }
  };

  // ─── LOGIN SCREEN ──────────────────────────────────────────
  if (!authed) {
    return (
      <div className="min-h-screen bg-[#0a0e1a] text-foreground flex items-center justify-center p-6 relative overflow-hidden">
        {/* Background ambient */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-primary/8 rounded-full blur-[150px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[200px] bg-cyan-500/5 rounded-full blur-[120px] pointer-events-none" />

        <Card className="w-full max-w-sm border-primary/20 bg-[#0f1525]/80 backdrop-blur-xl shadow-[0_8px_40px_rgba(0,0,0,0.5)]">
          <CardHeader className="text-center space-y-3 pb-2">
            <div className="flex justify-center mb-1">
              <div className="w-14 h-14 rounded-2xl border border-primary/30 flex items-center justify-center bg-gradient-to-br from-primary/20 to-orange-600/10 shadow-[0_0_20px_rgba(249,115,22,0.15)]">
                <Lock className="w-7 h-7 text-primary" />
              </div>
            </div>
            <CardTitle className="font-mono text-xl text-primary tracking-[0.2em] uppercase font-black">
              Turnier-Konsole
            </CardTitle>
            <CardDescription className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground/70">
              Passwort erforderlich
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4 mt-2">
              <div className="relative">
                <Input
                  type={showPw ? "text" : "password"}
                  placeholder="Passwort eingeben..."
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="font-mono pr-10 bg-black/40 border-border/40 focus-visible:ring-primary/50 h-11"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowPw((v) => !v)}
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {error && <p className="font-mono text-xs text-destructive text-center tracking-wider">{error}</p>}
              <Button
                type="submit"
                className="w-full font-mono uppercase tracking-[0.2em] h-11 bg-gradient-to-r from-primary to-orange-600 hover:from-primary/90 hover:to-orange-500 text-white shadow-[0_4px_20px_rgba(249,115,22,0.3)]"
                disabled={!password || loading}
              >
                {loading ? "Prüfen..." : "Anmelden"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── TURNIER KONSOLE ───────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0a0e1a] text-foreground p-4 md:p-6 relative overflow-x-hidden">
      {/* Background ambient glows */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[250px] bg-primary/6 rounded-full blur-[150px] pointer-events-none" />
      <div className="absolute top-0 right-1/4 w-[400px] h-[200px] bg-cyan-500/4 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-1/2 w-[600px] h-[200px] bg-purple-500/3 rounded-full blur-[150px] pointer-events-none" />

      <div className="max-w-6xl mx-auto space-y-5 relative z-10">
        {/* ── Header ────────────────────────────────────────── */}
        <header className="relative w-full rounded-xl bg-[#0f1525]/60 backdrop-blur-xl p-5 border border-white/[0.06] overflow-hidden shadow-[0_4px_30px_rgba(0,0,0,0.4)]">
          {/* Top accent */}
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 relative z-10">
            {/* Title */}
            <div className="text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981] animate-pulse" />
                <span className="text-[9px] font-mono tracking-[0.2em] text-emerald-500/80 uppercase font-bold">
                  Live System
                </span>
              </div>
              <h1 className="text-xl md:text-2xl font-black tracking-[0.15em] font-mono uppercase text-white/90">
                Janaxf <span className="text-primary">5v5</span> CS2 Turnier
              </h1>
            </div>

            {/* Action bar */}
            <div className="flex items-center gap-2">

              {/* Server join button if ready (admin always, streamer if playing) */}
              {showHeaderJoinButton && (
                <a href={getSteamUrl(activeServerDetails)}>
                  <Button size="sm" className="font-mono text-[10px] uppercase tracking-wider bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 h-8">
                    <Play className="w-3.5 h-3.5 fill-current" />
                    Server Beitreten
                  </Button>
                </a>
              )}

              {/* Settings (admin only) */}
              {role === "admin" && (
                <Sheet>
                  <SheetTrigger asChild>
                    <Button variant="ghost" size="sm" className="font-mono text-[10px] uppercase tracking-wider gap-1.5 h-8 text-muted-foreground/60 hover:text-primary hover:bg-primary/5">
                      <Settings className="w-3.5 h-3.5" />
                      Setup
                    </Button>
                  </SheetTrigger>
                  <SheetContent className="sm:max-w-2xl w-[600px] overflow-y-auto bg-[#0a0e1a] border-l border-white/[0.06] p-6">
                    <SheetHeader className="mb-6">
                      <SheetTitle className="font-mono text-xl uppercase text-primary tracking-wider">Server & Einstellungen</SheetTitle>
                    </SheetHeader>
                    <MapSetup />
                  </SheetContent>
                </Sheet>
              )}

              {/* Logout */}
              <Button
                variant="ghost"
                size="sm"
                className="font-mono text-[10px] uppercase tracking-wider gap-1.5 h-8 text-muted-foreground/40 hover:text-red-400 hover:bg-red-500/5"
                onClick={() => { sessionStorage.removeItem(AUTH_KEY); setAuthed(false); }}
              >
                <LogOut className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </header>

        {role === "streamer" && (
          <StreamerSteamLink
            activeServerDetails={activeServerDetails}
            isStreamerPlaying={isStreamerPlaying}
            getSteamUrl={getSteamUrl}
          />
        )}

        {/* ── Tabs ───────────────────────────────────────────── */}
        <Tabs defaultValue="bracket" className="w-full">
          <TabsList className="w-full max-w-lg mx-auto grid grid-cols-2 mb-5 bg-[#0f1525]/60 backdrop-blur border border-white/[0.06] rounded-lg h-10">
            <TabsTrigger
              value="bracket"
              className="font-mono uppercase text-[11px] tracking-wider gap-1.5 rounded-md data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-[0_0_12px_rgba(249,115,22,0.1)]"
            >
              <Swords className="w-3.5 h-3.5" />
              Bracket & Karten
            </TabsTrigger>
            <TabsTrigger
              value="players"
              className="font-mono uppercase text-[11px] tracking-wider gap-1.5 rounded-md data-[state=active]:bg-cyan-500/10 data-[state=active]:text-cyan-400 data-[state=active]:shadow-[0_0_12px_rgba(6,182,212,0.1)]"
            >
              <Users className="w-3.5 h-3.5" />
              Spielerverwaltung
            </TabsTrigger>
          </TabsList>

          <TabsContent value="bracket" className="animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
            <BracketMapRoll />
          </TabsContent>

          <TabsContent value="players" className="animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
            <PlayerManagement />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
