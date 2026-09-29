import { useCallback, useEffect, useMemo, useState } from "react";
import type { Credential, EventPolicy, ProofPayload } from "../shared/types.js";
import { generateProof, redeem } from "./prover.js";

interface ServerPolicy {
  merkleRoot: string;
  treeDepth: number;
  events: EventPolicy[];
}

type Stage = "idle" | "proving" | "verifying" | "done";

interface Outcome {
  status: number;
  body: Record<string, unknown>;
}

export function App() {
  const [policy, setPolicy] = useState<ServerPolicy | null>(null);
  const [policyError, setPolicyError] = useState<string>("");
  const [credential, setCredential] = useState<Credential | null>(null);
  const [credentialLabel, setCredentialLabel] = useState<string>("");
  const [eventId, setEventId] = useState<number>(1001);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string>("");
  const [payload, setPayload] = useState<ProofPayload | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  useEffect(() => {
    fetch("/api/policy")
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setPolicy((await res.json()) as ServerPolicy);
      })
      .catch((err: Error) => setPolicyError(`无法获取服务端政策：${err.message}`));
  }, []);

  const selectedEvent = useMemo(
    () => policy?.events.find((e) => e.eventId === eventId) ?? null,
    [policy, eventId],
  );

  // Any input change invalidates the previously generated proof.
  const invalidate = useCallback(() => {
    setPayload(null);
    setOutcome(null);
    setError("");
    setStage("idle");
  }, []);

  const onImport = useCallback(
    async (file: File) => {
      invalidate();
      try {
        const text = await file.text();
        const parsed = JSON.parse(text) as Credential;
        if (
          typeof parsed.secret !== "string" ||
          !Number.isInteger(parsed.score) ||
          !Array.isArray(parsed.pathElements) ||
          !Array.isArray(parsed.pathIndices)
        ) {
          throw new Error("凭证字段缺失或格式错误");
        }
        if (BigInt(parsed.secret) <= 0n) throw new Error("秘密必须为非零值");
        if (parsed.score < 0 || parsed.score > 100) throw new Error("成绩超出 0-100");
        setCredential(parsed);
        setCredentialLabel(file.name);
      } catch (err) {
        setCredential(null);
        setCredentialLabel("");
        setError(`凭证导入失败：${(err as Error).message}`);
      }
    },
    [invalidate],
  );

  const onGenerate = useCallback(async () => {
    if (!credential || !policy || !selectedEvent) return;
    invalidate();
    setStage("proving");
    try {
      const next = await generateProof(
        credential,
        policy.merkleRoot,
        selectedEvent.eventId,
        selectedEvent.threshold,
      );
      setPayload(next);
      setStage("done");
    } catch (err) {
      setError(`证明生成失败（通常是成绩不达标或路径不匹配，电路直接拒绝）：${(err as Error).message}`);
      setStage("idle");
    }
  }, [credential, policy, selectedEvent, invalidate]);

  const onVerify = useCallback(async () => {
    if (!payload) return;
    setStage("verifying");
    setError("");
    setOutcome(null);
    try {
      const result = await redeem(payload);
      setOutcome(result);
    } catch (err) {
      setError(`核验请求失败：${(err as Error).message}`);
    } finally {
      setStage("done");
    }
  }, [payload]);

  return (
    <main className="page">
      <header>
        <h1>零知识成绩凭证核验</h1>
        <p className="sub">
          浏览器内本地生成 Groth16 证明；服务端只持有受信 Merkle 根与活动门槛，
          秘密、成绩与成员路径不上传、不入日志。
        </p>
      </header>

      {policyError && <section className="card error">{policyError}</section>}

      <section className="card">
        <h2>1. 服务端配置（公开）</h2>
        {policy ? (
          <>
            <p className="mono break">受信根：{policy.merkleRoot}</p>
            <ul>
              {policy.events.map((event) => (
                <li key={event.eventId}>
                  活动 {event.eventId} — {event.name}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p>加载中……</p>
        )}
      </section>

      <section className="card">
        <h2>2. 导入凭证（仅留在本机）</h2>
        <input
          type="file"
          accept="application/json,.json"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void onImport(file);
          }}
        />
        {credential && (
          <div className="info">
            <span>已导入：{credentialLabel}</span>
            <span>叶子序号：{credential.leafIndex}</span>
            <span>成绩（仅本机显示）：{credential.score}</span>
            <span>秘密：{credential.secret.slice(0, 10)}…（不会上传）</span>
          </div>
        )}
      </section>

      <section className="card">
        <h2>3. 选择活动并生成证明</h2>
        <select
          value={eventId}
          onChange={(event) => {
            setEventId(Number(event.target.value));
            invalidate();
          }}
        >
          {policy?.events.map((event) => (
            <option key={event.eventId} value={event.eventId}>
              {event.eventId} — {event.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!credential || !policy || stage === "proving"}
          onClick={() => void onGenerate()}
        >
          {stage === "proving" ? "电路计算中……" : "本地生成 Groth16 证明"}
        </button>
        {selectedEvent && credential && (
          <p className={credential.score >= selectedEvent.threshold ? "ok" : "warn"}>
            提示：本凭证成绩 {credential.score}
            {credential.score >= selectedEvent.threshold
              ? ` ≥ 门槛 ${selectedEvent.threshold}，电路可生成证明。`
              : ` &lt; 门槛 ${selectedEvent.threshold}，电路约束会拒绝出证（前端不能绕过）。`}
          </p>
        )}
      </section>

      <section className="card">
        <h2>4. 提交服务端核验与核销</h2>
        <button
          type="button"
          disabled={!payload || stage === "verifying"}
          onClick={() => void onVerify()}
        >
          {stage === "verifying" ? "核验中……" : "提交证明（仅公开信号）"}
        </button>
        {payload && (
          <div className="info mono small">
            <span className="break">nullifier: {payload.publicSignals[0]}</span>
            <span className="break">root: {payload.publicSignals[1]}</span>
            <span>threshold: {payload.publicSignals[2]}</span>
            <span>eventId: {payload.publicSignals[3]}</span>
          </div>
        )}
        {outcome && (
          <pre className={outcome.body.redeemed ? "result ok" : "result warn"}>
            {`HTTP ${outcome.status}\n${JSON.stringify(outcome.body, null, 2)}`}
          </pre>
        )}
        {error && <p className="error-text">{error}</p>}
        <p className="note">
          重新导入凭证、切换活动或修改输入后，旧证明立即失效；同一活动同一 nullifier
          仅能核销一次，不同活动相互独立，核销记录重启后仍保留。
        </p>
      </section>
    </main>
  );
}
