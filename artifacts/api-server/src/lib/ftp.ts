import net from "net";

export interface FtpConfig {
  host: string;
  port?: number;
  user: string;
  pass: string;
}

export class FtpClient {
  /**
   * Uploads text content to a remote FTP server at the specified remote path.
   */
  static upload(config: FtpConfig, remotePath: string, content: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const port = config.port || 21;
      const client = new net.Socket();
      let state = "CONNECT";
      let dataSocket: net.Socket | null = null;
      let errorOccurred = false;

      const cleanUp = () => {
        client.destroy();
        if (dataSocket) {
          dataSocket.destroy();
        }
      };

      const fail = (msg: string) => {
        if (errorOccurred) return;
        errorOccurred = true;
        cleanUp();
        reject(new Error(msg));
      };

      console.log(`[FTP] Connecting to command server ${config.host}:${port}...`);
      client.connect(port, config.host, () => {
        console.log(`[FTP] Command connection established.`);
      });

      client.on("data", (data) => {
        const lines = data.toString().split("\r\n");
        for (const line of lines) {
          if (!line.trim()) continue;
          console.log(`[FTP Server] ${line}`);
          const code = parseInt(line.substring(0, 3));
          
          if (line.substring(3, 4) === "-") {
            // Multi-line response intermediate, ignore
            continue;
          }

          if (state === "CONNECT" && code === 220) {
            state = "USER";
            client.write(`USER ${config.user}\r\n`);
          } else if (state === "USER" && (code === 331 || code === 230)) {
            if (code === 331) {
              state = "PASS";
              client.write(`PASS ${config.pass}\r\n`);
            } else {
              state = "TYPE";
              client.write("TYPE I\r\n");
            }
          } else if (state === "PASS" && code === 230) {
            state = "TYPE";
            client.write("TYPE I\r\n");
          } else if (state === "TYPE" && code === 200) {
            state = "PASV";
            client.write("PASV\r\n");
          } else if (state === "PASV" && code === 227) {
            // E.g. "227 Entering Passive Mode (185,194,236,142,125,12)"
            const match = line.match(/\(([^)]+)\)/);
            if (!match) {
              fail("Failed to parse passive mode PASV response.");
              return;
            }
            const parts = match[1].split(",").map(Number);
            if (parts.length !== 6) {
              fail(`Invalid PASV format: ${match[1]}`);
              return;
            }
            const dataHost = parts.slice(0, 4).join(".");
            const dataPort = (parts[4] << 8) + parts[5];

            console.log(`[FTP] Connecting to data socket at ${dataHost}:${dataPort}`);
            dataSocket = new net.Socket();
            dataSocket.connect(dataPort, dataHost, () => {
              console.log("[FTP Data] Data connection active.");
              state = "STOR";
              client.write(`STOR ${remotePath}\r\n`);
            });

            dataSocket.on("error", (err) => {
              fail(`FTP data socket connection error: ${err.message}`);
            });
          } else if (state === "STOR" && code === 150) {
            if (dataSocket) {
              console.log(`[FTP] Writing file data to STOR socket...`);
              dataSocket.write(content, "utf8", () => {
                console.log("[FTP] Data written. Sending EOF...");
                dataSocket!.end();
              });
            } else {
              fail("FTP data socket not initialized.");
            }
          } else if (state === "STOR" && code === 226) {
            console.log("[FTP] Upload completed successfully!");
            state = "QUIT";
            client.write("QUIT\r\n");
          } else if (code === 221) {
            cleanUp();
            resolve();
          } else if (code >= 400) {
            fail(`FTP error: ${line}`);
            return;
          }
        }
      });

      client.on("error", (err) => {
        fail(`FTP command socket connection error: ${err.message}`);
      });
    });
  }
}
