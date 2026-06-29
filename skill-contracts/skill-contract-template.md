# Skill Contract Template

## Metadata

```yaml
name:
version:
category:
stage:
standard_package: ai-sdlc-standard
input_artifacts:
output_artifacts:
required_schema:
required_checklist:
side_effects:
can_modify_code:
can_modify_docs:
can_modify_knowledge_base:
can_execute_commands:
blocking_conditions:
```

## Responsibilities

- 本 Skill 负责什么。
- 本 Skill 不负责什么。

## Input Contract

必须说明：
- 需要哪些文档。
- 需要哪些上下文。
- 缺失输入时如何处理。

## Output Contract

必须说明：
- 输出格式。
- 输出路径或交付方式。
- 输出如何被下一阶段消费。

## Side Effects

必须明确：
- 是否修改代码。
- 是否修改文档。
- 是否修改知识库。
- 是否执行命令。
- 是否提交代码。
- 是否触发外部系统。

## Blocking Conditions

必须明确遇到哪些情况时停止，而不是继续猜测。

## Gate Requirements

说明本 Skill 前置和后置 Gate。

