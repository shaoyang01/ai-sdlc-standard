# G5-T1 投影语义冻结稿收口报告（R1–R8 八轮评审收敛，R8 PASS）

> Date: 2026-09-09
> 结论: **G5-T1 收口**。`docs/reports/decision-090-g5-projection-semantics.md` v1.7.0 @ `a5ea6873158ecf3d2c7852739f985959acf89f41`（PR #145 合并提交）经 R8 独立只读复审 **PASS**，冻结为 G5-T2 编码依据。G5 整体（D-090-03，T1..T5）仍在 [G5_MANIFEST_PROJECTION] 授权（consumed: false）内推进。
> R8 报告: /private/tmp/g5-t1-review-r8/.review-tmp/G5-T1-REVIEW-R8.md（证据 254 文件 SHA256 归档，主工作区只读回执 final-readonly.json）

## 1. 评审收敛轨迹（v1.0.0 → v1.7.0）

| 轮次 | 评审对象（主线候选） | 版本 | 阻塞 → 修复版本（PR） |
| --- | --- | --- | --- |
| R1 | `ddab203`（PR #137） | v1.0.0 | R1-H1..H7 → v1.1.0（PR #138） |
| R2 | `38e179d`（PR #138） | v1.1.0 | R2-H2 fold 全函数 / H3 时点方向 / H5 集合顺序 → v1.2.0（PR #139） |
| R3 | `2425731`（PR #139） | v1.2.0 | R3-H1 Gate 三字段裁决槽 / H2 前缀时点归约 / H4 parity 方向 → v1.3.0（PR #140） |
| R4 | `a905f25`（PR #140） | v1.3.0 | R4-H1 formal failed 终态 / H2 前缀三槽位 rehash / H3 parity 六缺口 → v1.4.0（PR #141） |
| R5 | `5c18de7`（PR #141） | v1.4.0 | R5-H1 failed 裁决槽 / H2 provenance 缺键误停 → v1.5.0（PR #143） |
| R6 | `dcc2d5c`（PR #143） | v1.5.0 | R6-H2 六子项（版本边界三态 D-15、per-row 来源 D-16、mapped 后继 D-17、非 scan 入口 D-18）→ v1.6.0（PR #144） |
| R7 | `a701fe0`（PR #144） | v1.6.0 | R7-H1 持久映射与重入六缺口 / R7-H2 depth 比较错位 → v1.7.0（PR #145） |
| **R8** | **`a5ea687`（PR #145）** | **v1.7.0** | **PASS——G5-T1 收口** |

## 2. R8 PASS 判定摘要

- **§3 十项全部 CLOSED**：
  - R7-H1-1/2/3：三分区对象（`logical_identity_map = {findings, revisions, closures}`，D-19）无 finding 多 revision 可存、不变量 1–5 逐条可执行且违例各被拒；真实 W2 经 A2 恰 2 行 manual 承接 + revisions/closures 登记齐全（D-20 填充义务生效）；§8.5 六步重放在 A/B × 有无 finding × 一致/分叉 × 重启矩阵下全 no-op、分叉 STOP、映射字段存盘不丢。
  - R7-H1-4/5/6：真实 P 的 `impl-fixed` 与 W2 真实版本标签均可解析（D-21）；wrong revision / 零解 / 多解 / 证据漂移各 STOP；真实 gateway 两条同公共绑定 finding（store sequence 1/2）locator 单面唯一、跨面歧义 STOP（D-22）；eligibility 四条件谓词覆盖 BLOCKED × 产物 current 反例（D-23），真实 store 事件 03 ≠ revision 04 时点写读同域、矛盾消除。
  - R7-H2：12 个真实 P 场景（含 R7 六项反例）在 D-a/D-b 双断言下全 PASS；变异 Gate `decisionDepth` 仅 D-a 红、变异 `required_depth` 仅 D-b 红（D-24 独立可检）；原 depth fold 12/12 不回退。
  - S1/S2：v1.5.0 全部 11 表恢复（+1 新 D-a 表）、差异逐行核对为 R7 修正叠加或语义保持的编辑压缩；无"同 v1.x"自指；态 2 显式优先、schema 锚、`source` 入正式 schema。
- **§4 回归零回退**：D-15 三态、D-17 单行迁移四不动、D-18 非 scan 入口、R5-H1 诚实 formal failed、R4-H2 四 rehash 4/4 STOP、R2-H5 集合、R3 时点/共享 ref、R6 降级反例全保持。159/159 串行测试全绿、tsc 退出 0、三 Ruby 校验器退出 0、四客户端 × 八 Skill 32/32 identical、skill 基线 38e179d 零 diff。PR145 四 CI job SUCCESS；STATE `open_blockers=[]`。
- **证据纪律**：四级证据（真实 P①、真实 J/materializer②、绑定物理 store③、临时规则模型④）分别记录未混同；W/W2 业务文件哈希与 R7 一致且全程只读。

## 3. 冻结效力

- 编码依据 = `feature/loop-runtime-v1` @ `a5ea687` 的 `docs/reports/decision-090-g5-projection-semantics.md` v1.7.0（含 D-1..D-24 边界决策全表）。本报告不改动冻结稿正文——评审对象与冻结对象保持同一 SHA。
- G5-T2（`core/loop-manifest-projector.ts` 实现，Δ1，含 §6.2.2 三级有序判别与第 3 级幂等追平）可据此启动；实施中的语义疑问以冻结稿 + 合同 §6.2 为准，不得实施中改语义。

## 4. R8 残留建议（不阻塞）与处置

| # | 内容 | 处置 |
| --- | --- | --- |
| R8-S1 | `runtime_locator.producer_execution_id` 无派生规则（store 24 列无此字段；命中校验仅用 `source_capability + store_sequence`，确定性不受影响） | 留 T2 实施注意：locator 命中按 `source_capability + store_sequence` 两元实现；`producer_execution_id` 作为登记时的可取证附注，不参与命中谓词 |
| R8-S2 | `closure_evidence_digest` 跨面字面比较依赖字符串约定（手动面存在 `sha256:` 前缀形态，误停方向保守安全） | 留 T2 实施注意：比较前按面内既有形态归一（前缀剥离一致化）；任何歧义保持 STOP 方向 |
| R8-S3 | 冻结稿首部 `/tmp` 评审报告引用宜在归档时 pin 稳定地址 | 归档（PKB/Exchange）时以本报告 §1 轨迹表为稳定索引；冻结稿正文不改 |

## 5. 治理状态

- Control Plane STATE 随本收口更新 `source_refs.product_commit → a5ea687`（分支 + PR 合 main）；`route_state`/`active_work`/`next_transition`（G5_D09003_COMPLETION_REVIEW）与 [G5_MANIFEST_PROJECTION] 授权不变。
- 边界保持：未实施 T2；未触碰 intake.manifest.json、手动发布器、Skill 面、shadow 路径、业务仓、真实 CLI；G6/run8/C03-E 完成判断/C05、D091 业务收编仍不在授权范围。
