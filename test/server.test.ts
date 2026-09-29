import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { prove } from "./helpers";

const root = resolve(__dirname, "..");
const PORT = 3199;
const base = `http://127.0.0.1:${PORT}`;
let server: ChildProcess;

beforeAll(async () => {
  rmSync(resolve(root, "data", "redemptions.json"), { force: true });
  server = spawn(
    process.execPath,
    ["--import", "tsx", resolve(root, "server", "index.ts")],
    { cwd: root, env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" },
  );
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("server did not start");
}, 60000);

afterAll(() => {
  server.kill();
});

async function post(payload: unknown): Promise<{ status: number; body: any }> {
  const res = await fetch(`${base}/api/redeem`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return { status: res.status, body: await res.json() };
}

describe("server policy enforcement", () => {
  it("redeems a valid proof once and rejects the duplicate", async () => {
    const payload = await prove(5, 1001); // score 60 >= 60
    const first = await post(payload);
    expect(first.status).toBe(200);
    expect(first.body.redeemed).toBe(true);
    const second = await post(payload);
    expect(second.status).toBe(409);
    expect(second.body.redeemed).toBe(false);
  });

  it("rejects an unknown event", async () => {
    const payload = await prove(12, 1001); // score 100
    payload.eventId = 9999;
    const res = await post(payload);
    expect(res.status).toBe(400);
  });

  it("rejects a client-chosen lower threshold", async () => {
    // credential idx 6 has score 58; circuit cannot prove against threshold 60,
    // so build a valid proof for event 1002 policy threshold 85 with a score
    // 100 credential then try to relay its signals claiming event 1001: the
    // eventId/public signal mismatch is enforced. Here we directly tamper the
    // publicSignals threshold which makes the Groth16 proof invalid.
    const payload = await prove(12, 1001);
    payload.publicSignals[2] = "30";
    const res = await post(payload);
    expect([400, 403]).toContain(res.status);
    expect(res.body.redeemed).toBe(false);
  });

  it("rejects a proof bound to a foreign root", async () => {
    // A well-formed proof can only be built for the configured root;
    // tampering the public root invalidates the proof cryptographically.
    const payload = await prove(12, 1002);
    payload.publicSignals[1] = "1";
    const res = await post(payload);
    expect([400, 403]).toContain(res.status);
  });

  it("treats the two events independently", async () => {
    const forA = await prove(0, 1001);
    const forB = await prove(0, 1002);
    const a = await post(forA);
    const b = await post(forB);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.body.nullifier).not.toBe(b.body.nullifier);
  });
});
