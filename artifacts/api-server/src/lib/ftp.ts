import { Client } from "basic-ftp";
import { Readable } from "stream";

export interface FtpConfig {
  host: string;
  port?: number;
  user: string;
  pass: string;
}

/**
 * FTP Client using basic-ftp library.
 * Supports FTPS (Explicit TLS) with proper session reuse for ProFTPD/fshost.
 */
export class FtpClient {
  static async upload(config: FtpConfig, remotePath: string, content: string): Promise<void> {
    const client = new Client();
    client.ftp.verbose = true; // Log all FTP commands for debugging

    try {
      console.log(`[FTP] Connecting to ${config.host}:${config.port || 21}...`);

      await client.access({
        host: config.host,
        port: config.port || 21,
        user: config.user,
        password: config.pass,
        secure: true,               // Use FTPS (AUTH TLS)
        secureOptions: {
          rejectUnauthorized: false, // Game server certs are self-signed
        },
      });

      console.log(`[FTP] Connected & authenticated.`);

      // Convert string content to a readable stream
      const stream = Readable.from(Buffer.from(content, "utf8"));

      console.log(`[FTP] Uploading to ${remotePath} (${content.length} bytes)...`);
      await client.uploadFrom(stream, remotePath);

      console.log(`[FTP] Upload completed successfully!`);
    } catch (err: any) {
      console.error(`[FTP] Error: ${err.message}`);
      throw err;
    } finally {
      client.close();
    }
  }
}
