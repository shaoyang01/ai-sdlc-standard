# C02-WP3.5 Single-Rail Retired Documents（单轨退役文档归档）

> 归档时间：2026-08-22（C02-WP3.5 阶段 3 WP3.5-A 合同重基线，Decision-044/045）
> 状态：**Historical**——以下文件已从 active entrypoints（`manifest.yaml`）退役，不再作为现行标准或模板入口。Git 历史即历史权威；不为旧 Skill ID、旧 node ID、旧 Manifest 或旧格式保留 alias/fallback。

## 退役原因

Decision-044/045 单轨裁决取消 Direct/Speckit 路径分流与独立 Speckit 产物轨道后，下列文档承载的双轨、specs-run、sync source mode、pipeline authority 与 Shared Tail 语义不再成立；其可复用条款已迁移进对应 v2 active standard（见下表）。

## 归档清单与职责承接

| 退役文件 | 可复用条款承接 |
| --- | --- |
| `agents-rail-routing.md` | 已取消（单轨无 rail 分流）；激活/停靠/暂停/恢复职责由 LOOP runtime 接管（WP4/WP5）。 |
| `business-domain-sync-source-modes.md` | sync source mode 三模式取消；稳定事实写入统一经 `knowledge-sync`（APPLY_LOCAL/PROPOSAL_ONLY）。 |
| `library-driven-sync-runtime.md` | library 驱动同步语义并入 `knowledge-sync` 与 `loop-artifact-revision.md`（单一对账基准 = library 工件 + LOOP artifact revision）。 |
| `specs-run-lifecycle.md` / `specs-run-metadata-and-archive.md` | specs 机器事实层取消；运行元数据/归档语义不进入 v2。 |
| `speckit-dual-rail-isolation.md` | 双轨隔离取消；specify/plan/clarify 语义并入 solution-design/solution-gate。 |
| `speckit-document-generation-spec.md` / `speckit-document-split.md` / `speckit-document-governance.md` | 文档生成/治理通用规则并入 `sdlc-docflow-writer`（non-node utility）与 `knowledge-sync`。 |
| `speckit-project-bootstrap.md` / `speckit-project-type-profiles.md` / `speckit-skill-product-compatibility.md` | 项目引导与类型矩阵语义并入 `project-type-contract-artifact-matrix.md`（v2 重写版）。 |
| `NEW_RAIL_ENHANCED_SPECKIT_PIPELINE_SUMMARY.md` | 历史总结，保留为归档；Pipeline 已退役（Decision-045）。 |
| `specs-run-metadata-template.yaml` / `specs-archive-cleanup-proposal-template.md` / `library-driven-sync-decision-template.md` | 模板随 specs 机器事实层取消而退役。 |

## 允许例外（residue audit allowlist）

本归档目录整体属于 archive 例外；residue audit（C02-WP6）允许本目录内的旧术语出现，不进入 active code/standard/manifest/registry 扫描范围。
