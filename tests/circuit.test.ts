import { describe, expect, it } from "vitest";
import { buildPoseidon } from "circomlibjs";
import { loadBundle, makeProof } from "./helpers";

const bundle = loadBundle();
const byIndex = (i: number) => bundle.credentials[i];

describe("qualification circuit", () => {
  it("proves a passing credential for both activities", async () => {
    const standard = await makeProof(byIndex(0), "77777777");
    expect(standard.publicSignals[0]).toBe(bundle.root);
    expect(standard.publicSignals[1]).toBe("60");
    expect(standard.publicSignals[2]).toBe("77777777");

    const advanced = await makeProof(byIndex(0), "31415926");
    expect(advanced.publicSignals[1]).toBe("90");
    expect(advanced.publicSignals[3]).not.toBe(standard.publicSignals[3]);
  });

  it("allows boundary scores equal to the threshold", async () => {
    const advanced = await makeProof(byIndex(2), "31415926"); // score 90
    expect(advanced.publicSignals[1]).toBe("90");
    const standard = await makeProof(byIndex(8), "77777777"); // score 60
    expect(standard.publicSignals[1]).toBe("60");
  });

  it("refuses to build a witness when score is below threshold", async () => {
    await expect(makeProof(byIndex(9), "77777777")).rejects.toThrow(/Assert|constraint/i);
    await expect(makeProof(byIndex(8), "31415926")).rejects.toThrow(/Assert|constraint/i);
  });

  it("refuses a non-member root or an out-of-range threshold", async () => {
    await expect(makeProof(byIndex(0), "77777777", undefined, "1")).rejects.toThrow(/Assert|constraint/i);
    await expect(makeProof(byIndex(0), "77777777", 101)).rejects.toThrow(/Assert|constraint/i);
  });

  it("rejects a zero secret even with passing score", async () => {
    const credential = { ...byIndex(0), secret: "0" };
    await expect(makeProof(credential, "77777777")).rejects.toThrow(/Assert|constraint|Error/i);
  });

  it("nullifier is Poseidon(secret, activityId) and differs per activity", async () => {
    const poseidon = await buildPoseidon();
    const credential = byIndex(0);
    const standard = await makeProof(credential, "77777777");
    const advanced = await makeProof(credential, "31415926");
    const expected = poseidon.F.toString(poseidon([BigInt(credential.secret), 77777777n]));
    expect(standard.publicSignals[3]).toBe(expected);
    expect(standard.publicSignals[3]).not.toBe(advanced.publicSignals[3]);
  });
});
