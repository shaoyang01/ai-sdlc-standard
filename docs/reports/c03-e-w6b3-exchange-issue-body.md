# C03-E W6b3 Exchange 发布请求 —— Issue body（待 owner 使用）

> **未发布**。本文件是离线预演产物，供仓库 owner 开 Issue 时整段复制。
> 正式发布前请重新生成时间戳（`generated_at` / `run_id` / `publication_request_id`）
> 与 `exchange_base_commit`（Exchange `main` 当前 HEAD），并复核 `supersedes` 指向。
> 开 Issue 后由 owner 施加 `exchange-publish` 标签触发 Publisher v1.1。
> 权限约束（Exchange policy §8.2）：只有仓库 owner 可以撰写该 Issue 并添加标签。

```text
---BEGIN EXCHANGE REQUEST---
request_version: v1
publication_request_id: REQ-20260829T164038Z-C03E-W6B3-PASS
exchange_base_commit: 6b558f037d6b4159e066bb9db10ba12a64caa578
project: ai-sdlc-standard
topic: 06-governance-artifact-exchange
run_id: 20260829T164038Z-05d12d2-c03e-w6b3-pass
generated_at: '2026-08-29T16:40:38Z'
stage: c03e-w6b3-pass
source_repository: shaoyang01/ai-sdlc-standard
source_branch: feature/c03-e1-e4-runtime-implementation
source_commit: 05d12d2bd37e9957e9242946aff795a79d1e1862
review_status: proposed
authorization_status: pending
execution_status: completed
publication_status: not_published
supersedes:
- projects/ai-sdlc-standard/topics/06-governance-artifact-exchange/runs/20260828T141247Z-ai-sdlc-path-b-sole-production-path-a-frozen/manifest.yaml
notes: 'C03-E W6b3 (E4-T5 attempt workspace three-state cleanup) PASS. Independent
  review round 1 NOT_CLOSED on blocker B1 (committed rename escaped out-of-bounds
  detection and destroyed evidence); fixed by one --no-renames flag in 05d12d2 with
  regression matrix T9a/T9b/T9c (35 -> 41 assertions); focused re-review CLOSED with
  zero blockers. Control Plane PR #25 merged as 2d2ff53. No real-repo promotion until
  E5.'
---END EXCHANGE REQUEST---

---BEGIN HANDOFF---
# C03-E W6b3 (E4-T5) — Attempt Workspace Three-State Cleanup — PASS

- **Requirement / wave:** C03-E, W6b3 = E4-T5
- **Source repository:** `shaoyang01/ai-sdlc-standard`
- **Source branch:** `feature/c03-e1-e4-runtime-implementation`
- **Baseline commit:** `02b642a` (initial implementation, 35 assertions)
- **Product commit (this run):** `05d12d2bd37e9957e9242946aff795a79d1e1862` (B1 fix, 41 assertions)
- **Authority:** `transport_only` — this record creates no acceptance, merge,
  Ready, publication or next-stage authority.

## Scope

`cleanup()` for an attempt workspace resolves to exactly one of three states:

- `promote` — attempt succeeded and every change stayed inside the task's allowed
  paths; workspace reclaimed. No merge, no push.
- `isolate` — attempt failed; evidence retained and returned.
- `block` — outcome unknown or changes out of bounds; evidence retained and
  `CLEANUP_BLOCKED` thrown.

Out-of-bounds detection takes two inputs: committed
(`git diff --name-only -z --no-renames <base>...HEAD`) plus unstaged/untracked
(`status --porcelain=v1 -z -uall`). Enabled only when `allowedPaths` is supplied
explicitly; all 30+ pre-existing callers are unchanged.

### Non-scope

- No real-repository promotion. E5 remains unauthorized; PASS is not activation.
- No per-commit `diff-tree` walk. A trace that exists only in an intermediate
  commit and is later removed is still outside detection (see Open items).

## Changed artifacts

- `core/loop-git-workspace.ts` — three-state types, `classifyWorkspaceCleanup`,
  `statusPaths`, `vRelPath`, `isWithinAllowed`; `--no-renames` on the committed diff.
- `tests/loop-w6b3-attempt-workspace-three-state.test.ts` — 41 assertions.

## Verified tests

- W6b3 suite: 41/41 passed (Node v24.12.0, tsx).
- Reverse probe P1 (drop `--no-renames`): T9a turns red, T9b/T9c stay green —
  the assertion carries weight.
- Related: `loop-git-workspace` 110 passed; `tsc --noEmit` clean.
- Full suite (implementation environment): 1767 assertions passed, 0 failed.
  File-level: 2 known environment-gap files (`loop-artifact-store`,
  `loop-delivery-checkpoint-store`) plus 1 load-sensitive flake
  (`loop-codex-implementation-adapter`, green at 354/354 isolated and 8/8 under
  8-way parallel load). Reviewer environment: 146 files, failed=0 — authoritative.

## Review / finding disposition

1. **Independent review round 1 — NOT_CLOSED, 1 blocker (B1).**
   A committed rename escaped out-of-bounds detection: `git diff` collapsed
   `git mv secret/b.ts src/b.ts` into a single destination record, so the
   out-of-bounds source never entered `changedPaths`, the attempt was promoted
   and its evidence destroyed.
2. **Fix:** one flag, `--no-renames` (`core/loop-git-workspace.ts:533`). A rename
   is then reported as delete+add, matching the conservative direction
   `statusPaths` already takes for unstaged renames.
3. **Regression matrix T9** (35 → 41 assertions): T9a out-of-bounds rename source
   blocks and evidence stays readable; T9b an in-bounds rename still promotes
   (guards against over-tightening); T9c an out-of-bounds pure delete blocks.
4. **Focused re-review — CLOSED, zero blockers.**

## Current STATE reference

Control Plane `projects/ai-sdlc/STATE.yaml` — W6b3 recorded PASS; CP PR #25
merged to `main` as `2d2ff53`. W1–W6b3 PASS.

## Open items

1. **Intermediate-commit out-of-bounds traces** (reviewer suggestion, non-blocking).
   A path created and then moved away within the attempt leaves no record in
   `<base>...HEAD`, so no diff flag can recover it. Needs a per-commit
   `diff-tree` walk — a new mechanism, to be raised as its own wave.
2. **W6b4** (follow-on, implementation-side self-check after W6b3 PASS): the
   committed diff was fetched unconditionally although only the out-of-bounds
   check reads it and that check is itself gated on `allowedPaths`. Gated on
   `allowedPaths !== null` in `1605a84`; 45 assertions; focused review outstanding.

## Next valid transition

W6b4 focused review → W7 = C-T1 (full read-only review) → C-T2 (Current User
closure). No real-repository promotion until E5 is separately authorized.

---END HANDOFF---
```
