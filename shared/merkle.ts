import { buildPoseidon } from "circomlibjs";

export const TREE_DEPTH = 4;
export const TREE_LEAVES = 2 ** TREE_DEPTH; // 16

let poseidonPromise: ReturnType<typeof buildPoseidon> | null = null;

export function getPoseidon() {
  if (!poseidonPromise) poseidonPromise = buildPoseidon();
  return poseidonPromise;
}

export async function poseidon2(a: string | bigint, b: string | bigint): Promise<string> {
  const poseidon = await getPoseidon();
  const F = poseidon.F;
  const h = poseidon([a, b]);
  return F.toString(h);
}

// Build a complete binary Merkle tree from exactly 2**depth leaves.
// Returns levels[0] = leaves, levels[depth] = [root].
export async function buildMerkleTree(leaves: string[]): Promise<string[][]> {
  if (leaves.length !== TREE_LEAVES) {
    throw new Error(`expected ${TREE_LEAVES} leaves, got ${leaves.length}`);
  }
  const levels: string[][] = [leaves.slice()];
  for (let level = 0; level < TREE_DEPTH; level++) {
    const current = levels[level];
    const next: string[] = [];
    for (let i = 0; i < current.length; i += 2) {
      next.push(await poseidon2(current[i], current[i + 1]));
    }
    levels.push(next);
  }
  return levels;
}

export interface MembershipPath {
  pathElements: string[];
  pathIndices: number[];
  root: string;
}

// Path is ordered leaf -> root to match the circuit's hashing loop.
export function pathForLeaf(levels: string[][], leafIndex: number): MembershipPath {
  const pathElements: string[] = [];
  const pathIndices: number[] = [];
  let index = leafIndex;
  for (let level = 0; level < TREE_DEPTH; level++) {
    pathIndices.push(index & 1);
    const siblingIndex = index ^ 1;
    pathElements.push(levels[level][siblingIndex]);
    index >>= 1;
  }
  return {
    pathElements,
    pathIndices,
    root: levels[TREE_DEPTH][0],
  };
}
