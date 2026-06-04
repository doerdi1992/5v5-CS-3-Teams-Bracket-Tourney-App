// RCON Test on port 30045
import net from "net";

const host = "185.194.236.142";
const port = 30045;
const pass = "FetchingJealous1";
const cmd = "status";

console.log(`\n  🔌 RCON TEST → ${host}:${port}\n`);

function sendPacket(socket, reqId, type, payload) {
  const payloadBuf = Buffer.from(payload, "utf8");
  const size = 8 + payloadBuf.length + 2;
  const buf = Buffer.alloc(4 + size);
  buf.writeInt32LE(size, 0);
  buf.writeInt32LE(reqId, 4);
  buf.writeInt32LE(type, 8);
  payloadBuf.copy(buf, 12);
  buf.writeUInt8(0, 12 + payloadBuf.length);
  buf.writeUInt8(0, 12 + payloadBuf.length + 1);
  socket.write(buf);
}

const socket = new net.Socket();
let authed = false;
let responseText = "";

const timeout = setTimeout(() => {
  console.log("  ❌ TIMEOUT (10s)");
  socket.destroy();
  process.exit(1);
}, 10000);

socket.connect(port, host, () => {
  console.log("  ✅ TCP connected!");
  console.log("  → Sending AUTH...");
  sendPacket(socket, 999, 3, pass);
});

socket.on("data", (data) => {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  let offset = 0;
  while (offset < buf.length) {
    if (buf.length - offset < 12) break;
    const size = buf.readInt32LE(offset);
    if (buf.length - offset < size + 4) break;

    const reqId = buf.readInt32LE(offset + 4);
    const type = buf.readInt32LE(offset + 8);
    const payload = buf.toString("utf8", offset + 12, offset + 4 + size - 2);
    offset += 4 + size;

    if (!authed) {
      if (reqId === -1) {
        console.log("  ❌ AUTH FAILED — wrong RCON password!");
        clearTimeout(timeout);
        socket.destroy();
        process.exit(1);
      }
      if ((type === 2 || type === 0) && reqId === 999) {
        authed = true;
        console.log("  ✅ AUTH SUCCESS!");
        console.log(`  → Sending: ${cmd}`);
        sendPacket(socket, 1000, 2, cmd);
      }
    } else {
      if (reqId === 1000) {
        responseText += payload;
        console.log("\n  ✅ RCON RESPONSE:");
        console.log("  ─────────────────────────────────");
        responseText.trim().split("\n").forEach(l => console.log(`  ${l}`));
        console.log("  ─────────────────────────────────");

        // Now test matchzy_loadmatch
        console.log(`\n  → Sending: matchzy_loadmatch "cfg/MatchZy/match_pipeline_test.json"`);
        sendPacket(socket, 1001, 2, 'matchzy_loadmatch "cfg/MatchZy/match_pipeline_test.json"');
      }
      if (reqId === 1001) {
        console.log("\n  ✅ MATCHZY RESPONSE:");
        console.log("  ─────────────────────────────────");
        payload.trim().split("\n").forEach(l => console.log(`  ${l}`));
        console.log("  ─────────────────────────────────");
        
        clearTimeout(timeout);
        socket.destroy();
        console.log("\n  🎉 FULL PIPELINE WORKS!\n");
        process.exit(0);
      }
    }
  }
});

socket.on("error", (err) => {
  clearTimeout(timeout);
  console.log(`  ❌ CONNECTION ERROR: ${err.message}`);
  process.exit(1);
});
