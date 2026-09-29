import { buildPoseidon } from "circomlibjs";
import type { PoseidonFn } from "./poseidon-types.js";

let cached: PoseidonFn | undefined;

export async function poseidon(): Promise<PoseidonFn> {
  if (!cached) {
    const instance = await buildPoseidon();
    cached = (inputs: bigint[]): bigint =>
      instance.F.toObject(instance(inputs)) as bigint;
  }
  return cached;
}
