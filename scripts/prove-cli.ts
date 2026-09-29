// CLI helper: generate a real Groth16 proof for one credential/activity.
// Usage: npx tsx scripts/prove-cli.ts <credentialIndex> <activityId> [outFile]
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as snarkjs from "snarkjs";
import { buildPoseidon } from "circomlibjs";
import type { GeneratedBundle, ProofPayload } from "../shared/types.ts";

const here = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(here, "..");

async function main() {
  const index = Number(process.argv[2] ?? "0");
  const activityId = process.argv[3] ?? "77777777";
  const outFile = process.argv[4];

  const bundle = JSON.parse(
    readFileSync(join(rootDir, "public/demo/bundle.secret.json"), "utf8"),
  ) as GeneratedBundle;
  const credential = bundle.credentials.find((c) => c.leafIndex === index);
  const activity = bundle.activities.find((a) => a.activityId === activityId);
  if (!credential || !activity) throw new Error("credential or activity not found");

  const poseidon = await buildPoseidon();
  const nullifier = poseidon.F.toString(
    poseidon([BigInt(credential.secret), BigInt(activity.activityId)]),
  );

  const input = {
    root: credential.root,
    threshold: activity.threshold,
    activityId: BigInt(activity.activityId).toString(),
    nullifier,
    secret: credential.secret,
    score: credential.score,
    pathElements: credential.pathElements,
    pathIndices: credential.pathIndices,
  };

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    join(rootDir, "build/circuit/qualification_js/qualification.wasm"),
    join(rootDir, "build/circuit/qualification_final.zkey"),
  );

  const payload: ProofPayload = {
    activityId: activity.activityId,
    proof,
    publicSignals,
  };
  const text = JSON.stringify(payload, null, 2);
  if (outFile) {
    writeFileSync(resolve(rootDir, outFile), text + "\n");
    console.log(`wrote ${outFile}`);
  } else {
    console.log(text);
  }
  console.error(`score=${credential.score} threshold=${activity.threshold} publicSignals=${JSON.stringify(publicSignals)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
