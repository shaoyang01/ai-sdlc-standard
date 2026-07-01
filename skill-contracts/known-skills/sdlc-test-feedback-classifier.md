# sdlc-test-feedback-classifier Skill Contract

## Metadata

```yaml
name: sdlc-test-feedback-classifier
version: 0.1.0
category: Reviewer Skill / Producer Skill
stage: Test Feedback Classification
standard_package: ai-sdlc-standard
status: active
input_artifacts:
  - raw test feedback
  - acceptance feedback or online verification feedback
  - optional reproduction steps, screenshots, logs, environment, data samples
  - optional library/{requirement_id}/01-技术方案/*
  - optional library/{requirement_id}/02-方案审核/*
  - optional library/{requirement_id}/03-实现记录/*
  - optional library/{requirement_id}/04-代码审核/*
output_artifacts:
  - library/{requirement_id}/05-测试验收/{requirement_id}__测试验收.md
  - manifest.md change or re-gate update recommendation
required_schema:
  - ess/test-feedback-schema.md
required_storage:
  - ai-sdlc/artifact-storage.md
  - ai-sdlc/artifact-versioning.md
  - ai-sdlc/change-control.md
side_effects:
  - write structured test feedback artifact when explicitly requested
  - recommend manifest.md updates
can_modify_code: false
can_modify_docs: true
can_modify_knowledge_base: false
can_execute_commands: true
blocking_conditions:
  - raw feedback is missing
  - reproduction or observed behavior is missing for failed cases
  - failure cannot be classified
  - specification missing is detected but no re-gate path is recorded
  - requirement change is detected but no change-control decision exists
```

## Responsibilities

`sdlc-test-feedback-classifier` 是测试反馈分类器。

它负责：

- 将测试、验收、线上验证反馈结构化为 `05-测试验收`。
- 对失败项分类：
  - Implementation Bug
  - Specification Missing
  - Review Missing
  - Requirement Change
  - Test Case Issue
  - Environment / Data Issue
- 判断反馈应进入修复、回到方案、回到需求、更新测试口径还是记录环境阻塞。
- 建议更新 manifest 的 Artifact Index、Activity Log、Change History、Blocking Issues、Re-Gate Records 和 Next Step。
- 为 `sdlc-test-feedback-sync` 提供稳定输入。

它不负责：

- 修改业务代码。
- 直接修复测试用例。
- 修改技术方案或代码审核报告。
- 将测试反馈沉淀到长期知识库。
- 直接更新 Checklist 或 Schema。
- 把新需求当作当前需求内的 Bug。

## Input Contract

必需输入：

- 原始测试反馈、验收反馈或线上验证反馈。
- 失败现象或通过结论。

建议输入：

- 复现步骤、截图、日志、环境、数据样本。
- `library/{requirement_id}/01-技术方案/*`
- `library/{requirement_id}/02-方案审核/*`
- `library/{requirement_id}/03-实现记录/*`
- `library/{requirement_id}/04-代码审核/*`

缺失输入处理：

- 缺少原始反馈时停止。
- 失败项缺少现象、复现或期望结果时停止或标记为不可分类。
- 缺少方案、实现记录或代码审核时，可以生成反馈记录，但必须标记 Missing Artifacts。
- 无法区分 Bug、规格遗漏或需求变更时，不得猜测分类。

## Output Contract

### Artifact Versioning Contract

Any DocFlow requirement artifact produced or updated by this skill must follow
`ai-sdlc/artifact-versioning.md`:

- use the stable path recorded in manifest, not a filename-versioned path;
- include Metadata `Version` and `Status`;
- include `## 修订记录`;
- keep the body to current effective content only;
- recommend manifest updates with stable path, internal version, and status;
- include `Reviewed Artifact` and `Reviewed Artifact Version` for Gate,
  review, sync, and reconcile artifacts, plus `Gate Artifact Version` when
  the artifact is itself a Gate result.

默认输出：

```text
library/{requirement_id}/05-测试验收/{requirement_id}__测试验收.md
```

输出必须符合 `ess/test-feedback-schema.md`，包含：

- Conclusion
- Test Scope
- Passed Cases
- Failed Cases
- Failure Classification
- Specification Updates Required
- Checklist Updates Required
- Code Fixes Required
- Review Gaps
- Environment / Data Issues
- Change-Control Decision
- Next Step

分类处理规则：

| Classification | 必需动作 |
| --- | --- |
| Implementation Bug | 进入 Fix，更新实现记录，必要时重新代码审核。 |
| Specification Missing | 回到 `01-技术方案`，更新稳定文件版本并重新方案审核。 |
| Review Missing | 记录 Review 缺口，建议后续由 `sdlc-test-feedback-sync` 沉淀到 Review Checklist。 |
| Requirement Change | 按 `ai-sdlc/change-control.md` 判断沿用当前 requirement_id 或新建需求。 |
| Test Case Issue | 更新测试口径，不要求改方案或代码。 |
| Environment / Data Issue | 记录环境或数据阻塞，并判断是否阻塞发布。 |

建议更新：

- Artifact Index: `05 测试验收`
- Activity Log
- Change History
- Re-Gate Records
- Blocking Issues
- Missing Artifacts
- Next Step

## Side Effects

允许：

- 写入 `05-测试验收` 结构化反馈。
- 输出 manifest 更新建议。
- 读取方案、实现记录、代码审核报告和日志以辅助分类。
- 执行只读检查命令或用户明确要求的验证命令。

禁止：

- 修改业务代码。
- 修改技术方案、实现记录或代码审核报告。
- 修改 `.specify/business_domain/**`。
- 修改 Checklist、Schema 或长期知识库。
- 自动接受风险。
- 将 Requirement Change 当作 Implementation Bug 直接修。

## Blocking Conditions

必须停止或输出阻塞结论的情况：

- 反馈缺少现象或期望结果，无法分类。
- 核心路径失败且缺少复现信息。
- Specification Missing 但未记录 Re-Gate 建议。
- Requirement Change 但未进入 change-control 判断。
- 测试结果无法复现且缺少环境/数据说明。
- 分类会影响是否继续发布，但缺少必要证据。

## Gate Requirements

前置 Gate：

- 已有可验证实现、验收反馈或线上验证反馈。
- 方案、方案审核和实现记录建议存在；缺失时必须记录 Missing Artifacts。

后置 Gate：

- Implementation Bug 进入 Fix。
- Specification Missing 必须回到方案并重新审核。
- Review Missing 必须交给后续 Sync 或 Checklist 更新流程。
- Requirement Change 必须进入 change-control。
- Test Case Issue 可更新测试口径后继续验收。
- 可复用的 Checklist / Schema 缺口交给 `sdlc-test-feedback-sync`。
