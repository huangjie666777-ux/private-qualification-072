import { afterEach, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import { RedemptionStore } from "../server/store.js";

const dbFile = new URL("../data/redemptions.json", import.meta.url);

afterEach(() => {
  try {
    rmSync(dbFile, { force: true });
  } catch {
    // ignore
  }
});

describe("RedemptionStore", () => {
  it("allows concurrent duplicate claims only once per event+nullifier", async () => {
    const store = new RedemptionStore();
    const results = await Promise.all([
      store.claim(1001, "nullifier-x"),
      store.claim(1001, "nullifier-x"),
      store.claim(1001, "nullifier-x"),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("keeps events independent and persists across instances", async () => {
    const first = new RedemptionStore();
    expect(await first.claim(1001, "n1")).toBe(true);
    expect(await first.claim(1002, "n1")).toBe(true);
    const restarted = new RedemptionStore();
    expect(await restarted.claim(1001, "n1")).toBe(false);
    expect(await restarted.claim(1002, "n1")).toBe(false);
    expect(await restarted.claim(1001, "n2")).toBe(true);
  });
});
