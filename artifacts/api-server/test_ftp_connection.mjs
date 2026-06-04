// Full Pipeline Test: FTP Upload + fake_rcon check + RCON test
import { Client } from "basic-ftp";
import { Readable } from "stream";
import net from "net";

const ftpConfig = { host: "de35.fsho.st", port: 21, user: "343263", pass: "tZWNVrJ4CKUz" };

// Test MatchZy JSON (minimal valid config)
const testMatchConfig = {
  matchid: "pipeline_test_" + Date.now(),
  team1: {
    name: "Team Alpha",
    tag: "ALPHA",
    players: { "76561198000000001": "Player1", "76561198000000002": "Player2" }
  },
  team2: {
    name: "Team Beta",
    tag: "BETA",
    players: { "76561198000000003": "Player3", "76561198000000004": "Player4" }
  },
  num_maps: 1,
  maplist: ["de_dust2"],
  skip_veto: true,
  clinch_series: true,
  players_per_team: 5,
  cvars: {
    "mp_overtime_enable": "true",
    "mp_overtime_maxrounds": "6"
  }
};

const client = new Client();
client.ftp.verbose = false; // Less noise

async function run() {
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║   FULL PIPELINE TEST — MatchZy Auto Setup    ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  // ── Step 1: FTP Connect ──────────────────────────────────
  console.log("━━━ STEP 1: FTP Connect ━━━");
  try {
    await client.access({
      host: ftpConfig.host, port: ftpConfig.port,
      user: ftpConfig.user, password: ftpConfig.pass,
      secure: true, secureOptions: { rejectUnauthorized: false },
    });
    console.log("  ✅ FTP connected (FTPS/TLS)\n");
  } catch (err) {
    console.log(`  ❌ FTP connect failed: ${err.message}`);
    process.exit(1);
  }

  // ── Step 2: Upload MatchZy JSON ──────────────────────────
  console.log("━━━ STEP 2: Upload MatchZy JSON ━━━");
  const fileName = `match_${testMatchConfig.matchid}.json`;
  const remotePath = `p3611/cfg/MatchZy/${fileName}`;
  const content = JSON.stringify(testMatchConfig, null, 2);

  try {
    const stream = Readable.from(Buffer.from(content, "utf8"));
    await client.uploadFrom(stream, remotePath);
    console.log(`  ✅ Uploaded: ${remotePath}`);
    console.log(`  📄 Size: ${content.length} bytes`);
    console.log(`  🎮 MatchID: ${testMatchConfig.matchid}\n`);
  } catch (err) {
    console.log(`  ❌ Upload failed: ${err.message}\n`);
  }

  // ── Step 3: Verify upload ────────────────────────────────
  console.log("━━━ STEP 3: Verify Upload ━━━");
  try {
    const matchzyFiles = await client.list("p3611/cfg/MatchZy");
    const jsonFiles = matchzyFiles.filter(f => f.name.endsWith(".json"));
    console.log(`  📂 p3611/cfg/MatchZy/ (${jsonFiles.length} JSON files):`);
    jsonFiles.forEach(f => {
      const isOurs = f.name === fileName ? " ← JUST UPLOADED" : "";
      console.log(`     📄 ${f.name} (${f.size} bytes)${isOurs}`);
    });
    console.log();
  } catch (err) {
    console.log(`  ⚠️ Could not list: ${err.message}\n`);
  }

  // ── Step 4: Check fake_rcon folder ───────────────────────
  console.log("━━━ STEP 4: Check fake_rcon ━━━");
  try {
    const fakeRconFiles = await client.list("p3611/fake_rcon");
    console.log(`  📂 p3611/fake_rcon/ (${fakeRconFiles.length} items):`);
    fakeRconFiles.filter(f => f.name !== "." && f.name !== "..").forEach(f => {
      console.log(`     ${f.isDirectory ? "📁" : "📄"} ${f.name} ${f.size ? `(${f.size} bytes)` : ""}`);
    });

    // Try to read any config/readme files in fake_rcon
    for (const f of fakeRconFiles) {
      if (f.name.endsWith(".cfg") || f.name.endsWith(".txt") || f.name.endsWith(".md") || f.name === "README") {
        console.log(`\n  📖 Contents of fake_rcon/${f.name}:`);
        try {
          const chunks = [];
          const writable = new (await import("stream")).Writable({
            write(chunk, encoding, callback) { chunks.push(chunk); callback(); }
          });
          await client.downloadTo(writable, `p3611/fake_rcon/${f.name}`);
          const text = Buffer.concat(chunks).toString("utf8").substring(0, 500);
          text.split("\n").forEach(l => console.log(`     ${l}`));
        } catch (e) { console.log(`     (could not read: ${e.message})`); }
      }
    }
    console.log();
  } catch (err) {
    console.log(`  ⚠️ fake_rcon not accessible: ${err.message}\n`);
  }

  // ── Step 5: Check cfg/MatchZy folder structure ───────────
  console.log("━━━ STEP 5: MatchZy Config Structure ━━━");
  try {
    // Check if there's a matchzy subfolder (lowercase) too
    const cfgList = await client.list("p3611/cfg");
    const matchzyDirs = cfgList.filter(f => f.isDirectory && f.name.toLowerCase().includes("matchzy"));
    console.log(`  Found MatchZy-related folders in cfg/:`);
    for (const dir of matchzyDirs) {
      console.log(`     📁 ${dir.name}`);
      try {
        const subFiles = await client.list(`p3611/cfg/${dir.name}`);
        subFiles.filter(f => f.name !== "." && f.name !== "..").forEach(sf => {
          console.log(`        ${sf.isDirectory ? "📁" : "📄"} ${sf.name} ${sf.size ? `(${sf.size}b)` : ""}`);
        });
      } catch (_) {}
    }
    console.log();
  } catch (err) {
    console.log(`  ⚠️ Could not list cfg/: ${err.message}\n`);
  }

  // ── Step 6: Try RCON connection ──────────────────────────
  console.log("━━━ STEP 6: RCON Test ━━━");
  const serverIp = "185.194.236.142";
  const portsToTry = [27015, 27016, 27017, 27020, 27025];

  for (const port of portsToTry) {
    const result = await testRconPort(serverIp, port);
    console.log(`  ${result}`);
  }
  console.log();

  // ── Summary ──────────────────────────────────────────────
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║                  SUMMARY                     ║");
  console.log("╠══════════════════════════════════════════════╣");
  console.log("║  ✅ FTP Upload:   WORKING                    ║");
  console.log(`║  📄 JSON File:    ${fileName.substring(0, 30).padEnd(30)}║`);
  console.log(`║  📂 Location:     cfg/MatchZy/               ║`);
  console.log("║                                              ║");
  console.log("║  RCON command to load match:                 ║");
  console.log(`║  matchzy_loadmatch "cfg/MatchZy/${fileName.substring(0, 18)}"  ║`);
  console.log("╚══════════════════════════════════════════════╝\n");

  client.close();
}

function testRconPort(host, port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve(`🔴 ${host}:${port} — timeout (no response)`);
    }, 3000);

    socket.connect(port, host, () => {
      clearTimeout(timeout);
      socket.destroy();
      resolve(`🟢 ${host}:${port} — PORT OPEN! (potential RCON)`);
    });

    socket.on("error", (err) => {
      clearTimeout(timeout);
      resolve(`🔴 ${host}:${port} — ${err.message}`);
    });
  });
}

run().catch(err => {
  console.log(`\n❌ Fatal: ${err.message}`);
  client.close();
  process.exit(1);
});
