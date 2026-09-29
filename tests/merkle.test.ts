import { describe, expect, it } from "vitest";
import { buildMerkleTree, pathForLeaf, poseidon2, TREE_LEAVES } from "../shared/merkle";

// Rebuild the root from a membership path, leaf -> root.
async function rootFromPath(leaf: string, elements: string[], indices: number[]) {
  let current = leaf;
  for (let i = 0; i < elements.length; i++) {
    if (indices[i] === 0) current = await poseidon2(current, elements[i]);
    else current = await poseidon2(elements[i], current);
  }
  return current;
}

describe("depth-4 Poseidon Merkle tree", () => {
  it("has 16 leaves and each stored path reconstructs the root", async () => {
    const leaves: string[] = [];
    for (let i = 0; i < TREE_LEAVES; i++) leaves.push(await poseidon2(BigInt(i + 1), BigInt(100 - i)));
    const levels = await buildMerkleTree(leaves);
    const root = levels[4][0];

    for (let i = 0; i < TREE_LEAVES; i++) {
      const path = pathForLeaf(levels, i);
      expect(path.pathElements).toHaveLength(4);
      expect(path.pathIndices).toHaveLength(4);
      expect(path.pathIndices.every((d) => d === 0 || d === 1)).toBe(true);
      expect(path.root).toBe(root);
      expect(await rootFromPath(leaves[i], path.pathElements, path.pathIndices)).toBe(root);
    }
  });

  it("produces distinct roots for changed leaves", async () => {
    const leavesA = await Promise.all(Array.from({ length: 16 }, (_, i) => poseidon2(1n, BigInt(i))));
    const leavesB = await Promise.all(Array.from({ length: 16 }, (_, i) => poseidon2(2n, BigInt(i))));
    expect((await buildMerkleTree(leavesA))[4][0]).not.toBe((await buildMerkleTree(leavesB))[4][0]);
  });
});
