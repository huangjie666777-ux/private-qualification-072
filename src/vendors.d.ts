declare module "snarkjs" {
  export interface Groth16Proof {
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
    protocol: string;
    curve: string;
  }
  export const groth16: {
    fullProve(
      input: Record<string, unknown>,
      wasmFile: string | Uint8Array,
      zkeyFile: string | Uint8Array,
    ): Promise<{ proof: Groth16Proof; publicSignals: string[] }>;
    verify(
      vkey: unknown,
      publicSignals: string[],
      proof: Groth16Proof,
    ): Promise<boolean>;
  };
  export const zKey: {
    newZKey(r1cs: string, ptau: string, zkey: string): Promise<void>;
    contribute(
      zkeyOld: string,
      zkeyNew: string,
      name: string,
      entropy: string,
    ): Promise<void>;
    exportVerificationKey(zkey: string): Promise<unknown>;
  };
}

declare module "circomlibjs" {
  interface PoseidonInstance {
    (inputs: (bigint | string | number)[]): unknown;
    F: { toObject(value: unknown): bigint | string };
  }
  export function buildPoseidon(): Promise<PoseidonInstance>;
}
