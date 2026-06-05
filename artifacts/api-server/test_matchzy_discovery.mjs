// Test different load paths + find correct endmatch command
import net from "net";

const rcon = { host: "185.194.236.142", port: 30045, pass: "FetchingJealous1" };

function sendRcon(cmd, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let authed = false, response = "";
    const timeout = setTimeout(() => { socket.destroy(); resolve(response.trim() || "[timeout]"); }, timeoutMs);
    function sendPacket(reqId, type, payload) {
      const p = Buffer.from(payload, "utf8"), size = 8 + p.length + 2, buf = Buffer.alloc(4 + size);
      buf.writeInt32LE(size, 0); buf.writeInt32LE(reqId, 4); buf.writeInt32LE(type, 8);
      p.copy(buf, 12); buf.writeUInt8(0, 12 + p.length); buf.writeUInt8(0, 13 + p.length);
      socket.write(buf);
    }
    socket.connect(rcon.port, rcon.host, () => sendPacket(999, 3, rcon.pass));
    socket.on("data", (data) => {
      const buf = Buffer.from(data); let off = 0;
      while (off < buf.length) {
        if (buf.length - off < 12) break;
        const size = buf.readInt32LE(off), reqId = buf.readInt32LE(off + 4), type = buf.readInt32LE(off + 8);
        const payload = buf.toString("utf8", off + 12, off + 4 + size - 2); off += 4 + size;
        if (!authed) { if (reqId === -1) { clearTimeout(timeout); socket.destroy(); resolve("AUTH_FAIL"); return; }
          if ((type === 2 || type === 0) && reqId === 999) { authed = true; sendPacket(1000, 2, cmd); }
        } else if (reqId === 1000) { response += payload; clearTimeout(timeout); socket.destroy(); resolve(response.trim()); return; }
      }
    });
    socket.on("error", (err) => { clearTimeout(timeout); resolve(`[error: ${err.message}]`); });
    socket.on("close", () => { clearTimeout(timeout); resolve(response.trim()); });
  });
}

async function run() {
  console.log("\n═══ MatchZy Command & Path Discovery ═══\n");

  // Find the correct end-match command
  console.log("── Testing end-match commands ──");
  const endCmds = ["matchzy_endmatch", "css_endmatch", "sm_endmatch", "matchzy_end", "css_end", "endmatch", "get5_endmatch"];
  for (const cmd of endCmds) {
    const res = await sendRcon(cmd);
    const status = res.includes("Unknown command") ? "❌" : "✅";
    console.log(`  ${status} ${cmd} → ${res.substring(0, 80)}`);
  }

  // Find available matchzy commands
  console.log("\n── Testing matchzy_ commands ──");
  const matchzyCmds = [
    "matchzy_loadmatch", "matchzy_loadmatch_url",
    "matchzy_restart", "matchzy_pause", "matchzy_unpause",
    "css_matchzy_loadmatch", "matchzy_status", "matchzy_help",
    "css_matchzy_help", "css_matchzy_status"
  ];
  for (const cmd of matchzyCmds) {
    const res = await sendRcon(cmd);
    const status = res.includes("Unknown command") ? "❌" : "✅";
    console.log(`  ${status} ${cmd} → ${res.substring(0, 100)}`);
  }

  // Test different file paths with matchzy_loadmatch
  console.log("\n── Testing file paths ──");
  const testFile = "match_e2e_test_1780618124439.json";
  const paths = [
    testFile,
    `MatchZy/${testFile}`,
    `cfg/MatchZy/${testFile}`,
    `csgo/cfg/MatchZy/${testFile}`,
    `p3611/cfg/MatchZy/${testFile}`,
    `addons/counterstrikesharp/plugins/FSH-MatchZy/${testFile}`,
  ];
  for (const p of paths) {
    const res = await sendRcon(`matchzy_loadmatch "${p}"`);
    const status = res.includes("does not exist") ? "❌" : res.includes("Unknown") ? "⛔" : "✅";
    console.log(`  ${status} matchzy_loadmatch "${p}"`);
    console.log(`     → ${res.substring(0, 100)}`);
    if (!res.includes("does not exist") && !res.includes("Unknown")) break;
  }

  console.log("\n═══ Done ═══\n");
}

run().catch(err => { console.log(`❌ ${err.message}`); process.exit(1); });
