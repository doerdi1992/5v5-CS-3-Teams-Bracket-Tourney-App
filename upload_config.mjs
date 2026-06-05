import fs from "fs";

async function run() {
  try {
    const fileContent = fs.readFileSync("match_config.json", "utf8");
    const res = await fetch("https://api.npoint.io", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: fileContent
    });

    if (!res.ok) {
      throw new Error(`Upload failed: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    console.log(`✅ Upload successful!`);
    console.log(`🔗 Raw URL: https://api.npoint.io/${data.id}`);
  } catch (err) {
    console.error(`❌ Error uploading config: ${err.message}`);
  }
}

run();
