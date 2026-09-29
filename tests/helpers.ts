import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as snarkjs from "snarkjs";
import { buildPoseidon } from "circomlibjs";
import type { Credential, GeneratedBundle, ProofPayload } from "../shared/types";
import { buildMerkleTree, pathForLeaf, poseidon2, TREE_LEAVES } from "../shared/merkle";

export const ROOT_DIR = join(process.cwd());
const WASM = join(ROOT_DIR, "build/circuit/qualification_js/qualification.wasm");
const ZKEY = join(ROOT_DIR, "build/circuit/qualification_final.zkey");

export function loadBundle(): GeneratedBundle {
  return JSON.parse(readFileSync(join(ROOT_DIR, "public/demo/bundle.secret.json"), "utf8"));
}

export async function makeProof(
  credential: Credential,
  activityId: string,
  thresholdOverride?: number,
  rootOverride?: string,
): Promise<{ proof: object; publicSignals: string[] }> {
  const bundle = loadBundle();
  const activity = bundle.activities.find((a) => a.activityId === activityId);
  if (!activity) throw new Error("unknown activity");
  const poseidon = await buildPoseidon();
  const nullifier = poseidon.F.toString(
    poseidon([BigInt(credential.secret), BigInt(activity.activityId)]),
  );
  return snarkjs.groth16.fullProve(
    {
      root: rootOverride ?? credential.root,
      threshold: thresholdOverride ?? activity.threshold,
      activityId: BigInt(activity.activityId).toString(),
      nullifier,
      secret: credential.secret,
      score: credential.score,
      pathElements: credential.pathElements,
      pathIndices: credential.pathIndices,
    },
    WASM,
    ZKEY,
  );
}

export async function payload(
  credential: Credential,
  activityId: string,
  overrides?: { threshold?: number; root?: string; signals?: (s: string[]) => string[] },
): Promise<ProofPayload> {
  const result = await makeProof(credential, activityId, overrides?.threshold, overrides?.root);
  const publicSignals = overrides?.signals ? overrides.signals(result.publicSignals) : result.publicSignals;
  return { activityId, proof: result.proof, publicSignals };
}

export { buildMerkleTree, pathForLeaf, poseidon2, TREE_LEAVES };
