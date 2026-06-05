import { store } from "./artifacts/api-server/dist/store.js";
import fs from "fs";

// Load from server_config.json first if needed
store.loadServerSettings();

console.log("All players registered in memory store:");
console.log(JSON.stringify(store.getAllPlayers(), null, 2));
