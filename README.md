# 零知识成绩凭证核验演示

持证人在浏览器内本地生成真实 **Groth16** 零知识证明，向培训机构证明「自己属于受信学员群体且成绩达到活动门槛」，而不泄露具体成绩、秘密或身份。服务端只配置受信 Merkle 根与活动门槛，持有不到任何凭证秘密。

## 密码学设计

- **凭证**：每份凭证含非零秘密 `secret`、整数成绩 `score ∈ [0,100]` 与深度 4 的 Merkle 成员路径；叶子承诺为 `Poseidon(secret, score)`。
- **Merkle 树**：16 份凭证构成深度 4 的完全二叉 Poseidon 树（3189 个约束，pot12 的 4096 上限内）。
- **nullifier**：`Poseidon(secret, activityId)`。同活动重复提交会被识别，不同活动的 nullifier 互不关联。
- **电路** `circuits/qualification.circom`（公开信号顺序：`root, threshold, activityId, nullifier`）约束：
  - `secret ≠ 0`；
  - 成绩与门槛均在 0–100（8 位 Num2Bits 范围约束）；
  - 路径方向为二进制且 Merkle 成员关系成立（根严格相等）；
  - `score ≥ threshold`（电路内比较，不依赖前端判断）；
  - nullifier 绑定 `secret` 与活动标识，公开信号全部参与约束。
- **服务端政策**：只读取 `server-config/policy.json`（受信根 + 两个活动及门槛）和 Groth16 验证密钥；证明中的根/门槛/活动标识必须与配置完全一致，拒绝自选根或降低门槛。
- **核销**：SQLite 表 `PRIMARY KEY (activity_id, nullifier)` 保证按「活动 + nullifier」原子核销；同活动并发重复提交仅一次成功，验证失败不写记录，不同活动独立，数据落盘、重启保留。

## 演示活动与凭证

| 活动 | activityId | 门槛 |
| --- | --- | --- |
| 进阶训练营 | 31415926 | 90 |
| 标准体验课 | 77777777 | 60 |

16 份成绩：98、95、90、88、85、80、72、65、60、55、50、40、30、20、10、0（凭证 #0–#15）。
- 达标示例：#0（98，两个活动均达标）、#2（90，进阶门槛边界）、#8（60，标准门槛边界）。
- 不达标示例：#9（55，标准活动无法出证）、#15（0）。

## 一次性环境准备

仓库已附带通用仪式参数 `parameters/demo-pot12-final.ptau`。电路密钥与演示凭证可重新生成：

```bash
npm install
npm run setup            # 编译电路 + Groth16 设置，并生成 16 份凭证
```

产物：
- `server-config/policy.json`：受信根与活动政策（服务端唯一信任来源）；
- `server-config/qualification.zkey`、`server-config/verification_key.json`：电路证明/验证密钥；
- `public/circuit/qualification.wasm`、`public/circuit/qualification.zkey`：浏览器出证文件；
- `public/demo/credential-*.json`：16 份独立凭证（含秘密，供本地导入）；
- `public/demo/bundle.secret.json`：含全部秘密的完整包，仅为演示便利。

## 启动

```bash
# 终端 1：核验服务（默认 127.0.0.1:3101，可用 PORT 覆盖）
npm run dev:server

# 终端 2：前端（开发模式，/api 代理到 3101）
npm run dev
```

生产方式：`npm run build && npm run preview`（已在 4173 端口验证）。

浏览器打开前端后：
1. 查看服务端活动政策与受信根；
2. 点选演示凭证（或导入/粘贴凭证 JSON）；
3. 选择活动，点击「本地生成 Groth16 证明」——秘密、成绩、路径只进入本地 witness；
4. 点击「提交核验并核销」，查看公开信号、证明与服务端结果；
5. 修改凭证或活动后，旧证明立即失效（页面状态自动重置）。

## curl 演示（真实证明）

```bash
# 浏览器外生成真实 Groth16 证明（仅用于脚本化演示）
npx tsx scripts/prove-cli.ts 0 77777777 /tmp/p.json
# 提交核验
curl -s -X POST http://127.0.0.1:3101/api/redeem \
  -H 'Content-Type: application/json' --data @/tmp/p.json
# 再次提交 -> HTTP 409 already redeemed
```

已验证的完整场景：达标证明首次 200、同活动重复 409、不同活动独立 200、成绩不足时电路直接断言失败无法出证、篡改公开门槛/根信号返回 400、服务重启后核销记录仍生效。

## 自测

```bash
npm test        # 15 个用例：Merkle 路径、电路约束、服务端政策与并发核销
npm run build   # TypeScript 严格检查 + 前端构建
```

## 隐私边界与可信设置说明

- `parameters/demo-pot12-final.ptau` 为**本地单方** Powers of Tau（BN128, power 12），zkey 贡献也是演示用固定熵值；这不是多方可信仪式，掌握毒性参数者可伪造证明，**严禁用于生产**。
- 证明只公开根、门槛、活动标识与 nullifier；服务端无法得知具体成绩或持证人身份，但知道「某 nullifier 已参与某活动」。
- nullifier 跨活动不可链接，但若服务端与发证方合谋，仍可能结合发证记录做关联分析。
- 演示凭证的秘密随 `public/demo` 分发，等同公开；真实系统中秘密只能由持证人在本地生成与持有。
- 前端「成绩是否达标」的提示只是用户体验预览；真正的门槛、范围、成员关系全部由电路约束，服务端独立用 Groth16 验证密钥复核。
