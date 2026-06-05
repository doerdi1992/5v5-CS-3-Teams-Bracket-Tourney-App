// FULL END-TO-END MatchZy Integration Test
import net from "net";
import { Client } from "basic-ftp";
import { Readable } from "stream";

const rcon = { host: "185.194.236.142", port: 30045, pass: "FetchingJealous1" };
const ftp = { host: "de35.fsho.st", port: 21, user: "343263", pass: "tZWNVrJ4CKUz" };

// ── RCON Helper ─────────────────────────────────────────
function sendRcon(cmd, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let authed = false, response = "";
    const timeout = setTimeout(() => { socket.destroy(); resolve(response.trim() || `[timeout after ${timeoutMs}ms]`); }, timeoutMs);

    function sendPacket(reqId, type, payload) {
      const payloadBuf = Buffer.from(payload, "utf8");
      const size = 8 + payloadBuf.length + 2;
      const buf = Buffer.alloc(4 + size);
      buf.writeInt32LE(size, 0); buf.writeInt32LE(reqId, 4); buf.writeInt32LE(type, 8);
      payloadBuf.copy(buf, 12); buf.writeUInt8(0, 12 + payloadBuf.length); buf.writeUInt8(0, 13 + payloadBuf.length);
      socket.write(buf);
    }

    socket.connect(rcon.port, rcon.host, () => sendPacket(999, 3, rcon.pass));
    socket.on("data", (data) => {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      let off = 0;
      while (off < buf.length) {
        if (buf.length - off < 12) break;
        const size = buf.readInt32LE(off);
        if (buf.length - off < size + 4) break;
        const reqId = buf.readInt32LE(off + 4), type = buf.readInt32LE(off + 8);
        const payload = buf.toString("utf8", off + 12, off + 4 + size - 2);
        off += 4 + size;
        if (!authed) {
          if (reqId === -1) { clearTimeout(timeout); socket.destroy(); reject(new Error("AUTH FAILED")); return; }
          if ((type === 2 || type === 0) && reqId === 999) { authed = true; sendPacket(1000, 2, cmd); }
        } else if (reqId === 1000) {
          response += payload;
          clearTimeout(timeout); socket.destroy(); resolve(response.trim());
          return;
        }
      }
    });
    socket.on("error", (err) => { clearTimeout(timeout); resolve(`[error: ${err.message}]`); });
    socket.on("close", () => { clearTimeout(timeout); resolve(response.trim()); });
  });
}

// ── Real match config (as the app generates it) ─────────
const matchId = `e2e_test_${Date.now()}`;
const matchConfig = {
  matchid: matchId,
  team1: {
    name: "Team Alpha",
    tag: "ALPHA",
    players: {
      "76561198000000001": "TestPlayer1",
      "76561198000000002": "TestPlayer2",
      "76561198000000003": "TestPlayer3",
      "76561198000000004": "TestPlayer4",
      "76561198000000005": "TestPlayer5"
    }
  },
  team2: {
    name: "Team Beta",
    tag: "BETA",
    players: {
      "76561198000000006": "TestPlayer6",
      "76561198000000007": "TestPlayer7",
      "76561198000000008": "TestPlayer8",
      "76561198000000009": "TestPlayer9",
      "76561198000000010": "TestPlayer10"
    }
  },
  num_maps: 1,
  maplist: ["de_dust2"],
  skip_veto: true,
  clinch_series: true,
  players_per_team: 5,
  cvars: {
    "mp_overtime_enable": "true",
    "mp_overtime_maxrounds": "6",
    "mp_maxrounds": "24"
  }
};

const fileName = `match_${matchId}.json`;
const remotePath = `p3611/cfg/MatchZy/${fileName}`;
const rconLoadPath = `cfg/MatchZy/${fileName}`;

async function run() {
  console.log("\n╔════════════════════════════════════════════════════╗");
  console.log("║    MATCHZY E2E INTEGRATION TEST                    ║");
  console.log("║    Testing the EXACT flow the app uses             ║");
  console.log("╚════════════════════════════════════════════════════╝\n");

  // ── 1. FTP Upload ─────────────────────────────────────
  console.log("━━━ STEP 1: FTP Upload ━━━");
  const ftpClient = new Client();
  try {
    await ftpClient.access({
      host: ftp.host, port: ftp.port, user: ftp.user, password: ftp.pass,
      secure: true, secureOptions: { rejectUnauthorized: false },
    });
    const content = JSON.stringify(matchConfig, null, 2);
    await ftpClient.uploadFrom(Readable.from(Buffer.from(content, "utf8")), remotePath);
    console.log(`  ✅ Uploaded: ${remotePath} (${content.length} bytes)`);

    // Verify file exists
    const files = await ftpClient.list("p3611/cfg/MatchZy");
    const found = files.find(f => f.name === fileName);
    console.log(`  ✅ Verified: ${found ? `${found.name} (${found.size}b)` : "NOT FOUND ❌"}\n`);
  } catch (err) {
    console.log(`  ❌ FTP failed: ${err.message}\n`);
    process.exit(1);
  } finally {
    ftpClient.close();
  }

  // ── 2. RCON: End existing match ───────────────────────
  console.log("━━━ STEP 2: RCON matchzy_endmatch ━━━");
  const endRes = await sendRcon("matchzy_endmatch");
  console.log(`  → ${endRes || "(no output — match ended or none was active)"}\n`);

  // Wait 2s for MatchZy to reset
  console.log("  ⏳ Waiting 2s for reset...");
  await new Promise(r => setTimeout(r, 2000));

  // ── 3. RCON: Change map ───────────────────────────────
  console.log("\n━━━ STEP 3: RCON changelevel de_dust2 ━━━");
  const mapRes = await sendRcon('changelevel "de_dust2"', 3000);
  console.log(`  → ${mapRes || "(server restarting — connection dropped, expected)"}\n`);

  // Wait for map change
  console.log("  ⏳ Waiting 10s for map load...");
  await new Promise(r => setTimeout(r, 10000));

  // ── 4. Verify server is back ──────────────────────────
  console.log("\n━━━ STEP 4: Verify server is online ━━━");
  let retries = 3;
  let serverOnline = false;
  while (retries > 0) {
    try {
      const status = await sendRcon("status", 4000);
      if (status && !status.includes("[error]") && !status.includes("[timeout")) {
        const mapLine = status.split("\n").find(l => l.includes("spawngroup") || l.includes("de_dust2"));
        console.log(`  ✅ Server online!`);
        if (mapLine) console.log(`  📍 ${mapLine.trim()}`);
        serverOnline = true;
        break;
      }
    } catch (_) {}
    retries--;
    if (retries > 0) {
      console.log(`  ⏳ Not ready yet, retrying in 3s... (${retries} left)`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  if (!serverOnline) {
    console.log("  ⚠️ Server might still be loading, trying loadmatch anyway...\n");
  } else {
    console.log();
  }

  // ── 5. RCON: Load match config ────────────────────────
  console.log("━━━ STEP 5: RCON matchzy_loadmatch ━━━");
  const loadCmd = `matchzy_loadmatch "${rconLoadPath}"`;
  console.log(`  → Sending: ${loadCmd}`);
  const loadRes = await sendRcon(loadCmd, 5000);
  console.log(`  → Response: ${loadRes}\n`);

  // Parse result
  const loadSuccess = loadRes.includes("LoadMatch") && !loadRes.includes("cannot load");
  const alreadyLoaded = loadRes.includes("cannot load a new match");

  // ── 6. Verify match state ─────────────────────────────
  console.log("━━━ STEP 6: Verify match state ━━━");
  const matchzyStatus = await sendRcon("matchzy_status", 4000);
  console.log(`  → matchzy_status: ${matchzyStatus || "(no response)"}\n`);

  // ── RESULT ────────────────────────────────────────────
  console.log("╔════════════════════════════════════════════════════╗");
  if (loadSuccess) {
    console.log("║  ✅✅✅  MATCHZY INTEGRATION: FULLY WORKING  ✅✅✅ ║");
    console.log("║                                                    ║");
    console.log(`║  Match ID:    ${matchId.substring(0,38).padEnd(38)}║`);
    console.log("║  Config:      Uploaded + Loaded via RCON           ║");
    console.log("║  Teams:       Alpha vs Beta (5v5)                  ║");
    console.log("║  Map:         de_dust2                             ║");
  } else if (alreadyLoaded) {
    console.log("║  ⚠️  MATCH ALREADY ACTIVE — endmatch didnt clear  ║");
    console.log("║  The file IS on the server, RCON works, but        ║");
    console.log("║  endmatch needs more time or a different approach  ║");
  } else {
    console.log("║  ⚠️  PARTIAL — Check output above for details     ║");
  }
  console.log("╚════════════════════════════════════════════════════╝\n");
}

run().catch(err => { console.log(`\n❌ Fatal: ${err.message}`); process.exit(1); });
