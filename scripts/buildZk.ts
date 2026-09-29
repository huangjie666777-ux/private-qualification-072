import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as snarkjs from "snarkjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const zkDir = resolve(root, "zk");
const publicDir = resolve(root, "public", "zk");
const includeDir = resolve(root, "node_modules", "circomlib", "circuits");
const ptau = resolve(root, "parameters", "demo-pot12-final.ptau");

const circuit = resolve(zkDir, "qualification");
const r1cs = `${circuit}.r1cs`;
const wasm = resolve(zkDir, "qualification_js", "qualification.wasm");
const zkey0 = resolve(zkDir, "qualification_0.zkey");
const zkeyFinal = resolve(zkDir, "qualification_final.zkey");
const vkeyPath = resolve(zkDir, "verification_key.json");

function runCircom(): void {
  if (existsSync(r1cs) && existsSync(wasm) && existsSync(zkeyFinal) && existsSync(vkeyPath)) {
    console.log("zk artifacts already built, skipping");
    return;
  }
  mkdirSync(zkDir, { recursive: true });
  console.log("compiling circuit with circom2 ...");
  execFileSync(
    resolve(root, "node_modules", ".bin", "circom2"),
    [
      resolve(root, "circuits", "qualification.circom"),
      "--r1cs",
      "--wasm",
      "--sym",
      "-o",
      zkDir,
      "-l",
      includeDir,
    ],
    { stdio: "inherit" },
  );
}

async function setup(): Promise<void> {
  if (!existsSync(zkeyFinal)) {
    console.log("phase 2: new zkey ...");
    await snarkjs.zKey.newZKey(r1cs, ptau, zkey0);
    console.log("single-party demo contribution ...");
    await snarkjs.zKey.contribute(
      zkey0,
      zkeyFinal,
      "local-demo-contribution",
      "demo-entropy-not-secret-072",
    );
  }
  if (!existsSync(vkeyPath)) {
    const vkey = await snarkjs.zKey.exportVerificationKey(zkeyFinal);
    writeFileSync(vkeyPath, JSON.stringify(vkey));
  }
}

function publishForBrowser(): void {
  mkdirSync(publicDir, { recursive: true });
  cpSync(wasm, resolve(publicDir, "qualification.wasm"));
  cpSync(zkeyFinal, resolve(publicDir, "qualification_final.zkey"));
  const vkeyJson = JSON.parse(readFileSync(vkeyPath, "utf8")) as unknown;
  writeFileSync(resolve(publicDir, "verification_key.json"), JSON.stringify(vkeyJson));
}

runCircom();
await setup();
publishForBrowser();
console.log("zk build complete:", { r1cs, wasm, zkeyFinal, vkeyPath });
// snarkjs may keep worker threads alive; the build is complete here.
process.exit(0);
