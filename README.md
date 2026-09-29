# Private Qualification

Generic React and Express scaffold with a local zero-knowledge toolchain.

- Node.js 22.19.0, npm 10.9.3, TypeScript 5.8.3, React 19.0.0, Vite 6.2.0.
- circom2 0.2.23 provides the Circom compiler through WebAssembly; use `npm run circom -- --version` and `npm run circom -- circuit.circom --r1cs --wasm --sym -o OUTPUT`.
- snarkjs 0.7.6, circomlib 2.0.5 and circomlibjs 0.1.7 are installed locally. `npx --no-install snarkjs --help` shows tooling.
- `parameters/demo-pot12-final.ptau` is a locally generated BN128 power-12 universal demo parameter file, supporting up to 4096 constraints. It is prepared for phase 2. Circuit-specific Groth16 setup and proving keys are not included.
- This single-party ceremony is for synthetic local demonstration only. It is not a production trusted setup. No production security guarantee is made.

Run `npm run dev` for the frontend, `npm run dev:server` for the generic backend, and `npm run build` for TypeScript checks and frontend build. Vitest is available as `npm test`; no business logic or tests have been implemented. Node's built-in SQLite is available if needed.

The scaffold does not implement credentials, Merkle trees, circuits, proof creation, policy verification or redemption.
