# 校验指南

> 本指南说明当前仓库真实存在的校验能力，以及在真实项目试跑前应做的人工检查。

## 当前自动校验脚本

当前仓库提供：

```bash
ruby scripts/validate-skill-contracts.rb
```

该脚本用于校验标准包内部一致性。

## validate-skill-contracts.rb 检查什么

当前脚本检查：

```text
1. 每个 skills/sdlc-* 是否有对应 skill-contracts/known-skills/sdlc-*.md。
2. 合同 YAML 元数据是否包含必填字段。
3. 合同 name 是否与文件名一致。
4. category 是否属于允许分类。
5. can_modify_code / can_modify_knowledge_base 是否与 Skill 分类匹配。
6. manifest.yaml 中登记的 skill path 和 contract 是否存在。
7. registry/skill-registry.md 中登记的 Skill 是否与 manifest.yaml 一致。
8. skills/sdlc-* 下是否仍使用 ../../ai-sdlc、../../ess、../../templates、../../skill-contracts 等相对标准路径。
9. 新版 sdlc-* Skill 是否把旧版 .specify/memory、.specify/workflow、.specify/coding_guide 当作正常输入。
10. bootstrap 脚本是否具备 project-context candidate 策略，且不再依赖单一 --force。
```

成功时输出：

```text
skill contract validation ok
```

失败时输出具体错误并返回非零状态。

## 双轨隔离校验

validator 会扫描 `skills/sdlc-*` 下的 Markdown。

危险语义示例：

```text
read .specify/memory/xxx.md
load .specify/workflow/xxx.md
use .specify/coding_guide/xxx.md as input
```

允许语义示例：

```text
do not read .specify/memory/**
inventory only
parity reference only
legacy_reference_only
remain untouched
```

这用于防止新版 `sdlc-*` Skill 把旧版 Speckit 文档当作正常输入。

## bootstrap dry-run 校验

对目标项目执行：

```bash
scripts/bootstrap-speckit-project.sh <target-project-path> --dry-run
```

检查点：

```text
1. 是否预览 .specify/project-governance-profile.yaml。
2. 是否预览 .specify/entry-coverage-profile.yaml。
3. 是否预览 .specify/business-domain-bootstrap.yaml。
4. 是否预览 .specify/project-context/ProjectCodingGuide.md。
5. 是否预览 .specify/project-context/RepositoryStructure.md。
6. 是否预览 .specify/project-context/ProjectGovernanceOverrides.md。
7. 是否预览 .specify/reports/speckit_generation_report.md。
8. 如果存在旧版文档，是否预览 legacy inventory 和 pending equivalence report。
9. 是否不会写文件。
10. 是否不会生成 specs/** 或 .specify/business_domain/**。
```

已有 profile 时，dry-run 应提示真实写入需要 `--force-profiles`，但不应直接失败。

## bootstrap 正式写入前检查

正式执行前确认：

```text
1. 目标项目是否允许新增 .specify/project-context/**。
2. 目标项目是否允许新增 .specify/reports/**。
3. 目标项目是否允许新增 library/ 并写入 .gitignore 的 /library/。
4. 已有 project-context 是否应生成 .candidate，而不是覆盖。
5. 是否真的需要 --force-profiles。
6. 是否需要保留旧版 Speckit rail。
```

默认不建议直接使用：

```bash
--force-profiles
--force-context
```

除非已经人工确认。

## bootstrap 输出检查

正式执行后检查：

```text
.specify/project-governance-profile.yaml
.specify/entry-coverage-profile.yaml
.specify/business-domain-bootstrap.yaml
.specify/project-context/ProjectCodingGuide.md
.specify/project-context/RepositoryStructure.md
.specify/project-context/ProjectGovernanceOverrides.md
.specify/reports/speckit_generation_report.md
```

如果存在旧版 Speckit 文件，还应检查：

```text
.specify/reports/legacy_speckit_source_inventory.md
.specify/reports/speckit_equivalence_report.pending.md
```

pending equivalence report 不是 PASS artifact。

## 真实项目试跑检查项

### 投放层检查

```text
1. 旧版 .specify/memory/** 未被修改。
2. 旧版 .specify/workflow/** 未被修改。
3. 旧版 .specify/coding_guide/** 未被修改。
4. 旧版 Skill 未被覆盖。
5. 新 project-context 文件来自目标代码扫描和占位确认，不复制旧版文档内容。
6. generation report 能说明代码证据和待确认事实。
```

### Direct Implementation 流程检查

```text
1. 00-需求资料 是否保留来源信息。
2. 01-技术方案 是否符合 ESS 必填章节。
3. 02-方案审核 是否输出 PASS / FAIL / PASS_WITH_RISK。
4. 方案审核是否输出 DIRECT_IMPLEMENTATION / SPECKIT_PIPELINE_REQUIRED / BLOCKED_NEEDS_REVISION。
5. 实现阶段是否没有补造未定义业务规则。
6. Code Review 是否能归一为标准问题类型。
7. 测试反馈是否能分类并反向沉淀。
```

### Speckit Pipeline 检查

```text
1. Pipeline 是否只在方案审核通过后启动。
2. 用户 full SDD 是否没有绕过 01-技术方案 / 02-方案审核。
3. specify 是否复用已审阅 DocFlow 产物。
4. clarify 是否只处理残留问题。
5. plan/tasks 是否没有改变业务行为。
6. implement 是否按 approved tasks 执行。
7. sync 是否只沉淀稳定事实。
8. reconcile 是否能发现 drift。
```

## 当前校验能力边界

当前自动校验脚本不能证明：

```text
1. 每个 Skill 在真实需求中输出一定正确。
2. business_domain 生成一定准确。
3. ProjectCodingGuide 中 detected evidence 已经是权威规则。
4. 方案审核一定发现所有业务风险。
5. 测试反馈沉淀一定能自动改进 Checklist。
```

这些必须通过真实项目样例持续验证。

## 推荐校验顺序

```text
1. ruby scripts/validate-skill-contracts.rb
2. scripts/init-standard-home.sh --dry-run
3. scripts/bootstrap-speckit-project.sh <target> --dry-run
4. 人工检查 generation report / project-context / legacy inventory
5. 测试仓库正式 bootstrap
6. Direct Implementation 小需求闭环
7. Complex Speckit pipeline 闭环
```
