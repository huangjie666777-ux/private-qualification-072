// Shared types for the zero-knowledge qualification demo.

export interface Credential {
  version: 1;
  // Private holder secret (non-zero field element). Never sent to the server.
  secret: string;
  // Integer score in [0, 100].
  score: number;
  leafIndex: number;
  // Merkle membership path, root -> leaf direction.
  pathElements: string[];
  // 0 = sibling on the right, 1 = sibling on the left (root -> leaf order).
  pathIndices: number[];
  root: string;
}

export interface ActivityPolicy {
  id: string;
  activityId: string;
  name: string;
  threshold: number;
}

export interface GeneratedBundle {
  root: string;
  depth: number;
  activities: ActivityPolicy[];
  credentials: Credential[];
}

export interface ProofPayload {
  activityId: string;
  // snarkjs groth16 proof, serialized.
  proof: unknown;
  // Public signals: [root, threshold, activityId, nullifier].
  publicSignals: string[];
}
