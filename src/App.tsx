import { useEffect, useMemo, useState } from "react";
import type { ActivityPolicy, Credential, ProofPayload } from "../shared/types";
import { generateProof, redeemProof, PUBLIC_SIGNAL_ORDER } from "./proof";
import "./styles.css";

interface PolicyResponse {
  root: string;
  depth: number;
  activities: ActivityPolicy[];
}

type Stage = "idle" | "proving" | "redeeming" | "proved" | "redeemed" | "error";

// Files shipped with the demo, covering passing/failing holders.
const DEMO_FILES = [
  { file: "credential-00-score98.json", label: "#0 成绩 98（达标）" },
  { file: "credential-02-score90.json", label: "#2 成绩 90（刚好进阶）" },
  { file: "credential-08-score60.json", label: "#8 成绩 60（刚好标准）" },
  { file: "credential-09-score55.json", label: "#9 成绩 55（不达标）" },
  { file: "credential-15-score0.json", label: "#15 成绩 0（不达标）" },
];

export default function App() {
  const [policy, setPolicy] = useState<PolicyResponse | null>(null);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [credential, setCredential] = useState<Credential | null>(null);
  const [rawInput, setRawInput] = useState("");
  const [activityId, setActivityId] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [message, setMessage] = useState("");
  const [payload, setPayload] = useState<ProofPayload | null>(null);
  const [redeemResult, setRedeemResult] = useState<unknown>(null);

  useEffect(() => {
    fetch("/api/policy")
      .then((r) => r.json())
      .then((data: PolicyResponse) => {
        setPolicy(data);
        setActivityId(data.activities[0]?.activityId ?? "");
      })
      .catch((error) => setPolicyError(String(error)));
  }, []);

  const activity = useMemo(
    () => policy?.activities.find((a) => a.activityId === activityId) ?? null,
    [policy, activityId],
  );

  // Any change to credential or activity invalidates the previous proof.
  useEffect(() => {
    setStage("idle");
    setMessage("");
    setPayload(null);
    setRedeemResult(null);
  }, [rawInput, activityId]);

  function importCredential(text: string) {
    try {
      const parsed = JSON.parse(text) as Credential;
      if (
        parsed.version !== 1 ||
        typeof parsed.secret !== "string" ||
        !Number.isInteger(parsed.score) ||
        !Array.isArray(parsed.pathElements) ||
        !Array.isArray(parsed.pathIndices) ||
        typeof parsed.root !== "string"
      ) {
        throw new Error("凭证字段不完整");
      }
      setCredential(parsed);
      setMessage(`已导入凭证 #${parsed.leafIndex}，成绩 ${parsed.score}`);
      setStage("idle");
    } catch (error) {
      setCredential(null);
      setStage("error");
      setMessage(`导入失败: ${(error as Error).message}`);
    }
  }

  async function loadDemo(file: string) {
    const response = await fetch(`/demo/${file}`);
    const text = await response.text();
    setRawInput(text);
    importCredential(text);
  }

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    void file.text().then((text) => {
      setRawInput(text);
      importCredential(text);
    });
  }

  async function onGenerate() {
    if (!credential || !activity) return;
    setStage("proving");
    setMessage("正在浏览器本地生成 Groth16 证明（秘密与路径不会离开本机）…");
    setPayload(null);
    setRedeemResult(null);
    try {
      const result = await generateProof(credential, activity);
      setPayload(result.payload);
      setStage("proved");
      setMessage(`证明生成成功。nullifier = ${result.nullifier}`);
    } catch (error) {
      setStage("error");
      setMessage((error as Error).message);
    }
  }

  async function onRedeem() {
    if (!payload) return;
    setStage("redeeming");
    setMessage("正在提交公开信号与证明到核验服务…");
    try {
      const result = await redeemProof(payload);
      setRedeemResult(result);
      if ((result as { ok?: boolean }).ok) {
        setStage("redeemed");
        setMessage("核验通过并核销成功");
      } else {
        setStage("proved");
        setMessage(`服务端拒绝: ${(result as { error?: string }).error ?? "未知错误"}`);
      }
    } catch (error) {
      setStage("proved");
      setMessage(`请求失败: ${(error as Error).message}`);
    }
  }

  const rootMatch = credential && policy ? credential.root === policy.root : null;
  const scorePass = credential && activity ? credential.score >= activity.threshold : null;

  return (
    <main>
      <h1>零知识成绩凭证核验</h1>
      <p className="subtitle">
        持证人本地生成 Groth16 证明：不泄露具体成绩、秘密或身份；服务端只持有受信 Merkle 根与活动门槛。
      </p>

      <section className="card">
        <h2>1. 服务端活动政策</h2>
        {policyError && <span className="tag fail">无法获取政策：{policyError}</span>}
        {policy && (
          <>
            <div className="small">
              受信根（Poseidon 深度 4 树）：<span className="mono">{policy.root}</span>
            </div>
            <ul className="notes">
              {policy.activities.map((a) => (
                <li key={a.activityId}>
                  {a.name} · activityId={a.activityId} · 门槛 {a.threshold}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="card">
        <h2>2. 导入凭证</h2>
        <label>凭证 JSON 文件（含秘密，仅保存在浏览器内存）</label>
        <input type="file" accept="application/json,.json" onChange={onFileChange} />
        <label>或粘贴凭证 JSON</label>
        <textarea value={rawInput} onChange={(e) => setRawInput(e.target.value)} />
        <div className="row">
          <button className="secondary" onClick={() => importCredential(rawInput)}>
            解析粘贴内容
          </button>
        </div>
        <div className="demo-list">
          {DEMO_FILES.map((d) => (
            <button key={d.file} onClick={() => void loadDemo(d.file)} title={d.file}>
              {d.label}
            </button>
          ))}
        </div>
        {credential && (
          <div className="row" style={{ marginTop: 10 }}>
            <span className="tag info">凭证 #{credential.leafIndex} · 成绩 {credential.score}</span>
            <span className={rootMatch ? "tag ok" : "tag fail"}>
              {rootMatch ? "属于受信根" : "不属于受信根（服务端必拒）"}
            </span>
            {activity && (
              <span className={scorePass ? "tag ok" : "tag fail"}>
                {scorePass
                  ? `本地预览：达到 ${activity.name} 门槛`
                  : `本地预览：未达到门槛 ${activity.threshold}，电路无法出证`}
              </span>
            )}
          </div>
        )}
      </section>

      <section className="card">
        <h2>3. 选择活动并本地生成证明</h2>
        <label>活动（门槛与 activityId 以服务端配置为准）</label>
        <select value={activityId} onChange={(e) => setActivityId(e.target.value)}>
          {policy?.activities.map((a) => (
            <option key={a.activityId} value={a.activityId}>
              {a.name}
            </option>
          ))}
        </select>
        <div className="row">
          <button onClick={() => void onGenerate()} disabled={!credential || !activity || stage === "proving"}>
            {stage === "proving" ? "生成中…" : "本地生成 Groth16 证明"}
          </button>
          <button onClick={() => void onRedeem()} disabled={!payload || stage === "redeeming"} className="secondary">
            {stage === "redeeming" ? "核验中…" : "提交核验并核销"}
          </button>
        </div>
        <p className="small">
          公开信号顺序：{PUBLIC_SIGNAL_ORDER.join("、")}。秘密、成绩与成员路径仅进入本地 witness，不上传、不写日志。
        </p>
        {message && (
          <div
            className={
              "result " +
              (stage === "redeemed" ? "ok" : stage === "error" ? "fail" : "pending")
            }
          >
            {message}
          </div>
        )}
        {redeemResult !== null && (
          <pre className="small">{JSON.stringify(redeemResult, null, 2)}</pre>
        )}
        {payload && (
          <details>
            <summary className="small">查看提交给服务端的数据（仅公开信号 + 证明）</summary>
            <pre className="mono">{JSON.stringify(payload, null, 2)}</pre>
          </details>
        )}
      </section>

      <section className="card">
        <h2>隐私与可信设置边界</h2>
        <ul className="notes">
          <li>演示参数为本地单方仪式（Powers of Tau pot12 + 一次性 zkey 贡献），仅供演示，不具备生产可信设置保证。</li>
          <li>证明只披露根、门槛、活动标识与 nullifier；服务端无法获知具体成绩、秘密或持证人身份。</li>
          <li>nullifier = Poseidon(secret, activityId)，同活动可防重复核销，不同活动互不关联。</li>
          <li>完整演示包 bundle.secret.json 含全部秘密，仅用于本地演示，真实场景中秘密只由持证人持有。</li>
        </ul>
      </section>
    </main>
  );
}
