import net from "net";
import tls from "tls";

export interface FtpConfig {
  host: string;
  port?: number;
  user: string;
  pass: string;
}

/**
 * FTP Client with Explicit TLS/SSL support (AUTH TLS on port 21).
 * Flow: Connect plain TCP → AUTH TLS → upgrade to TLS → login → PASV → STOR → QUIT
 */
export class FtpClient {
  static upload(config: FtpConfig, remotePath: string, content: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const port = config.port || 21;
      let socket: net.Socket | tls.TLSSocket = new net.Socket();
      let state = "CONNECT";
      let dataSocket: net.Socket | tls.TLSSocket | null = null;
      let errorOccurred = false;
      let useTLS = false;
      let buffer = "";

      const timeout = setTimeout(() => {
        cleanUp();
        reject(new Error("FTP connection timeout (15s)"));
      }, 15000);

      const cleanUp = () => {
        clearTimeout(timeout);
        try { socket.destroy(); } catch (_) {}
        if (dataSocket) {
          try { dataSocket.destroy(); } catch (_) {}
        }
      };

      const fail = (msg: string) => {
        if (errorOccurred) return;
        errorOccurred = true;
        cleanUp();
        reject(new Error(msg));
      };

      const write = (cmd: string) => {
        console.log(`[FTP ->] ${cmd.startsWith("PASS") ? "PASS ****" : cmd.trim()}`);
        socket.write(cmd + "\r\n");
      };

      const handleLine = (line: string) => {
        if (!line.trim()) return;
        console.log(`[FTP <-] ${line}`);
        const code = parseInt(line.substring(0, 3));

        // Skip multi-line response intermediate lines (e.g. "220-Welcome")
        if (line.substring(3, 4) === "-") return;

        if (state === "CONNECT" && code === 220) {
          // Try AUTH TLS first (Explicit FTPS)
          state = "AUTH_TLS";
          write("AUTH TLS");

        } else if (state === "AUTH_TLS") {
          if (code === 234) {
            // Server accepted TLS — upgrade the socket
            console.log("[FTP] Upgrading to TLS...");
            useTLS = true;
            const tlsSocket = tls.connect({
              socket: socket as net.Socket,
              rejectUnauthorized: false, // Game server certs are usually self-signed
              servername: config.host,
            }, () => {
              console.log("[FTP] TLS handshake complete.");
              state = "USER";
              // Re-wire data handler to the TLS socket
              socket = tlsSocket;
              socket.on("data", onData);
              write("USER " + config.user);
            });
            tlsSocket.on("error", (err) => fail(`TLS error: ${err.message}`));

          } else if (code === 500 || code === 502 || code === 530) {
            // Server doesn't support AUTH TLS — fall back to plain FTP
            console.log("[FTP] AUTH TLS not supported, using plain FTP.");
            useTLS = false;
            state = "USER";
            write("USER " + config.user);
          } else {
            fail(`Unexpected response to AUTH TLS: ${line}`);
          }

        } else if (state === "USER" && (code === 331 || code === 230)) {
          if (code === 331) {
            state = "PASS";
            write("PASS " + config.pass);
          } else {
            // Logged in without password
            state = "PBSZ";
            if (useTLS) {
              write("PBSZ 0");
            } else {
              state = "TYPE";
              write("TYPE I");
            }
          }

        } else if (state === "PASS" && code === 230) {
          // Logged in — if TLS, set protection buffer size and level
          if (useTLS) {
            state = "PBSZ";
            write("PBSZ 0");
          } else {
            state = "TYPE";
            write("TYPE I");
          }

        } else if (state === "PBSZ" && code === 200) {
          state = "PROT";
          write("PROT P"); // Private data channel (encrypted)

        } else if (state === "PROT" && code === 200) {
          state = "TYPE";
          write("TYPE I");

        } else if (state === "TYPE" && code === 200) {
          state = "PASV";
          write("PASV");

        } else if (state === "PASV" && code === 227) {
          // Parse: "227 Entering Passive Mode (h1,h2,h3,h4,p1,p2)"
          const match = line.match(/\(([^)]+)\)/);
          if (!match) {
            fail("Failed to parse PASV response.");
            return;
          }
          const parts = match[1].split(",").map(Number);
          if (parts.length !== 6) {
            fail(`Invalid PASV format: ${match[1]}`);
            return;
          }
          const dataHost = parts.slice(0, 4).join(".");
          const dataPort = (parts[4] << 8) + parts[5];

          console.log(`[FTP] Opening data connection to ${dataHost}:${dataPort}${useTLS ? " (TLS)" : ""}...`);

          // Create data socket — use TLS if the control channel is encrypted
          const rawDataSocket = new net.Socket();
          rawDataSocket.connect(dataPort, dataHost, () => {
            if (useTLS) {
              // Wrap data socket in TLS
              const tlsDataSocket = tls.connect({
                socket: rawDataSocket,
                rejectUnauthorized: false,
                servername: config.host,
              }, () => {
                console.log("[FTP Data] TLS data connection established.");
                dataSocket = tlsDataSocket;
                state = "STOR";
                write("STOR " + remotePath);
              });
              tlsDataSocket.on("error", (err) => fail(`FTP TLS data socket error: ${err.message}`));
            } else {
              console.log("[FTP Data] Plain data connection established.");
              dataSocket = rawDataSocket;
              state = "STOR";
              write("STOR " + remotePath);
            }
          });

          rawDataSocket.on("error", (err) => {
            fail(`FTP data socket error: ${err.message}`);
          });

        } else if (state === "STOR" && (code === 150 || code === 125)) {
          if (dataSocket) {
            console.log(`[FTP] Writing ${content.length} bytes to server...`);
            dataSocket.write(content, "utf8", () => {
              console.log("[FTP] Data written, closing data channel...");
              dataSocket!.end();
            });
          } else {
            fail("FTP data socket not initialized.");
          }

        } else if (state === "STOR" && code === 226) {
          console.log("[FTP] Upload completed successfully!");
          state = "QUIT";
          write("QUIT");

        } else if (code === 221) {
          cleanUp();
          resolve();

        } else if (code >= 400) {
          fail(`FTP error (${code}): ${line}`);
        }
      };

      const onData = (data: Buffer | string) => {
        buffer += data.toString();
        let idx;
        while ((idx = buffer.indexOf("\r\n")) !== -1) {
          const line = buffer.substring(0, idx);
          buffer = buffer.substring(idx + 2);
          handleLine(line);
        }
      };

      console.log(`[FTP] Connecting to ${config.host}:${port}...`);
      (socket as net.Socket).connect(port, config.host, () => {
        console.log(`[FTP] Command connection established.`);
      });

      socket.on("data", onData);
      socket.on("error", (err) => fail(`FTP connection error: ${err.message}`));
      socket.on("close", () => {
        clearTimeout(timeout);
        if (!errorOccurred) resolve();
      });
    });
  }
}
