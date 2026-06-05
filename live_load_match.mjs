import { Socket } from "net";

class Rcon {
  static send(host, port, pass, cmd) {
    return new Promise((resolve, reject) => {
      const socket = new Socket();
      let authed = false;
      let responseText = "";

      const timeout = setTimeout(() => {
        socket.destroy();
        reject(new Error(`Timeout (5s) for port ${port}`));
      }, 5000);

      socket.connect(port, host, () => {
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
            if ((type === 2 || type === 0) && reqId === 999) {
              authed = true;
              sendPacket(socket, 1000, 2, cmd);
            } else if (reqId === -1) {
              socket.destroy();
              clearTimeout(timeout);
              reject(new Error(`RCON Auth failed for port ${port}`));
              return;
            }
          } else {
            if (reqId === 1000) {
              responseText += payload;
              socket.destroy();
              clearTimeout(timeout);
              resolve(responseText.trim());
              return;
            }
          }
        }
      });

      socket.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      socket.on("close", () => {
        clearTimeout(timeout);
        resolve(responseText.trim());
      });
    });
  }
}

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

const host = "185.194.236.142";
const port = 30045;
const pass = "FetchingJealous1";

const REPLIT_API_URL = "https://esports-bracket-flow--buffinger1.replit.app/api/create-match";
const API_KEY = "sk_live_janaxF";
const MATCH_ID = "blueprint_live_test_" + Date.now();

async function run() {
  try {
    console.log("📡 Step 1: Creating match configuration on Replit...");
    const matchPayload = {
      match_id: MATCH_ID,
      team1: {
        name: "Team 1",
        players: {
          "76561198091064949": "mosca" // the user's SteamID
        }
      },
      team2: {
        name: "Team 2",
        players: {
          "76561198000000002": "MockPlayer"
        }
      },
      num_maps: 1,
      maplist: ["de_cbble"],
      clinch_series: true,
      cvars: {
        hostname: "janaxF Community Live Match"
      }
    };

    const res = await fetch(REPLIT_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY
      },
      body: JSON.stringify(matchPayload)
    });

    if (!res.ok) {
      throw new Error(`Failed to create match config on Replit: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    console.log("✅ Match config successfully created on Replit!");
    console.log(`   Config URL: ${data.configUrl}`);

    // Wait 2 seconds
    await new Promise((resolve) => setTimeout(resolve, 2000));

    console.log("\n📡 Step 2: Triggering MatchZy match load via RCON...");
    const loadCmd = `matchzy_loadmatch_url "${data.configUrl}"`;
    const rconResult = await Rcon.send(host, port, pass, loadCmd);
    console.log("✅ RCON command sent successfully!");
    console.log(`   Result output: ${rconResult}`);

    // Tell the server chat
    console.log("\n💬 Announcing live load in chat...");
    await Rcon.send(host, port, pass, 'say "Antigravity AI: MatchZy live config loaded! Player mosca sorted to Team 1."');
    console.log("✅ Chat announcement sent.");

  } catch (e) {
    console.error(`❌ Live Load Match failed: ${e.message}`);
  }
}

run();
