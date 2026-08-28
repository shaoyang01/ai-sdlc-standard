# C03-E E1～E4 Runtime 实施 — 集成层交接（HANDOFF）

> 最后更新：2026-08-28（EDT）。本文件供中断后新会话/新 Agent 无缝续作。只读事实 + 明确下一步，勿凭印象改。

## 1. 当前位置

- 分支：`feature/c03-e1-e4-runtime-implementation`
- 远端：`origin` = github.com/shaoyang01/ai-sdlc-standard（HTTPS）
- **该分支尚未 push、无上游**；续作前先 `git fetch` 并确认远端是否已建分支。
- 主干是 `loop-runtime-v1`（不是 main）。
- 本地最新提交（时间倒序）：
  - `eb8b5c5` E1 集成：canonical prompt builder（33 测试）
  - `23f9880` 能力层 Round1 修复（B1 argv traversal + S1/S2/S3）
  - `494e5de` E3 node-output-envelope
  - `3da342b` E1 production-entry request v1 parser
  - `a135a36` E2c posix runner MAX_TO→1800000
  - `898026c` E2b real-capability-adapter
  - `d37f7f2` merge loop-runtime-v1
  - `f5c4559` E2a agent-cli-profile（在 merge-base 内）

## 2. 已完成且已锁定（勿重做）

- **能力层 Round2 独立复审 = PASS**（HEAD 23f9880）。B1 CLOSED（entry runId 单路径段白名单 + adapter usage 文件名仅由封闭枚举派生，argv 零动态内容），S1/S2/S3 CLOSED；全套件 failed_file_count=26 与父提交 d37f7f2 完全相同（pre-existing 环境性失败，非本次引入）。
- 五个能力模块（均死代码、仅 tests 引用、零生产行为变化）：
  - `execution/agent-cli-profile.ts`：三 provider 静态 argv / §9 上限 / Q1 绑定投影 / dual-role firewall。
  - `execution/real-capability-adapter.ts`：注入 runner、prompt 仅 stdin、Q1 强制、有序 fail-closed、infra 标记、不建 artifact。
  - `core/loop-posix-process-runner.ts`：仅 MAX_TO 常量 600000→1800000（默认仍 120s，安全逻辑未动）。
  - `core/loop-production-entry.ts`：request v1 closed-schema fail-closed parser → journal 校验过的 identity。
  - `core/node-output-envelope.ts`：哨兵 JSON 信封解析（不可信 CLI 文本→校验过的节点输出）。
- 集成层第一块：`execution/capability-prompt-builder.ts`（`buildNodeCapabilityPrompt`），哨兵/字段名直接 import 自 node-output-envelope（单一事实源）。

## 3. 关键架构决策（Current User 已拍板）

- **Decision A（2026-08-28）**：E3 哨兵信封 `<!--@loop-output-begin/end-->` 是**唯一** agent I/O 契约。
  legacy 行标记协议（`GATE_RESULT:` / `UNRESOLVED_FINDINGS_JSON:`，在 `execution/codex-real-dispatch-*.ts`）随旧 real-dispatch sidecar **归档淘汰**，新代码不得再发射。
  但**复用** `buildCapabilityTextArtifact`（codex-real-dispatch-runner.ts，内部用 `createArtifact`，已带 source:"execution_gateway"）把 envelope.body 造成 canonical artifact，不重写。
- Q1 绑定：Kimi×4（intake/design/task-planning/knowledge-sync）、Codex（solution-gate adversarial_scan + implementation）、Hermes（solution-gate formal_verdict + code-review）。scan≠verdict firewall。
- AgentName === provider id === `kimi|codex|hermes`（同名自洽，无映射层）。
- §9：implementation attempt 30min（1800000），非 implementation 10min；默认 runner 120s 不变。

## 4. 下一步：real gateway（集成核心，需整块时间一次做对）

目标：新增 `execution/real-capability-gateway.ts`，`extends ExecutionGateway`，只 override 产品来源，**复用基类唯一 tracing 状态机** `executeCapabilityWithTracing`（claim started→executePrimary→output-contract 校验 379-400→artifact/ledger→succeeded/failed），不得另造状态机。

已探明的接缝与障碍（动手前先重读核对）：
1. **冻结文件最小改动**：`execution/gateway.ts` 的 `private executePrimary`（约 :640）需改 `protected` 才能 override。
2. **role 传递障碍（重点）**：`executeCapabilityWithTracing` 在闭包里解析出 `capability/executionRole/binding`，但只把 `boundRequest={...request,agent:binding.agent}` 传给 executePrimary——**executePrimary 拿不到 executionRole/attempt**。solution-gate 双 role 必须区分。方案二选一（实施时定，倾向最小侵入）：
   - 给 protected executePrimary 扩一个只读 context 参数 `{capability,executionRole,attempt,inputArtifactRef,...}`（改基类签名+两处调用，行为不变）；或
   - 从 boundRequest.metadata 读取（需确认 tracing/entry 确实把 role/attempt 放进 metadata）。
3. **executePrimary 内序列**：提取 inputText（boundRequest.input 上游产物；intake 首节点用 bootstrap source，first-writer-wins）→ `buildNodeCapabilityPrompt` → `RealCapabilityAdapter.execute`（provider=boundRequest.agent，cwd=attempt workspace，由 production wiring 注入）→ `parseNodeOutputEnvelope(text, capability)` → `buildCapabilityTextArtifact` 造**恰好 1 个** artifact（type=`CAPABILITY_ARTIFACT_TYPES[capability]`，metadata.agent=binding.agent、source=execution_gateway）→ 返回满足基类 379-400 全部断言的 ExecutionResult；gateResult/findings 交回基类读（gateway.ts 405+）。
4. **失败语义**：envelope 解析失败/adapter 失败 → 走基类既有 OUTPUT_CONTRACT/appendCapabilityFailure，不得伪装成功。
5. 测试：注入 fake adapter，验证①复用基类 tracing（started/succeeded 事件序列、claim 幂等）②双 role 路由到不同 provider ③畸形 envelope 不产生 artifact ④output-contract 违例被基类拦。

其后顺序：E1 编排（parseProductionEntryRequest + LoopGitWorkspaceManager.prepare 真实 git/base/dirty preflight + 装配 store/gateway/runtime）→ `scripts/loop-run.ts`（仅 `--request-file`/`--resume`）→ **E4**（process evidence/recovery/lease/human reason allowlist）→ 旧 sidecar 与三个旧 spawn runner 归档（production factory 不引用）→ 独立全量复审。

## 5. 治理边界（勿越界）

- 全部 WIP 死代码、未接线；不改 runtime/dispatch/journal 既有行为；除 runner MAX_TO 外不碰 C02 冻结生产逻辑（gateway protected 化是下一提交的最小必要改动）。
- **E5 真实 CLI canary 未授权**：fake runner 只证明 adapter 逻辑，E2-P 只证明可达性，三者证据不互替。
- 无远程 Git 副作用、无业务仓写入、无发布、无 Agent CLI 真实调用（除非 Current User 另行授权）。
- H3 归属 C03-B 不转移；WP1～WP4/C01 已收口行为除非直接破坏否则不动。
- 退役术语扫描：新文档/代码勿引入 DIRECT_IMPLEMENTATION / Development Path Decision 等 RETIRED_PATH_TERMS。

## 6. 验证命令

```bash
npx tsc --noEmit
for t in agent-cli-profile real-capability-adapter loop-posix-runner-timeout-bound \
         loop-production-entry node-output-envelope capability-prompt-builder \
         loop-posix-process-runner; do ./node_modules/.bin/tsx tests/$t.test.ts; done
npm test                      # 全量；失败文件集合须与 d37f7f2 相同（26 个 pre-existing）
ruby scripts/validate-skill-contracts.rb
```

续作第一步：读本文件 + `git log --oneline -10` + 重读 §4.2 列出的 gateway.ts 203-513 / 640-735，再动手。
