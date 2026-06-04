import { io } from "socket.io-client";

// Connect to the same origin with the specified path
export const socket = io({ path: "/api/socket.io" });
