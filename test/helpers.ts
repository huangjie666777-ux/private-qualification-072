import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as snarkjs from "snarkjs";
import type { Credential, ProofPayload } from "../shared/types.js";

const root = resolve(__dirname, "..");

export function paths() {
  return {
    root,
    wasm: resolve(root, "zk", "qualification_js", "qualification.wasm"),
    zkey: resolve(root, "zk", "qualification_final.zkey"),
    vkey: resolve(root, "zk", "verification_key.json"),
  };
}

export function loadPolicy(): {
  merkleRoot: string;
  events: { eventId: number; name: string; threshold: number }[];
} {
  return JSON.parse(
    readFileSync(resolve(root, "data", "policy.json"), "utf8"),
  );
}

export function loadCredential(index: number): Credential {
  return JSON.parse(
    readFileSync(
      resolve(root, "credentials", `credential-${String(index).padStart(2, "0")}.json`),
      "utf8",
    ),
  );
}

export async function prove(
  index: number,
  eventId: number,
  overrides: Partial<{
    secret: string;
    score: number;
    root: string;
    threshold: number;
    tamperedEvent: number;
  }> = {},
): Promise<ProofPayload> {
  const policy = loadPolicy();
  const event = policy.events.find((e) => e.eventId === eventId)!;
  const credential = loadCredential(index);
  const { wasm, zkey } = paths();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    {
      secret: overrides.secret ?? credential.secret,
      score: overrides.score ?? credential.score,
      pathElements: credential.pathElements,
      pathIndices: credential.pathIndices,
      root: overrides.root ?? policy.merkleRoot,
      threshold: overrides.threshold ?? event.threshold,
      eventId: overrides.tamperedEvent ?? event.eventId,
    },
    wasm,
    zkey,
  );
  return { eventId, proof, publicSignals };
}

export async function verifyProof(payload: ProofPayload): Promise<boolean> {
  const { vkey } = paths();
  return snarkjs.groth16.verify(
    JSON.parse(readFileSync(vkey, "utf8")),
    payload.publicSignals,
    payload.proof as never,
  );
}
