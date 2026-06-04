import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Eye, EyeOff, Lock } from "lucide-react";
import PlayerManagement from "@/components/player-management";
import BracketMapRoll from "@/components/bracket-map-roll";

const AUTH_KEY = "cs2_admin_auth";

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(AUTH_KEY) === "1") {
      setAuthed(true);
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
        sessionStorage.setItem(AUTH_KEY, "1");
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

              {error && (
                <p className="font-mono text-xs text-destructive text-center tracking-wider">{error}</p>
              )}

              <Button
                type="submit"
                className="w-full font-mono uppercase tracking-widest"
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

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="mb-8 border-b border-border pb-4 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tighter text-primary font-mono">ADMIN_KONSOLE</h1>
            <p className="text-muted-foreground font-mono uppercase text-sm mt-1">CS2 Turnier-Verwaltung</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="font-mono text-xs text-muted-foreground hover:text-destructive"
            onClick={() => { sessionStorage.removeItem(AUTH_KEY); setAuthed(false); }}
          >
            Abmelden
          </Button>
        </header>

        <Tabs defaultValue="players" className="w-full">
          <TabsList className="grid w-full grid-cols-2 max-w-md mb-6 bg-card border border-border">
            <TabsTrigger value="players" className="font-mono uppercase data-[state=active]:text-primary data-[state=active]:bg-background">Spielerverwaltung</TabsTrigger>
            <TabsTrigger value="bracket" className="font-mono uppercase data-[state=active]:text-secondary data-[state=active]:bg-background">Bracket & Karten</TabsTrigger>
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
