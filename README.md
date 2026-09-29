# 零知识成绩凭证核验（ZK Qualification）

学员向培训机构证明“成绩达到某活动门槛且属于受信学员集合”，但不透露具体成绩、身份或秘密。证明在浏览器内以 Groth16 生成，服务端只持有受信 Merkle 根和活动政策。

## 架构与隐私边界

- 发证方离线生成 16 份演示凭证：每份含非零 `secret`、整数成绩 `score`（0–100）与深度 4 的二叉 Merkle 成员路径；叶子为 `Poseidon(secret, score)`。
- 服务端配置仅有受信根、树深度与两个活动门槛（`data/policy.json`），**不持有任何 secret 或成绩**。
- 浏览器导入凭证后在本地用 snarkjs 生成真实 Groth16 证明。上传内容只有证明与 4 个公开信号：`root, threshold, eventId, nullifier`，其中 `nullifier = Poseidon(secret, eventId)`。`secret`、成绩、路径不离开本机，也不写入服务日志。
- 电路（`circuits/qualification.circom`）强制约束：成绩/门槛 ∈ [0,100]、路径位为二进制、Merkle 成员关系成立、`score >= threshold`、secret 非零，且 nullifier 绑定 secret 与活动。前端判断无法替代或绕过约束。
- 服务端按受信政策复核：公开信号中的根必须等于配置根，门槛必须等于该活动配置门槛，eventId 必须匹配；拒绝自选根或降低门槛。
- 核销以 `(eventId, nullifier)` 为原子唯一键：同活动并发重复提交仅一次成功；证明失败不写入、不消耗资格；记录持久化到 `data/redemptions.json`，重启保留；不同活动相互独立。

## 两个演示活动

| 活动 | eventId | 门槛 |
| --- | --- | --- |
| 精英训练营 | 1001 | 60 |
| 大师班 | 1002 | 85 |

演示成绩（共 16 人，见 `credentials/manifest.json`）包含：
- 达标：`credential-00.json`（95，两个活动均达标）、`credential-02.json`（85，恰好达到大师班门槛）、`credential-05.json`（60，恰好达到 60 门槛）。
- 不达标：`credential-06.json`（58，60 门槛即不达标）、`credential-15.json`（30，均不达标）。

不达标凭证在浏览器点击生成证明时会被电路直接拒绝（约束不满足，无法 witness 计算），没有任何前端绕过方式。

## 使用步骤

前置：Node.js 22、已安装依赖（`node_modules/` 已就绪）。

```bash
# 1. 编译电路并完成 Groth16 演示设置（产物写入 zk/ 与 public/zk/）
npm run zk:build

# 2. 生成 16 份凭证（credentials/）与服务端受信政策（data/policy.json）
npm run credentials:generate

# 3. 自测（电路约束、核销原子性、服务端政策）
npm test

# 4. 构建前端
npm run build

# 5. 启动服务端（127.0.0.1:3001）
npm run dev:server

# 6. 另开终端启动前端（Vite，端口 5200，代理 /api 到 3001）
npm run dev
```

打开 Vite 输出的地址：导入 `credentials/credential-00.json`，选择活动，点击“本地生成 Groth16 证明”，再提交核验；然后尝试 `credential-06.json` 或切换活动观察拒绝/独立核销行为。重新导入或切换活动后旧证明立即失效。

## curl 演示真实证明

```bash
# 达标证明（credential 0, 成绩 95, 活动 1001 门槛 60）
npx tsx scripts/demoProof.ts 0 1001 /tmp/proof-ok.json
curl -s -X POST http://127.0.0.1:3001/api/redeem \
  -H 'Content-Type: application/json' --data @/tmp/proof-ok.json | jq
# 再次提交同一证明 -> 409 already redeemed
curl -s -X POST http://127.0.0.1:3001/api/redeem \
  -H 'Content-Type: application/json' --data @/tmp/proof-ok.json | jq

# 同一凭证参加另一活动（nullifier 不同，独立核销）
npx tsx scripts/demoProof.ts 0 1002 /tmp/proof-b.json
curl -s -X POST http://127.0.0.1:3001/api/redeem \
  -H 'Content-Type: application/json' --data @/tmp/proof-b.json | jq
```

不达标凭证（如索引 6，成绩 58）无法生成证明，`demoProof.ts` 在 witness 阶段即报错。

## 可信设置说明

`parameters/demo-pot12-final.ptau` 是本机单人生成的 BN128 Powers-of-Tau（power 12，支持 ≤4096 约束）通用参数；电路专用 phase-2 密钥由 `npm run zk:build` 在本地做单一方贡献（`zk/qualification_final.zkey`）。该仪式为**合成本地演示**，任何人持有该熵都可伪造证明，**不得用于生产**；生产环境需多方可信仪式（如 Hermes/通用 ceremony 的 phase-2 贡献）并保护毒废料。

## 目录

- `circuits/qualification.circom` — 成绩门槛 + Merkle 成员 + nullifier 电路
- `scripts/buildZk.ts` — 编译、Groth16 setup、导出验证密钥、发布浏览器产物
- `scripts/generateCredentials.ts` — 16 份凭证 + 受信政策
- `scripts/demoProof.ts` — 命令行生成真实证明
- `server/` — Express 核验与持久化原子核销
- `src/` — React 页面与浏览器内证明生成
- `test/` — Vitest 电路/核销/服务端测试
