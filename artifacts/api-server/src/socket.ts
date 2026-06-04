import { Server as SocketIOServer } from "socket.io";
import type { Server as HttpServer } from "http";
import { store } from "./store.js";
import { logger } from "./lib/logger.js";

let io: SocketIOServer | null = null;

export function initSocketIO(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    path: "/api/socket.io",
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    logger.info({ socketId: socket.id }, "Client connected");

    socket.on("register", ({ clientId }: { clientId: string }) => {
      const player = store.getPlayer(clientId);
      if (player) {
        store.updatePlayer(clientId, { socketId: socket.id });
        socket.join(`player:${clientId}`);
        logger.info({ clientId, socketId: socket.id }, "Player registered socket");
      }
    });

    socket.on("disconnect", () => {
      logger.info({ socketId: socket.id }, "Client disconnected");
    });
  });

  return io;
}

export function broadcastStateUpdate(): void {
  if (!io) return;
  io.emit("state_update", store.getFullState());
}

export function broadcastServerToTeams(connectionString: string, teams: string[]): void {
  if (!io) return;
  const players = store.getAllPlayers().filter(
    (p) => p.team !== null && teams.includes(p.team) && p.socketId !== null
  );
  const payload = { connectionString, teams };
  for (const player of players) {
    io.to(player.socketId!).emit("server_broadcast", payload);
  }
  logger.info({ teams, playerCount: players.length }, "Server broadcast sent");
}

export { io };
