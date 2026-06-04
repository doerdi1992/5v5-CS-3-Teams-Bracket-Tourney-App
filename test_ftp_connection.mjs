// Quick FTP Test — run with: node test_ftp_connection.mjs
import { Client } from "basic-ftp";
import { Readable } from "stream";

const config = { host: "de35.fsho.st", port: 21, user: "343263", pass: "tZWNVrJ4CKUz" };
const remotePath = "p3611/ftp_test_connection.txt";
const content = `FTP Test OK — ${new Date().toISOString()}\nUploaded by Esports-Bracket-Flow`;

console.log("\n═══════════════════════════════════════════");
console.log("  FTP CONNECTION TEST — fshost FTPS");
console.log("═══════════════════════════════════════════");
console.log(`  Host: ${config.host}:${config.port}`);
console.log(`  Upload: ${remotePath}`);
console.log("───────────────────────────────────────────\n");

const client = new Client();
client.ftp.verbose = true;

try {
  console.log("  Connecting (FTPS/AUTH TLS)...\n");
  await client.access({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.pass,
    secure: true,
    secureOptions: { rejectUnauthorized: false },
  });

  console.log("\n  ✅ Connected & authenticated!\n");

  // List root to find the correct directory
  console.log("  📂 Listing root directory...");
  const rootList = await client.list();
  rootList.forEach((f) => console.log(`     ${f.isDirectory ? "📁" : "📄"} ${f.name}`));

  // Try listing p3611/
  console.log("\n  📂 Listing p3611/...");
  const p3611List = await client.list("p3611");
  p3611List.forEach((f) => console.log(`     ${f.isDirectory ? "📁" : "📄"} ${f.name}`));

  // Upload test file
  console.log(`\n  📤 Uploading test file to ${remotePath}...`);
  const stream = Readable.from(Buffer.from(content, "utf8"));
  await client.uploadFrom(stream, remotePath);

  console.log("\n═══════════════════════════════════════════");
  console.log("  ✅✅✅ FTP UPLOAD SUCCESS! ✅✅✅");
  console.log(`  File: ${remotePath}`);
  console.log("  Check your fshost file manager now!");
  console.log("═══════════════════════════════════════════\n");
} catch (err) {
  console.log(`\n  ❌ ERROR: ${err.message}\n`);
  process.exit(1);
} finally {
  client.close();
}
