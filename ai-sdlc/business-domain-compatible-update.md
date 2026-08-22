# Business-Domain Compatible Update

> 状态：Draft（2026-08-22，C02-WP3.5 合同重基线，Decision-044/045；收口后升 Accepted）
> **Reference**: `${AI_SDLC_STANDARD_HOME}/ai-sdlc/business-domain-compatible-update.md`

## Purpose

This file supplements `${AI_SDLC_STANDARD_HOME}/ai-sdlc/shared-business-domain-governance.md` and `${AI_SDLC_STANDARD_HOME}/ai-sdlc/business-domain-naming-and-shape.md`. It governs **compatible updates** of existing business-domain knowledge: when a target L4 document already exists in `.specify/business_domain/**`, any writer must:

- preserve existing shape
- preserve existing facts
- record source traceability
- never whole-document rewrite
- never inject fixed sections into legacy-shaped documents

The core rule: **a compatible update must never break existing business facts**. Update existing documents; do not create parallel L4 documents, do not delete or overwrite existing facts without explicit supersession evidence, and do not force a fixed document shape onto legacy-shaped documents.

Under the v2 single rail (Decision-044), stable business facts are written only through the `knowledge-sync` node:

- `APPLY_LOCAL` — fact confirmed by the current generation and local write authorization exists;
- `PROPOSAL_ONLY` — fact confirmed but write authorization or safe insertion point is missing;
- `BLOCKED_CONFLICT` — new fact conflicts with existing facts; both sides' evidence is preserved.

Rendering or 落盘 of already-confirmed content may be delegated to `sdlc-docflow-writer` only under explicit authorization; it never selects stable facts and never grants write authority.

## Compatible Update Principles

| Principle | Rule |
| --- | --- |
| Target L4 exists | Update existing document. Do not create parallel L4. |
| Preserve existing shape | Title format, metadata style, section language, section order, table style, revision history style, numbering style, domain terminology. |
| Preserve existing facts | Do not delete or overwrite existing facts without explicit supersession evidence. |
| No whole-document rewrite | Do not replace entire document with a new template. |
| No forced section injection | Do not inject fixed English sections (Entry Chain, Transaction Boundary, Stable Business Facts) into legacy-shaped Chinese documents by default. |
| Compatible section update only | Insert or append new facts into the closest matching existing section. |
| Update proposal when unsafe | Generate a proposal (`PROPOSAL_ONLY`) when safe insertion point is unknown. |
| Reconcile proposal on conflict | Generate a reconcile proposal (`BLOCKED_CONFLICT`) when new facts conflict with existing facts. |
| Write goes through knowledge-sync | Confirmed stable facts are written only via the knowledge-sync decision `APPLY_LOCAL` (local write authorization), or rendered by `sdlc-docflow-writer` under explicit authorization. |

## Existing Shape Preservation

Must preserve:

- title format (e.g., `# L4_ID+L4_NAME_EN (L4_NAME_CN)`)
- metadata style (fields present and their order)
- section language (Chinese, English, or mixed as existing)
- section order (existing section sequence)
- existing table style (column count, alignment, header style)
- revision history style (format and location)
- existing numbering style (e.g., `## 1.`, `## 2.`, or `### 1.1`)
- existing domain terminology (keep project-specific terms)

Prohibited:

- Replace Chinese legacy sections with English fixed sections wholesale.
- Replace free-text sections with fixed tables wholesale.
- Delete existing facts and reorganize into a fixed template.
- Inject sections that do not match the project's actual shape.
- Guess target sections or write template sections; when the insertion point cannot be determined, produce a proposal (`PROPOSAL_ONLY`), never a direct write.

## Section Mapping Rules

Stable facts confirmed by the current generation should be mapped to existing sections using these anchors:

| Confirmed Fact | Legacy Section Candidates |
| --- | --- |
| business scope / bounded context | 背景与范围, 业务范围, 范围, Domain Scope, 适用范围 |
| entry chain / entry coverage | 入口与主链路, 入口覆盖, 调用链路, EntryCoverage link, 入口覆盖对账 |
| business rules | 业务规则, 规则说明, 核心逻辑, 处理规则 |
| state / lifecycle | 生命周期节点, 状态流转, 状态机, 流程节点 |
| data side effects | 数据变更, 数据口径, 表字段, 持久化影响, 数据影响 |
| idempotency / rollback / compensation | 幂等, 回滚, 补偿, 异常处理 |
| verification evidence | 测试与验证, 验证记录, 质量保障, 回归验证 |
| revision / source traceability | 修订记录, Revision History, 变更记录 |

Rules:

- If an existing section can be clearly mapped, insert or append there.
- If no matching section exists, do not directly add large English fixed-schema sections.
- Append to the closest matching section in the project's language.
- If the closest section cannot be determined, output a proposal (`PROPOSAL_ONLY`).
- If the existing document uses Chinese sections, new sections must also use Chinese or the project's existing language style.

## Safe Insert Rules

### APPLY_LOCAL conditions (direct write via knowledge-sync)

- target L4 is explicit.
- existing shape is understood.
- stable fact has source evidence (current generation revisions, closed/accepted finding proof, code/test evidence, external system receipts).
- knowledge-sync has confirmed the fact: current generation's seven-node current revisions are valid and no unclosed blocking finding blocks the sync.
- local write authorization exists (`APPLY_LOCAL`).
- target section can be identified with high or medium confidence.
- update does not delete or rewrite existing facts.
- update does not inject fixed sections into legacy-shaped document.
- revision record can be appended using existing revision style.
- entry coverage and reconcile evidence support the update.

### PROPOSAL_ONLY conditions

- target section confidence is low or unknown.
- existing section semantics are ambiguous.
- table structure cannot be safely extended.
- update would require restructuring multiple sections.
- update would introduce fixed-only section style into legacy-shaped document.
- revision record format is unknown.
- fact is confirmed but local write authorization is missing or insertion location is unclear.
- evidence is sufficient for a proposal but not for a direct write.

## Fact Conflict Rules

When a new fact conflicts with an existing business_domain fact:

- Do not overwrite.
- Do not delete the existing fact.
- Do not write the new fact as a replacement conclusion.
- Classify conflict type:
  - `semantic_conflict` — same concept, different meaning
  - `code_drift` — code behavior changed but document not updated
  - `doc_drift` — document updated but code unchanged
  - `stale_fact` — fact was true but is now outdated
  - `scope_conflict` — fact belongs to different L2/L4 scope
  - `duplicate_fact` — same fact already exists in another L4
  - `source_priority_conflict` — code, documents and external system receipts disagree
- Record: existing statement, new candidate statement, source artifacts, code evidence, external system receipts, verification evidence, source priority assessment, recommended owner.
- Generate a reconcile proposal; `knowledge-sync` outputs `BLOCKED_CONFLICT` preserving both sides' evidence.
- If the root cause is an upstream fact error, re-route by finding category (REQUIREMENT / SOLUTION / PLANNING / IMPLEMENTATION / REVIEW / KNOWLEDGE) to the canonical earliest affected node; otherwise route back to `01-技术方案` / `02-方案审核` / `03-任务规划` / implementation evidence as needed.
- Code/document reconciliation duty is owned by `knowledge-sync` (`sdlc-knowledge-sync`, which absorbed the former code-doc-reconcile capability); no separate reconcile skill entry point remains.
- Raw test/online feedback is not a direct input to knowledge-sync or business_domain writes: it re-enters through `requirement-intake` as `changeKind=FEEDBACK_DRIVEN_CHANGE` before any fact can be confirmed.

## Revision and Traceability

Every compatible update must record:

| Field | Description |
| --- | --- |
| decision | `APPLY_LOCAL` / `PROPOSAL_ONLY` / `BLOCKED_CONFLICT` / `NO_CHANGE` (knowledge-sync output) |
| requirement_id / generation | Parent requirement identifier and generation |
| source_revision_ids | Current generation seven-node current revisions referenced |
| source_artifacts | Paths to source artifacts |
| write_authorization | Local write authorization evidence for `APPLY_LOCAL`; explicit authorization record for `sdlc-docflow-writer` rendering |
| naming_pattern_source | Source of naming pattern |
| shape_profile_source | Source of shape profile |
| shape_confidence | `high`, `medium`, `low`, `unknown` |
| update_section | Section where facts were inserted |
| update_type | `apply_local`, `proposal_only`, `blocked_conflict` |
| evidence | Implementation / test / external-system-receipt evidence that the fact was verified |
| author / skill | Skill that performed the update (`sdlc-knowledge-sync`, or `sdlc-docflow-writer` under explicit authorization) |
| date | Update date |
| Re-Gate required | yes / no |

If existing revision history style is identifiable, append to it. If revision style is not identifiable, generate a proposal; do not write directly.

## Output Modes

| Mode | Condition |
| --- | --- |
| `NO_CHANGE` | No new stable fact; reconcile evidence recorded; no empty write. |
| `APPLY_LOCAL` | All safe insert conditions satisfied and local write authorization exists. |
| `PROPOSAL_ONLY` | Shape understood but insertion point uncertain, revision style uncertain, write authorization missing, or user confirmation needed. |
| `BLOCKED_CONFLICT` | Fact conflict, code/doc drift, source priority conflict, duplicate L4, or source conflict detected; both sides' evidence preserved. |

`NO_CHANGE / APPLY_LOCAL / PROPOSAL_ONLY / BLOCKED_CONFLICT` are decisions of the `knowledge-sync` node, not independent output modes of this protocol. Rendering of already-confirmed content by `sdlc-docflow-writer` is a presentation/落盘 service used only under explicit authorization after the decision is fixed; it never changes the decision.

## Blocking Rules

Block or generate proposal (do not write directly) when:

- target L4 unknown
- existing shape unknown
- safe insertion point unknown for direct write
- proposed update would rewrite whole document
- proposed update would delete existing facts
- proposed update injects fixed sections into legacy-shaped doc
- revision history format unknown and no proposal mode selected
- source evidence missing
- knowledge-sync decision missing (stable facts not confirmed by the current generation must not be written directly)
- implementation evidence missing for confirmed fact
- verification evidence / external system receipt missing for confirmed fact
- fact conflicts with existing business_domain (`BLOCKED_CONFLICT`, preserve both sides' evidence)
- duplicate L4 candidate detected
- write authorization missing (`PROPOSAL_ONLY`; if the knowledge update is a completion obligation of the current requirement, remain blocked unless policy says otherwise)
- entry coverage audit BLOCKED/PENDING when required
- raw feedback has not re-entered through `requirement-intake` (`changeKind=FEEDBACK_DRIVEN_CHANGE`)

## Revision Record

| Version | Date | Status | Summary |
| --- | --- | --- | --- |
| 2.0.0 | 2026-08-22 | Draft | C02-WP3.5 contract rebaseline (Decision-044/045): removed sync source mode / speckit_driven / pipeline / specs references; stable-fact writes now go through the `knowledge-sync` node (`APPLY_LOCAL` under local write authorization) or `sdlc-docflow-writer` rendering under explicit authorization; output modes aligned to `NO_CHANGE / APPLY_LOCAL / PROPOSAL_ONLY / BLOCKED_CONFLICT`; compatible-update semantics (preserve existing shape/facts, conflict proposal) preserved with reference to shared-business-domain-governance.md. |
