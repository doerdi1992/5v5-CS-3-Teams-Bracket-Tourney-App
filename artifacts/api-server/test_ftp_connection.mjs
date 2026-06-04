// Test write to cfg folder
import { Client } from "basic-ftp";
import { Readable } from "stream";

const client = new Client();
client.ftp.verbose = true;

try {
  await client.access({
    host: "de35.fsho.st", port: 21, user: "343263", password: "tZWNVrJ4CKUz",
    secure: true, secureOptions: { rejectUnauthorized: false },
  });

  // List p3611/cfg to see what's there
  console.log("\n📂 p3611/cfg/:");
  const cfgList = await client.list("p3611/cfg");
  cfgList.forEach((f) => console.log(`  ${f.isDirectory ? "📁" : "📄"} ${f.name}`));

  // Try listing addons/counterstrikesharp/plugins/FSH-MatchZy
  console.log("\n📂 p3611/addons/counterstrikesharp/plugins/FSH-MatchZy/:");
  try {
    const matchzyList = await client.list("p3611/addons/counterstrikesharp/plugins/FSH-MatchZy");
    matchzyList.forEach((f) => console.log(`  ${f.isDirectory ? "📁" : "📄"} ${f.name}`));
  } catch (e) { console.log("  ❌ " + e.message); }

  // Try writing to cfg/
  console.log("\n📤 Test write to p3611/cfg/ftp_test.txt...");
  try {
    await client.uploadFrom(Readable.from(Buffer.from("test")), "p3611/cfg/ftp_test.txt");
    console.log("  ✅ cfg/ is WRITABLE!");
  } catch (e) { console.log("  ❌ cfg/: " + e.message); }

  // Try writing to addons/counterstrikesharp/plugins/FSH-MatchZy/
  console.log("\n📤 Test write to FSH-MatchZy folder...");
  try {
    await client.uploadFrom(Readable.from(Buffer.from("test")), "p3611/addons/counterstrikesharp/plugins/FSH-MatchZy/ftp_test.txt");
    console.log("  ✅ FSH-MatchZy/ is WRITABLE!");
  } catch (e) { console.log("  ❌ FSH-MatchZy/: " + e.message); }

} catch (err) {
  console.log("❌ " + err.message);
} finally {
  client.close();
}
