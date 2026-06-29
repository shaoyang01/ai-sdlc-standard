# Test Feedback Schema

## 适用范围

用于测试阶段反馈、验收反馈、线上验证反馈和返工原因归类。

## 标准结构

```markdown
# Test Feedback Report

## Conclusion

- Result: PASS / FAIL / PASS_WITH_RISK
- Can Release: yes/no

## Test Scope

## Passed Cases

## Failed Cases

## Failure Classification

## Specification Updates Required

## Checklist Updates Required

## Code Fixes Required

## Review Gaps

## Next Step
```

## 失败分类

每个失败项必须归类为：

1. Implementation Bug
2. Specification Missing
3. Review Missing
4. Requirement Change
5. Test Case Issue

## 回写规则

- 如果是 Implementation Bug，进入 Fix。
- 如果是 Specification Missing，必须更新 Specification Checklist 或 Schema。
- 如果是 Review Missing，必须更新 Code Review Checklist。
- 如果是 Requirement Change，必须回到 Requirement Confirmation。
- 如果是 Test Case Issue，必须修正测试用例或测试口径。

