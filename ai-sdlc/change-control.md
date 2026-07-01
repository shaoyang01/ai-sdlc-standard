# Requirement Change Control

## 目标

本标准定义需求开发过程中发生变更、返工、理解错误或测试反馈时，如何继续当前 DocFlow 流程。

它解决的问题：

- 需求中途变化时是否新建 `requirement_id`。
- 哪些产物需要提升内部版本。
- 哪些下游 Gate 需要标记为 stale 并重新执行。
- 从哪个节点重新 Gate。
- 哪些情况不能在实现阶段自行补业务规则。

## 基本原则

- 不删除当前产物。
- 不通过文件名堆版本。
- 正文只保留当前有效内容，历史变化进入修订记录和 Git history。
- 默认沿用原 `requirement_id`，除非变更已成为独立需求。
- 从最早受影响节点重新走 Gate。
- 实现阶段发现未定义行为时，停止实现并回到上游产物。
- 测试反馈不能只修代码；如果暴露规格遗漏，必须回写规格和 Checklist。
- `library/{requirement_id}/` 记录人工交接和 Gate 状态，不作为长期知识库。

## 术语

| 术语 | 含义 |
| --- | --- |
| Change Event | 需求、方案、实现、Review 或测试阶段发现的变化事件。 |
| Affected Node | 变更影响的最早 DocFlow 节点。 |
| Re-Gate | 变更后重新执行受影响 Gate。 |
| Stable Artifact | 每个 DocFlow 阶段的当前稳定文件。 |
| Internal Version | 写在文档 Metadata 中的语义版本。 |
| Stale Gate | 被上游版本变化影响、需要重新确认的下游 Gate。 |
| Same Requirement | 业务目标不变，仍属于同一个 `requirement_id`。 |
| New Requirement | 业务目标、交付边界或排期已变成独立事项。 |

## 是否新建 requirement_id

默认不新建 `requirement_id`。

沿用原 `requirement_id` 的情况：

- 业务目标不变，只补充边界、异常、兼容或测试口径。
- 技术方案理解有误，但仍在解决同一个业务目标。
- 实现中发现方案遗漏，需要补充方案后继续。
- 测试反馈属于原需求范围内的问题。
- Code Review 发现实现未遵守原方案。

新建 `requirement_id` 的情况：

- 变更后的业务目标已不同。
- 变更可以独立排期、独立验收或独立发布。
- 原需求已完成，新诉求是后续增强。
- 合并到原流程会让 Gate 结论失去可读性。
- 用户明确要求拆成新需求。

如果是否新建存在争议，先停在 Requirement Confirmation，不进入实现。

## 变更来源分类

| 来源 | 示例 | 默认处理 |
| --- | --- | --- |
| Requirement Change | 业务方改变目标、范围、规则。 | 回到需求资料或技术方案，必要时新建需求。 |
| Specification Missing | 方案缺少状态、异常、兼容、测试规则。 | 补技术方案新版本并重新方案审核。 |
| Review Missing | Review 未发现方案或实现问题。 | 记录 Review 缺口，并更新 Review Checklist。 |
| Implementation Bug | 实现未按已通过方案执行。 | 修复代码，更新实现记录，必要时重新代码审核。 |
| Test Case Issue | 测试用例或口径错误。 | 更新测试验收记录，不要求改方案或代码。 |
| Environment / Data Issue | 环境、数据、配置导致验证失败。 | 记录环境或数据问题，明确是否阻塞发布。 |
| Documentation Correction | 文档错别字、排版、路径修正。 | 新增活动记录；不影响 Gate 时不重走 Gate。 |

## 影响节点判断

从最早受影响节点重新走。

| 变更影响 | 受影响节点 | 必需动作 |
| --- | --- | --- |
| 原始需求或业务目标 | `00-需求资料` | 更新需求资料稳定文件的内部版本，重新确认需求。 |
| 技术方案、行为约束、异常、兼容、数据、接口、状态 | `01-技术方案` | 更新技术方案稳定文件的内部版本，重新方案审核。 |
| 方案审核结论或风险接受 | `02-方案审核` | 更新方案审核稳定文件的内部版本，重新 Gate。 |
| 实现范围、验证结果、未完成项 | `03-实现记录` | 更新实现记录稳定文件的内部版本，必要时重新代码审核。 |
| 代码审查发现阻塞问题 | `04-代码审核` | 修复后重新代码审核或更新审核结论。 |
| 测试反馈、验收口径、线上验证 | `05-测试验收` | 更新测试验收稳定文件的内部版本并分类处理。 |

## 版本规则

发生变更时，受影响节点必须更新同一个稳定文件的内部版本。

示例：

```text
library/20260629-order-rule/01-技术方案/20260629-order-rule__技术方案.html
  Version: 1.1.0
library/20260629-order-rule/02-方案审核/20260629-order-rule__方案审核.html
  Reviewed Artifact Version: 1.1.0
```

规则：

- 不创建多个文件表达版本。
- 内部 Version 按语义版本递增。
- 修订记录必须说明变更来源和影响范围。
- manifest Artifact Index 必须记录稳定路径、当前 Version、状态和 Gate 结果。
- 上游 Version 变化后，下游 Gate 必须确认是否 stale。
- 新 Gate 通过前，不能继续依赖已 stale 的旧 Gate 进入后续阶段。

## Gate 规则

变更后进入下一阶段必须满足：

1. 受影响节点已有新版本产物。
2. 受影响 Gate 已重新执行。
3. Gate Result 为 `PASS` 或 `PASS_WITH_RISK`。
4. `PASS_WITH_RISK` 必须有风险接受说明。
5. Manifest 已记录当前有效版本。
6. Manifest 已记录 Change History 和 Re-Gate Records。

以下情况必须停止：

- 变更影响行为但没有技术方案新版本。
- 变更影响方案但没有方案审核新版本。
- 旧 Gate 结论与新需求不一致。
- 实现阶段需要猜测未定义业务行为。
- 测试反馈分类为 Specification Missing 但未回写方案。

## 场景处理

### 业务补充边界条件

处理：

1. 新增 `00-需求资料` 或更新需求补充说明。
2. 更新 `01-技术方案` 稳定文件并提升内部 Version。
3. 更新 `02-方案审核` 稳定文件并绑定新的 Reviewed Artifact Version。
4. Manifest 记录 Change History 和 Re-Gate Records。

不允许直接在实现中补逻辑。

### 开发中发现需求理解错误

处理：

1. 停止继续实现。
2. 在实现记录或 manifest Blocking Issues 中记录发现的问题。
3. 回到 `01-技术方案` 或更早节点。
4. 新方案审核通过后，再继续实现。

已经写出的代码不能作为新业务规则依据。

### Code Review 发现方案外实现

处理：

1. 如果实现偏离已通过方案，按 Implementation Bug 处理。
2. 如果偏离原因是方案缺失，按 Specification Missing 处理。
3. 不得用 Review 意见直接扩大业务范围。

### 测试反馈是实现 Bug

处理：

1. 更新 `05-测试验收` 稳定文件并提升内部 Version。
2. 分类为 Implementation Bug。
3. 修复代码。
4. 更新 `03-实现记录`。
5. 根据风险决定是否重新代码审核。

### 测试反馈是规格遗漏

处理：

1. 更新 `05-测试验收` 稳定文件并提升内部 Version。
2. 分类为 Specification Missing。
3. 回到 `01-技术方案`。
4. 更新 Specification Checklist 或 Schema，如该遗漏具有复用价值。
5. 重新方案审核。

### 需求变成独立交付

处理：

1. 新建 `requirement_id`。
2. 原需求 manifest 记录分拆说明。
3. 新需求从 `00-需求资料` 开始。
4. 不把新需求的 Gate 结论混入原需求。

## Manifest 记录要求

发生变更时，manifest 至少应记录：

- Change Date
- Change Source
- Change Type
- Affected Node
- Artifact Path
- Previous Version
- New Version
- Required Re-Gate
- Current Effective Version
- Next Step

在 manifest 模板升级前，可以先记录在 `Blocking Issues`、`Next Step` 或新增临时小节中。

推荐临时小节：

```markdown
## Change History

| Date | Source | Type | Affected Node | Artifact | Previous Version | New Version | Required Re-Gate | Next Step |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
```

## 与 Speckit Sync 的关系

变更控制只处理过程产物和 Gate 状态。

稳定事实是否进入 `.specify/business_domain/**`，由 Speckit Sync 或等价同步流程决定。

规则：

- 变更未通过 Gate 前，不进入长期知识库。
- 已 stale 的旧 Gate 或旧正文结论不得同步为当前事实。
- 测试暴露的通用 Checklist 缺口，可以在 Sync 阶段沉淀。
- Manifest 只记录 Sync 是否执行、目标路径和残余风险。

## 最小执行要求

即使暂时没有自动化 Skill，也必须做到：

1. 不覆盖旧产物。
2. 更新受影响节点稳定文件的内部版本。
3. 明确下游 Gate 是否 stale。
4. 明确是否需要 Re-Gate。
5. Gate 未通过前不进入后续阶段。
