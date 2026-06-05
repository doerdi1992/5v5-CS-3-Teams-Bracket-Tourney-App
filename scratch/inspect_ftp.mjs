import { Client } from "basic-ftp";

async function run() {
  const client = new Client();
  client.ftp.verbose = true;
  try {
    await client.access({
      host: "de35.fsho.st",
      port: 21,
      user: "343263",
      password: "tZWNVrJ4CKUz",
      secure: true,
      secureOptions: { rejectUnauthorized: false }
    });

    console.log("FTP Connected. Listing root...");
    const rootFiles = await client.list("p3611");
    console.log("Root files:", rootFiles.map(f => f.name));

    // Let's search recursively for configs/admins.json or plugins/CS2-SimpleAdmin
    console.log("Searching for admins.json or simpleadmin configs...");
    
    // We will look in p3611/addons/counterstrikesharp/configs/
    try {
      const configFiles = await client.list("p3611/addons/counterstrikesharp/configs");
      console.log("CSS configs:", configFiles.map(f => f.name));
    } catch (e) {
      console.log("Could not list counterstrikesharp/configs:", e.message);
    }

    try {
      const simpleAdminFiles = await client.list("p3611/addons/counterstrikesharp/plugins/CS2-SimpleAdmin");
      console.log("SimpleAdmin files:", simpleAdminFiles.map(f => f.name));
    } catch (e) {
      console.log("Could not list CS2-SimpleAdmin:", e.message);
    }

  } catch (err) {
    console.error("Error:", err);
  } finally {
    client.close();
  }
}

run();
