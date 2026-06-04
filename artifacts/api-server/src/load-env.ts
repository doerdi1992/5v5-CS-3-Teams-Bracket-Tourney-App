import fs from "fs";
import path from "path";

try {
  const paths = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "../../.env"), // Root of workspace when running in workspace artifacts folder
  ];
  for (const envPath of paths) {
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, "utf8").split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const idx = trimmed.indexOf("=");
        if (idx > 0) {
          const key = trimmed.substring(0, idx).trim();
          const val = trimmed.substring(idx + 1).trim().replace(/^['"]|['"]$/g, "");
          process.env[key] = val;
        }
      }
    }
  }
} catch (e) {
  console.error("Failed to load .env file:", e);
}
