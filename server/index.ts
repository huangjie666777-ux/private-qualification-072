import express from "express";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import * as snarkjs from "snarkjs";
import { loadPolicy } from "./policy.js";
import { RedemptionStore } from "./store.js";
import type { ProofPayload, VerifyResult } from "../shared/types.js";

const here = dirname(fileURLToPath(import.meta.url));
const vkey = JSON.parse(
  readFileSync(resolve(here, "..", "zk", "verification_key.json"), "utf8"),
) as unknown;

const policy = loadPolicy();
const store = new RedemptionStore();

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Public configuration: trusted root and server-side event thresholds.
app.get("/api/policy", (_req, res) => {
  res.json({
    merkleRoot: policy.merkleRoot,
    treeDepth: policy.treeDepth,
    events: policy.events,
  });
});

app.post("/api/redeem", async (req, res) => {
  const body = req.body as Partial<ProofPayload>;
  const fail = (status: number, reason: string): void => {
    // Never log secrets: the body contains no secret/score/path, and the
    // rejection log only records the reason.
    console.log("redeem rejected:", reason);
    res.status(status).json({ verified: false, redeemed: false, reason } satisfies VerifyResult);
  };

  const event = policy.events.find((e) => e.eventId === body?.eventId);
  if (!event) {
    fail(400, "unknown event");
    return;
  }
  if (!body || typeof body.proof !== "object" || !Array.isArray(body.publicSignals)) {
    fail(400, "malformed payload");
    return;
  }

  // snarkjs public signal order: circuit outputs first, then public inputs
  // in declaration order -> [nullifier, root, threshold, eventId].
  const [nullifier, root, threshold, eventId] = body.publicSignals as string[];
  if (
    root === undefined ||
    threshold === undefined ||
    eventId === undefined ||
    nullifier === undefined
  ) {
    fail(400, "missing public signals");
    return;
  }

  // Enforce server policy: the client cannot choose its own root or lower the
  // threshold, and the proof must bind to this event id.
  if (BigInt(root) !== BigInt(policy.merkleRoot)) {
    fail(403, "merkle root mismatch");
    return;
  }
  if (Number(threshold) !== event.threshold) {
    fail(403, "threshold mismatch");
    return;
  }
  if (BigInt(eventId) !== BigInt(event.eventId)) {
    fail(403, "event id mismatch");
    return;
  }

  let valid = false;
  try {
    valid = await snarkjs.groth16.verify(
      vkey,
      body.publicSignals,
      body.proof as never,
    );
  } catch (error) {
    fail(400, `proof verification error: ${(error as Error).message}`);
    return;
  }
  if (!valid) {
    // Failed verification does not consume the qualification.
    fail(403, "invalid proof");
    return;
  }

  const redeemed = await store.claim(event.eventId, nullifier);
  if (!redeemed) {
    res.status(409).json({
      verified: true,
      redeemed: false,
      eventId: event.eventId,
      nullifier,
      reason: "already redeemed for this event",
    } satisfies VerifyResult);
    return;
  }
  console.log("redeem accepted:", { eventId: event.eventId, nullifier });
  res.json({
    verified: true,
    redeemed: true,
    eventId: event.eventId,
    nullifier,
  } satisfies VerifyResult);
});

const port = Number(process.env.PORT || 3001);
app.listen(port, "127.0.0.1", () => {
  console.log(`verification server listening on http://127.0.0.1:${port}`);
  console.log("trusted root:", policy.merkleRoot);
});
