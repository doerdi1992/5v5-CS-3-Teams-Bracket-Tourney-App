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

const command = process.argv.slice(2).join(" ");

if (!command) {
  console.log("Usage: node rcon_tool.mjs <command>");
  process.exit(1);
}

async function run() {
  console.log(`📡 Sending RCON command to ${host}:${port}: "${command}"...`);
  try {
    const result = await Rcon.send(host, port, pass, command);
    console.log("✅ Response:\n");
    console.log(result || "(No output from server)");
  } catch (e) {
    console.error(`❌ Failed: ${e.message}`);
  }
}

run();
