# D-088-01 v3 差距审查报告：候选 `a626335` 相对 v3 行为规格

> Version: 0.1.0
> Status: 只读审查结论（冻结计划 §4/G1 阶段 A；随 [v3 规格](d088-01-v3-behavior-spec.md) 一并提交 Current User 审查）
> 审查对象: 产品仓 `a626335`（D088-R2 收口）：`scripts/bootstrap-knowledge-target.sh`（1822 行）、`scripts/bootstrap-entry-coverage-profile.sh`（662 行）、`scripts/validate-skill-contracts.rb`、`skills/sdlc-knowledge-sync/**`、`tests/bootstrap-knowledge-target.test.sh`（799 行，35 场景）
> 性质: 只读差距审查，无任何代码修改；修复清单为实施授权的申请输入。

## 1. 审查方法

以 v3 规格 §1–§9 为基线，逐模块对照候选实现事实（代码行为 + 35 个既有场景的实证覆盖）。每个差距条目给出：规格条款、候选现状、影响、处置建议（修改/新增；已满足项列入保留清单）。归因原则：候选不是"错误"——它是按 v2 需求边界（Decision-089）正确实现的；差距来自 Decision-090 重基线扩大的需求边界。

## 2. 已满足项（保留清单 —— 实施时不得回退）

| # | 能力 | 规格 | 候选证据 |
| --- | --- | --- | --- |
| K1 | create-if-missing / 永不覆盖 / 人工改写权威 | I1, R15 | `plan_file` preserve 语义；场景 3/4/5/16/17/18 |
| K2 | 声明状态机 + `--domain-map` routed 流 | I2, R21 | 场景 2/8/10/11；`generate_declaration*` |
| K3 | 管理根文档 provenance + digest 基线原子升级（仅 pristine candidate） | I1/I2, R14 部分 | R1-H4 实现；场景 26–29 |
| K4 | routed map fingerprint fail-closed / containment / 非法 map 拒绝 | I8c, R12 部分 | R2-H2/H3；场景 9/24/33/34 |
| K5 | legacy 根零穿越（dangling symlink 安全） | I4 部分 | R2-H1；场景 22 |
| K6 | 残留扫描（全 `.sdlc` 面 + 语义豁免）与原子报告 | I7/I8b, R18 部分 | R2-H6 + H6；场景 15/30/31/35 |
| K7 | 治理 YAML 无 aliases + 严格门禁消费各 artifact 变体 | I8a | H5；场景 32 |
| K8 | 代码驱动填充（入口扫描/机械聚类/xx99/零业务语义） | I3, R20 部分 | 场景 12/13/14/23 |
| K9 | git user.name 门禁 / dry-run 零写入 / 幂等重跑 | I5, R11, R16 | 场景 1/3/4/7/20/29 |
| K10 | validator 强化（否定绑定、代码块标记、Ruby 2.6 兼容） | §9 | R2-H4/H5 修复 |
| K11 | single-rail 契约与 knowledge-sync 联动 | §9 | R1-H7 |

## 3. 差距清单（对照规格条款）

| # | 规格条款 | 候选现状 | 影响 | 处置 |
| --- | --- | --- | --- | --- |
| G1 | §2 四类判定（R01/R02） | `detect_profile_hint` 是技术栈画像；legacy 检测仅 `.specify/business_domain` 存在性（`legacy_root_present`）；无 S6–S12 信号，无 SDD vs SDLC-SDD 区分 | 四类重基线的核心缺口；SDLC-SDD 存量无法识别 | **修改 M1**：新增类型判定器（信号表 + 决策表 D1–D9），`detect_profile_hint` 保留为并行技术栈输出 |
| G2 | §2.3 类型级 BLOCKED_AMBIGUOUS（R03） | 双根/冲突时路由进 AUDIT 或文件级 blocked；无类型级歧义判定与零部分升级 | 歧义存量可能被错误地走 AUDIT-only 路径 | **修改 M2**：模式选择前移判定器；D1/D2 → exit 1 零写入 |
| G3 | §2.2(4) 多信号输出（R04） | 无治理类型多信号收集 | 判定不可审计 | **修改 M1** 内含：`signals[]` 结构化输出 |
| G4 | §4 逐文件迁移（R06–R08） | legacy 仅 AUDIT advisory（"reported as migration suggestion, never read or rewritten"）；无分类器、无五动词、无归档树 | Decision-090 明确取代该立场；存量迁移是初始化场景的一半 | **修改 M3**：新增 PLAN 生成器（分类基线表 C1–C10 + 计划 artifact） |
| G5 | §4.3/§4.5 plan digest + DP1 确认（R09/R10） | 无计划 artifact、无 digest、无确认机制 | 迁移不可审计、不可确认 | **新增 A1**：`--plan`/`--detect` 输出 + `plan.json` schema + `--confirm-migration-plan` |
| G6 | §5.3 逐文件安全分类（R12） | symlink 处理限 legacy 根与 domain-map；普通 legacy 文件不可读/越界无分类路径 | 边界文件会崩溃或被静默跳过 | **修改 M4**：PLAN 前逐文件安全扫描（C10） |
| G7 | §5.4 写入面断言（R13） | 写入面靠路径构造约定，无 apply 前显式断言 | 零接触不变量缺机械防线 | **新增 A2**：apply 前目标路径集合断言 |
| G8 | §6 事务性 apply + 回滚（R14/R17） | execute 为顺序 `cp`；声明升级有 digest 基线但迁移面无备份/回滚；中途失败留半成品 | 迁移中断=仓内不一致状态，人工无法恢复 | **修改 M5**：备份 + 逆序恢复 + post-digest 复核 |
| G9 | §6.4 迁移后残留门禁（R18） | 残留扫描只在 AUDIT 报告（事后体检）；非 APPLY 内部门禁 | 迁移产出可能携带旧语义而不阻断 | **修改 M5** 内含：apply 后扫描命中 → 回滚 |
| G10 | §7 机器可校验报告（R22） | 报告仅 md 人读 | 报告不可机械断言（自述成功风险） | **修改 M6**：md + 结构化 json 双产物，schema 固定键集 |
| G11 | §8 矩阵组织（R23/R25/DP2） | 35 场景按修复历史组织（H1–H6 命名）；LEGACY_SDD/LEGACY_SDLC_SDD 全真 fixture 缺失（场景 6 仅旧根目录）；无 108 组 dry-run 生成器；DP2 代表组合未冻结 | 验收口径不合格；组合缺陷漏检 | **新增 A3**：table-driven fixture 生成器 + 16 代表组合 + 边界 B6/B8/B9/B10 新用例 |
| G12 | §4.4 TRANSFORM 机械合并（I4 例外） | 不适用（无迁移面） | 随 M3 落地 | **新增 A4**：固定字段映射表 + 正文零进入断言 |
| G13 | R05 检测幂等显式断言 | 隐含满足，无测试 | 回归无防线 | **新增 A3** 内含：detect 幂等用例 |
| G14 | R26 findings 重归因 | 未做（本轮报告 §4 承接） | — | 见 §4 |

## 4. R1/R2 findings 按 v3 规格重归因（R26）

| Finding | v3 归因 |
| --- | --- |
| R1-H1 零 legacy 读 | **被规格吸收**（I4），保留并扩展：检测元数据只读 + §4.4 机械合并例外 |
| R1-H2 扫描收窄 | **保留**（K8），无变化 |
| R1-H3 编号/confirmed 严格性 | **保留**（K2），无变化 |
| R1-H4 digest 基线原子升级 | **保留并推广**（K3 → M5 把同类事务性机制从声明面推广到迁移面） |
| R1-H5 YAML aliases 消除 | **保留**（I8a，K7） |
| R1-H7 single-rail 契约 | **保留**（K11）；v3 下旧根声明不可路由语义在 §9 显式化 |
| R1-H8 / R2 全部（H1–H6） | **保留**（K4/K5/K6/K10）；其中 R2-H1 零穿越、R2-H6 原子报告与残留扫描直接成为 v3 的 I8b/§6.4 基座 |
| 旧 Round"全绿" | **不作为 v3 验收依据**（规格 §8.3）；全部场景按新矩阵重新归位 |

## 5. 有界修复清单（实施授权申请；批准后按此执行，不夹带）

**范围文件面**（= 冻结计划 §5 D-088-01 行）：`scripts/bootstrap-knowledge-target.sh`、`scripts/bootstrap-entry-coverage-profile.sh`（仅联动触碰）、`scripts/validate-skill-contracts.rb`、`skills/sdlc-knowledge-sync/**`（声明路由语义注记）、`tests/bootstrap-knowledge-target.test.sh`。业务仓零接触。

| 序 | 项 | 类型 | 内容 | 验收指向 |
| --- | --- | --- | --- | --- |
| F1 | 类型判定器 | 修改（M1/M2/M3 合并条目 G1–G3） | 信号表 S1–S13 + 决策表 D1–D9 + `--detect` 输出 + 模式选择重排；`legacy_root_present` 保留为 S9 实现细节 | 场景：四类判定 + B10 + detect 幂等 |
| F2 | 迁移 PLAN 生成器 | 修改（M3/G4） | 分类基线表 C1–C10、逐文件动词+理由、`plan.json` + `plan_sha256`、C10 安全扫描（G6/M4） | A9–A14 的 plan 断言 + dry-run 全组合 |
| F3 | DP1 确认 | 新增（A1/G5） | `--confirm-migration-plan <sha256>`；add_only 豁免；digest 漂移拒绝 | A9/A11 + B8 |
| F4 | 事务性 APPLY | 修改（M5/G8/G9） | 备份 + 顺序执行 + 失败逆序回滚 + post-digest 复核 + 迁移后残留门禁 + 写入面断言（A2/G7） | A15 + B9 + §5.4 断言 |
| F5 | 报告双产物 | 修改（M6/G10） | migration report md + json（固定键集）；validator 增迁移动词/plan schema/确认语义负向矩阵 | §7 schema 断言 |
| F6 | 测试矩阵重组 | 新增（A3/G11/G13 + A4/G12） | fixture 生成器（108 dry-run 组合）、16 代表组合（A1–A16）、边界 B6/B8/B9/B10；既有 35 场景归位到新矩阵并保持全绿 | §8 全部 |
| F7 | sync/validator 联动注记 | 修改 | `sdlc-knowledge-sync` 旧根声明不可路由 + single-rail 注记；validator Ruby 2.6 兼容保持 | §9 断言 |

**明确不做（防夹带）**：不改 runtime/gateway；不动 7+1 其他 Skill（除 sdlc-knowledge-sync 声明路由注记）；不执行任何真实业务仓初始化/迁移；不物理删除任何文件（RETIRE=归档树移动）；不动 Decision-089 v2 既有不变量。

**规模估计**：F1–F5 为脚本主体改造（预计 +600~800 行）；F6 测试翻倍（~+800 行）；validator +100 行。单波可完成，无跨仓依赖。

## 6. 审查结论

候选实现质量良好（v2 边界内自洽，R1/R2 修复有效），**保留清单 K1–K11 全部延续**；差距为需求边界扩大所致，非实现缺陷。修复按 F1–F7 单波实施后，验收以 v3 规格 §8 矩阵全绿 + 本清单无夹带为完成门。停等 Current User 对 v3 规格（PROPOSED）与 F1–F7 的实施授权裁决。
