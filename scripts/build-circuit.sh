#!/usr/bin/env bash
# Compile the circuit and run a demo single-party Groth16 setup.
# Requires npm dependencies and parameters/demo-pot12-final.ptau.
set -euo pipefail
cd "$(dirname "$0")/.."

BUILD=build/circuit
PTAU=parameters/demo-pot12-final.ptau
mkdir -p "$BUILD"

echo "[1/5] Compiling circuit with circom (via npm circom2 package)..."
npm run --silent circom -- circuits/qualification.circom --r1cs --wasm --sym \
  -l node_modules -o "$BUILD"

echo "[2/5] Checking constraint count..."
npx --no-install snarkjs r1cs info "$BUILD/qualification.r1cs"

echo "[3/5] Phase-2 setup (groth16 setup)..."
npx --no-install snarkjs groth16 setup "$BUILD/qualification.r1cs" "$PTAU" "$BUILD/qualification_0000.zkey"

echo "[4/5] One demo contribution..."
npx --no-install snarkjs zkey contribute "$BUILD/qualification_0000.zkey" "$BUILD/qualification_final.zkey" \
  --name="demo single-party contribution" -e="demo-entropy-not-secret"

echo "[5/5] Exporting verification key and copying browser artifacts..."
npx --no-install snarkjs zkey export verificationkey "$BUILD/qualification_final.zkey" "$BUILD/verification_key.json"
mkdir -p server-config public/circuit
cp "$BUILD/qualification_final.zkey" server-config/qualification.zkey
cp "$BUILD/verification_key.json" server-config/verification_key.json
cp "$BUILD/qualification_final.zkey" public/circuit/qualification.zkey
cp "$BUILD/qualification_js/qualification.wasm" public/circuit/qualification.wasm
echo "Circuit setup complete."
