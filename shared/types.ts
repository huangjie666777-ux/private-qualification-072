export const TREE_DEPTH = 4;

export interface MerklePath {
  pathElements: string[];
  pathIndices: number[];
}

export interface Credential {
  secret: string;
  score: number;
  leafIndex: number;
  pathElements: string[];
  pathIndices: number[];
}

export interface EventPolicy {
  eventId: number;
  name: string;
  threshold: number;
}

export interface ProofPayload {
  eventId: number;
  proof: unknown;
  publicSignals: string[];
}

export interface VerifyResult {
  verified: boolean;
  redeemed: boolean;
  eventId?: number;
  nullifier?: string;
  reason?: string;
}
