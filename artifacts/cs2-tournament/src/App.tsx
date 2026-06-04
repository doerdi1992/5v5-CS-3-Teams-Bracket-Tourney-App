import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import ViewerPage from "@/pages/viewer";
import AdminPage from "@/pages/admin";
import { useEffect } from "react";
import { socket } from "@/lib/socket";

const queryClient = new QueryClient();

function SocketProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    socket.on("connect", () => {
      console.log("Socket connected");
    });
    
    socket.on("state_update", () => {
      queryClient.invalidateQueries();
    });

    return () => {
      socket.off("connect");
      socket.off("state_update");
    };
  }, []);

  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={ViewerPage} />
      <Route path="/admin" component={AdminPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SocketProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </SocketProvider>
    </QueryClientProvider>
  );
}

export default App;
