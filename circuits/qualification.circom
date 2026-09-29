pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/bitify.circom";
include "circomlib/circuits/comparators.circom";

// 8-bit range: value in [0, 255], which contains [0, 100].
template Range8() {
    signal input value;
    signal output bits[8];
    component dec = Num2Bits(8);
    dec.in <== value;
    for (var i = 0; i < 8; i++) bits[i] <== dec.out[i];
}

// Unsigned a >= b for 8-bit operands (covers 0..255).
template GeU8() {
    signal input a;
    signal input b;
    signal output out;
    // Range checks are applied separately to score/threshold; this compares
    // two 8-bit operands: a >= b  <=>  !(a < b).
    component lt = LessThan(8);
    lt.in[0] <== a;
    lt.in[1] <== b;
    component isZero = IsZero();
    isZero.in <== lt.out;
    out <== isZero.out;
}

// Select between two field elements with a binary switch.
template Mux1() {
    signal input s;
    signal input a;
    signal input b;
    signal output out;
    s * (s - 1) === 0;
    out <== a + s * (b - a);
}

template MerkleProof(depth) {
    signal input leaf;
    signal input pathElements[depth];
    signal input pathIndices[depth];
    signal output root;

    component selectors[depth];
    component hashers[depth];
    signal current[depth + 1];
    current[0] <== leaf;

    for (var i = 0; i < depth; i++) {
        // 0 => sibling on the right (current first); 1 => sibling on the left.
        pathIndices[i] * (pathIndices[i] - 1) === 0;
        selectors[i] = Mux1();
        selectors[i].s <== pathIndices[i];
        selectors[i].a <== current[i];
        selectors[i].b <== pathElements[i];

        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== selectors[i].out;
        hashers[i].inputs[1] <== current[i] + pathElements[i] - selectors[i].out;

        current[i + 1] <== hashers[i].out;
    }
    root <== current[depth];
}

// Public signals: root, threshold, activityId, nullifier.
// Private signals: secret, score, pathElements[4], pathIndices[4].
template Qualification(depth) {
    signal input root;
    signal input threshold;
    signal input activityId;
    signal input nullifier;
    signal input secret;
    signal input score;
    signal input pathElements[depth];
    signal input pathIndices[depth];

    // Secret must be non-zero.
    component secretNonZero = IsZero();
    secretNonZero.in <== secret;
    secretNonZero.out === 0;

    // score in [0, 100].
    component scoreGe0 = GeU8();
    scoreGe0.a <== score;
    scoreGe0.b <== 0;
    scoreGe0.out === 1;
    component scoreLe100 = GeU8();
    scoreLe100.a <== 100;
    scoreLe100.b <== score;
    scoreLe100.out === 1;

    // threshold in [0, 100].
    component thresholdGe0 = GeU8();
    thresholdGe0.a <== threshold;
    thresholdGe0.b <== 0;
    thresholdGe0.out === 1;
    component thresholdLe100 = GeU8();
    thresholdLe100.a <== 100;
    thresholdLe100.b <== threshold;
    thresholdLe100.out === 1;

    // Qualification: score >= threshold.
    component qualifies = GeU8();
    qualifies.a <== score;
    qualifies.b <== threshold;
    qualifies.out === 1;

    // Commitment leaf = Poseidon(secret, score).
    component leafHasher = Poseidon(2);
    leafHasher.inputs[0] <== secret;
    leafHasher.inputs[1] <== score;

    // Merkle membership against root.
    component tree = MerkleProof(depth);
    tree.leaf <== leafHasher.out;
    for (var i = 0; i < depth; i++) {
        tree.pathElements[i] <== pathElements[i];
        tree.pathIndices[i] <== pathIndices[i];
    }
    tree.root === root;

    // Nullifier = Poseidon(secret, activityId).
    component nullifierHasher = Poseidon(2);
    nullifierHasher.inputs[0] <== secret;
    nullifierHasher.inputs[1] <== activityId;
    nullifierHasher.out === nullifier;
}

component main {public [root, threshold, activityId, nullifier]} = Qualification(4);
