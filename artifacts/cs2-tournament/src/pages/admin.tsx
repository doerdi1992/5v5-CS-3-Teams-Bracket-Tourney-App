import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Eye, EyeOff, Lock, Settings } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import PlayerManagement from "@/components/player-management";
import BracketMapRoll from "@/components/bracket-map-roll";
import MapSetup from "@/components/map-setup";

const AUTH_KEY = "cs2_admin_auth";

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(AUTH_KEY) === "1") setAuthed(true);
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
        sessionStorage.setItem(AUTH_KEY, "1");
        sessionStorage.setItem("cs2_admin_password", password);
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

  if (!authed) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        <Card className="w-full max-w-sm border-primary/30 bg-card/80 backdrop-blur">
          <CardHeader className="text-center space-y-2 pb-2">
            <div className="flex justify-center mb-2">
              <div className="w-12 h-12 rounded-full border-2 border-primary/40 flex items-center justify-center bg-primary/10">
                <Lock className="w-6 h-6 text-primary" />
              </div>
            </div>
            <CardTitle className="font-mono text-2xl text-primary tracking-widest uppercase">Admin-Zugang</CardTitle>
            <CardDescription className="font-mono text-xs uppercase tracking-widest">Passwort erforderlich</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4 mt-4">
              <div className="relative">
                <Input
                  type={showPw ? "text" : "password"}
                  placeholder="Passwort eingeben..."
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="font-mono pr-10 bg-background/60 border-border/60 focus-visible:ring-primary"
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
              <Button type="submit" className="w-full font-mono uppercase tracking-widest" disabled={!password || loading}>
                {loading ? "Prüfen..." : "Anmelden"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-6 relative overflow-x-hidden">
      {/* Decorative ambient background glows */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[250px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-0 right-1/4 w-[500px] h-[250px] bg-secondary/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-6xl mx-auto space-y-6 relative z-10">
        <header className="relative w-full rounded-2xl glass p-6 mb-8 border border-primary/20 overflow-hidden shadow-[0_4px_30px_rgba(0,0,0,0.4)]">
          {/* Subtle top accent line */}
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

          <div className="flex flex-col sm:flex-row items-center justify-between gap-6 relative z-10">
            {/* Title block */}
            <div className="text-center sm:text-left space-y-1">
              <div className="flex items-center justify-center sm:justify-start gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_#ef4444]" />
                <span className="text-[10px] font-mono tracking-widest text-red-500 uppercase font-black">Admin Mode</span>
              </div>
              <h1 className="text-2xl md:text-3xl font-black tracking-wider text-primary font-mono uppercase bg-gradient-to-r from-primary via-orange-400 to-primary bg-clip-text text-transparent drop-shadow-[0_0_12px_rgba(249,115,22,0.25)]">
                ADMIN_KONSOLE
              </h1>
              <p className="text-muted-foreground font-mono uppercase text-[10px] tracking-[0.15em]">
                Janaxf 5v5 CS2 Turnier-Verwaltung
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-3">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="font-mono text-xs gap-1.5 h-9 px-4 border-border/60 hover:border-primary/50 hover:bg-primary/5 transition-all">
                    <Settings className="w-4 h-4 text-muted-foreground" />
                    Einstellungen
                  </Button>
                </SheetTrigger>
                <SheetContent className="sm:max-w-2xl w-[600px] overflow-y-auto bg-background border-l border-border p-6">
                  <SheetHeader className="mb-6">
                    <SheetTitle className="font-mono text-xl uppercase text-primary">Einstellungen</SheetTitle>
                  </SheetHeader>
                  <MapSetup />
                </SheetContent>
              </Sheet>

              <Button
                variant="ghost"
                size="sm"
                className="font-mono text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-9 px-4 transition-all"
                onClick={() => { sessionStorage.removeItem(AUTH_KEY); setAuthed(false); }}
              >
                Abmelden
              </Button>
            </div>
          </div>
          
          {/* Decorative tactical watermark background */}
          <div className="absolute right-4 bottom-0 opacity-[0.03] pointer-events-none select-none text-[80px] font-mono font-black tracking-widest leading-none">
            HQ
          </div>
        </header>

        <Tabs defaultValue="players" className="w-full">
          <TabsList className="grid w-full grid-cols-2 max-w-md mb-6 bg-card border border-border">
            <TabsTrigger value="players" className="font-mono uppercase text-xs data-[state=active]:text-primary data-[state=active]:bg-background">Spielerverwaltung</TabsTrigger>
            <TabsTrigger value="bracket" className="font-mono uppercase text-xs data-[state=active]:text-secondary data-[state=active]:bg-background">Bracket & Karten</TabsTrigger>
          </TabsList>

          <TabsContent value="players" className="animate-in fade-in-50 zoom-in-95 duration-200">
            <PlayerManagement />
          </TabsContent>

          <TabsContent value="bracket" className="animate-in fade-in-50 zoom-in-95 duration-200">
            <BracketMapRoll />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
