import { useState, useEffect } from "react";
import {
  useGetMapImages,
  useSetMapImage,
  useDeleteMapImage,
  getGetMapImagesQueryKey,
  useBroadcastServer,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Save, Image as ImageIcon, ExternalLink, Send, Eye, EyeOff, Zap } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

const DEFAULT_MAPS = ["Cache", "Mirage", "Cobblestone"];

interface MapRow {
  id: string;
  mapName: string;
  imageUrl: string;
  saved: boolean;
}

export default function MapSetup() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: mapImages = {}, isLoading } = useGetMapImages({
    query: { queryKey: getGetMapImagesQueryKey() },
  });

  const setImageMut = useSetMapImage();
  const deleteImageMut = useDeleteMapImage();
  const broadcastMut = useBroadcastServer();

  const [rows, setRows] = useState<MapRow[]>([]);

  const [connectionString, setConnectionString] = useState("");
  const [autoSend, setAutoSend] = useState(true);
  const [showConnection, setShowConnection] = useState(false);

  const [rconHost, setRconHost] = useState("");
  const [rconPort, setRconPort] = useState("27015");
  const [rconPassword, setRconPassword] = useState("");
  const [showRconPw, setShowRconPw] = useState(false);
  const [rconStatus, setRconStatus] = useState("");
  const [isStartingMatch, setIsStartingMatch] = useState(false);
  const [autoStartMatch, setAutoStartMatch] = useState(true);

  // FTP state variables
  const [loadMethod, setLoadMethod] = useState<"url" | "ftp">("url");
  const [ftpHost, setFtpHost] = useState("");
  const [ftpPort, setFtpPort] = useState("21");
  const [ftpUser, setFtpUser] = useState("");
  const [ftpPassword, setFtpPassword] = useState("");
  const [ftpDir, setFtpDir] = useState("game/csgo/MatchZy/");
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  // Admin password editing state variables
  const [adminPassword, setAdminPassword] = useState("");
  const [showAdminPw, setShowAdminPw] = useState(false);

  useEffect(() => {
    const currentAdminPassword = sessionStorage.getItem("cs2_admin_password") ?? "";
    fetch("/api/config/server", {
      headers: {
        "x-admin-password": currentAdminPassword
      }
    })
      .then((res) => {
        if (!res.ok) throw new Error("Server Settings failed to load");
        return res.json();
      })
      .then((config: any) => {
        setConnectionString(config.connectionString ?? "");
        setAutoSend(config.autoSend ?? true);
        setRconHost(config.rconHost ?? "");
        setRconPort(String(config.rconPort ?? "27015"));
        setRconPassword(config.rconPassword ?? "");
        setLoadMethod(config.loadMethod ?? "url");
        setFtpHost(config.ftpHost ?? "");
        setFtpPort(String(config.ftpPort ?? "21"));
        setFtpUser(config.ftpUser ?? "");
        setFtpPassword(config.ftpPassword ?? "");
        setFtpDir(config.ftpDir ?? "game/csgo/MatchZy/");
        setAutoStartMatch(config.autoStartMatch ?? true);
        setAdminPassword(config.adminPassword ?? "");
      })
      .catch((err) => console.error("Error loading server settings:", err));
  }, []);

  const handleSaveConfig = async () => {
    setIsSavingConfig(true);
    try {
      const currentAdminPassword = sessionStorage.getItem("cs2_admin_password") ?? "";
      const res = await fetch("/api/config/server", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": currentAdminPassword
        },
        body: JSON.stringify({
          connectionString,
          autoSend,
          autoStartMatch,
          rconHost,
          rconPort: Number(rconPort) || 27015,
          rconPassword,
          loadMethod,
          ftpHost,
          ftpPort: Number(ftpPort) || 21,
          ftpUser,
          ftpPassword,
          ftpDir,
          adminPassword
        })
      });

      if (!res.ok) throw new Error("Einstellungen konnten nicht gespeichert werden");
      toast({ title: "Gespeichert", description: "Die Konfiguration wurde serverseitig gespeichert." });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Fehler beim Speichern", description: e.message });
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleStartMatch = async () => {
    setIsStartingMatch(true);
    setRconStatus("Verbindungsaufbau & MatchZy Pipeline initiiert...");
    try {
      const currentAdminPassword = sessionStorage.getItem("cs2_admin_password") ?? "";
      
      // Save current configuration first to ensure latest is used
      const saveRes = await fetch("/api/config/server", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": currentAdminPassword
        },
        body: JSON.stringify({
          connectionString,
          autoSend,
          autoStartMatch,
          rconHost,
          rconPort: Number(rconPort) || 27015,
          rconPassword,
          loadMethod,
          ftpHost,
          ftpPort: Number(ftpPort) || 21,
          ftpUser,
          ftpPassword,
          ftpDir,
          adminPassword
        })
      });

      if (!saveRes.ok) throw new Error("Einstellungen konnten vor dem Start nicht gespeichert werden");

      const res = await fetch("/api/matchzy/start", {
        method: "POST",
        headers: { 
          "x-admin-password": currentAdminPassword
        }
      });

      const data = await res.json() as { success?: boolean; command?: string; output?: string; error?: string };
      if (res.ok && data.success) {
        toast({ title: "Match gestartet!", description: "MatchZy-Match erfolgreich auf CS2 Server geladen." });
        setRconStatus(`Erfolg: ${data.output || "Match geladen."}`);
      } else {
        throw new Error(data.error || "Start fehlgeschlagen");
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: "Fehler beim Match-Start", description: e.message });
      setRconStatus(`Fehler: ${e.message}`);
    } finally {
      setIsStartingMatch(false);
    }
  };

  const handleBroadcast = () => {
    if (!connectionString.trim()) return;
    broadcastMut.mutate(
      { data: { connectionString } },
      {
        onSuccess: () => {
          toast({ title: "Gesendet", description: "Server-Verbindungsdaten an aktive Teams übertragen." });
        },
      }
    );
  };
  const [initialized, setInitialized] = useState(false);

  // Initialize rows from server data + default maps
  useEffect(() => {
    if (isLoading || initialized) return;
    setInitialized(true);

    const allMapNames = new Set([...DEFAULT_MAPS, ...Object.keys(mapImages)]);
    const initialRows: MapRow[] = Array.from(allMapNames).map((name) => ({
      id: name,
      mapName: name,
      imageUrl: mapImages[name] ?? "",
      saved: !!mapImages[name],
    }));
    setRows(initialRows);
  }, [mapImages, isLoading, initialized]);

  const addRow = () => {
    const id = `custom-${Date.now()}`;
    setRows((prev) => [...prev, { id, mapName: "", imageUrl: "", saved: false }]);
  };

  const updateRow = (id: string, field: "mapName" | "imageUrl", value: string) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value, saved: false } : r))
    );
  };

  const saveRow = (row: MapRow) => {
    if (!row.mapName.trim() || !row.imageUrl.trim()) {
      toast({ variant: "destructive", title: "Fehler", description: "Kartenname und Bild-URL sind erforderlich." });
      return;
    }
    setImageMut.mutate(
      { data: { map: row.mapName.trim(), imageUrl: row.imageUrl.trim() } },
      {
        onSuccess: () => {
          setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, saved: true } : r)));
          queryClient.invalidateQueries({ queryKey: getGetMapImagesQueryKey() });
          toast({ title: "Gespeichert", description: `Bild für ${row.mapName} gesetzt.` });
        },
      }
    );
  };

  const deleteRow = (row: MapRow) => {
    if (row.saved && row.mapName) {
      deleteImageMut.mutate(
        { mapName: row.mapName },
        {
          onSuccess: () => {
            setRows((prev) => prev.filter((r) => r.id !== row.id));
            queryClient.invalidateQueries({ queryKey: getGetMapImagesQueryKey() });
            toast({ title: "Entfernt", description: `Bild für ${row.mapName} gelöscht.` });
          },
        }
      );
    } else {
      setRows((prev) => prev.filter((r) => r.id !== row.id));
    }
  };

  return (
    <div className="space-y-6">
      {/* Streamer view link */}
      <Card className="border-secondary/30 bg-secondary/5">
        <CardContent className="p-4 flex items-center justify-between">
          <div>
            <p className="font-mono font-bold text-secondary text-sm uppercase">Streamer-Ansicht</p>
            <p className="text-xs text-muted-foreground mt-0.5">Bracket + Karte als Display-Seite für OBS oder Streaming</p>
          </div>
          <a
            href="/streamer"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" size="sm" className="font-mono gap-2 border-secondary/40 text-secondary hover:bg-secondary/10">
              <ExternalLink className="w-4 h-4" />
              Öffnen
            </Button>
          </a>
        </CardContent>
      </Card>

      {/* Server Broadcast */}
      <Card className="border-destructive/20 bg-destructive/5">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="font-mono text-destructive flex items-center gap-2">
              <Send className="w-5 h-5" />
              SERVER SENDEN
            </CardTitle>
            <span className="flex items-center gap-1.5 text-[10px] font-mono text-green-500/70 uppercase tracking-wider">
              <Save className="w-3 h-3" />
              Auto-gespeichert
            </span>
          </div>
          <CardDescription className="font-mono text-xs">Verbindungsdaten an aktive Teams übertragen</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Input
              type={showConnection ? "text" : "password"}
              placeholder="connect 192.168.1.1:27015; password xyz"
              value={connectionString}
              onChange={(e) => setConnectionString(e.target.value)}
              className="font-mono font-bold text-sm bg-black/50 border-destructive/30 focus-visible:ring-destructive pr-10"
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowConnection((v) => !v)}
              tabIndex={-1}
            >
              {showConnection ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {/* Auto-send toggle */}
          <div className="flex items-center justify-between p-3 rounded-md border border-border/30 bg-background/30">
            <div className="flex items-center gap-2">
              <Zap className={`w-4 h-4 ${autoSend ? "text-yellow-500" : "text-muted-foreground"}`} />
              <Label htmlFor="auto-send" className="font-mono text-xs uppercase tracking-wider cursor-pointer">
                Auto-Senden nach Karten-Roll
              </Label>
            </div>
            <Switch
              id="auto-send"
              checked={autoSend}
              onCheckedChange={setAutoSend}
            />
          </div>

          <Button
            variant="destructive"
            className="w-full font-mono font-bold tracking-widest"
            onClick={handleBroadcast}
            disabled={!connectionString.trim() || broadcastMut.isPending}
          >
            AN SPIELER ÜBERTRAGEN
          </Button>
        </CardContent>
      </Card>

      {/* MatchZy CS2 Server Control */}
      <Card className="border-green-500/20 bg-green-500/5">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="font-mono text-green-500 flex items-center gap-2">
              <Zap className="w-5 h-5 fill-current" />
              MATCHZY AUTOMATION
            </CardTitle>
            <span className="flex items-center gap-1.5 text-[10px] font-mono text-green-500/70 uppercase tracking-wider">
              <Save className="w-3 h-3" />
              Serverseitig gesichert
            </span>
          </div>
          <CardDescription className="font-mono text-xs">CS2 Server RCON-Verbindung & MatchZy-Steuerung</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1">
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Server IP / Host</label>
              <Input
                placeholder="z.B. 12.34.56.78"
                value={rconHost}
                onChange={(e) => setRconHost(e.target.value)}
                className="font-mono text-xs bg-black/50 border-green-500/30"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">RCON Port</label>
              <Input
                placeholder="27015"
                value={rconPort}
                onChange={(e) => setRconPort(e.target.value)}
                className="font-mono text-xs bg-black/50 border-green-500/30"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">RCON Passwort</label>
            <div className="relative">
              <Input
                type={showRconPw ? "text" : "password"}
                placeholder="RCON-Passwort..."
                value={rconPassword}
                onChange={(e) => setRconPassword(e.target.value)}
                className="font-mono text-xs bg-black/50 border-green-500/30 pr-10"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowRconPw((v) => !v)}
                tabIndex={-1}
              >
                {showRconPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Admin-Passwort (für Einstellungen & Spielerverwaltung)</label>
            <div className="relative">
              <Input
                type={showAdminPw ? "text" : "password"}
                placeholder="Neues Admin-Passwort eingeben..."
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                className="font-mono text-xs bg-black/50 border-green-500/30 pr-10"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowAdminPw((v) => !v)}
                tabIndex={-1}
              >
                {showAdminPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Lademethode Selector */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Lademethode (MatchZy JSON)</label>
            <select
              value={loadMethod}
              onChange={(e) => setLoadMethod(e.target.value as "url" | "ftp")}
              className="w-full font-mono text-xs bg-black/50 border border-green-500/30 rounded p-2 text-foreground focus-visible:ring-green-500"
            >
              <option value="url">RCON Pull über HTTP-URL (standard)</option>
              <option value="ftp">Sicherer FTP-Upload auf Server</option>
            </select>
          </div>

          {/* FTP Subform */}
          {loadMethod === "ftp" && (
            <div className="space-y-3 p-3 rounded border border-green-500/20 bg-green-500/5 animate-in fade-in duration-200">
              <p className="text-[10px] font-mono uppercase tracking-wider text-green-400 font-bold">FTP Server-Einstellungen</p>
              
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">FTP Host (falls abweichend)</label>
                  <Input
                    placeholder="z.B. 12.34.56.78"
                    value={ftpHost}
                    onChange={(e) => setFtpHost(e.target.value)}
                    className="font-mono text-xs bg-black/50 border-green-500/30"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">FTP Port</label>
                  <Input
                    placeholder="21"
                    value={ftpPort}
                    onChange={(e) => setFtpPort(e.target.value)}
                    className="font-mono text-xs bg-black/50 border-green-500/30"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">FTP Benutzer</label>
                  <Input
                    placeholder="FTP-Username..."
                    value={ftpUser}
                    onChange={(e) => setFtpUser(e.target.value)}
                    className="font-mono text-xs bg-black/50 border-green-500/30"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">FTP Passwort</label>
                  <Input
                    type="password"
                    placeholder="FTP-Passwort..."
                    value={ftpPassword}
                    onChange={(e) => setFtpPassword(e.target.value)}
                    className="font-mono text-xs bg-black/50 border-green-500/30"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">MatchZy Server-Verzeichnis</label>
                <Input
                  placeholder="game/csgo/MatchZy/"
                  value={ftpDir}
                  onChange={(e) => setFtpDir(e.target.value)}
                  className="font-mono text-xs bg-black/50 border-green-500/30"
                />
              </div>
            </div>
          )}

          {/* Auto-start toggle */}
          <div className="flex items-center justify-between p-3 rounded-md border border-border/30 bg-background/30">
            <div className="flex items-center gap-2">
              <Zap className={`w-4 h-4 ${autoStartMatch ? "text-yellow-500 animate-pulse" : "text-muted-foreground"}`} />
              <Label htmlFor="auto-start-match" className="font-mono text-xs uppercase tracking-wider cursor-pointer">
                Auto-Laden nach Karten-Roll
              </Label>
            </div>
            <Switch
              id="auto-start-match"
              checked={autoStartMatch}
              onCheckedChange={setAutoStartMatch}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button
              variant="outline"
              className="font-mono text-xs uppercase tracking-wider border-green-500/30 text-green-400 hover:bg-green-500/10"
              onClick={handleSaveConfig}
              disabled={isSavingConfig}
            >
              {isSavingConfig ? "Speichert..." : "SPEICHERN"}
            </Button>
            
            <Button
              className="font-mono text-xs uppercase tracking-wider bg-green-600 hover:bg-green-700 text-white"
              onClick={handleStartMatch}
              disabled={!rconHost || !rconPort || !rconPassword || isStartingMatch}
            >
              {isStartingMatch ? "Startet..." : "MATCH DIREKT STARTEN"}
            </Button>
          </div>

          {/* Connection Test Buttons */}
          <div className="grid grid-cols-3 gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              className="font-mono text-[10px] uppercase tracking-wider border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10"
              onClick={async () => {
                setRconStatus("⏳ RCON-Verbindung wird getestet...");
                try {
                  const pw = sessionStorage.getItem("cs2_admin_password") ?? "";
                  const res = await fetch("/api/matchzy/test-rcon", {
                    method: "POST",
                    headers: { "x-admin-password": pw },
                  });
                  const data = await res.json() as any;
                  if (data.success) {
                    setRconStatus(`✅ RCON OK — ${data.host}:${data.port}\n${data.output || ""}`);
                  } else {
                    setRconStatus(`❌ RCON FEHLER: ${data.error}`);
                  }
                } catch (e: any) {
                  setRconStatus(`❌ RCON FEHLER: ${e.message}`);
                }
              }}
              disabled={!rconHost || !rconPassword}
            >
              🔌 RCON TEST
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="font-mono text-[10px] uppercase tracking-wider border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10"
              onClick={async () => {
                setRconStatus("⏳ FTP-Verbindung wird getestet...");
                try {
                  const pw = sessionStorage.getItem("cs2_admin_password") ?? "";
                  const res = await fetch("/api/matchzy/test-ftp", {
                    method: "POST",
                    headers: { "x-admin-password": pw },
                  });
                  const data = await res.json() as any;
                  if (data.success) {
                    setRconStatus(`✅ FTP OK — ${data.message}`);
                  } else {
                    setRconStatus(`❌ FTP FEHLER: ${data.error}`);
                  }
                } catch (e: any) {
                  setRconStatus(`❌ FTP FEHLER: ${e.message}`);
                }
              }}
              disabled={loadMethod !== "ftp" || !ftpUser || !ftpPassword}
            >
              📁 FTP TEST
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="font-mono text-[10px] uppercase tracking-wider border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
              onClick={async () => {
                setRconStatus("⏳ MatchZy Config wird geladen...");
                try {
                  const pw = sessionStorage.getItem("cs2_admin_password") ?? "";
                  const res = await fetch("/api/matchzy/preview-config", {
                    headers: { "x-admin-password": pw },
                  });
                  const data = await res.json() as any;
                  if (data.success) {
                    setRconStatus(`📋 MatchZy JSON Preview:\n${JSON.stringify(data.config, null, 2)}`);
                  } else {
                    setRconStatus(`⚠️ Config Preview: ${data.error}`);
                  }
                } catch (e: any) {
                  setRconStatus(`❌ Preview FEHLER: ${e.message}`);
                }
              }}
            >
              📋 CONFIG PREVIEW
            </Button>
          </div>

          {rconStatus && (
            <div className="p-2.5 bg-black/40 border border-green-500/20 rounded font-mono text-[10px] text-green-400 break-all whitespace-pre-wrap max-h-48 overflow-y-auto">
              {rconStatus}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Map images list */}
      <Card className="border-border/50">
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <div>
            <CardTitle className="font-mono text-primary flex items-center gap-2">
              <ImageIcon className="w-5 h-5" />
              KARTEN-BILDER
            </CardTitle>
            <CardDescription className="font-mono text-xs mt-1">
              Bild-URLs für jeden Kartennamen im Pool festlegen
            </CardDescription>
          </div>
          <Button onClick={addRow} size="sm" variant="outline" className="font-mono gap-2">
            <Plus className="w-4 h-4" />
            Karte hinzufügen
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {rows.map((row) => (
            <div
              key={row.id}
              className="grid grid-cols-[1fr_2fr_auto_auto_auto] gap-3 items-center p-3 border border-border/40 rounded-lg bg-background/30"
            >
              {/* Map name */}
              <Input
                value={row.mapName}
                onChange={(e) => updateRow(row.id, "mapName", e.target.value)}
                placeholder="Kartenname"
                className="font-mono text-sm bg-background/60 h-9"
              />

              {/* Image URL */}
              <Input
                value={row.imageUrl}
                onChange={(e) => updateRow(row.id, "imageUrl", e.target.value)}
                placeholder="https://example.com/map.jpg"
                className="font-mono text-xs bg-background/60 h-9 text-muted-foreground"
              />

              {/* Thumbnail preview */}
              <div className="w-12 h-9 rounded overflow-hidden border border-border/40 bg-muted/20 flex-shrink-0">
                {row.imageUrl ? (
                  <img
                    src={row.imageUrl}
                    alt={row.mapName}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon className="w-4 h-4 text-muted-foreground/40" />
                  </div>
                )}
              </div>

              {/* Save */}
              <Button
                size="icon"
                variant={row.saved ? "ghost" : "default"}
                className={`h-9 w-9 flex-shrink-0 ${row.saved ? "text-green-500" : ""}`}
                onClick={() => saveRow(row)}
                disabled={setImageMut.isPending}
                title="Speichern"
              >
                <Save className="w-4 h-4" />
              </Button>

              {/* Delete */}
              <Button
                size="icon"
                variant="ghost"
                className="h-9 w-9 flex-shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                onClick={() => deleteRow(row)}
                disabled={deleteImageMut.isPending}
                title="Löschen"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}

          {rows.length === 0 && (
            <p className="text-sm text-muted-foreground font-mono text-center py-4">
              Keine Karten konfiguriert. Klicke "Karte hinzufügen".
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
