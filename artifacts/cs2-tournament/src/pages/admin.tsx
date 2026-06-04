import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Eye, EyeOff, Lock, Settings, Users, Swords, LogOut } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import PlayerManagement from "@/components/player-management";
import BracketMapRoll from "@/components/bracket-map-roll";
import MapSetup from "@/components/map-setup";

const AUTH_KEY = "cs2_admin_auth";

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [role, setRole] = useState<"admin" | "streamer">("streamer");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
