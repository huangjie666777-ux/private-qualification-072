import { groth16 } from "snarkjs";
import type { Credential, ProofPayload } from "../shared/types.js";

const WASM_URL = "zk/qualification.wasm";
const ZKEY_URL = "zk/qualification_final.zkey";

// Generates the Groth16 proof entirely in the browser. Only the proof and the
// four public signals (root, threshold, eventId, nullifier) ever leave the
// page; secret, score and Merkle path stay local.
export async function generateProof(
  credential: Credential,
  merkleRoot: string,
  eventId: number,
  threshold: number,
): Promise<ProofPayload> {
  const input = {
    secret: BigInt(credential.secret).toString(),
    score: credential.score,
    pathElements: credential.pathElements,
    pathIndices: credential.pathIndices,
    root: BigInt(merkleRoot).toString(),
    threshold,
    eventId,
  };
  const { proof, publicSignals } = await groth16.fullProve(
    input,
    WASM_URL,
    ZKEY_URL,
  );
  return { eventId, proof, publicSignals };
}

export async function redeem(payload: ProofPayload): Promise<{
  status: number;
  body: Record<string, unknown>;
}> {
  const response = await fetch("/api/redeem", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await response.json()) as Record<string, unknown>;
  return { status: response.status, body };
}
