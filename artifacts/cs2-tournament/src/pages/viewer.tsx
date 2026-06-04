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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Copy, Server } from "lucide-react";

export default function ViewerPage() {
  const { toast } = useToast();
  const [clientId, setClientId] = useState<string>("");
  const [playerName, setPlayerName] = useState<string>("");
  const [isRegistered, setIsRegistered] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [connectionString, setConnectionString] = useState<string | null>(null);
  const [showConnectionModal, setShowConnectionModal] = useState(false);

  const { data: players } = useGetPlayers({ query: { queryKey: getGetPlayersQueryKey() } });
  const { data: bracket } = useGetBracket({ query: { queryKey: getGetBracketQueryKey() } });
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
        setShowConnectionModal(true);
      }
    };
    socket.on("server_broadcast", handleBroadcast);
    return () => { socket.off("server_broadcast", handleBroadcast); };
  }, [players, playerName]);

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameInput.trim()) return;
    registerMutation.mutate(
      { data: { name: nameInput, clientId } },
      {
        onSuccess: () => {
          localStorage.setItem("cs2_player_name", nameInput);
          setPlayerName(nameInput);
          setIsRegistered(true);
          socket.emit("register", { clientId });
          toast({ title: "Erfolgreich angemeldet", description: "Warte auf Admin-Freigabe." });
        },
        onError: (err: unknown) => {
          toast({ variant: "destructive", title: "Anmeldung fehlgeschlagen", description: err instanceof Error ? err.message : "Fehler" });
        },
      }
    );
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

  return (
    <div className="min-h-screen bg-background text-foreground p-6 flex flex-col items-center">
      <div className="max-w-4xl w-full space-y-8">
        <header className="text-center mb-12">
          <h1 className="text-4xl md:text-6xl font-bold tracking-tighter text-primary font-mono drop-shadow-sm">Janaxf 5v5 CS2 Tunier</h1>
          <p className="text-muted-foreground mt-2 tracking-widest uppercase text-sm">Spieler-Portal</p>
        </header>

        {!isRegistered ? (
          <Card className="max-w-md mx-auto border-primary/20 bg-card/50 backdrop-blur">
            <CardHeader>
              <CardTitle className="font-mono text-xl uppercase text-primary">Warteschlange beitreten</CardTitle>
              <CardDescription>Kampfname eingeben, um am Turnier teilzunehmen.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleRegister} className="space-y-4">
                <Input value={nameInput} onChange={(e) => setNameInput(e.target.value)} placeholder="Kampfname eingeben..." className="font-mono bg-background/50" />
                <Button type="submit" className="w-full font-mono uppercase tracking-widest" disabled={registerMutation.isPending}>
                  {registerMutation.isPending ? "Verbinde..." : "Anmelden"}
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
                    <div className="mt-2 flex gap-2 justify-center md:justify-start flex-wrap">
                      <Badge variant={me?.status === "accepted" ? "default" : "secondary"} className="uppercase">
                        {me?.status === "accepted" ? "Akzeptiert" : me?.status === "rejected" ? "Abgelehnt" : "Ausstehend"}
                      </Badge>
                      {me?.flagged && <Badge variant="destructive" className="uppercase">Profi</Badge>}
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

            {/* Live Bracket */}
            <Card className="border-border/50 bg-card/30">
              <CardHeader>
                <CardTitle className="font-mono text-xl uppercase text-secondary">Live-Bracket</CardTitle>
              </CardHeader>
              <CardContent>
                {bracket ? (
                  <>
                    <div className="grid gap-4 md:grid-cols-3 mb-6">
                      {[
                        { label: "Partie 1", num: 1, left: "TEAM A", right: "TEAM B", winner: bracket.match1Winner, lTeam: "A", rTeam: "B" },
                        { label: "Partie 2", num: 2, left: bracket.match2 ? `TEAM ${bracket.match2.split(" ")[0]}` : "?", right: bracket.match2 ? `TEAM ${bracket.match2.split(" ")[2]}` : "?", winner: bracket.match2Winner, lTeam: bracket.match2?.split(" ")[0] ?? null, rTeam: bracket.match2?.split(" ")[2] ?? null },
                        { label: "Finale", num: 3, left: bracket.match3 ? `TEAM ${bracket.match3.split(" ")[0]}` : "?", right: bracket.match3 ? `TEAM ${bracket.match3.split(" ")[2]}` : "?", winner: bracket.match3Winner, lTeam: bracket.match3?.split(" ")[0] ?? null, rTeam: bracket.match3?.split(" ")[2] ?? null },
                      ].map(({ label, num, left, right, winner, lTeam, rTeam }) => (
                        <div key={label} className={`p-4 border rounded-lg ${bracket.currentMatch === num ? "border-primary shadow-[0_0_15px_rgba(249,115,22,0.2)]" : "border-border"}`}>
                          <h3 className="font-mono text-sm text-muted-foreground mb-2 uppercase">{label}</h3>
                          <div className="flex justify-between items-center text-lg font-bold">
                            <span className={winner === lTeam && winner ? "text-primary" : ""}>{left}</span>
                            <span className="text-muted-foreground text-xs">VS</span>
                            <span className={winner === rTeam && winner ? "text-primary" : ""}>{right}</span>
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
          <div className="p-4 bg-black/50 rounded-md border border-border mt-4 flex items-center justify-between">
            <code className="text-secondary font-mono text-sm break-all">{connectionString}</code>
            <Button variant="ghost" size="icon" onClick={copyConnectionString} className="ml-2 hover:text-primary">
              <Copy className="w-4 h-4" />
            </Button>
          </div>
          <Button onClick={() => setShowConnectionModal(false)} className="w-full mt-4 font-mono uppercase tracking-widest">Bestätigen</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
