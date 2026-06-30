# implementation-recorder Skill Contract

## Metadata

```yaml
name: implementation-recorder
version: 0.1.0
category: Producer Skill
stage: Implementation Recording
standard_package: ai-sdlc-standard
status: active
input_artifacts:
  - code diff or changed file list
  - implementation summary or commit range
  - library/{requirement_id}/01-技术方案/*
  - optional library/{requirement_id}/02-方案审核/*
  - optional specs/** plan or tasks artifacts
  - optional verification command output
output_artifacts:
  - library/{requirement_id}/03-实现记录/{requirement_id}__实现记录__vN.md
  - manifest.md metadata update recommendation
required_schema:
  - ai-sdlc/artifact-flow.md
required_checklist:
  - checklists/implementation-checklist.md
required_storage:
  - ai-sdlc/artifact-storage.md
  - ai-sdlc/change-control.md
side_effects:
  - write implementation record artifact when explicitly requested
  - recommend manifest.md updates
can_modify_code: false
can_modify_docs: true
can_modify_knowledge_base: false
can_execute_commands: true
blocking_conditions:
  - changed file list or diff is missing
  - specification basis is missing for behavior-changing implementation
  - implementation includes undefined business behavior
  - verification result is missing for required checks
  - implementation deviates from approved specification without classification
```

## Responsibilities

`implementation-recorder` 是实现记录生成器。

它负责：

- 根据 diff、变更文件列表、提交范围、任务状态和验证输出生成 `03-实现记录`。
- 记录实际改了什么、为什么改、影响哪些模块、跑过什么验证。
- 对照 `01-技术方案`、`02-方案审核`、Speckit plan/tasks，标记实现是否一致。
- 记录未完成项、验证缺口、残余风险和下一步。
- 识别实现偏离方案时应按 Implementation Bug、Specification Missing 或 Requirement Change 分类。
- 建议更新 manifest 的 `03 实现记录`、Activity Log、Blocking Issues、Missing Artifacts 和 Next Step。

它不负责：

- 修改业务代码。
- 审阅代码质量以替代 `code-review-normalizer` 或 Reviewer。
- 补写技术方案。
- 自动接受风险。
- 将聊天片段或未验证猜测写成实现事实。
- 修改 `.specify/business_domain/**`。

## Input Contract

必需输入：

- 代码 diff、提交范围或变更文件列表。
- 实现目标或需求 ID。
- `library/{requirement_id}/01-技术方案/*`，当实现改变业务行为时必须存在。

建议输入：

- `library/{requirement_id}/02-方案审核/*`
- Speckit `plan.md` / `tasks.md`
- 编译、单测、集成测试或人工验证命令输出。
- 运行失败日志或未执行原因。

缺失输入处理：

- 缺少 diff 或变更文件列表时停止。
- 行为变更缺少规格依据时停止或标记为不可进入 Code Review。
- 未执行验证时必须记录验证缺口，不能写成验证通过。
- 实现偏离已通过方案时必须分类并建议回到受影响节点。

## Output Contract

默认输出：

```text
library/{requirement_id}/03-实现记录/{requirement_id}__实现记录__vN.md
```

输出必须包含：

- 实现范围
- 规格依据
- 变更文件
- 关键实现点
- 行为一致性检查
- 方案偏离与分类
- 数据 / API / DB / cache / MQ / schedule / listener 影响
- 验证命令与结果
- 未完成项
- 残余风险
- 回滚或兼容说明
- 建议下一步

建议更新：

- Artifact Index: `03 实现记录`
- Activity Log
- Missing Artifacts
- Blocking Issues
- Change History
- Next Step: run `code-review-normalizer` or resolve blockers

## Side Effects

允许：

- 写入 `03-实现记录` 产物。
- 输出 manifest 更新建议。
- 读取 diff、提交、任务文件、验证日志和相关代码文件。
- 执行只读检查命令或用户明确要求的验证命令。

禁止：

- 修改业务代码。
- 修改技术方案、方案审核或测试验收产物。
- 修改 `.specify/business_domain/**`。
- 自动进入代码审核或测试阶段。
- 把未执行验证写成通过。
- 用实现结果倒推新的业务规则。

## Blocking Conditions

必须停止或输出阻塞结论的情况：

- 无法读取 diff、提交范围或变更文件列表。
- 行为变更缺少已通过规格依据。
- 实现中出现未定义业务行为。
- 实现与 `01-技术方案` 或 `02-方案审核` 冲突。
- 必需验证失败。
- 必需验证未执行且无法说明原因。
- 实现偏离方案但无法分类为 Implementation Bug、Specification Missing 或 Requirement Change。

## Gate Requirements

前置 Gate：

- `02-方案审核` 应为 `PASS` 或有效 `PASS_WITH_RISK`，除非用户只要求记录已有实现事实。
- 对 Speckit 路径，tasks 应能追溯到已审阅方案。

后置 Gate：

- 实现记录完成后，可进入 Code Review Gate。
- 如果存在阻塞项，不得进入 Code Review；应回到对应的变更控制节点。
- Specification Missing 或 Requirement Change 必须触发 Re-Gate。
