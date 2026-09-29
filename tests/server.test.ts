import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { rmSync } from "node:fs";
import { join } from "node:path";

// Isolated DB for the integration test; removed afterwards.
process.env.DEMO_DB_PATH = join(process.cwd(), "server-data/test-redemptions.db");
for (const suffix of ["", "-wal", "-shm"]) rmSync(process.env.DEMO_DB_PATH + suffix, { force: true });
const { app } = await import("../server/index");
const { loadBundle, payload } = await import("./helpers");

const bundle = loadBundle();

let server: Server;
let baseUrl: string;
const byIndex = (i: number) => bundle.credentials[i];

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  for (const suffix of ["", "-wal", "-shm"]) {
    rmSync(process.env.DEMO_DB_PATH + suffix, { force: true });
  }
});

async function postRedeem(body: unknown) {
  const response = await fetch(baseUrl + "/api/redeem", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    json: (await response.json()) as { ok?: boolean; error?: string; duplicate?: boolean },
  };
}

describe("verification service", () => {
  it("exposes policy with trusted root and activities", async () => {
    const response = await fetch(baseUrl + "/api/policy");
    const json = (await response.json()) as { root: string; activities: { threshold: number }[] };
    expect(json.root).toBe(bundle.root);
    expect(json.activities.map((a) => a.threshold).sort()).toEqual([60, 90]);
  });

  it("accepts a valid proof and redeems once; duplicate fails without consuming", async () => {
    const proof = await payload(byIndex(0), "77777777");
    const first = await postRedeem(proof);
    expect(first.status).toBe(200);
    expect(first.json.ok).toBe(true);

    const second = await postRedeem(proof);
    expect(second.status).toBe(409);
    expect(second.json.duplicate ?? false).toBe(true);
  });

  it("keeps activities independent for the same holder", async () => {
    const proof = await payload(byIndex(0), "31415926");
    const result = await postRedeem(proof);
    expect(result.status).toBe(200);
    expect(result.json.ok).toBe(true);
  });

  it("rejects a self-chosen root even if the proof is otherwise valid", async () => {
    // Build valid proof against the trusted root, then rewrite the root signal
    // in the submitted payload. Pairing check must fail.
    const proof = await payload(byIndex(1), "77777777");
    const tampered = { ...proof, publicSignals: ["1", ...proof.publicSignals.slice(1)] };
    const result = await postRedeem(tampered);
    expect([400]).toContain(result.status);
    expect(result.json.ok).toBeFalsy();
  });

  it("rejects an attempt to lower the threshold", async () => {
    // score 72 passes only the standard 60 threshold; circuit proves with the
    // configured 60. Submitting the same proof while claiming threshold 1 must
    // be rejected because proof signals bind the threshold.
    const proof = await payload(byIndex(6), "77777777");
    const lowered = { ...proof, publicSignals: proof.publicSignals.map((s, i) => (i === 1 ? "1" : s)) };
    const result = await postRedeem(lowered);
    expect(result.status).toBe(400);
    expect(result.json.error).toMatch(/threshold|invalid proof/);
  });

  it("rejects unknown activity and malformed payload", async () => {
    const proof = await payload(byIndex(1), "77777777");
    const unknown = await postRedeem({ ...proof, activityId: "12345" });
    expect(unknown.status).toBe(400);
    const malformed = await postRedeem({});
    expect(malformed.status).toBe(400);
  });

  it("allows exactly one success for concurrent duplicate submissions", async () => {
    const proof = await payload(byIndex(3), "77777777"); // unused so far
    const responses = await Promise.all(
      Array.from({ length: 6 }, () =>
        fetch(baseUrl + "/api/redeem", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(proof),
        }),
      ),
    );
    const statuses = responses.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(5);
  });
});
