import { useState } from "react";
import {
  useGetPlayers,
  useAddPlayers,
  useUpdatePlayer,
  useGetTeams,
  useRollTeams,
  useDeletePlayer,
  getGetPlayersQueryKey,
  getGetTeamsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Users, Check, X, ShieldAlert, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export default function PlayerManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [bulkInput, setBulkInput] = useState("");
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [singleName, setSingleName] = useState("");
  const [singleSteam, setSingleSteam] = useState("");
  const [isAddingSingle, setIsAddingSingle] = useState(false);

  const { data: players = [] } = useGetPlayers({ query: { queryKey: getGetPlayersQueryKey() } });
  const { data: teams } = useGetTeams({ query: { queryKey: getGetTeamsQueryKey() } });

  const addPlayersMut = useAddPlayers();
  const updatePlayerMut = useUpdatePlayer();
  const deletePlayerMut = useDeletePlayer();
  const rollTeamsMut = useRollTeams();

  const handleBulkAdd = () => {
    const names = bulkInput.split(/[\n,;]+/).map((n) => n.trim()).filter((n) => n);
    if (!names.length) return;
    addPlayersMut.mutate(
      { data: { names } },
      {
        onSuccess: () => {
          setBulkInput("");
          toast({
            title: "Spieler hinzugefügt",
            description: `${names.length} Spieler erfolgreich importiert.`,
          });
          queryClient.invalidateQueries({ queryKey: getGetPlayersQueryKey() });
        },
      }
    );
  };


  const handleAddSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = singleName.trim();
    if (!name) {
      toast({ variant: "destructive", title: "Name erforderlich", description: "Bitte gib einen Namen für den Spieler ein." });
      return;
    }

    let resolvedSteamId = singleSteam.trim();
    setIsAddingSingle(true);

    if (resolvedSteamId && !/^\d{17}$/.test(resolvedSteamId)) {
      try {
        const res = await fetch(`/api/players/resolve-steam?input=${encodeURIComponent(resolvedSteamId)}`);
        const data = await res.json() as { steamId?: string; error?: string };
        if (res.ok && data.steamId) {
          resolvedSteamId = data.steamId;
        } else {
          throw new Error(data.error || "Steam-ID konnte nicht aufgelöst werden.");
        }
      } catch (err: any) {
        toast({ variant: "destructive", title: "Fehler beim Auflösen der Steam-ID", description: err.message });
        setIsAddingSingle(false);
        return;
      }
    }

    try {
      const res = await fetch("/api/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, steamId: resolvedSteamId || undefined }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error || "Fehler beim Hinzufügen.");
      }
      toast({ title: "Spieler hinzugefügt", description: `${name} wurde als akzeptierter Spieler hinzugefügt.` });
      setSingleName("");
      setSingleSteam("");
      queryClient.invalidateQueries({ queryKey: getGetPlayersQueryKey() });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fehler", description: err.message });
    } finally {
      setIsAddingSingle(false);
    }
  };

  const setStatus = (id: string, status: "accepted" | "rejected") => {
    updatePlayerMut.mutate(
      { id, data: { status } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetPlayersQueryKey() }) }
    );
  };

  const toggleFlag = (id: string, current: boolean) => {
    updatePlayerMut.mutate(
      { id, data: { flagged: !current } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetPlayersQueryKey() }) }
    );
  };

  const handleDelete = (id: string) => {
    deletePlayerMut.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Spieler entfernt", description: "Spieler wurde gelöscht." });
          queryClient.invalidateQueries({ queryKey: getGetPlayersQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetTeamsQueryKey() });
        },
      }
    );
  };

  const handleRollTeams = () => {
    rollTeamsMut.mutate(undefined, {
      onSuccess: () => {
        toast({
          title: "Teams ausgelost",
          description: "Spieler wurden gleichmäßig auf die Teams verteilt.",
        });
        queryClient.invalidateQueries({ queryKey: getGetTeamsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetPlayersQueryKey() });
      },
    });
  };

  const pendingPlayers = players.filter((p) => p.status === "pending");
  const acceptedPlayers = players.filter((p) => p.status === "accepted");

  return (
    <div className="grid gap-6 md:grid-cols-12 items-stretch">
      {/* Left Column */}
      <div className="md:col-span-8 flex flex-col gap-6">
        {/* Large drafted active teams card */}
        {teams && (teams.A.length > 0 || teams.B.length > 0 || teams.C.length > 0) && (
          <Card className="border-border/50 border-t-primary border-t-2 animate-in fade-in slide-in-from-top-4 duration-300">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="font-mono text-primary uppercase text-sm tracking-wider">
                Aktive Teams Lineup
              </CardTitle>
              <Button
                onClick={handleRollTeams}
                disabled={rollTeamsMut.isPending || acceptedPlayers.length < 15}
                variant="outline"
                className="font-mono text-[10px] h-8 uppercase tracking-widest"
              >
                Neu auslosen
              </Button>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {(["A", "B", "C"] as const).map((t) => (
                  <div
                    key={t}
                    className="border border-border/50 rounded-xl p-5 bg-background/40 flex flex-col justify-between min-h-[280px] shadow-lg"
                  >
                    <div>
                      <div className="font-mono text-secondary font-black text-2xl mb-4 flex items-center justify-between border-b border-white/10 pb-3">
                        <span>TEAM {t}</span>
                        <Badge variant="outline" className="text-xs font-mono border-secondary/40 text-secondary px-2 py-0.5">
                          {teams[t].length}/5
                        </Badge>
                      </div>
                      <div className="space-y-2">
                        {teams[t].map((p) => (
                          <div
                            key={p.id}
                            className={`flex items-center justify-between px-4 py-2.5 rounded-xl bg-black/30 border border-white/5 shadow-inner ${
                              p.flagged ? "border-destructive/30 bg-destructive/5" : ""
                            }`}
                          >
                            <span className="font-mono text-sm md:text-base font-bold truncate max-w-[160px] text-foreground">
                              {p.name}
                            </span>
                            {p.flagged && (
                              <Badge
                                variant="destructive"
                                className="text-[10px] font-black font-mono px-1.5 py-0.5 uppercase tracking-wider scale-95"
                              >
                                GOAT
                              </Badge>
                            )}
                          </div>
                        ))}
                        {teams[t].length === 0 && (
                          <div className="text-center font-mono text-xs text-muted-foreground/40 py-12">
                            Leer
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="border-border/50 flex-1 flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="font-mono text-secondary">
              AKZEPTIERTE SPIELER ({acceptedPlayers.length})
            </CardTitle>
            <Button
              onClick={handleRollTeams}
              disabled={rollTeamsMut.isPending || acceptedPlayers.length < 15}
              variant="default"
              className="font-mono"
            >
              Teams auslosen (15 benötigt)
            </Button>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col min-h-0">
            <ScrollArea className="flex-1 pr-4 min-h-[300px]">
              <div className="space-y-2 mt-4">
                {acceptedPlayers.length === 0 ? (
                  <p className="text-sm text-muted-foreground font-mono">
                    Noch keine akzeptierten Spieler.
                  </p>
                ) : (
                  acceptedPlayers.map((player) => (
                    <div
                      key={player.id}
                      className="flex items-center justify-between p-3 border border-border/50 rounded-md bg-background/30 hover:bg-background/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col">
                          <span className="font-mono font-bold text-lg leading-tight">{player.name}</span>
                          {(player as any).steamId && (
                            <span className="font-mono text-[10px] text-muted-foreground mt-0.5">
                              Steam64 ID: {(player as any).steamId}
                            </span>
                          )}
                        </div>
                        {player.team && (
                          <Badge
                            variant="outline"
                            className="font-mono text-primary border-primary/50"
                          >
                            Team {player.team}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <label
                            className="text-xs font-mono text-muted-foreground uppercase cursor-pointer flex items-center gap-1"
                            htmlFor={`flag-${player.id}`}
                          >
                            <ShieldAlert
                              className={`w-3 h-3 ${
                                player.flagged ? "text-destructive" : "text-muted-foreground"
                              }`}
                            />
                            GOAT
                          </label>
                          <Switch
                            id={`flag-${player.id}`}
                            checked={player.flagged}
                            onCheckedChange={() => toggleFlag(player.id, player.flagged)}
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleDelete(player.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Right Column */}
      <div className="md:col-span-4 flex flex-col gap-6">
        <Card className="border-border/50 border-t-secondary border-t-2 flex-1 flex flex-col">
          <CardHeader>
            <CardTitle className="font-mono text-sm text-muted-foreground">
              FREIGABE-WARTESCHLANGE
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col min-h-0">
            <ScrollArea className="flex-1 min-h-[250px]">
              <div className="space-y-3">
                {pendingPlayers.length === 0 ? (
                  <p className="text-xs font-mono text-muted-foreground">Warteschlange leer.</p>
                ) : (
                  pendingPlayers.map((player) => (
                    <div
                      key={player.id}
                      className="flex items-center justify-between p-2 border border-border bg-card rounded"
                    >
                      <div className="flex flex-col truncate max-w-[150px]">
                        <span className="font-mono text-sm font-bold truncate">
                          {player.name}
                        </span>
                        {(player as any).steamId && (
                          <span className="font-mono text-[9px] text-muted-foreground truncate">
                            ID: {(player as any).steamId}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-green-500 hover:text-green-400 hover:bg-green-500/10"
                          onClick={() => setStatus(player.id, "accepted")}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-red-400 hover:bg-destructive/10"
                          onClick={() => setStatus(player.id, "rejected")}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Collapsible Manual Add / Bulk Import at the bottom (full width) */}
      <div className="col-span-12 pt-4">
        <Button
          variant="outline"
          className="font-mono text-xs gap-1.5 border-border/60"
          onClick={() => setShowManualAdd(!showManualAdd)}
        >
          {showManualAdd ? "Bereich ausblenden" : "Manuell hinzufügen"}
        </Button>

        {showManualAdd && (
          <Card className="border-border/50 mt-4 animate-in fade-in slide-in-from-top-2 duration-200">
            <CardHeader>
              <CardTitle className="font-mono text-primary flex items-center gap-2 text-sm uppercase">
                <Users className="w-4 h-4" />
                MANUELL HINZUFÜGEN
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Part A: Add Single Player */}
              <form onSubmit={handleAddSingle} className="space-y-3 p-4 bg-background/30 rounded-lg border border-border/40">
                <h4 className="font-mono text-xs text-secondary font-bold uppercase tracking-wider">Einzelnen Spieler hinzufügen</h4>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Name</label>
                    <Input
                      value={singleName}
                      onChange={(e) => setSingleName(e.target.value)}
                      placeholder="z.B. Janaxf"
                      className="font-mono bg-background/50 h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Steam-Profil / Steam64 ID</label>
                    <Input
                      value={singleSteam}
                      onChange={(e) => setSingleSteam(e.target.value)}
                      placeholder="Link oder 17 Ziffern"
                      className="font-mono bg-background/50 h-9 text-sm"
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  disabled={isAddingSingle || !singleName.trim()}
                  className="font-mono w-full text-xs h-8 uppercase tracking-widest mt-2"
                >
                  {isAddingSingle ? "Auflösen & Hinzufügen..." : "Spieler hinzufügen"}
                </Button>
              </form>

              {/* Part B: Bulk Import */}
              <div className="space-y-3 p-4 bg-background/30 rounded-lg border border-border/40">
                <h4 className="font-mono text-xs text-secondary font-bold uppercase tracking-wider">Massen-Import (Kommagetrennt oder Zeilenweise)</h4>
                <Input
                  placeholder="Spielernamen eingeben (z.B. Spieler1, Spieler2, Spieler3)..."
                  value={bulkInput}
                  onChange={(e) => setBulkInput(e.target.value)}
                  className="font-mono bg-background/50 text-sm h-9"
                />
                <Button
                  onClick={handleBulkAdd}
                  disabled={addPlayersMut.isPending || !bulkInput.trim()}
                  className="font-mono w-full text-xs h-8 uppercase tracking-widest"
                >
                  Massen-Import starten
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
