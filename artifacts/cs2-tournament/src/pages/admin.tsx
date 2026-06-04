import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PlayerManagement from "@/components/player-management";
import BracketMapRoll from "@/components/bracket-map-roll";

export default function AdminPage() {
  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="mb-8 border-b border-border pb-4">
          <h1 className="text-3xl font-bold tracking-tighter text-primary font-mono">ADMIN_CONSOLE</h1>
          <p className="text-muted-foreground font-mono uppercase text-sm mt-1">CS2 Tournament Organizer</p>
        </header>

        <Tabs defaultValue="players" className="w-full">
          <TabsList className="grid w-full grid-cols-2 max-w-md mb-6 bg-card border border-border">
            <TabsTrigger value="players" className="font-mono uppercase data-[state=active]:text-primary data-[state=active]:bg-background">Player Management</TabsTrigger>
            <TabsTrigger value="bracket" className="font-mono uppercase data-[state=active]:text-secondary data-[state=active]:bg-background">Bracket & Maps</TabsTrigger>
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
