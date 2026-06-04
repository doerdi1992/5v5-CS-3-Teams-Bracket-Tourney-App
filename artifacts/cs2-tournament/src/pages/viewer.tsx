import { useState, useEffect } from "react";
import { useGetPlayers, useRegisterViewer, getGetPlayersQueryKey, useGetBracket, getGetBracketQueryKey } from "@workspace/api-client-react";
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
  
  const registerMutation = useRegisterViewer();

  useEffect(() => {
    // 1. Check local storage for client id
    let storedClientId = localStorage.getItem("cs2_client_id");
    if (!storedClientId) {
      storedClientId = crypto.randomUUID();
      localStorage.setItem("cs2_client_id", storedClientId);
    }
    setClientId(storedClientId);

    // 2. Check local storage for player name
    const storedPlayerName = localStorage.getItem("cs2_player_name");
    if (storedPlayerName) {
      setPlayerName(storedPlayerName);
      setIsRegistered(true);
      // Emit register to link socket
      socket.emit("register", { clientId: storedClientId });
    }
  }, []);

  useEffect(() => {
    const handleBroadcast = (payload: { connectionString: string, teams: string[] }) => {
      // Find current player
      const currentPlayer = players?.find(p => p.name === playerName);
      if (currentPlayer && currentPlayer.team && payload.teams.includes(currentPlayer.team)) {
        setConnectionString(payload.connectionString);
        setShowConnectionModal(true);
      }
    };

    socket.on("server_broadcast", handleBroadcast);
    return () => {
      socket.off("server_broadcast", handleBroadcast);
    };
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
          toast({ title: "Registered Successfully", description: "Waiting for admin approval." });
        },
        onError: (err: any) => {
          toast({ variant: "destructive", title: "Registration Failed", description: err.message || "Something went wrong" });
        }
      }
    );
  };

  const copyConnectionString = () => {
    if (connectionString) {
      navigator.clipboard.writeText(connectionString);
      toast({ title: "Copied!", description: "Server connection string copied to clipboard." });
    }
  };

  const currentPlayer = players?.find(p => p.name === playerName);

  return (
    <div className="min-h-screen bg-background text-foreground p-6 flex flex-col items-center">
      <div className="max-w-4xl w-full space-y-8">
        <header className="text-center mb-12">
          <h1 className="text-4xl md:text-6xl font-bold tracking-tighter text-primary font-mono drop-shadow-sm">CS2_TOURNAMENT</h1>
          <p className="text-muted-foreground mt-2 tracking-widest uppercase text-sm">Operative Dashboard</p>
        </header>

        {!isRegistered ? (
          <Card className="max-w-md mx-auto border-primary/20 bg-card/50 backdrop-blur">
            <CardHeader>
              <CardTitle className="font-mono text-xl uppercase text-primary">Join Queue</CardTitle>
              <CardDescription>Enter your alias to join the tournament pool.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="space-y-2">
                  <Input 
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder="Enter Operative Name"
                    className="font-mono bg-background/50"
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full font-mono uppercase tracking-widest"
                  disabled={registerMutation.isPending}
                >
                  {registerMutation.isPending ? "Connecting..." : "Initialize"}
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            <Card className="border-primary/20 bg-card/50 backdrop-blur">
              <CardContent className="p-6">
                <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                  <div className="space-y-1 text-center md:text-left">
                    <p className="text-sm font-mono text-muted-foreground uppercase">Current Operative</p>
                    <h2 className="text-3xl font-bold font-mono">{playerName}</h2>
                    <div className="mt-2 flex gap-2 justify-center md:justify-start">
                      <Badge variant={currentPlayer?.status === 'accepted' ? 'default' : 'secondary'} className="uppercase">
                        Status: {currentPlayer?.status || 'PENDING'}
                      </Badge>
                      {currentPlayer?.flagged && (
                        <Badge variant="destructive" className="uppercase">High Skill</Badge>
                      )}
                    </div>
                  </div>
                  
                  <div className="text-center md:text-right border border-border p-4 rounded-lg bg-background/50 min-w-[200px]">
                    <p className="text-sm font-mono text-muted-foreground uppercase mb-1">Squad Assignment</p>
                    <div className="text-5xl font-black text-primary drop-shadow-[0_0_8px_rgba(249,115,22,0.5)]">
                      {currentPlayer?.team ? `TEAM ${currentPlayer.team}` : '--'}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Bracket Preview */}
            <Card className="border-border/50 bg-card/30">
              <CardHeader>
                <CardTitle className="font-mono text-xl uppercase text-secondary">Live Bracket Intel</CardTitle>
              </CardHeader>
              <CardContent>
                {bracket ? (
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className={`p-4 border rounded-lg ${bracket.currentMatch === 1 ? 'border-primary shadow-[0_0_15px_rgba(249,115,22,0.2)]' : 'border-border'}`}>
                      <h3 className="font-mono text-sm text-muted-foreground mb-2">MATCH 1</h3>
                      <div className="flex justify-between items-center text-lg font-bold">
                        <span className={bracket.match1Winner === 'A' ? 'text-primary' : ''}>TEAM A</span>
                        <span className="text-muted-foreground text-xs">VS</span>
                        <span className={bracket.match1Winner === 'B' ? 'text-primary' : ''}>TEAM B</span>
                      </div>
                      {bracket.match1Winner && (
                        <div className="mt-2 text-center text-xs font-mono text-primary">WINNER: TEAM {bracket.match1Winner}</div>
                      )}
                    </div>
                    <div className={`p-4 border rounded-lg ${bracket.currentMatch === 2 ? 'border-primary shadow-[0_0_15px_rgba(249,115,22,0.2)]' : 'border-border'}`}>
                      <h3 className="font-mono text-sm text-muted-foreground mb-2">MATCH 2</h3>
                      <div className="flex justify-between items-center text-lg font-bold">
                        <span className={bracket.match2Winner === bracket.match2?.split(' ')[0] ? 'text-primary' : ''}>{bracket.match2?.split(' ')[0] || '?'}</span>
                        <span className="text-muted-foreground text-xs">VS</span>
                        <span className={bracket.match2Winner === bracket.match2?.split(' ')[2] ? 'text-primary' : ''}>{bracket.match2?.split(' ')[2] || '?'}</span>
                      </div>
                      {bracket.match2Winner && (
                        <div className="mt-2 text-center text-xs font-mono text-primary">WINNER: TEAM {bracket.match2Winner}</div>
                      )}
                    </div>
                    <div className={`p-4 border rounded-lg ${bracket.currentMatch === 3 ? 'border-primary shadow-[0_0_15px_rgba(249,115,22,0.2)]' : 'border-border'}`}>
                      <h3 className="font-mono text-sm text-muted-foreground mb-2">MATCH 3</h3>
                      <div className="flex justify-between items-center text-lg font-bold">
                        <span className={bracket.match3Winner === bracket.match3?.split(' ')[0] ? 'text-primary' : ''}>{bracket.match3?.split(' ')[0] || '?'}</span>
                        <span className="text-muted-foreground text-xs">VS</span>
                        <span className={bracket.match3Winner === bracket.match3?.split(' ')[2] ? 'text-primary' : ''}>{bracket.match3?.split(' ')[2] || '?'}</span>
                      </div>
                      {bracket.match3Winner && (
                        <div className="mt-2 text-center text-xs font-mono text-primary">WINNER: TEAM {bracket.match3Winner}</div>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center font-mono">NO ACTIVE BRACKET</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <Dialog open={showConnectionModal} onOpenChange={setShowConnectionModal}>
        <DialogContent className="sm:max-w-md border-primary shadow-[0_0_30px_rgba(249,115,22,0.1)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-mono text-2xl text-primary">
              <Server className="w-6 h-6" />
              MATCH READY
            </DialogTitle>
            <DialogDescription className="text-lg">
              Your match is ready. Connect to the server below:
            </DialogDescription>
          </DialogHeader>
          <div className="p-4 bg-black/50 rounded-md border border-border mt-4 flex items-center justify-between">
            <code className="text-secondary font-mono text-sm break-all">{connectionString}</code>
            <Button variant="ghost" size="icon" onClick={copyConnectionString} className="ml-2 hover:text-primary">
              <Copy className="w-4 h-4" />
            </Button>
          </div>
          <Button onClick={() => setShowConnectionModal(false)} className="w-full mt-4 font-mono">ACKNOWLEDGE</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
