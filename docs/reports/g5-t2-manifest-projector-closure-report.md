# G5-T2 manifest projector 收口报告（R1–R4 四轮评审收敛，R4 PASS）

> Date: 2026-09-11
> 结论: **G5-T2 收口**。`core/loop-manifest-projector.ts` + `core/loop-manifest-yaml.ts`（Δ1，含 §6.2.2 三级有序判别与第 3 级幂等追平）+ `core/loop-run-store.ts` 已验证 proofs 读接口，@ `2b5eb3682e50b1015668832f1008d7b1472c2eb7`（PR #151 合并提交，feature/loop-runtime-v1 主线）经 R4 独立只读复审 **PASS——无阻塞项、无新增建议项**，进入 Current User 收口裁决并冻结为 G5-T3（Δ2 出口接线）编码依据。
> R4 报告: /private/tmp/g5-t2-review-r4/.review-tmp/G5-T2-REVIEW-R4.md（证据 SHA256SUMS 70 项）
> 编码依据链: 冻结稿 v1.8.0（R1 修正边界内三项补全，R2/R3 轮零变更）+ 合同 v1.0.0 §6.2 族；实现全程未触碰 intake.manifest.json、手动发布器、Skill 面、shadow 路径。

## 1. 评审收敛轨迹（R1 → R4）

| 轮次 | 评审对象 | 阻塞 → 修复（PR → 主线） |
| --- | --- | --- |
| R1 | `32b20b8`（PR #147，实现初版 +2418） | 五项阻塞：RC3-1 失效时点写读两规则（永久死锁）/ RC1-1 多解静默 fail-open / RC4-1 takeover-B 三重断裂 / RC2-1 depth 自引用 + 额外键存活 / RC1-2 缺行静默 + 重复行码 → 整改 PR #149 → `566e5ce` |
| R2 | `566e5ce` | 两项阻塞：B1 分支2 读侧无 journal 参照 + 写侧整面翻转 / B2 真实产物（无 corrections 键）load 崩溃无码 → 整改 PR #150 → `e9beaa1` |
| R3 | `e9beaa1` | 唯一阻塞：B3 TS 发射器缺 Psych `0[0-7]*[89]` 坏八进制单引号规则（真实 W2 产物字节漂移，17 形态表 deferral 前提被真实产物证伪）→ 整改 PR #151 → `2b5eb36` |
| **R4** | **`2b5eb36`** | **PASS——无阻塞项、无新增建议项；G5-T2 可进入 Current User 收口裁决** |

## 2. R4 PASS 判定摘要

- **B3 CLOSED**：`/^[-+]?0[0-7]*[89]/` 规则与 Psych 5.1.2 yaml_tree.rb 第二析取支边界一致（probe17 45 例两侧逐字节对拍：`094fe8b3…`/`0179`/`08`/`0089` 引号、`0123` 走 int 支不误引、既有引号树零回退）；14 例 mismatch 全部落入 R1 17 形态表既有行（T5 域），**零新增偏差类**；真实域端到端——probe12 W2 误拒消除（PUBLISHED）、W 不回退、probe18 W2 全链 takeover→replay×2 NO_OP、probe13 全文档 diff 0 行（R3 为 1 行）、发布字节经 Ruby round-trip 逐字节一致（182 行）；树内 R3-B3 用例在案。
- **守成全部 CLOSED 保持**：B1 读侧三分支参照比较（probe9 9A/9B/9E）、B1 写侧手动面貌（9C/9D/16-T1/T2/T3）、B2 缺省即缺省（probe14 + 真实 W 全链）、RC3-1 写读同规则（probe3 死锁不复活）、RC1-1 多解 STOP（probe4）、RC2-1 锚复算与键集双向（probe5-A/10D）、RC1-2 明文 CORRUPT（probe5-D）、RC4-1 中文基名与 paired 全链（probe8-F0、probe6/11）。R1–R3 全套探针（3/4/5/6/8/9/10/11/15/16）与各自基线逐字节或语义一致。
- **套件与工具链**：本地 npm test 三轮全量断言层恒定 18823 通过 / 0 失败（三个文件级并行偶发集合互不相同、隔离单跑各自全绿、均不 import 被修改模块且其中之一在 R3 基线已同样偶发——预申报豁免坐实）；tsc 0；Ruby 校验 ×4 全 0；CI 四项经 gh api 独立核验 `2b5eb36` 全部 success；diff 恰 2 文件、冻结稿零变更、skills/ 零 tracked diff。
- **不转移项**：任务书豁免清单逐条核对均维持、无升格；合同外泛化加固建议为零。

## 3. 收口效力

- T3（Δ2：三级判别失败出口接线到 runtime 运行出口）编码依据 = `feature/loop-runtime-v1` @ `2b5eb36` 的实现与冻结稿 v1.8.0；实施中的语义疑问以冻结稿 + 合同 §6.2 为准，不得实施中改语义。
- 本报告不改动任何被评审文件——评审对象与收口对象保持同一 SHA。

## 4. 残留项处置（R1–R4 累积，均不阻塞）

| # | 内容 | 处置 |
| --- | --- | --- |
| O-2 | 配对必要条件（evidence_digest 相等）在手动 OPEN 行 schema 下不可满足；实现替代谓词已上报 | 冻结稿后续修订参考（合同 §6.2.2 pairing 判据）；T5 前定夺 |
| O-3 | `runtime_locator.producer_execution_id` 承载 revision id（R8-S1 裁定不参与命中） | T5 前改正或 schema 注释显式更名 |
| O-4 | 游标空洞（"游标处无对应事件 → STOP"）未实现 | 观察项维持；T5 parity 矩阵可构造 |
| O-5 | strict 读取器接受未闭合流式 token 为 plain | 观察项维持（下游 digest/比对仍 fail-closed） |
| 17 形态余量（16 类） | YAML 越界形态偏差（B3 的 `0[0-7]*[89]` 已入范围修复） | T5 parity 矩阵必过用例；欠引致跨面类型翻转类（`1_000`/`1.`/`y`/`n`/NEL）最高优先 |
| lag 端到端 | OPEN→RESOLVED 合法落后迁移端到端依赖 Re-Gate 授权链 | T5 parity 矩阵以真实发布器 fixture 覆盖 |
| D-21/§7.4 跨面解析 | closures 分区只写不读（T2 无调用点） | T5 parity 域 |
| ACCEPTED 混合 / repair 全流程 | 与 RESOLVED 同分支 / 代码审核符合 | T5 独立构造标注 |

## 5. 治理状态

- Control Plane STATE 随本收口更新 `source_refs.product_commit → 9927dbc`（分支 + PR 合 main）——`source_refs` 为收口时刻产品仓 tip 的快照，本报告的合并提交（PR #152）落在其中，故该值与本报告 §3 的编码依据 SHA 不同；T3 编码依据仍为实现 @ `2b5eb36` 与冻结稿 v1.8.0。`route_state` / `active_work`（D-090-03 IN_PROGRESS）/ `next_transition`（G5_D09003_COMPLETION_REVIEW）与 `[G5_MANIFEST_PROJECTION]` 授权（consumed: false）不变。
- 边界保持：未实施 T3；未触碰 intake.manifest.json、手动发布器、Skill 面、shadow 路径、业务仓、真实 CLI；G6/run8/C03-E 完成判断/C05、D091 业务收编仍不在授权范围。
