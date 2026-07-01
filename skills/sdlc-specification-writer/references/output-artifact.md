# Specification Writer Output Artifact

## Local Path

When writing a local artifact, use:

```text
library/{requirement_id}/01-技术方案/{requirement_id}__技术方案.md
```

Update the stable artifact file and increment its internal Metadata Version; preserve history in 修订记录 and Git history.

## HTML or Lark/Feishu

When the requested output is HTML or Lark/Feishu:

1. Generate the specification content.
2. Use `sdlc-docflow-writer` for output routing, rendering, and publishing.
3. Keep semantic content unchanged during rendering.

## Manifest Update Recommendation

Recommend:

```text
Artifact Index:
  Node: 01 技术方案
  Path: library/{requirement_id}/01-技术方案/{requirement_id}__技术方案.md
  Version: <semantic-version>
  Result: draft / ready-for-review

Activity Log:
  Actor / Skill: sdlc-specification-writer
  Action: generate technical specification
  Node: 01-技术方案
  Result: ready-for-solution-review

Next Step:
  Run sdlc-solution-reviewer
```

## Ready-for-Review Criteria

A specification is ready for `sdlc-solution-reviewer` when:

- ESS required sections exist.
- Core Scope is clear.
- Original-flow compatibility is explicitly described.
- Failure and exception behavior are not hidden.
- Tests can validate the core requirement.
- Pending questions are listed honestly.

If these criteria are not met, either stop or mark the artifact as not ready for review.
