import { useState, useEffect } from "react";
import {
  useGetMapImages,
  useSetMapImage,
  useDeleteMapImage,
  getGetMapImagesQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Save, Image as ImageIcon, ExternalLink } from "lucide-react";

const DEFAULT_MAPS = ["Mirage", "Inferno", "Dust2", "Nuke", "Overpass", "Anubis", "Vertigo", "Ancient"];

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

  const [rows, setRows] = useState<MapRow[]>([]);
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
