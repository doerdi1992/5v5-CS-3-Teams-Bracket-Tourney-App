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

  const { data: players = [] } = useGetPlayers({ query: { queryKey: getGetPlayersQueryKey() } });
  const { data: teams } = useGetTeams({ query: { queryKey: getGetTeamsQueryKey() } });

  const addPlayersMut = useAddPlayers();
  const updatePlayerMut = useUpdatePlayer();
  const deletePlayerMut = useDeletePlayer();
  const rollTeamsMut = useRollTeams();

  const handleBulkAdd = () => {
    const names = bulkInput.split("\n").map((n) => n.trim()).filter((n) => n);
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
    <div className="grid gap-6 md:grid-cols-12">
      {/* Left Column */}
      <div className="md:col-span-8 space-y-6">
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="font-mono text-primary flex items-center gap-2">
              <Users className="w-5 h-5" />
              MASSEN-IMPORT
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Textarea
                placeholder="Spielernamen einfügen (einer pro Zeile)..."
                value={bulkInput}
                onChange={(e) => setBulkInput(e.target.value)}
                className="font-mono bg-background/50 min-h-[120px]"
              />
              <Button
                onClick={handleBulkAdd}
                disabled={addPlayersMut.isPending || !bulkInput.trim()}
                className="font-mono w-full md:w-auto"
              >
                Spieler hinzufügen
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50">
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
          <CardContent>
            <ScrollArea className="h-[400px] pr-4">
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
                            Profi
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
      <div className="md:col-span-4 space-y-6">
        <Card className="border-border/50 border-t-secondary border-t-2">
          <CardHeader>
            <CardTitle className="font-mono text-sm text-muted-foreground">
              FREIGABE-WARTESCHLANGE
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[250px]">
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

        {teams && (
          <div className="space-y-4">
            <h3 className="font-mono text-lg text-primary border-b border-border pb-2">
              AKTIVE TEAMS
            </h3>
            <div className="space-y-3">
              {(["A", "B", "C"] as const).map((t) => (
                <div
                  key={t}
                  className="border border-border/50 rounded-lg p-3 bg-card/30"
                >
                  <div className="font-mono text-secondary font-bold mb-2 flex items-center justify-between">
                    <span>TEAM {t}</span>
                    <Badge variant="outline" className="text-xs">
                      {teams[t].length}/5
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {teams[t].map((p) => (
                      <Badge
                        key={p.id}
                        variant="secondary"
                        className={`font-mono text-xs ${
                          p.flagged
                            ? "border-destructive text-destructive bg-destructive/10"
                            : ""
                        }`}
                      >
                        {p.name}
                      </Badge>
                    ))}
                    {teams[t].length === 0 && (
                      <span className="text-xs text-muted-foreground font-mono">Leer</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
