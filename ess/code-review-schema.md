# Code Review Schema

## 适用范围

用于 DeepSeek、Codex 或其他 Reviewer 输出代码审查报告。报告必须可被实现者直接消费。

## 标准结构

```markdown
# Code Review Report

## Conclusion

- Result: PASS / FAIL / PASS_WITH_RISK
- Can Continue: yes/no
- Reviewed Diff:
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

- ID
- Severity
- File
- Line or Symbol
- Specification Basis
- Problem
- Impact
- Suggested Fix
- Blocking: yes/no

## 不合格输出

以下输出不可接受：
- 只有泛泛建议，没有文件位置。
- 只有代码风格问题，没有规格依据。
- 建议扩大业务范围。
- 建议引入未在 Specification 定义的新行为。

