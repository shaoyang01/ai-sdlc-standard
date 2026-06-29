# ESS Review Schema

## 适用范围

用于技术方案、计划、任务、测试反馈等非代码产物的审阅报告。

## 标准结构

```markdown
# Review Report: <Artifact Name>

## Conclusion

- Result: PASS / FAIL / PASS_WITH_RISK
- Can Continue: yes/no
- Reviewed Artifact:

## Critical

## High

## Medium

## Low

## Missing Constraint

## Missing Branch

## Behavior Risk

## Compatibility Risk

## Implementation Risk

## Test Gap

## Pending Confirmation

## Required Actions

## Next Step
```

## 每个问题必须包含

- ID
- Severity
- Location
- Summary
- Evidence
- Impact
- Required Fix
- Blocking: yes/no

