# G5-T2 跨机交接：manifest projector 已合并，待 T2-R1 独立复审

> Date: 2026-09-10 · Author: AI_SDLC_PROJECT_CONTROLLER（eric_shaoooo 工作机会话）
> 用途：换机恢复现场。新会话恢复时先读本文件，再按 §3 步骤推进。**复审 prompt 不入产品仓文档（Current User 规则）**——恢复后由会话按 §4 要点现场生成并展示。

## 1. 当前位置（精确）

- 产品仓 `shaoyang01/ai-sdlc-standard`，分支 `feature/loop-runtime-v1`，HEAD = **`32b20b86ada446e27ba7ec3894b3861179ce0e0b`**（PR #147 合并提交；工作分支 `feat/g5-t2-manifest-projector`，第一父 `5f2c46c`、第二父 `fab2b83`）。
- G5-T1 已收口：冻结稿 `docs/reports/decision-090-g5-projection-semantics.md` **v1.7.0 @ `a5ea687`** 为 T2 编码依据（收口报告 `docs/reports/g5-t1-projection-semantics-closure-report.md`；R1–R8 轨迹见该报告 §1）。
- Control Plane STATE：`open_blockers=[]`，`[G5_MANIFEST_PROJECTION]` 授权（consumed: false，覆盖 T1..T5）；`source_refs.product_commit` 停在 `5f2c46c`（惯例：收口才推进，T2 复审 PASS 后随 T2 收口更新）。
- T2 状态：**已实现合并，未复审**。下一轮为 **G5-T2-R1**（T2 的第一轮独立复审）。

## 2. T2 交付物（diff = `5f2c46c..32b20b8`，恰 4 文件 +2418）

| 文件 | 内容 |
| --- | --- |
| `core/loop-manifest-yaml.ts`（新，385 行） | D-5：Ruby `YAML.dump` 的 TS 确定性复刻（plain/single/double 引号树、数组与键同级缩进、null 空值、timestamp/bool/数字/sexagesimal 形态加引号）+ 严格 round-trip 读取器 |
| `core/loop-manifest-projector.ts`（新，1381 行） | 投影器本体：D-9 前置 → §4.1 三态互斥 → 前缀重推导（三槽位；失效时点按 D-10 同事务 createdAt 关联，多解 STOP）→ §4.2(b) 集合完整性/三步交叉/域别分流 → §4.3 追平发布（V9 单次原子发布）→ §8 接管 A/B（D-20 填充、D-19 三分区、§7.4 配对歧义拒绝）+ §3.3 depth 归约 |
| `core/loop-run-store.ts`（+25） | `readFindingChainInTransaction` 返回已验证 proofs；新增 `listFindingProofs` 只读接口（C §6.2.2(b) 证明绑定经现役已验证读接口） |
| `tests/loop-manifest-projector.test.ts`（新，627 行） | 78 断言：YAML 字节形态 golden、接管 A/W2 三分区登记、尾段追平、重放 no-op、D-15 篡改负例、§3.3 归约表 18 组合、V9 entries 纪律 |

## 3. 换机恢复步骤

1. `git fetch && git checkout feature/loop-runtime-v1 && git pull` → 核验 HEAD = `32b20b8`、工作区干净。
2. 快速自检：`npx --no-install tsc --noEmit`（应 0）；`npx tsx tests/loop-manifest-projector.test.ts`（应 78/78）。
3. 由会话生成 **G5-T2-R1 复审 prompt**（会话内展示，不入仓；要点见 §4），复制给独立复审方。
4. 复审 PASS → T2 收口（收口报告 + STATE `product_commit` 推进，走分支 + PR）；FAIL → 按阻塞项修复，新版本 PR。

## 4. T2-R1 复审要点（生成 prompt 的核对清单）

- 对象：`32b20b8`；diff 基线 `5f2c46c..32b20b8`；越界核验（intake.manifest.json / 手动发布器 / Skill 面 / ai-sdlc 合同零 diff）。
- 编码依据符合性：实现逐条对照冻结稿 v1.7.0 的 D-1..D-24 与 §2–§8；语义分歧以冻结稿为准。
- D-5 实证：评审可用 `ruby -ryaml` 对同形态 state 独立生成期望 bytes，与 `dumpRubyYaml` 逐字节对拍（引号树、缩进、null、长行不折叠）。
- 关键语义：前缀重推导不依赖 manifest 自身行（防 rehash 篡改存活）；三级判别顺序固定互斥；fold 覆盖式三槽位与批次无关；失效时点推导的 createdAt 匹配多解 STOP；接管初始化填充义务（空 map 承接非空 findingIndex = 违规）；配对歧义 STOP；原子发布 + 重放 no-op。
- 已声明的诚实边界（核对其真实性，不得当语义缺口放过，也不得要求 T2 越界补齐）：OPEN→RESOLVED lag 端到端依赖 Re-Gate 授权链（C03-E 域），归 G5-T5 parity 矩阵；YAML 字节级对拍矩阵归 T5（T2 已含样例级 golden）。
- 回归基线：160 文件全绿（159 + 1 新增，1767 断言）、tsc 0、三 Ruby 校验器 0、四客户端 32/32 不受影响。

## 5. 边界保持（不可越界）

不触碰 `00-需求资料/intake.manifest.json`、手动发布器 `scripts/publish-requirement-manifest.sh`、Skill 面、shadow 路径、业务仓、真实 CLI；G6/run8/C03-E 完成/C05、D091 业务收编仍在授权外。T3（Δ2 出口接线）在 T2 复审闭合后启动。
