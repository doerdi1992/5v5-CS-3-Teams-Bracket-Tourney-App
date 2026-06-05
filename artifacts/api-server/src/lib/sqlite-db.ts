import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import os from "os";

function getDatabasePath(): string {
  if (process.env.MATCHZY_DB_PATH) {
    return process.env.MATCHZY_DB_PATH;
  }
  const defaultPath = path.resolve(process.cwd(), "matchzy.db");
  try {
    const dir = path.dirname(defaultPath);
    fs.accessSync(dir, fs.constants.W_OK);
    return defaultPath;
  } catch (e) {
    const fallbackPath = path.resolve(os.tmpdir(), "matchzy.db");
    console.warn(`[SQLite] Warning: Default database path '${defaultPath}' is not writable. Falling back to: ${fallbackPath}`);
    return fallbackPath;
  }
}

const dbPath = getDatabasePath();
console.log(`[SQLite] Initializing database at: ${dbPath}`);

const db = new Database(dbPath);

// Create matches table
db.exec(`
  CREATE TABLE IF NOT EXISTS matches (
    match_id TEXT PRIMARY KEY,
    config_json TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

export function saveMatch(matchId: string, configJson: string): void {
  const stmt = db.prepare("INSERT OR REPLACE INTO matches (match_id, config_json) VALUES (?, ?)");
  stmt.run(matchId, configJson);
}

export function getMatch(matchId: string): string | null {
  const stmt = db.prepare("SELECT config_json FROM matches WHERE match_id = ?");
  const row = stmt.get(matchId) as { config_json: string } | undefined;
  return row ? row.config_json : null;
}
