# Decision-055: Artifact Directory Numbering Authority — WP3.5 Single-Rail Scheme

**Date**: 2026-08-26
**Status**: Accepted
**Author**: Current User (via C03-C Round 1 review O-b)
**Scope**: Governance — artifact directory numbering authority across runtime code, contracts, skill manifests, and documentation.

## 1. Background

C03-C Round 1 review (O-b) identified a dual numbering drift in artifact directory names:

- **WP3.5 single-rail scheme** (adopted by `LOOP_CORE_CONTRACT.md`, `LOOP-CORE-C02-WP3.5-SINGLE-RAIL-IMPACT-ANALYSIS.md`, all 8 `skill-contracts/known-skills/*.md`, and C03-C `c2` constants):
  - `00-需求资料` (requirement-intake)
  - `01-技术方案` (solution-design)
  - `02-方案审核` (solution-gate)
  - `03-任务规划` (task-planning)
  - `04-实现记录` (implementation)
  - `05-代码审核` (code-review)
  - `06-知识同步` (knowledge-sync)

- **Legacy runtime scheme** (only in `core/loop-governance-tail-result.ts:178-180`):
  - `03-实现记录`
  - `04-代码审核`
  - `05-测试验收`

The legacy scheme predates WP3.5 single-rail consolidation and covers only 3 of 7 nodes with different naming. The WP3.5 scheme is the contract-authoritative numbering and has been adopted by all contract and registration surfaces.

## 2. Decision

**The WP3.5 single-rail numbering scheme is the sole artifact directory authority.**

All runtime code, tests, templates, and documentation must use the WP3.5 scheme (`00-需求资料` through `06-知识同步`). The legacy scheme (`03-实现记录`/`04-代码审核`/`05-测试验收`) is deprecated and must be migrated.

## 3. Rationale

1. **Contract authority**: `LOOP_CORE_CONTRACT.md` and WP3.5 impact analysis already define the 7-node single-rail topology with the new numbering.
2. **Registration surface consistency**: All 8 skill contracts use the new numbering. C03-C `c2` constants (`C03_REQUIRED_NODE_ARTIFACTS`) use the new numbering.
3. **Single source of truth**: The legacy scheme in `loop-governance-tail-result.ts` is the only remaining consumer and predates WP3.5. It must not become a competing authority.
4. **C05 readiness**: Before C05 real validation, artifact directory names must be uniform across runtime and contracts, otherwise real artifact landing paths will diverge from contract documentation.

## 4. Migration Scope

**Immediate (this decision)**: Declare WP3.5 scheme as authoritative. No code changes in C03-C (out of scope — C03-C only added `c2` constants which already use the new scheme).

**Follow-up package input**: Migrate `core/loop-governance-tail-result.ts:178-180` from legacy to WP3.5 scheme. This includes:
- `DIR_03`: `03-实现记录` → `03-任务规划`
- `DIR_04`: `04-代码审核` → `04-实现记录`
- `DIR_05`: `05-测试验收` → `05-代码审核`
- Add `DIR_06`: `06-知识同步` (new node)
- Update all consumers and tests of `loop-governance-tail-result.ts`
- Verify no other runtime code references legacy directory names

This migration is logged as input for the next governance package (C03-D or a dedicated artifact-path-migration package).

## 5. Constraints

- This decision does **not** authorize changes to `loop-governance-tail-result.ts` in C03-C. C03-C scope is frozen (Decision-054).
- Migration must preserve backward compatibility for any existing on-disk artifacts using legacy directory names (read-side fallback or one-time migration script).
- After migration, a full grep across runtime code, tests, templates, and documentation must confirm zero legacy directory name references in active surfaces (historical/archive documents exempt).

## 6. Verification

- [x] WP3.5 scheme declared as authoritative (this decision)
- [ ] `loop-governance-tail-result.ts` migrated (follow-up package)
- [ ] Full grep confirms zero legacy references in active surfaces (follow-up package)
- [ ] C05 real validation confirms artifact landing paths match contract documentation (C05)

## 7. References

- `LOOP_CORE_CONTRACT.md:48-51` — 7-node single-rail numbering
- `LOOP-CORE-C02-WP3.5-SINGLE-RAIL-IMPACT-ANALYSIS.md:95-98` — WP3.5 numbering table
- `core/loop-governance-tail-result.ts:178-180` — legacy numbering (to be migrated)
- `core/loop-c03-delivery-tail.ts:301-308` — C03-C c2 constants using WP3.5 scheme
- C03-C Round 1 review finding O-b
