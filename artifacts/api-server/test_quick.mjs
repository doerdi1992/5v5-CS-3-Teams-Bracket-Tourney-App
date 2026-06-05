// Quick E2E test with CORRECT FSH-MatchZy commands
import net from "net";

const rcon = { host: "185.194.236.142", port: 30045, pass: "FetchingJealous1" };
const appUrl = "https://esports-bracket-flow--buffinger1.replit.app";

function sendRcon(cmd, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let authed = false, response = "";
    const timeout = setTimeout(() => { socket.destroy(); resolve(response.trim() || "[timeout]"); }, timeoutMs);
    function pkt(reqId, type, payload) {
      const p = Buffer.from(payload, "utf8"), size = 8 + p.length + 2, buf = Buffer.alloc(4 + size);
      buf.writeInt32LE(size, 0); buf.writeInt32LE(reqId, 4); buf.writeInt32LE(type, 8);
      p.copy(buf, 12); buf.writeUInt8(0, 12 + p.length); buf.writeUInt8(0, 13 + p.length);
      socket.write(buf);
    }
    socket.connect(rcon.port, rcon.host, () => pkt(999, 3, rcon.pass));
    socket.on("data", (data) => {
      const buf = Buffer.from(data); let off = 0;
      while (off < buf.length) {
        if (buf.length - off < 12) break;
        const size = buf.readInt32LE(off), reqId = buf.readInt32LE(off + 4), type = buf.readInt32LE(off + 8);
        const payload = buf.toString("utf8", off + 12, off + 4 + size - 2); off += 4 + size;
        if (!authed) { if (reqId === -1) { clearTimeout(timeout); socket.destroy(); resolve("AUTH_FAIL"); return; }
          if ((type === 2 || type === 0) && reqId === 999) { authed = true; pkt(1000, 2, cmd); }
        } else if (reqId === 1000) { response += payload; clearTimeout(timeout); socket.destroy(); resolve(response.trim()); return; }
      }
    });
    socket.on("error", (err) => { clearTimeout(timeout); resolve(`[err: ${err.message}]`); });
    socket.on("close", () => { clearTimeout(timeout); resolve(response.trim()); });
  });
}

async function run() {
  console.log("\n══ MATCHZY QUICK TEST ══\n");

  // 1. End match
  console.log("1️⃣  css_endmatch");
  console.log("   →", await sendRcon("css_endmatch") || "(ok, cleared)");

  await new Promise(r => setTimeout(r, 2000));

  // 2. Changelevel
  console.log("\n2️⃣  changelevel de_dust2");
  console.log("   →", await sendRcon('changelevel "de_dust2"', 3000) || "(server restarting)");

  console.log("\n   ⏳ Waiting 12s for map load...");
  await new Promise(r => setTimeout(r, 12000));

  // 3. Verify server back
  console.log("\n3️⃣  status check");
  const status = await sendRcon("status", 4000);
  if (status.includes("[err") || status.includes("[timeout")) {
    console.log("   ⏳ Not ready, waiting 5s more...");
    await new Promise(r => setTimeout(r, 5000));
  } else {
    const hostname = status.split("\n").find(l => l.includes("hostname"));
    console.log("   ✅ Server online:", hostname?.trim() || "ok");
  }

  // 4. Load match via URL
  const configUrl = `${appUrl}/api/matchzy/active-match.json`;
  console.log(`\n4️⃣  matchzy_loadmatch_url "${configUrl}"`);
  const loadRes = await sendRcon(`matchzy_loadmatch_url "${configUrl}"`, 6000);
  console.log("   →", loadRes);

  // Result
  const success = loadRes.includes("LoadMatch") && !loadRes.includes("does not exist") && !loadRes.includes("cannot load") && !loadRes.includes("Invalid URL");
  console.log(`\n══ RESULT: ${success ? "✅ MATCH LOADED!" : "⚠️ Check output above"} ══\n`);
}

run().catch(err => { console.log(`❌ ${err.message}`); process.exit(1); });
