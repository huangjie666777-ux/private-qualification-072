import * as snarkjs from "snarkjs";
import { buildPoseidon } from "circomlibjs";
import type { ActivityPolicy, Credential, ProofPayload } from "../shared/types";

const WASM_URL = "/circuit/qualification.wasm";
const ZKEY_URL = "/circuit/qualification.zkey";

// Public signal order emitted by the Groth16 setup:
// [root, threshold, activityId, nullifier]
export const PUBLIC_SIGNAL_ORDER = ["root", "threshold", "activityId", "nullifier"] as const;

let poseidonPromise: ReturnType<typeof buildPoseidon> | null = null;
function poseidon() {
  if (!poseidonPromise) poseidonPromise = buildPoseidon();
  return poseidonPromise;
}

export async function computeNullifier(secret: string, activityId: string): Promise<string> {
  const p = await poseidon();
  return p.F.toString(p([BigInt(secret), BigInt(activityId)]));
}

export interface GeneratedProof {
  payload: ProofPayload;
  nullifier: string;
  root: string;
}

// Everything here runs in the browser. Secret, score and path never leave
// the device; only public signals and the zk proof are sent to the server.
export async function generateProof(
  credential: Credential,
  activity: ActivityPolicy,
): Promise<GeneratedProof> {
  if (!Number.isInteger(credential.score) || credential.score < 0 || credential.score > 100) {
    throw new Error("成绩必须为 0 至 100 的整数");
  }
  if (!credential.secret || BigInt(credential.secret) === 0n) {
    throw new Error("凭证秘密缺失或为零");
  }
  if (credential.pathElements.length !== 4 || credential.pathIndices.length !== 4) {
    throw new Error("成员路径深度必须为 4");
  }
  if (credential.pathIndices.some((d) => d !== 0 && d !== 1)) {
    throw new Error("路径方向必须为二进制");
  }

  const nullifier = await computeNullifier(credential.secret, activity.activityId);

  const witnessInput = {
    // public
    root: credential.root,
    threshold: activity.threshold,
    activityId: BigInt(activity.activityId).toString(),
    nullifier,
    // private
    secret: credential.secret,
    score: credential.score,
    pathElements: credential.pathElements,
    pathIndices: credential.pathIndices,
  };

  let result: { proof: object; publicSignals: string[] };
  try {
    result = await snarkjs.groth16.fullProve(witnessInput, WASM_URL, ZKEY_URL);
  } catch (error) {
    // Constraint failure (e.g. score below threshold, bad membership path)
    // prevents a witness/proof from being created at all.
    throw new Error(`电路约束不满足，无法生成证明: ${(error as Error).message || String(error)}`);
  }

  return {
    nullifier,
    root: credential.root,
    payload: {
      activityId: activity.activityId,
      proof: result.proof,
      publicSignals: result.publicSignals,
    },
  };
}

export async function redeemProof(payload: ProofPayload): Promise<unknown> {
  const response = await fetch("/api/redeem", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return response.json();
}
