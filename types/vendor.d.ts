declare module "snarkjs" {
  export interface Groth16Proof {
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
    protocol: string;
    curve: string;
  }
  export namespace groth16 {
    function fullProve(
      input: Record<string, unknown>,
      wasmFile: string | Uint8Array,
      zkeyFile: string | Uint8Array,
    ): Promise<{ proof: Groth16Proof; publicSignals: string[] }>;
    function verify(
      verificationKey: unknown,
      publicSignals: string[],
      proof: unknown,
    ): Promise<boolean>;
  }
  const snarkjs: { groth16: typeof groth16 };
  export default snarkjs;
}

declare module "circomlibjs" {
  interface PoseidonFn {
    (inputs: (bigint | string | number)[]): unknown;
    F: { toString(value: unknown): string; p: bigint };
  }
  export function buildPoseidon(options?: unknown): Promise<PoseidonFn>;
}
