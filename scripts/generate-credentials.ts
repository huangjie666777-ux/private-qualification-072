// Generates 16 demo credentials, a depth-4 Poseidon Merkle tree and the
// server-side policy configuration. Run: npx tsx scripts/generate-credentials.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import {
  buildMerkleTree,
  getPoseidon,
  pathForLeaf,
  poseidon2,
  TREE_LEAVES,
} from "../shared/merkle.ts";
import type { ActivityPolicy, Credential, GeneratedBundle } from "../shared/types.ts";

const here = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(here, "..");

// Fixed demo scores in [0, 100], spread across pass/fail for both activities.
const SCORES = [98, 95, 90, 88, 85, 80, 72, 65, 60, 55, 50, 40, 30, 20, 10, 0];

const ACTIVITIES: ActivityPolicy[] = [
  { id: "act-advanced", activityId: "31415926", name: "进阶训练营（门槛 90）", threshold: 90 },
  { id: "act-standard", activityId: "77777777", name: "标准体验课（门槛 60）", threshold: 60 },
];

async function randomNonZeroSecret(): Promise<string> {
  const poseidon = await getPoseidon();
  const F = poseidon.F;
  const order = F.p;
  // 31 random bytes -> well below the BN254 scalar modulus.
  let candidate = 0n;
  do {
    const bytes = randomBytes(31);
    candidate = BigInt("0x" + bytes.toString("hex")) % order;
  } while (candidate === 0n);
  return candidate.toString();
}

async function main() {
  if (SCORES.length !== TREE_LEAVES) throw new Error("need exactly 16 scores");

  const secrets: string[] = [];
  const leaves: string[] = [];
  for (let i = 0; i < TREE_LEAVES; i++) {
    const secret = await randomNonZeroSecret();
    secrets.push(secret);
    leaves.push(await poseidon2(secret, BigInt(SCORES[i])));
  }

  const levels = await buildMerkleTree(leaves);
  const root = levels[4][0];

  const credentials: Credential[] = SCORES.map((score, i) => {
    const path = pathForLeaf(levels, i);
    return {
      version: 1,
      secret: secrets[i],
      score,
      leafIndex: i,
      pathElements: path.pathElements,
      pathIndices: path.pathIndices,
      root,
    };
  });

  const bundle: GeneratedBundle = { root, depth: 4, activities: ACTIVITIES, credentials };

  const serverConfigDir = resolve(rootDir, "server-config");
  const publicDemoDir = resolve(rootDir, "public/demo");
  mkdirSync(serverConfigDir, { recursive: true });
  mkdirSync(publicDemoDir, { recursive: true });

  // The server only learns the trusted root and the activity policies.
  writeFileSync(
    resolve(serverConfigDir, "policy.json"),
    JSON.stringify({ root, depth: 4, activities: ACTIVITIES }, null, 2) + "\n",
  );

  // Individual credential files for the holder to import.
  for (const credential of credentials) {
    const name = `credential-${String(credential.leafIndex).padStart(2, "0")}-score${credential.score}.json`;
    writeFileSync(resolve(publicDemoDir, name), JSON.stringify(credential, null, 2) + "\n");
  }

  // Full bundle (contains secrets!) for local demo convenience only.
  writeFileSync(resolve(publicDemoDir, "bundle.secret.json"), JSON.stringify(bundle, null, 2) + "\n");

  const summary = credentials
    .map((c) => `  #${String(c.leafIndex).padStart(2, " ")} score=${String(c.score).padStart(3, " ")}  ${c.score >= 90 ? "进阶+标准" : c.score >= 60 ? "仅标准" : "均不达标"}`)
    .join("\n");
  console.log(`Merkle root: ${root}\nActivities:\n${ACTIVITIES.map((a) => `  ${a.id}: activityId=${a.activityId} threshold=${a.threshold}`).join("\n")}\nCredentials:\n${summary}\nWrote server-config/policy.json and public/demo/*.json`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
