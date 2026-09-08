# Code Review Schema

## 适用范围

用于 `sdlc-code-review` 输出 `05-代码审核/{id}_代码审核.md`，或由 DocFlow 渲染该节点已确认的内容。报告必须可被实现者直接消费；结论与 finding 生命周期遵循 `ai-sdlc/manual-runtime-semantic-contract.md` §5.1/§5.2/§5.5。

## 标准结构

```markdown
# Code Review Report

## Conclusion

- Closure Status: resolved / blocked
- Reviewed Diff:
- Base Revision:
- Reviewed Revision:
- Change Digest:
- Specification:

## Critical

## High

## Medium

## Low

## Architecture

## Behavior Compatibility

## Data Consistency

## Transaction and Idempotency

## Exception Handling

## Performance

## Security

## Maintainability

## Test Gap

## Suggested Fixes

## Next Step
```

## 每个问题必须包含

- Finding ID（`{requirement_id}-F{两位序号}`，全 requirement 单一序列）
- Severity
- File
- Line or Symbol
- Specification Basis
- Problem
- Impact
- Suggested Fix
- Blocking: yes/no

## 返工与关闭

- 按根因确定 `earliestAffectedNodeId`，实现缺陷直接回流 implementation；HIGH finding 必须返工。
- 发现记录随本报告固定；状态由 publisher 的 `finding-register` / `finding-action` 登记到 manifest findingIndex。
- 非 scan 来源只允许维持 OPEN 或经独立复验成为 RESOLVED；修复者不得自行关闭。关闭动作不回写本报告。

## 不合格输出

以下输出不可接受：
- 只有泛泛建议，没有文件位置。
- 只有代码风格问题，没有规格依据。
- 建议扩大业务范围。
- 建议引入未在 Specification 定义的新行为。
