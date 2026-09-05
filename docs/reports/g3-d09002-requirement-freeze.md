# G3 / D-090-02 手动主路径修复——需求冻结（条目级）

> Version: 1.0.0
> Status: ACCEPTED（2026-09-05，G3 Gate 启动时按冻结计划 §6 节奏冻结；依据合同 v1.0.0 §8.1 变更清单 C2–C10/C19 与需求拆分 §5 六需求域）
> 完成门: `MANUAL_OPERATIONAL`——隔离 fixture 从 intake 到 knowledge-sync 全链无人工补文件/改状态；真实业务需求只读重放证明相同准入结果；不要求 runtime 已对齐。
> 授权声明: 本文档随 G3 实施授权（2026-09-05）生效；实施范围以下表为限，不夹带。

## 1. 条目（按合同 §8.1 变更清单映射）

| ID | 合同项 | 条目 | 验收 |
| --- | --- | --- | --- |
| G3-01 | C2 | intake：增 manifest 创建职责（`library/{id}/manifest.md` + `intake.manifest.json`）、§4.2 判定表执行与 `decisionScope/requestedDepth/initialDepthBasis` 输出；移除 R5 runtime recovery context 依赖；禁改清单 `.specify/business_domain/**` 更正为 `.sdlc/business_domain/**` | N4/N5；条文含判定表引用 |
| G3-02 | C3 | solution-design：描述行与 Core Rule 10 按合同 §4.3 重写（按 `requiredDepth` 立即产出方案 + `depthCoverageLedger`，首轮不等 Gate）；R5/R8 runtime 依赖替换为手动链语义 | N4；无"档位未裁决前不产出"残留 |
| G3-03 | C4 | solution-gate：stable paths（Ledger/方案审核）、`scannedDesignVersion==designVersion` 前置、CONFIRMED/ESCALATED/BLOCKED_UNKNOWN 组合与升档增量回流、移除 R10 runtime 推进权条款 | §4.3/§5.2/§5.4 引用齐备 |
| G3-04 | C5 | task-planning：R1 runtime 依赖 → A1 准入引用（Gate Result current + CONFIRMED + PASS/PWR + 无 OPEN blocking） | A1 引用条文 |
| G3-05 | C8-a | implementation：R1 runtime 依赖移除（单列）；证据绑定 `{baseRevision, reviewedRevision, changeDigest}` 输出条款 | §5.5 引用 |
| G3-06 | C6 | code-review：R12 风险接受仪式残留清除（severity 分级保留；CRITICAL/HIGH OPEN = blocking，经 direct rework + 本 Skill 复验 RESOLVED，无接受者/证据仪式）；finding 登记职责（§5.1 实现类来源）+ A3 引用 | 无"风险接受必须带接受者与证据"残留 |
| G3-07 | C8-b | knowledge-sync：R6 runtime Re-Gate 表述 → §7.3 回流映射；finding 登记职责（知识类来源）+ A4 引用；publisher 更新条款 | A4 引用 + publisher 条文 |
| G3-08 | C7 | docflow-writer：两处 manifest 直写 → 经 publisher（L92 URL 记录、L157 Update manifest.md、Side Effects 清单） | 无直写残留 |
| G3-09 | C9 | templates：finding-ledger/gate-result/task-plan/implementation-record/knowledge-sync 五模板头部元数据对齐（version/current/supersededBy + Gate 绑定字段 `scannedDesignVersion` 等）+ gate-result 模板增覆盖台账节 + task-plan/implementation-record/knowledge-sync 增 finding 段 | 模板含元数据与 finding 段 |
| G3-10 | C10 | 新增 `scripts/publish-requirement-manifest.sh`：手动面自证投影协议（§6.2）——init（intake 创建 manifest）/entry-update（节点完成声明）/finding-action（RESOLVED/ACCEPTED 生命周期动作）/repair（人工修复基线重建）；三级判别的手动面适配（损坏 STOP、自洽校验、差量追平）；原子 rename；重放幂等 | 协议条款逐条可执行 + fixture 断言 |
| G3-11 | C19 | `shared-business-domain-governance.md` / `standard-package-resolution.md`：旧 `.specify` 活动根/profile 解析条款同步为 G1 根语义 | 无现役旧根权威条款 |
| G3-12 | C20 子集 | validator：`validate-skill-contracts.rb` 增 G3 锚点（N4 prompt 扫描：solution-design 无深度前置残留；intake/publisher 条款存在；code-review 无风险接受仪式残留） | validator ok + 变异红 |

## 2. MANUAL_OPERATIONAL fixture（G3-13）

`tests/manual-chain-fixture.test.sh`：隔离临时仓 fixture，驱动全链——

1. intake：按 G3-01 产出需求摘要 + `intake.manifest.json` + publisher init 创建 manifest（`requestedDepth/initialDepthBasis/decisionScope` 记录）；
2. solution-design：按 G3-02 产出技术方案（含覆盖台账）——**无 Gate 前置**；
3. solution-gate：Ledger（scan）→ 方案审核（verdict，CONFIRMED/ESCALATED 两分支各跑一次）→ publisher entry-update；
4. task-planning → implementation（证据绑定）→ code-review（finding 登记 + 直接返工复验关闭）→ knowledge-sync（routed 声明消费）——每节点 publisher entry-update；
5. 断言：每步产物存在且 digest 与 manifest 一致；准入谓词（A1–A4）按 §7.3 逐条成立；finding 生命周期（OPEN→RESOLVED）经 findingIndex 投影；全程无人工补文件；findings 段篡改（V6′ 变体）→ publisher STOP。

## 3. 边界

- 不修改 runtime/gateway（G5）；不触碰业务仓；不执行真实 Agent CLI（fixture 的 agent 判断环节以代表性内容表达，流程机制为真）。
- 五目录 Skill 同步在 G3 复审通过后另行执行。
