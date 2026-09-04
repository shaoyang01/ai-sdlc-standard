# AI-SDLC Decision Index

> Storage policy version: 1.0.0
> Effective date: 2026-08-22
> Authority: [Decision-046](Decision-046-decision-record-modularization.md)

## 记录边界

- Decision-001～Decision-045 保留在历史卷 [AI-SDLC-Decision-Records.md](../AI-SDLC-Decision-Records.md)，不重编号、不拆迁正文。
- Decision-046 起每个 Decision 使用独立文件，命名为 `Decision-NNN-<short-slug>.md`。
- 本索引是 Decision 定位入口，不记录当前授权、执行尝试、live finding、PR/CI 或 HEAD；这些动态事实仍由 control plane STATE 与执行证据承载。
- 新 Decision 必须使用固定八段：`状态 / 背景 / 问题 / 决策 / 原因 / 影响 / 实现状态 / 依据`。若某段不适用，也必须保留并说明。
- 状态变化在原 Decision 文件原位追加带日期的状态说明，不新建同号文件，不覆盖历史裁决文本。
- Decision 之间只通过链接引用，不复制可独立漂移的完整合同或映射表。

## Index

| Decision | Date | Status | Title |
| --- | --- | --- | --- |
| [Decision-001～045](../AI-SDLC-Decision-Records.md) | Historical～2026-08-22 | Historical volume | 既有 Decision 历史卷；Decision-044 为单轨重基线，Decision-045 为 Skill 收敛映射。 |
| [Decision-046](Decision-046-decision-record-modularization.md) | 2026-08-22 | Accepted | Decision Record 模块化与历史卷冻结。 |
| [Decision-047](Decision-047-c02-wp5-cross-entry-recovery-authorization.md) | 2026-08-24 | Accepted | 授权实施 C02-WP5 跨入口恢复与生产入口接线（Q1/Q2/Q3 均按推荐方案；H3 归属 C03-B 不变）。 |
| [Decision-048](Decision-048-c02-wp6-validation-guards-authorization.md) | 2026-08-25 | Accepted | 授权实施 C02-WP6 Validation Guards and Completion Acceptance（C02 最终综合验收包；R-A/R-B/R-C 延续裁定固化）。 |
| [Decision-049](Decision-049-c02-completed.md) | 2026-08-25 | Accepted | 消费 C02 最终授权，登记 LOOP-CORE-02 = COMPLETED；O-2 移交 C03-B；下一转换为 C03 授权申请。 |
| [Decision-050](Decision-050-c03-plan-accepted.md) | 2026-08-25 | Accepted | 接受 LOOP-CORE-C03 有界实现规划（三包 A/B/C 沿用冻结 ID；Q1～Q5 全按建议方案成立）。 |
| [Decision-051](Decision-051-c03a-closed-c03b-held.md) | 2026-08-25 / 2026-08-26 更新 | Accepted / C03-B CLOSED | C03-A 收口（Round 3 PASS）；C03-B 先 CURRENT_USER_HOLD（旧版 Skill 仍在生产使用），后经 Decision-052 授权实施，五轮复审后 Round 5 PASS 收口（单一原子提交 2f822a2，PR #108）。 |
| [Decision-053](Decision-053-control-plane-authority-and-exchange-closure.md) | 2026-08-26 | Accepted | 确认控制平面为当前执行状态与授权/收口登记权威（CP `285fe59` 标签 ACTIVE 化）；恢复 Exchange 必经收口流程，近期直同步登记为历史偏离。 |
| [Decision-054](Decision-054-c03c-authorized-o1-in-scope.md) | 2026-08-26 | Accepted | 授权 C03-C Delivery Tail Integration（c1～c3 + runtime 消费面切换：agent-skill-registry / FLOW_DEFINITIONS / metadata inventory 更新为 7+1）；O-1 观察项（OPERATION_GUIDE.md 旧 ID）本轮一并处理。 |
| [Decision-055](Decision-055-artifact-numbering-authority.md) | 2026-08-26 | Accepted | 裁决制品目录编号权威为 WP3.5 单轨方案（00-需求资料～06-知识同步）；legacy runtime 编号（03-实现记录/04-代码审核/05-测试验收）废弃，迁移列为后续包输入。 |
| [Decision-056](Decision-056-c03d-runtime-integration-artifact-path-migration.md) | 2026-08-26 | Accepted | 授权 C03-D Runtime Integration & Artifact Path Migration（c1/c2/c3 接入 runtime 调度路径 + 制品路径常量迁移到 WP3.5 新编号）；Q1~Q4 全部按推荐方案 A 裁决。 |
| [Decision-057](Decision-057-c03d-runtime-integration-closed.md) | 2026-08-26 | Accepted / C03-D CLOSED | C03-D 收口裁决：三轮独立复审后 Round 3 PASS；d1 c1 守卫接入 runtime implementation 前置、d2 c2/c3 接入 chain 完成后尾聚合、d3 制品路径迁移 WP3.5 单轨、d4 runtime 级接线测试（负向变异实证）；PR #111（head 4252b6d）四 job 全绿。C03-A/B/C/D 全部 CLOSED，LOOP-CORE-03 待 C05 真实单仓验收。 |
| [Decision-058](Decision-058-c03-implementation-completed.md) | 2026-08-26 | Accepted | C03 实施阶段完成登记：A/B/C/D 四包全部经独立复审 PASS 收口，route_state → C03_IMPLEMENTATION_COMPLETED，current_gate → LOOP_CORE_C05_AUTHORIZATION_GATE；LOOP-CORE-03 最终 COMPLETED 待 C05 真实单仓验收通过后单独裁决（PR #113）。 |
| [Decision-059](Decision-059-c05-real-single-repo-acceptance-authorized.md) | 2026-08-27 | Accepted / C05 AUTHORIZED | 授权 C05 真实单仓验收：以 wms-monitor 需求 20260827-dashboard-page（指调大盘页面，前端对接冻结后端）为验收对象、基线 3e318dad6，Kimi 为入口 Agent；无远程 Git 副作用、产出人工 Git 交接包；完成合同含七节点贯通 + 至少一次有效 Re-Gate + binding/输入版本追溯 + 可恢复证据；PASS 后单独裁决 LOOP-CORE-03 COMPLETED。 |
| [Decision-060](Decision-060-c05-closure-and-autonomy-replan.md) | 2026-08-27 | Accepted direction / C03-E planning pending | 收口 wms-monitor 业务需求但不把人工切换 Agent 冒充 Core 全自主 PASS；受控重开 C03，新增 C03-E 真实多 Agent CLI 自主调度，并以下一条真实需求重验 C05。 |
| [Decision-061](Decision-061-pkb-project-artifact-projection-direction.md) | 2026-08-27 | Accepted direction / Advanced planning pending | 新增后期 LOOP-ADVANCED-04：把 Requirement 最终 LOOP/`.specify` 产物以 provenance/digest 投影到 Personal-KB；不阻塞当前 C03-E 全自主主线。 |
| [Decision-062](Decision-062-c03e-detailed-planning-authorized.md) | 2026-08-27 | Accepted / Detailed planning authorized | 授权把 C03-E 完善为 0.2.0 详细草案；只允许规划文档和治理记录，不授权代码、Agent CLI、E0～E5 或 C05。 |
| [Decision-063](Decision-063-c03e-plan-accepted.md) | 2026-08-27 | Accepted / C03-E plan accepted | 接受 C03-E v0.3.0 与 Q1～Q7 推荐值；Current User 接受本轮不执行双 binding Solution Gate 的剩余风险；不授权任务规划、实施、Agent CLI、E0～E5 或 C05。 |
| [Decision-064](Decision-064-c03e-early-provider-feasibility-plan-amendment.md) | 2026-08-27 | Accepted / Plan amendment accepted | 接受 C03-E v0.4.0 A1：拆分 E0 合同收口包与 E1～E4 runtime 实施包，在两者间前置三 Agent direct CLI 可达性预检，且不得替代 E5 production adapter/full-run 验收；不授权任务规划、CLI 或实施。 |
| [Decision-065](Decision-065-c03e-e0-active-contract-preflight-authorized.md) | 2026-08-27 | Accepted / E0 AUTHORIZED | 授权 C03-E E0 活动合同收口包（E0.1～E0.5）：清理 solution-gate 旧 Direct/Speckit 路径判定、校准两份 capabilities metadata 为单轨 7+1 当前事实、validator 闭包扫描退役 ID/旧路由/role firewall、清理 active tests；不改 runtime dispatch、不调 Agent CLI、不含 E2-P/E1～E5/C05；独立分支单一 PR，独立复审后单独收口。 |
| [Decision-066](Decision-066-cross-project-governance-state-and-pkb-ingress-boundary.md) | 2026-08-28 | Accepted | 统一产品 Decision、CP Governance/STATE、Exchange、PKB、Handoff/current 权威边界和授权/收口顺序；PKB 自写不经 Exchange，AI-SDLC 写入 PKB 必须经标准 Publisher；E0 授权有效但继续暂停。 |
| [Decision-067](Decision-067-c03e-e0-resumed-and-execution-started.md) | 2026-08-28 | Accepted / E0 IN_PROGRESS | ACP-R2 治理收敛完成收口后恢复 E0 授权，移除用户暂停，route_state 推进为 C03_E_E0_IN_PROGRESS；创建独立实施分支 feature/c03-e0-active-contract-preflight，开始执行 E0.1～E0.5；E2-P/E1～E5 仍未授权。 |
| [Decision-068](Decision-068-c03e-e0-active-contract-preflight-closed.md) | 2026-08-28 | Accepted / C03-E E0 CLOSED | E0 活动合同收口包收口裁决：两轮独立复审（R1 FAIL→B1/B2 修复 5bb60be→R2 PASS）后 PR #123 合入 feature/loop-runtime-v1（merge 158536b）；route_state 转 C03_E_E0_COMPLETED_AWAITING_E2P_AUTHORIZATION，active_work/lifecycle 回 IDLE，E0 授权消费移出；顺带修正 STATE v2 缺 pause 键的既有不合规；E2-P/E1～E5/C05 仍未授权。 |
| [Decision-069](Decision-069-c03e-e2p-provider-feasibility-preflight-authorized.md) | 2026-08-28 | Accepted / E2-P AUTHORIZED | 授权 C03-E E2-P Provider 可达性预检并授予 E2_P_REAL_CLI_PREFLIGHT_AUTHORIZED 真实 CLI 外部调用权：隔离 fixture 中对 Kimi/Codex/Hermes 各执行一个最小无业务语义探针，外部副作用仅限每 provider 一次模型请求的网络/计费/审计，证据固定 PROVIDER_REACHABILITY_ONLY 且脱敏；全 PASS 仅进入 E1～E4 授权判断，任一 BLOCKED 停止；不授权 production adapter/E1～E5/C05。 |
| [Decision-070](Decision-070-c03e-e2p-provider-reachability-passed.md) | 2026-08-28 | Accepted / E2-P PASSED | E2-P 结果收口：隔离 fixture 三 provider 最小探针全部 PASS（Kimi 0.38.0 / Codex 0.150.1 / Hermes 0.20.5，均 exit 0、非交互、凭据可用、固定 token 可确定截取；证据 record + 可复现脚本入库），Provider Feasibility Gate PASS；E2-P 授权 consumed，route_state 转 C03_E_E2P_PASSED_AWAITING_E1_E4_AUTHORIZATION，active_work/lifecycle 回 IDLE；按 INV-E13 不构成 adapter ready，E1～E4/E5/C05 仍待单独授权。 |
| [Decision-071](Decision-071-c03e-e1-e4-runtime-implementation-authorized.md) | 2026-08-28 | Accepted / E1～E4 AUTHORIZED | 授权 C03-E E1～E4 runtime 实施包（E1 生产入口/run ownership、E2 统一 adapter+production gateway、E3 输出校验/自动推进/Re-Gate、E4 持久恢复与人机边界）：单分支单 PR、一个 retained boundary 内 E1→E4 原子成立；自动证据只用 fake runner，不调真实 CLI/不发模型请求；沿用 Q1～Q5 与 §9 bounds；完成后独立全量复审+Current User 收口；不含 E5/下一 C05/生产远程 Git 发布。 |
| [Decision-072](Decision-072-c03e-e1e4-task-gate-ratified-and-wiring-authorized.md) | 2026-08-28 | Accepted / Task Gate ratified (post-hoc), wiring IN_PROGRESS | 事后追认 E1～E4 Task Gate PASS（事前记录缺失，任务集/审计经 b5e9206 事后重建，不伪造历史）；接受重建任务集为剩余工作基线；授权在 D-071 范围内继续 E2-T6 接线（默认 shadow、不激活真实 Agent）；B1 Q1 binding 对齐阻断真实激活、B3 E4 阻断收口；不含 E5/真实 spawn 激活/下一 C05。 |
| [Decision-073](Decision-073-canonical-runtime-b-as-sole-production-path-a-frozen.md) | 2026-08-28 | Accepted / Path B sole, Path A frozen | canonical runtime 七节点图（B）为唯一生产候选路径；第一版 sdlc-* 时期的 D0x 编排链 A（D08/D09/D06/D05+spawn runner，无生产入口、未投产）冻结退役、新代码零依赖，物理删除分批；D03 workspace/publisher Git 交付/governance tail 外围能力由 B 继承；删除条件=B 外围补齐+E5 canary 真实证据；不改变 E5/真实激活授权边界。 |
| [Decision-074](Decision-074-c03e-ct2-closure-implementation-complete.md) | 2026-08-30 | Accepted / E1～E4 CLOSED, C-T2 executed | 接受 C-T1 全量只读复审结论（CLOSED 零阻塞，基线 cebbecd，146 文件 1767 passed）；授权 C-T2 一次性收口：Exchange 收口 run（Issue #91，覆盖 W1–W6b5 全部 11 波 + C-T1，不得解读为逐波发布，补偿证据=台账）+ PKB 归档（handoffs/2026-08-30-c03-e-ct2-closure.md，分支 feature/knowledge-base-v1，d59008c/ba84d02）；CP lifecycle→CLOSED、route_state→C03_E_E1_E4_CLOSED_AWAITING_NEXT_DIRECTION、publication 回执更新；E5 真实激活/下一 Requirement 仍待单独裁决。 |
| [Decision-075](Decision-075-c03e-e5-autonomous-acceptance-authorized.md) | 2026-08-30 | Accepted / E5 authorized, layered | 授权 E5 自主运行验收（规划 §6 三层证据：自动负向矩阵 / 真实 Adapter canary / 真实自主 fixture run），分层推进：L1 负向矩阵映射立即执行（零 CLI、零生产改动，产出映射报告+缺口清单，缺口逐波立项独立复审）；L2/L3 真实 CLI 触发前须再次向 Current User 确认；全程零业务仓写入/远程 Git 副作用，失败不得 shadow/自述降级放行（S16/S18）；E5 PASS 前不请求 C05；事实分支 feature/c03-e5-autonomous-acceptance（自 c7a2e01 切出）；C-T1 P1–P3 不自动并入。 |

| [Decision-076](Decision-076-c03-loop-gw-material-and-rhythm-authorized.md) | 2026-08-31 | Accepted / C03-LOOP-GW authorized, ladder rhythm | 立项 C03-LOOP-GW：验收材料 = 本机 spruce_logistics_gateway @ feature/dev_20260831_loop_test（cc06c605，只读审查报告入库），三级节奏（①冒烟三项已授权 ②主测 P0-2 endsWith 绕过 ③批量正确性，逐级停等放行）；排除 P0-1/3/4 与 37 拷贝收敛（验收口径无法仓内自洽）；PKB 写入经 Exchange 派生；E5-L3 冻结不变，LOOP 真实 CLI 路径不在范围。 |

| [Decision-077](Decision-077-c03-loop-gw-smoke-real-run-fail-closed-and-wiring-gap-recorded.md) | 2026-09-01 | Accepted / smoke FAIL-CLOSED recorded, fix pending | 记录冒烟真实 run 结果：口径改定为「冒烟=测 LOOP 本体、三项缺陷为需求输入」；run2 于 requirement-intake/primary fail-closed（REAL_GATEWAY_NO_INPUT：run() 只传 inputArtifactRef vs extractInputText 只认自由文本键，kimi 探针实证）；确认 E5-L2 canary 未覆盖 run()+real 端到端（不追溯改判 E5）；缺口修复另行立项待授权；E5-T1 超时张力销项；脚本暂不入库；②③不推进。 |

| [Decision-078](Decision-078-entry-trigger-design-accepted-d1-authorized-d3-chartered.md) | 2026-09-01 | Accepted / entry trigger design accepted, D1 authorized, D3-deterministic chartered | 认可入口触发层接线设计（intake manifest 已确认标记 + loop-run --from-intake/--prepare-only + agent 触发六步协议，设计文档转 Accepted）；授权 D1 接线缺口修复波 W-GW-FIX（REAL_GATEWAY_NO_INPUT 二选一方向 + run()+real 最小回归 + W-GW-SMOKE 冒烟重跑，重跑 PASS 后②提请放行）；立项 D3-deterministic 段（real 接入不在本波）；D2 生产门 real 通道继续挂账；E5-L3 冻结、②③PENDING、零业务仓写入不变。 |

| [Decision-080](Decision-080-pk-eligibility-rederive-authorized.md) | 2026-09-02 | Accepted / P-K found, eligibility-rederive fix authorized | 发现 P-K：PWR + 事后验收无恢复路径（recovery 线性推进信任 verdict 事件上不可变 nextStepEligibility=BLOCKED，acceptFindingRisk 不参与推导，gateDecision DECIDED 而 next=null）。授权最小修复：recovery 单点——succeeded formal_verdict PWR 且存在绑定同 decisionScopeId 的 ACCEPTED_RISK finding 时 eligibility 视为 ELIGIBLE（无证明不变，fail-closed）；随后 resume run4 进 task-planning→implementation；附 P-J 勘误（run4 revision 物化时序）；D2/E5-L3/②③边界不变。 |

| [Decision-081](Decision-081-run4-closed-pk-deadlock-to-design.md) | 2026-09-02 | Accepted / run4 closed, P-K deadlock to design | run4 以 PWR 停等收口（返工闭环 + 重裁决 decision:3 + ADV-006/007 接受均为完整证据）；P-K 死锁（PWR-DECIDED vs Round 2 H1 组合必然死锁）转设计议题，候选方案①H1 修订②验收授权标记已记录，立项另行裁决；C03-LOOP-GW 阶段性停驻，重启前置 = P-K-d 设计裁决+实施；D2 挂账、E5-L3 冻结、零远程 Git 副作用不变。 |

| [Decision-082](Decision-082-pkd-plan-c-eligibility-contract-and-dispatch-gate.md) | 2026-09-02 | Accepted / P-K-d chartered per plan C | P-K-d 立项采用方案 C：nextStepEligibility 字段口径定为 agent 裁判（PASS/PWR→ELIGIBLE，FAIL→BLOCKED），人闸门移至派发命令推导（PWR scope 无 ACCEPTED_RISK 行 → RISK_ACCEPTANCE_PENDING 停等）；ledger 行物化缓行（scope 级验收替代，避免 SOLUTION finding 失效死循环）；H1/schema 不动；部件 4 再推导保留兼容 run4；测试三分支授权。D2/E5-L3/②③边界不变。 |

| [Decision-083](Decision-083-risk-accepted-event-chartered.md) | 2026-09-02 | Accepted / risk_accepted event chartered (H1 admission) | plan C 实施暴露第五道门 = H1 本身（store 链校验器 isCanonicalNext：verdict BLOCKED eligibility → task-planning started 非 canonical）。授权方案②：新增一等 run 级事件 `risk_accepted`（acceptFindingRisk 同事务追加，scope 绑定经 finding proof 行），投影为记录型，链校验器经 acceptedRiskScopes 放行 PWR verdict 后恰一次 canonical forward；H1 字面规则不变。测试矩阵授权；run4 续跑授权至全链完成。D2/E5-L3/②③边界不变。 |

| [Decision-085](Decision-085-codex-sandbox-workspace-write.md) | 2026-09-02 | Accepted / codex sandbox workspace-write + shell enabled | implementation 节点 codex profile 从 `--sandbox read-only` + `features.shell_tool=false` 改为 `workspace-write` + Shell 启用，使 codex 能真实读写 spruce 代码并运行 mvn。kimi/hermes 不动。人工 Git 边界不变（不 commit/push/PR）。E5-L3 冻结、D2 挂账不变。 |

| [Decision-086](Decision-086-pwr-auto-proceed-and-finding-gate-simplification.md) | 2026-09-02 | Accepted / PWR auto-proceed, finding gate simplified | PWR verdict 自动推进：`pwrProofSameScope` 简化为 `decisionScopeId !== null`（verdict 自身判断即验收），不再要求 ACCEPTED_RISK finding proof；gateway 派生 PWR→ELIGIBLE（已实施保留）；链校验器 isCanonicalNext 对 PWR+ELIGIBLE 自然通过；回滚 Decision-082/083 的验收闸门/停等码/risk_accepted 事件/acceptedRiskScopes 管道；`computeFindingGate` 的 OPEN blocking 暂不修改（影响 knowledge-sync eligibility，随 P-C/P-D 调）。D2/E5-L3/②③边界不变。 |

| [Decision-089](Decision-089-knowledge-governance-v2.md) | 2026-09-04 | Accepted / D-088-01 v2 chartered, supersedes v1 architecture | 知识沉淀治理初始化 v2：根路径 `.specify`→`.sdlc`（禁词表新增旧根）；初始化器升级双模式一站式——初始化含代码驱动填充（入口事实扫描→机械聚类候选域→候选 L1/L2+xx99 EntryCoverage，业务语义零虚构，routable 门控）+ 中文成熟架构骨架 + 治理规则固化进根文档 + 三份治理 YAML 职能并入；体检模式做适用性检查与 speckit 残留清单（只报告不改动）。取代 Decision-088 决策1 的 v1 实施范围，包编号与 roadmap 插入位置不变；logistics-center 分类迁移单独授权；v2 实施另需显式授权。设计全文：`docs/reports/decision-089-knowledge-governance-v2-design.md`。 |

| [Decision-090](Decision-090-c03e-prerun-governance-readiness-replan.md) | 2026-09-04 | Accepted / C03-E-PRE-RUN controlled replan, governance-only | 将 D-088-01 四类项目初始化/迁移与现役手动 Skill 流程收口设为 LOOP runtime 继续开发前置；新增 `C03-E-PRE-RUN`，顺序冻结为 D088 重基线→共同语义合同→手动 `MANUAL_OPERATIONAL`→调整 D087→runtime manifest/parity→run8。固定首轮深度启动、双角色稳定产物与三个 manifest 对象边界；Decision-087 seam 和 Decision-086 PWR 口径保留。逐包文件面、矩阵、Gate 与恢复动作已落 `docs/reports/decision-090-c03e-prerun-governance-plan.md`；本 Decision 不授权实施。G1 启动输入基线（2026-09-05 Current User 接受）：需求拆分与五点裁决（DP1/2/5 采纳建议、DP3 折中方案 c′、DP4 撤销存量重建）见 `docs/reports/decision-090-c03e-prerun-requirement-decomposition.md` @ `7934edb`；其中 DP3 构成对本 Decision 决策 4 默认深度起点语义的修订、DP4 收窄冻结计划 G3 子任务 6，均随 G2/D-090-01 合同冻结正式记录。 |

| [Decision-088](Decision-088-knowledge-target-initializer-priority.md) | 2026-09-03 | Accepted / D-088-01 chartered, priority over LOOP runtime smoke | 立项知识目标初始化器波 D-088-01：新增 bootstrap-knowledge-target.sh + `.specify/business_domain/knowledge-target.yaml` 机器可读声明 + sdlc-knowledge-sync 确定性目标解析联动；99PendingConfirmation 退出活动路径、`.candidate` 机制废除；active references 双轨/多源残留同波修正；旧脚本仅 deprecation note。Current User 裁决：该缺口关闭前不推进 D-087 真实 CLI 冒烟（run8），GW_VERTICAL_REBUILD 授权保留不消费。实施与三业务仓正式初始化均需显式授权。分析报告：`docs/reports/knowledge-target-initializer-analysis.md`。 |

| [Decision-087](Decision-087-vertical-mainline-rebuild.md) | 2026-09-03 | Accepted / vertical mainline rebuild chartered | codex 评审确认五条根因后立项纵向主干重建：接缝1 节点结果模型（E3 信封增 nodeStatus，gateway 校验正文声明与实际一致），接缝2 Finding 物化与路由（scan/verdict/code-review findings 原子物化为 loop_findings 行），接缝3 唯一生产装配入口（smoke 禁止直调 run()，统一走 loop-run→runProduction）。离线端到端测试矩阵全部通过前不发真实 CLI 冒烟。回滚 Decision-080/082/083 冲突代码。底层组件保留。 |

| [Decision-084](Decision-084-node-template-closure-wave.md) | 2026-09-02 | Accepted / P-L node-template closure wave (urgent) | sdlc-* skills 为现役手动驱动主干，模板缺口升级为紧急生产漏洞：P-L 收口波立项。templates/ 新增四份 canonical 文档模板（task-plan / implementation-record / knowledge-sync / finding-ledger），各节点 SKILL.md 增补引用，旧 specs/** 迁移模板废弃标注，00-需求资料 模板适用性评估。验证口径=对照 node-capability-contract 4.1~4.7 + artifact-flow；不涉 runtime/E3/H1。P-K-d 现场冻结保留。 |

| [Decision-079](Decision-079-smoke-run3-parked-and-diag-prep-waves-chartered.md) | 2026-09-01 | Accepted / smoke run3 parked, W-GW-DIAG + W-GW-PREP chartered | 冒烟 run3 停驻不收口（gate PASS_WITH_RISK 合法停等），待修复波落地后重发全新冒烟；立项波 1 W-GW-DIAG（P-E 最小释放门 --release + 合法矩阵 / P-A 后进程证据包装 / P-I journal_path 回填）与波 2 W-GW-PREP（P-B 按 C1：ProductionRunDeps 可选 prepareWorkspace，内核 prepare→inspect）；P-C/P-D 方向认可（链尾物化 + canonical 覆盖 + 漂移报告）时机缓随交付尾；P-F 观察不立项；旧接线缺口 blocker 关闭移出；D2/E5-L3/②③边界不变。 |

## 新增流程

1. 取本索引中的最大编号加一；不得复用或填补编号。
2. 创建单独 Decision 文件并补齐八段。
3. 在本表追加一行，并更新受影响的权威合同/规划链接。
4. 若涉及跨仓治理，先在产品仓形成可审阅事实；CP/PKB 同步由明确的后续授权执行，不以 handoff 代替产品仓权威文档。
