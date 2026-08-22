# Shared Business-Domain Governance

> 状态：Draft（2026-08-22，C02-WP3.5 合同重基线，Decision-044/045；收口后升 Accepted）
> **Reference**: `${AI_SDLC_STANDARD_HOME}/ai-sdlc/shared-business-domain-governance.md`

## Purpose

Define `.specify/business_domain/**` as a **shared long-term knowledge base** governed by the v2 single rail (Decision-044). It is a persistent cross-requirement knowledge store for stable business domain facts. Under v2, `specs/**`（run-level）、sync source modes（`speckit_driven` / `library_driven` / `hybrid`）与 pipeline 状态已随双轨退役（Decision-044/045），不再构成写入 authority；稳定事实的确认与写入统一经 `knowledge-sync` 节点裁决（`APPLY_LOCAL` / `PROPOSAL_ONLY` / `BLOCKED_CONFLICT` / `NO_CHANGE`）。

## Shared Knowledge Base

`.specify/business_domain/**` is the single source of truth for stable business domain knowledge. It is:

- **Long-term**: Not tied to any single requirement or generation run.
- **Shared**: Any requirement or generation may read it. Writes are governed: confirmed stable facts are written only via the `knowledge-sync` node — `APPLY_LOCAL`（本地写授权下写入）、`PROPOSAL_ONLY`（无写授权或插入点不确定）、`BLOCKED_CONFLICT`（与既有事实冲突，保留双方证据）、`NO_CHANGE`（无新增稳定事实，不制造空写）。
- **Governed**: Writes must follow this governance protocol regardless of the writing entry.

## Writing Rules

### Before Writing

1. Resolve target L1/L2/L4 from current generation revisions（`01-技术方案` / `02-方案审核` / `03-任务规划` / `04-实现记录` / `05-代码审核` / `06-知识同步`）、existing 01DomainCatalog.md、L2 main document index、current business-domain documents、or explicit user confirmation. If the target cannot be resolved, generate a proposal (`PROPOSAL_ONLY`) or ask the user; do not guess.
2. Verify L1/L2 are confirmed long-term domains, not temporary or pending.
3. Verify L4 id can be assigned without ambiguity.
4. Identify naming pattern source and determine the project's canonical naming convention per `${AI_SDLC_STANDARD_HOME}/ai-sdlc/business-domain-naming-and-shape.md`.
5. Identify shape profile source and determine shape confidence per the same reference.
6. Verify the target document naming follows the project's current business_domain naming convention.
7. Verify the fact is stable, reusable, and supported by current generation evidence: seven-node current revisions, closed/accepted finding proof, code/test evidence, and external system receipts.

### When Target L4 Exists

- **Compatible update only.** See `${AI_SDLC_STANDARD_HOME}/ai-sdlc/business-domain-compatible-update.md` for the full compatible update protocol.
- **Preserve existing shape** — title format, metadata style, section language, table style, revision history style.
- **Preserve existing facts** — do not delete or overwrite without explicit supersession evidence.
- **Safe insertion point required** for `APPLY_LOCAL`. Unknown insertion point → `PROPOSAL_ONLY`.
- **Conflict → `BLOCKED_CONFLICT`** (reconcile proposal). Use `${AI_SDLC_STANDARD_HOME}/templates/business-domain-reconcile-proposal-template.md`.

### When Target L4 Does Not Exist

- **Create-if-missing** with authorization, following the naming and shape rules in `${AI_SDLC_STANDARD_HOME}/ai-sdlc/business-domain-naming-and-shape.md`.
- Use the project's current naming convention for the new L4 document.
- Use the project's current shape for the new L4 document.
- Standard templates (`templates/business-domain-l4/*.md`) are fallback only when no project shape exists and user confirms.
- Do not create a second L4 document that covers the same domain concept as an existing document.

### Prohibited

- Do not create a parallel L4 document that duplicates the semantics of an existing L4.
- Do not rename or restructure existing L4 documents without explicit owner authorization.
- Do not overwrite existing facts without source evidence and revision record.
- Do not create documents under `99PendingConfirmation` or similar unconfirmed paths.
- knowledge-sync / LOOP nodes must not treat `.specify/memory/**`, `.specify/workflow/**`, or `.specify/coding_guide/**` as business_domain fact sources or write targets.
- Do not default to standard L4 skeleton (`templates/business-domain-l4/*.md`) in existing projects.
- Do not rewrite existing L4 documents to a fixed template shape.
- Do not create duplicate L4 candidate for the same domain concept.
- Do not inject fixed sections into legacy-shaped docs by default.
- Do not overwrite conflicting facts.
- Do not delete existing facts without explicit supersession evidence.
- Do not use chat as source of truth.
- Do not write confirmed facts without a `knowledge-sync` decision (`APPLY_LOCAL`) or explicit write authorization; `sdlc-docflow-writer` may only render/落盘 already-confirmed content.
- Raw test/online feedback must not be written directly into business_domain: it re-enters through `requirement-intake` as `changeKind=FEEDBACK_DRIVEN_CHANGE` first.

## Naming Convention

Document naming must follow the project's current convention. Common patterns:

- `{L4_ID}{L4_Name_EN}({L4_Name_CN}).md`
- `{L2_ID}{L2_Name_EN}({L2_Name_CN}).md`
- `{L4_ID}EntryCoverage({Domain_Name_CN}入口覆盖对账).md`

When the naming convention is unclear, ambiguous, or unavailable:

- Generate a proposal only (`PROPOSAL_ONLY`), not a direct write.
- Ask the user or domain owner to confirm the naming convention.

## Write Provenance

Every write to `.specify/business_domain/**` must record:

| Field | Description |
| --- | --- |
| `decision` | knowledge-sync 输出：`APPLY_LOCAL` / `PROPOSAL_ONLY` / `BLOCKED_CONFLICT` / `NO_CHANGE` |
| `requirement_id / generation` | Parent requirement identifier and generation |
| `source_revision_ids` | 当前 generation 七节点 current revision IDs 支撑该事实 |
| `source_artifacts` | Paths to source artifacts that support the fact |
| `external_receipts` | 外部系统回执（evidence；不是并列 authority） |
| `write_authorization` | `APPLY_LOCAL` 的本地写授权证据；`sdlc-docflow-writer` 渲染的明确授权记录 |
| `naming_pattern_source` | Where the naming pattern was resolved from |
| `shape_profile_source` | Where the shape profile was resolved from |
| `shape_confidence` | `high` / `medium` / `low` / `unknown` |
| `revision_record` | Standard revision record entry (date, author/skill, change type, summary) |

## Conflict Handling

When a proposed fact conflicts with an existing business_domain fact:

1. Do not overwrite silently.
2. Identify both statements and their source evidence.
3. Determine whether the conflict is code drift, document drift, or new behavior, and classify it per `${AI_SDLC_STANDARD_HOME}/ai-sdlc/business-domain-compatible-update.md`（`semantic_conflict` / `code_drift` / `doc_drift` / `stale_fact` / `scope_conflict` / `duplicate_fact` / `source_priority_conflict`）.
4. Generate a reconcile proposal; `knowledge-sync` outputs `BLOCKED_CONFLICT` preserving both sides' evidence, with a recommended Re-Gate node（按 finding category 回退 canonical 最早受影响节点；若根因是上游事实错误，回到更早节点）.
5. Code/document consistency audit is owned by `knowledge-sync`（`sdlc-knowledge-sync`，承接原 code-doc-reconcile 能力）；外部系统回执作为审计 evidence，不作为并列 authority.

When shape, naming, L4 id, or semantics are unclear:

- Generate proposal only (`PROPOSAL_ONLY`).
- Do not write directly to business_domain.
- Require user or domain owner confirmation.

## Relationship to Specs, Library and External Evidence

- `specs/**`、sync source modes 与 pipeline 状态已随双轨退役（Decision-044/045）；不作为写入 authority，不得作为知识同步输入。
- `library/{requirement_id}/**` 的当前 generation 七节点 current revisions（`00-需求资料` → `06-知识同步`）是 `knowledge-sync` 对账与稳定事实筛选的输入权威；`07-交付总结/` 与 delivery checkpoint 属 C03 Delivery Tail，单独登记。
- 代码/测试 evidence 与外部系统回执是 evidence 输入：外部系统回执只能佐证或证伪稳定事实，不能单独构成写入 authority。
- `business_domain/` is long-term. It accumulates stable facts across requirements and generations.

## Revision Record

| Version | Date | Status | Summary |
| --- | --- | --- | --- |
| 2.0.0 | 2026-08-22 | Draft | C02-WP3.5 contract rebaseline (Decision-044/045): removed sync source modes（speckit_driven / library_driven / hybrid）、dual-rail 与 pipeline/specs authority；knowledge write path rewritten to knowledge-sync decision semantics（APPLY_LOCAL / PROPOSAL_ONLY / BLOCKED_CONFLICT / NO_CHANGE）；外部系统回执记录为 evidence；preserved `.specify/business_domain/**` write governance（preserve existing shape/facts、conflict proposal、naming & shape rules）。 |
