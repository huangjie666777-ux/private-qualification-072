import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { PROJECT_ROOT } from "./config.ts";

// Node built-in SQLite. Records survive server restarts.
const DB_PATH = process.env.DEMO_DB_PATH || join(PROJECT_ROOT, "server-data/redemptions.db");
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
// Keep DELETE journaling: avoids file-lock surprises for this tiny demo DB.
db.exec("PRAGMA journal_mode = DELETE;");
db.exec("PRAGMA busy_timeout = 5000;");
db.exec(`
  CREATE TABLE IF NOT EXISTS redemptions (
    activity_id TEXT NOT NULL,
    nullifier   TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    PRIMARY KEY (activity_id, nullifier)
  ) STRICT;
`);

const insertStmt = db.prepare(
  "INSERT INTO redemptions (activity_id, nullifier, created_at) VALUES (?, ?, ?)",
);

// Atomic claim: UNIQUE(activity_id, nullifier) makes concurrent duplicates
// fail at the storage layer, so exactly one submission can succeed.
export function claimRedemption(activityId: string, nullifier: string): boolean {
  try {
    insertStmt.run(activityId, nullifier, Date.now());
    return true;
  } catch (error) {
    if (isUniqueError(error)) return false;
    throw error;
  }
}

export function hasRedemption(activityId: string, nullifier: string): boolean {
  const row = db
    .prepare("SELECT 1 FROM redemptions WHERE activity_id = ? AND nullifier = ? LIMIT 1")
    .get(activityId, nullifier);
  return row !== undefined;
}

function isUniqueError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const e = error as { code?: string; errcode?: number };
  return e.code === "SQLITE_CONSTRAINT_PRIMARYKEY" || e.code === "ERR_SQLITE_ERROR" && e.errcode === 1555;
}
