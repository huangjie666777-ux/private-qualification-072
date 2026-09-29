import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, "..", "data");
const dbPath = resolve(dataDir, "redemptions.json");

interface RedemptionRecord {
  eventId: number;
  nullifier: string;
  at: string;
}

function load(): RedemptionRecord[] {
  try {
    return JSON.parse(readFileSync(dbPath, "utf8")) as RedemptionRecord[];
  } catch {
    return [];
  }
}

export class RedemptionStore {
  private records: RedemptionRecord[];
  private chain: Promise<void> = Promise.resolve();

  constructor() {
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
    this.records = load();
  }

  private persist(): void {
    const tmp = `${dbPath}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.records, null, 2) + "\n");
    writeFileSync(dbPath, JSON.stringify(this.records, null, 2) + "\n");
  }

  has(eventId: number, nullifier: string): boolean {
    return this.records.some(
      (r) => r.eventId === eventId && r.nullifier === nullifier,
    );
  }

  // Serialized atomic claim: under concurrent duplicate submissions only one
  // call inserts; others see the record and return false. The record is
  // persisted before reporting success, so it survives restarts.
  claim(eventId: number, nullifier: string): Promise<boolean> {
    const run = this.chain.then(() => {
      if (this.has(eventId, nullifier)) return false;
      this.records.push({ eventId, nullifier, at: new Date().toISOString() });
      this.persist();
      return true;
    });
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}
