# G1 / D-088-01 v3 实施独立复审 Prompt（交付外部 Agent）

> 用途：把下方分隔线之间的**整段**复制给另一个独立 agent 做只读复审。实现方自审 / 子 agent / 对抗视角都不算数。
> 复审基线：产品仓 `shaoyang01/ai-sdlc-standard`，分支 `feature/c03-e5-autonomous-acceptance`，**HEAD 须为 `ce60539`**，实施增量范围 **`f21b0aa..ce60539`（恰 2 个提交：`ef8d470` F1–F6、`ce60539` F5b+F7）**。环境要求：bash、git、ruby（stdlib yaml/digest/json，无外部 gem）。
> 上游合同（复审对象是"实现相对合同"，三者均为只读输入）：[v3 行为规格 v1.0.0](d088-01-v3-behavior-spec.md)（ACCEPTED）、Decision-090、[冻结执行计划](decision-090-c03e-prerun-governance-plan.md) §4/G1、[需求拆分](decision-090-c03e-prerun-requirement-decomposition.md) v1.0.0（裁决 DP1–DP5）、[差距审查](d088-01-v3-gap-review.md)（授权范围 F1–F7 与保留清单 K1–K11）。
> 复审结论回来后：零阻塞 → G1 完成裁决 + STATE 推进；有阻塞 → 按报告一次性根因修复后再复审。同一根因变体不得拆成无尽 Round（冻结计划 §6）。

## 复审结论（等待回收）

---

对 C03-E-PRE-RUN G1 / D-088-01 v3 实施做一次聚焦、只读、根因级独立复审。

**背景**：Current User 接受 v3 规格 v1.0.0（`f21b0aa`）并授权有界修复清单 F1–F7（依据差距审查 `db4f736`）。实现方声称：四类判定器（信号 S1–S13 + 决策表 D1–D9 + R03 阻断门）、迁移 PLAN（分类 C1–C10 + 内容寻址 `plan_sha256` + 碰撞预检）、DP1 确认绑定、事务性 APPLY（备份 → 顺序移动 → 失败逆序回滚 → 空目录剪除 → 迁移后残留门禁 → 违规整体回滚）、双产物报告（md + json 固定键集）、validator v3 负向矩阵、sdlc-knowledge-sync 旧根不可路由注记。测试 **505 passed / 0 failed**（35 个 v2 场景重归因 + 新增场景 36–43），validator `skill contract validation ok`。**以上口径不采信，全部亲自实跑。**

**授权文件面（无夹带核查的第一步）**：`git show --stat ef8d470 ce60539` 必须恰覆盖：`scripts/bootstrap-knowledge-target.sh`、`tests/bootstrap-knowledge-target.test.sh`、`scripts/validate-skill-contracts.rb`、`skills/sdlc-knowledge-sync/SKILL.md`。任何其他文件 = 越权夹带，直接阻塞。

所有测试/探针亲自实跑，不采信实现方口径。不改代码、不提交、不推送（探针后须还原，`git status --porcelain` 为空）。

## 一、规格符合性（逐模块 CLOSED / NOT_CLOSED + 行号证据）

a) **DETECT（规格 §2）**：信号表 S1–S13 实现是否与规格一一对应（存在性/路径形态，零内容读取——I4）；决策表 D1–D9 求值顺序与规格表一致；R03 阻断门在**一切**执行模式前生效（`--detect` 输出 BLOCKED 类型后 exit 0，其余模式 exit 1 零写入）；检测幂等（同状态两次输出逐字节一致）。
b) **PLAN（§4）**：分类基线 C1–C10 首条命中；`BLOCKED_AMBIGUOUS` 文件存在时 APPLY 整体阻断零部分升级（R03）；plan 文本规范化（键序/排序）与 `plan_sha256` 内容寻址——**特别核验**：`generated_at` 不参与 digest（同内容跨时间两次 `--plan` 的 PLAN_SHA256 必须相同，请实测隔秒两次）；碰撞预检（目标已存在 → blocked，零写入）。
c) **DP1（§4.5，裁决点①）**：含 TRANSFORM/RETIRE 的计划无确认或 digest 不匹配 → exit 1 零写入；add_only 豁免；成功迁移后的 re-run 不再要求确认（重判为 EXISTING 路径）。
d) **事务性 APPLY（§6）**：备份先行（cp -p 到系统临时目录 + pre-digest）；中途失败逆序恢复且与备份逐字节 cmp（A15 场景实证）；门禁违规回滚 = 迁移 move 还原 + INIT CREATED 文件删除 + 报告删除（B9 场景实证 `.sdlc/business_domain/knowledge-target.yaml` 消失、legacy 树快照相等）；空目录剪除只作用被走查的 legacy 根且不碰 PRESERVE 文件所在目录。
e) **残留门禁（§6.4）**：扫描范围 `.sdlc/**` 排除 `legacy/`、`reports/`、`migration/` 与迁移知识文件豁免清单；逐子句否定豁免与机器字段豁免逻辑是否与既有 audit 扫描器（R2-H6）等价——**已知实现差异**：门禁版否定词表缺 `don't`（bash 单引号约束，用 `dont` 替代），请评估是否构成豁免面扩大。
f) **REPORT（§7）**：md+json 固定键集；`plan_sha256` 可从 `migration/plan.json` 复核；post_detect_type 字段与实测 `--detect` 重判一致。
g) **不变量 I1–I8（§0）**：逐条在代码中指认防线（create-if-missing、声明状态机、零虚构、零内容读取、幂等、零接触、git user.name、无 aliases/报告不覆盖/map containment）。validator 新增块（`KT_V3_REQUIRED_TERMS` + 三条删除禁令）是否真的承重。

## 二、回归矩阵（逐项实测并给出首挂断言名）

① `bash tests/bootstrap-knowledge-target.test.sh` → **505 passed, 0 failed**（场景 1–35 为重归因后的 v2 面，36–43 为 v3 面：162 组只读决策表执行、A1–A16 代表组合、B6/B8/B9/B10 边界）。
② `ruby scripts/validate-skill-contracts.rb` → `skill contract validation ok` 且三个 self-test 均 verified。
③ 任何一处不符：给出场景名 + 首挂断言。

## 三、反向探针（必须亲自改代码制造红，再还原；每项给出"恰 N 红"实测）

- **P1（DP1）**：把 DP1 校验条件改为恒过（如 `[[ "${MIG_ADD_ONLY}" != "true" && "${CONFIRM_DIGEST}" != "${PLAN_SHA}" && "${CONFIRM_DIGEST}" != "x" ]]`）→ 场景 38（A11 无确认拒绝）与 43（B9 前置的确认流）中至少 A11 必须**恰红**；场景 1–35 必须仍绿。
- **P2（回滚）**：把 `mig_rollback` 的恢复循环短路（如循环条件改 `m >= 999`）→ 场景 41（A15 注入失败）的"legacy tree restored byte-identical"必须红。
- **P3（门禁）**：把门禁 violations 阈值改为 `>= 999` 才算失败（即恒过）→ 场景 43 的 B9 断言必须红；且场景 15/30/31（audit 残留扫描，独立实现）必须**仍绿**——若同红，说明两者共享了你不知道的耦合。
- **P4（D2 细化）**：把 `LEGACY_ACTIVE` 判定改回"凡 S5 即 active"→ 场景 40（A16 迁移后 detect 重判）与场景 6（`--detect` 幂等）必须红——这是迁移后幂等（R16）的关键防线。
- **P5（可选）**：把 `generated_at=${V3_NOW}` 加回 PLAN_TEXT → 隔秒两次 `--plan` 的 digest 必须不同（证实现行实现的 digest 是内容寻址，测试网虽未断言此点，实现行为须符合规格 §4.5 的"确认最新计划"语义）。请同时裁定：测试网是否**应当**补一条跨时间 digest 稳定性断言（给出建议，不实现）。
- 探针后 `git status --porcelain` 必须为空。

## 四、实现方自报的解释性裁量（逐项给出你的独立裁定：接受 / 需修）

1. **D2 细化**：规格 §2.2 D2 字面为"双根并存 → 阻断"；实现细化为"双根且旧根仍有治理/流程签名（S6–S12/S9–S11）才阻断"，理由是 C8 PRESERVE 用户文件或空目录残留不得破坏迁移后幂等（R16）。这是对规格文字的收窄，请裁定是否在规格意图内（规格 §2.3 的"类型不清"定义可作解释锚点）。
2. **残留门禁豁免迁移知识文件**：规格 §6.4 说"活动治理表面"；实现把 TRANSFORM 进 `.sdlc/business_domain/**` 的迁移知识文件整体列入豁免（报告记录豁免数），理由是 I1（知识内容原样保留）与 R18（禁的是 owner/rail 语义残留）的对象是治理表面。请裁定：老知识正文里出现 "speckit" 是否应阻断迁移。
3. **§4.4 机械合并的落地范围**：规格要求"旧 knowledge-target 的域声明字段 → 新 map 模板候选区；旧 profile 字段 → 新 profile 对应键"；实现只做了 map 模板的 `legacy_candidate_domains` 追加 + 全部字段映射写入报告，**未**向新 declaration/profile YAML 做字段级合并。请裁定是否构成规格偏离（实现方立场：报告记录满足审计要求，YAML 合并待真实存量项目驱动再扩）。
4. **plan digest 规范化形态**：规格 §4.3 说"计划 JSON 规范化文本"；实现 digest 的是规范化 TSV 行文本（键排序固定），plan.json 本身只在 apply 后落盘。语义等价性请裁定。
5. **C9 的结构化实现**：规格 C9 启发式为"知识目录内嵌入 workflow/模板 front-matter"（需内容读取）；实现按 I4 改为纯结构判据（`.specify/business_domain/` 下非 .md 非 .yaml → C9）。请裁定。
6. **场景 6/22 的重写**：v2 的"legacy 自动进 audit + --domain-map 直达 routed"被 v3 取代（迁移流 + exit 2）。请核对该取代有明确合同依据（Decision-090 决策 3 + DP4），不是测试弱化。
7. **报告文件名**：`migration_report.<ts>.<pid>.json.XXXXXX`（随机段在扩展名后，mktemp 约束）。规格 §7 只要求原子独占创建不覆盖；请确认无冲突并裁定可接受性。

## 五、范围与冻结面

- v2 候选的保留清单 K1–K11（差距审查 §2）不得回退：create-if-missing、声明状态机与 provenance 升级、map fingerprint/containment、legacy 零穿越、残留扫描、原子报告、无 aliases、代码驱动填充、git 门禁、validator 自检、single-rail。
- 本波**未授权面**：runtime/gateway、其余 7 个 Skill、业务仓、四仓传播（G1 完成裁决后另行）。
- 已知事实（不得作为缺陷上报，除非能指认合同依据）：测试 35 个 v2 场景中 6/22 已按 v3 重写（见四.6）；报告文件名形态（四.7）；本机 ruby 为 3.3 但 validator 需保持 2.6 兼容语法（新增代码已避免 `&.`/numbered params）。

## 六、产出格式

1. 逐模块结论（一.a–一.g）：CLOSED / NOT_CLOSED + `file:line` 证据；
2. 实测矩阵结果（二①②）；
3. 探针结果（三 P1–P5）："恰 N 红"实测 + P5 的测试网补强建议；
4. 四项裁量的独立裁定；
5. **根因合并的 findings 清单**：`G1-R1-{H|M|L}<序号>`，同一根因变体合并为一条；
6. 最终建议：PASS / PASS-with-notes / FAIL（FAIL 必须逐条对应 blocker 级 finding）。
