# Test Feedback Schema

## 适用范围

用于 `sdlc-requirement-intake` 整理原始测试、验收和线上反馈。反馈资料归 `00-需求资料/反馈/`，变更分类遵循 `ai-sdlc/change-control.md`；新 generation 由 Owner 显式发起。

## 标准结构

```markdown
# Test Feedback Intake

## Classification

- Change Classification: FEEDBACK_DRIVEN_CHANGE
- 分类结论: 已分类 / 无法分类（待补充证据）
- 分类依据:

## Test Scope

## Passed Cases

## Failed Cases

## Observed / Expected Behavior

## Reproduction Context / Evidence

## Failure Classification

## Specification Updates Required

## Checklist Updates Required

## Code Fixes Required

## Review Gaps

## 待确认事项与来源冲突

## Next Step
```

## 失败分类

证据足够时记录失败原因，可使用以下描述；它们不替代变更分类，也不构成 Gate 或发布裁决：

1. Implementation Bug
2. Specification Missing
3. Review Missing
4. Requirement Change
5. Test Case Issue

## 回写规则

- 缺少实际行为、期望行为或复现上下文时，保持无法分类并列明所缺证据。
- 本节点记录当前变更范围、来源与建议受影响节点；不直接修代码、改方案、改 checklist 或推进执行。
- 后续返工按 change-control 与 manual-runtime-semantic-contract §7.3 交接给现役节点；实现期已登记 finding 的独立关闭复验遵循 §5.2。
