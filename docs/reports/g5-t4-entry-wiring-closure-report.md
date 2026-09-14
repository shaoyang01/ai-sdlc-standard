# G5-T4 生产入口 manifest 接线收口报告（R1–R3 三轮评审收敛，R3 PASS）

> Date: 2026-09-14
> 结论: **G5-T4 收口**。G5-T4（Δ3 生产入口接线：manifest readiness 预检三态 + 节点 terminal→projector 调用点 ×2 + S-2 停止持久化 + 受治理释放 `releaseManifestProjectionBlock`）@ `17546300500f85799d983c946740bd8cc160c536`（fix/g5-t4-r1-rework 分支头，PR #157 待本报告后随收口合并；全量交付 diff = `a5174ef..1754630` 2 文件 +1113/−3）经 R1→R2→R3 三轮独立只读复审收敛：R1 FAIL（2 阻塞）→ R2 FAIL（2 新阻塞，原 2 项闭环）→ **R3 PASS——RC-1..RC-6 全 CLOSED、无回归、无阻塞**。Current User 收口裁决已下（2026-09-14），冻结为 G5-T5（回归与 parity 矩阵）编码依据。
> R3 报告: /tmp/g5-t4-review-r3/.review-tmp/G5-T4-REVIEW-R3.md（探针同目录 untracked：t4r3-probes.ts、t4r2-caseb-probes-r2orig.ts、t4r2-probes.ts、t4r2-idem-probes.ts、parity-scenario.ts、mismatch-fresh-probe.ts、reason-probe.ts）
> 编码依据链: T3 出口接线 @ `9b70946` + 冻结稿 v1.8.0 + 合同 v1.0.0 §6.2/§6.2.2/§6.2.6/§6.2.7/§7.2 + 剩余计划 §3 Δ3/§4/§6。实施全程未触碰 intake.manifest.json、手动发布器、Skill 面、shadow 路径、业务仓、真实 CLI。

## 1. 评审收敛轨迹（R1 → R3）

| 轮次 | 评审对象 | 判定 | 阻塞 → 修复 |
| --- | --- | --- | --- |
| R1 | `fbc427f`（PR #156，恰 2 文件 +600/−3） | FAIL | RC1-1 中断重入调用点无三态守卫（同形缺陷漏兄弟调用点）；RC3-1 修复后无受治理释放路径 → 整改 PR #157 → `dc916a8` |
| R2 | `dc916a8`（分支头，有意未合并） | FAIL | 原两项 CLOSED；新阻塞：RC2-1 释放认证条件与入口判别不等价（未接管修复误拒 + AMBIGUOUS 消歧楔死）；RC3-1 崩溃窗口（执行存活）下 S-2 静默落空 + 孤儿产物（如实标注为早于该 diff 的 T4 面边界）→ 整改 `1754630` |
| R3 | `1754630`（分支头） | **PASS** | R2 两项闭环、RC-1..RC-6 全 CLOSED、R1/R2 已 CLOSED 项无回归、无新阻塞 |

## 2. R3 PASS 判定摘要

- **认证等价（R2-RC2-1 闭环）**：`releaseManifestProjectionBlock` 分码判别——AMBIGUOUS+FRESH 作 §6.2.7/DP4 合法消歧放行（复审独立裁合规：无投影可绕过，放行是受治理行为）；其余码必须 MANIFEST_PRESENT 且以与预检同源参数（`identity.createdAt`）投影重判；拒绝消息携带投影器真实原因。
- **崩溃窗口停止的诚实化（R2-RC3-1 闭环）**：可落盘性先行探测（末条执行 started → DEFERRED，产物零写入、零孤儿）；DEFERRED 时 fail-loud（类型化异常含码/runId/原因）；实施方"主边界 (a) 结构上不可行"的三段论经复审独立复推**成立**，fail-loud 恰为 R2 可接受替代的原文形态。
- **判定点全量等价**：投影调用恰 4 处（释放/预检/CP1/CP2）、终态落点恰 2 处各跟守卫调用点；认证等价矩阵全格同真同假；DEFERRED 探测与 store 守卫同一判定式同一读路径；TOCTOU 被 store 单写者假设 + 拒写即抛覆盖。
- **守恒零回归**：三态边界五例、FRESH 零阻挡零铸造、非生产路径 parity（6318 字节逐字节一致）、白名单 fail-closed、幂等/游标/字节稳定、S-2 三时序形态、全链自证、释放滥用矩阵、三 core 文件零 diff——全部保持。
- **基线独立复跑全绿**：tsc 0；npm test 162 文件（评审方两次初选 file-level 失败经五步对照实验定性为评审自污染，断言全过——见 S-3）；三 Ruby 校验器 exit 0；越界零 diff。

## 3. 收口效力

- T5（新增投影回归测试 + 既有全量回归 + 同 fixture 的 manual/runtime parity 对照）编码依据 = `feature/loop-runtime-v1` @ `3e2eeb8`（T4 交付与两轮整改）与冻结稿 v1.8.0；实施中的语义疑问以冻结稿 + 合同 §6.2 为准，不得实施中改语义。
- G5 完成门（剩余计划 §7）5 条在 T5 验收：manual/runtime 轨迹归一化等价、三级判别行为一致、finding 独立生命周期迁移投影、四项回归断言在位、全量回归 + tsc 干净。
- 本报告不改动任何被评审文件——评审对象与收口对象保持同一 SHA（T4 交付内容 = `1754630`，其随本收口链经 PR #157 合入主线）。

## 4. 残留项处置（R1–R3 累积，均不阻塞）

| # | 内容 | 处置 |
| --- | --- | --- |
| R3-S1 | 释放拒绝消息码前缀重复（`stops (CODE): CODE: …`，cosmetic） | T5 顺带修正（一行） |
| R3-S2 | DEFERRED 抛错消息中 resume/repair 排序误导（未修复时 resume 过不了预检） | T5 顺带修正（措辞） |
| R3-S3 | `loop-codex-implementation-adapter.test.ts` 全仓纯净守卫（`D05_REAL_SOURCE_UNCHANGED`，80a9209 引入）在并行 runner 下会被并发工作区文件活动翻转为 file-level 失败（断言零失败） | 运维项，非 T4 缺陷；T5 决定 runner 声明或守卫收窄 |
| R3-S4 | 17 类 YAML 越界形态余量（欠引类型翻转类最高优先）、lag 端到端、真实 D-9 DEFERRED 入矩阵、ACCEPTED 混合变体、repair 全流程、D-21/§7.4 跨面解析 | T5 parity 矩阵必过用例（沿 T2 收口报告 §4 口径） |
| T3 残留 | O-2..O-5、lag 端到端、D-21/§7.4、ACCEPTED/repair | 维持 T5 口径 |

## 5. 治理状态

- Control Plane STATE 随本收口更新 `source_refs.product_commit`（分支 + PR 合控制面 main）——按 GOVERNANCE §15.4，`source_refs` 为登记时刻产品仓 tip 的快照，本报告的合并提交落在其中，故该值与 §1 的评审对象 SHA 不同属构造必然。`route_state` / `active_work`（D-090-03 IN_PROGRESS）/ `next_transition`（G5_D09003_COMPLETION_REVIEW）与 `[G5_MANIFEST_PROJECTION]` 授权（consumed: false）不变。
- 边界保持：未实施 T5；未触碰 intake.manifest.json、手动发布器、Skill 面、shadow 路径、业务仓、真实 CLI；G6/run8/C03-E 完成判断/C05、D091 业务收编仍不在授权范围。
