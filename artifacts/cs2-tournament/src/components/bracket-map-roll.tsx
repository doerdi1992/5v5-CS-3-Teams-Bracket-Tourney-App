import { useState } from "react";
import { useGetBracket, useSetMatchWinner, useResetBracket, useRollMap, useBroadcastServer, getGetBracketQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Badge, Dices, RefreshCw, Send, Trophy } from "lucide-react";

export default function BracketMapRoll() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: bracket } = useGetBracket({ query: { queryKey: getGetBracketQueryKey() } });
  
  const [mapPool, setMapPool] = useState("Mirage, Inferno, Dust2, Nuke, Overpass, Anubis, Vertigo, Ancient");
  const [connectionString, setConnectionString] = useState("");
  const [isSpinning, setIsSpinning] = useState(false);

  const setWinnerMut = useSetMatchWinner();
  const resetBracketMut = useResetBracket();
  const rollMapMut = useRollMap();
  const broadcastMut = useBroadcastServer();

  const handleSetWinner = (winner: "A" | "B" | "C") => {
    setWinnerMut.mutate(
      { data: { winner } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetBracketQueryKey() });
        }
      }
    );
  };

  const handleResetBracket = () => {
    resetBracketMut.mutate(undefined, {
      onSuccess: () => {
        toast({ title: "Bracket Reset", description: "Tournament state cleared." });
        queryClient.invalidateQueries({ queryKey: getGetBracketQueryKey() });
      }
    });
  };

  const handleRollMap = () => {
    const maps = mapPool.split(/[,n]+/).map(m => m.trim()).filter(m => m);
    if (maps.length === 0) return;
    
    setIsSpinning(true);
    
    // Simulate spin effect
    setTimeout(() => {
      rollMapMut.mutate(
        { data: { maps } },
        {
          onSuccess: (data) => {
            setIsSpinning(false);
            queryClient.invalidateQueries({ queryKey: getGetBracketQueryKey() });
          },
          onError: () => setIsSpinning(false)
        }
      );
    }, 1500);
  };

  const handleBroadcast = () => {
    if (!connectionString.trim()) return;
    
    broadcastMut.mutate(
      { data: { connectionString } },
      {
        onSuccess: () => {
          toast({ title: "Broadcast Sent", description: "Connection string delivered to active teams." });
          setConnectionString("");
        }
      }
    );
  };

  const getMatchTeams = (matchString: string | null | undefined): string[] => {
    if (!matchString) return [];
    // Expected format "A vs B"
    const parts = matchString.split(" ");
    if (parts.length >= 3) {
      return [parts[0], parts[2]];
    }
    return [];
  };

  const currentTeams = bracket?.currentMatch === 1 ? getMatchTeams(bracket?.match1) :
                       bracket?.currentMatch === 2 ? getMatchTeams(bracket?.match2) :
                       bracket?.currentMatch === 3 ? getMatchTeams(bracket?.match3) : [];

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Bracket Logic */}
      <div className="space-y-6">
        <Card className="border-border/50">
          <CardHeader className="flex flex-row justify-between items-center">
            <CardTitle className="font-mono text-primary flex items-center gap-2">
              <Trophy className="w-5 h-5" />
              TOURNAMENT BRACKET
            </CardTitle>
            <Button variant="outline" size="sm" onClick={handleResetBracket} disabled={resetBracketMut.isPending}>
              <RefreshCw className="w-4 h-4 mr-2" />
              RESET
            </Button>
          </CardHeader>
          <CardContent>
            {bracket ? (
              <div className="space-y-4">
                <div className={`p-4 border rounded-md relative overflow-hidden ${bracket.currentMatch === 1 ? 'border-primary bg-primary/5' : 'border-border/50'}`}>
                  {bracket.currentMatch === 1 && <div className="absolute top-0 left-0 w-1 h-full bg-primary animate-pulse" />}
                  <div className="flex justify-between items-center font-mono">
                    <span className="text-muted-foreground text-sm">MATCH 1</span>
                    {bracket.match1Winner && <Badge variant="default" className="bg-primary/20 text-primary hover:bg-primary/30">WINNER: {bracket.match1Winner}</Badge>}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xl font-bold">
                    <span className={bracket.match1Winner === 'A' ? 'text-primary' : ''}>TEAM A</span>
                    <span className="text-muted-foreground text-sm px-4">VS</span>
                    <span className={bracket.match1Winner === 'B' ? 'text-primary' : ''}>TEAM B</span>
                  </div>
                </div>

                <div className={`p-4 border rounded-md relative overflow-hidden ${bracket.currentMatch === 2 ? 'border-primary bg-primary/5' : 'border-border/50'}`}>
                  {bracket.currentMatch === 2 && <div className="absolute top-0 left-0 w-1 h-full bg-primary animate-pulse" />}
                  <div className="flex justify-between items-center font-mono">
                    <span className="text-muted-foreground text-sm">MATCH 2</span>
                    {bracket.match2Winner && <Badge variant="default" className="bg-primary/20 text-primary hover:bg-primary/30">WINNER: {bracket.match2Winner}</Badge>}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xl font-bold">
                    <span className={bracket.match2Winner === bracket.match2?.split(' ')[0] ? 'text-primary' : ''}>{bracket.match2?.split(' ')[0] || '?'}</span>
                    <span className="text-muted-foreground text-sm px-4">VS</span>
                    <span className={bracket.match2Winner === bracket.match2?.split(' ')[2] ? 'text-primary' : ''}>{bracket.match2?.split(' ')[2] || '?'}</span>
                  </div>
                </div>

                <div className={`p-4 border rounded-md relative overflow-hidden ${bracket.currentMatch === 3 ? 'border-primary bg-primary/5' : 'border-border/50'}`}>
                  {bracket.currentMatch === 3 && <div className="absolute top-0 left-0 w-1 h-full bg-primary animate-pulse" />}
                  <div className="flex justify-between items-center font-mono">
                    <span className="text-muted-foreground text-sm">MATCH 3</span>
                    {bracket.match3Winner && <Badge variant="default" className="bg-primary/20 text-primary hover:bg-primary/30">WINNER: {bracket.match3Winner}</Badge>}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xl font-bold">
                    <span className={bracket.match3Winner === bracket.match3?.split(' ')[0] ? 'text-primary' : ''}>{bracket.match3?.split(' ')[0] || '?'}</span>
                    <span className="text-muted-foreground text-sm px-4">VS</span>
                    <span className={bracket.match3Winner === bracket.match3?.split(' ')[2] ? 'text-primary' : ''}>{bracket.match3?.split(' ')[2] || '?'}</span>
                  </div>
                </div>

                {bracket.currentMatch <= 3 && currentTeams.length > 0 && (
                  <div className="pt-4 border-t border-border mt-4">
                    <p className="font-mono text-sm text-muted-foreground mb-3 uppercase">Resolve Current Match</p>
                    <div className="flex gap-2">
                      {currentTeams.map(t => (
                        <Button 
                          key={t} 
                          className="flex-1 font-mono uppercase" 
                          variant="outline"
                          disabled={setWinnerMut.isPending}
                          onClick={() => handleSetWinner(t as "A" | "B" | "C")}
                        >
                          {t} WINS
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground font-mono">Bracket data unavailable.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Map & Broadcast */}
      <div className="space-y-6">
        <Card className="border-border/50 border-t-secondary border-t-2">
          <CardHeader>
            <CardTitle className="font-mono text-secondary">MAP SELECTOR</CardTitle>
            <CardDescription className="font-mono text-xs">Pool of available maps</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input 
              value={mapPool}
              onChange={(e) => setMapPool(e.target.value)}
              className="font-mono text-sm bg-background/50"
            />
            
            <div className="flex flex-col items-center justify-center p-6 border border-border/50 bg-black/40 rounded-lg min-h-[150px] relative overflow-hidden">
              {isSpinning && (
                <div className="absolute inset-0 bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(20,184,166,0.1)_10px,rgba(20,184,166,0.1)_20px)] animate-[bg-scroll_1s_linear_infinite]" style={{ backgroundSize: '200% 200%' }} />
              )}
              <div className={`text-4xl font-black font-mono tracking-widest uppercase transition-all duration-300 ${isSpinning ? 'scale-110 blur-[2px] opacity-70 text-secondary' : bracket?.rolledMap ? 'text-primary drop-shadow-[0_0_10px_rgba(249,115,22,0.5)] scale-100' : 'text-muted-foreground'}`}>
                {isSpinning ? "ROLLING..." : bracket?.rolledMap || "NO MAP"}
              </div>
            </div>

            <Button 
              className="w-full font-mono text-lg h-12" 
              onClick={handleRollMap}
              disabled={isSpinning || rollMapMut.isPending}
            >
              <Dices className="w-5 h-5 mr-2" />
              {isSpinning ? "CALCULATING..." : "SPIN MAP"}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-destructive/5 border-destructive/20">
          <CardHeader>
            <CardTitle className="font-mono text-destructive flex items-center gap-2">
              <Send className="w-5 h-5" />
              BROADCAST SERVER
            </CardTitle>
            <CardDescription className="font-mono text-xs">Send connection info to active teams</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input 
              placeholder="connect 192.168.1.1:27015; password xyz"
              value={connectionString}
              onChange={(e) => setConnectionString(e.target.value)}
              className="font-mono font-bold text-sm bg-black/50 border-destructive/30 focus-visible:ring-destructive"
            />
            <Button 
              variant="destructive" 
              className="w-full font-mono font-bold tracking-widest"
              onClick={handleBroadcast}
              disabled={!connectionString.trim() || broadcastMut.isPending}
            >
              TRANSMIT TO HUD
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
