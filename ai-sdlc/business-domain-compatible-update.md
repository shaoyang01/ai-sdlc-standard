# Business-Domain Compatible Update

> **Reference**: `${AI_SDLC_STANDARD_HOME}/ai-sdlc/business-domain-compatible-update.md`

## Purpose

This file supplements `${AI_SDLC_STANDARD_HOME}/ai-sdlc/shared-business-domain-governance.md` and `${AI_SDLC_STANDARD_HOME}/ai-sdlc/business-domain-naming-and-shape.md`. PR K addressed create-if-missing; this file addresses update existing.

When a target L4 document already exists in `.specify/business_domain/**`, New-Rail must:

- preserve existing shape
- preserve existing facts
- record source traceability
- never whole-document rewrite
- never inject New-Rail fixed sections into legacy-shaped documents

This applies to all sync_source_mode values: `speckit_driven`, `library_driven`, `hybrid`.

## Compatible Update Principles

| Principle | Rule |
| --- | --- |
| Target L4 exists | Update existing document. Do not create parallel L4. |
| Preserve existing shape | Title format, metadata style, section language, section order, table style, revision history style, numbering style, domain terminology. |
| Preserve existing facts | Do not delete or overwrite existing facts without explicit supersession evidence. |
| No whole-document rewrite | Do not replace entire document with a new template. |
| No forced New-Rail section injection | Do not inject fixed English sections (Entry Chain, Transaction Boundary, Stable Business Facts) into legacy-shaped Chinese documents by default. |
| Compatible section update only | Insert or append new facts into the closest matching existing section. |
| Update proposal when unsafe | Generate an update proposal when safe insertion point is unknown. |
| Reconcile proposal on conflict | Generate a reconcile proposal when new facts conflict with existing facts. |
| Direct update requires evidence | Implementation evidence and verification evidence must exist for the selected sync_source_mode. |

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

- Replace Chinese legacy sections with English new-rail sections wholesale.
- Replace free-text sections with fixed tables wholesale.
- Delete existing facts and reorganize into New-Rail template.
- Inject sections required by route.md / project_type_profile that do not match project shape.
- Guess target sections or write template sections because library_driven lacks specs.

## Section Mapping Rules

New-Rail stable facts should be mapped to existing sections using these anchors:

| New-Rail Concept | Legacy Section Candidates |
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
- If the closest section cannot be determined, output an update proposal.
- If the existing document uses Chinese sections, new sections must also use Chinese or the project's existing language style.

## Safe Insert Rules

### DIRECT_UPDATE conditions

- target L4 is explicit.
- existing shape is understood.
- stable fact has source evidence.
- implementation evidence exists for selected sync_source_mode.
- verification evidence exists for selected sync_source_mode.
- target section can be identified with high or medium confidence.
- update does not delete or rewrite existing facts.
- update does not inject New-Rail fixed sections into legacy-shaped document.
- revision record can be appended using existing revision style.
- write authorization exists.

### UPDATE_PROPOSAL conditions

- target section confidence is low or unknown.
- existing section semantics are ambiguous.
- table structure cannot be safely extended.
- update would require restructuring multiple sections.
- update would introduce New-Rail-only section style into legacy-shaped document.
- revision record format is unknown.
- library_driven target is resolved but insertion location is unclear.
- evidence is sufficient for proposal but not for direct write.

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
  - `source_priority_conflict` — spec vs library vs code disagree
- Record: existing statement, new candidate statement, source artifacts, code evidence, specs evidence, library evidence, verification evidence, source priority assessment, recommended owner.
- Generate a reconcile proposal.
- Recommend routing to `sdlc-speckit-code-doc-reconcile`.
- Route back to `01-技术方案` / `02-方案审核` / specs route/spec/plan / implementation evidence as needed.

## Revision and Traceability

Every compatible update must record:

| Field | Description |
| --- | --- |
| rail | `legacy_speckit` or `new_rail_sdlc` |
| sync_source_mode | `speckit_driven`, `library_driven`, `hybrid` |
| source_artifacts | Paths to source artifacts |
| requirement_id | Parent requirement identifier |
| specs_run_id or feature id | When present |
| naming_pattern_source | Source of naming pattern |
| shape_profile_source | Source of shape profile |
| shape_confidence | `high`, `medium`, `low`, `unknown` |
| update_section | Section where facts were inserted |
| update_type | `direct_update`, `update_proposal`, `reconcile_proposal` |
| verification evidence | Evidence that the fact was verified |
| author / skill | Skill that performed the update |
| date | Update date |
| Re-Gate required | yes / no |

If existing revision history style is identifiable, append to it. If revision style is not identifiable, generate an update proposal; do not write directly.

## Output Modes

| Mode | Condition |
| --- | --- |
| `DIRECT_UPDATE` | All safe insert conditions satisfied. |
| `UPDATE_PROPOSAL` | Shape understood but insertion point uncertain, revision style uncertain, or user confirmation needed. |
| `RECONCILE_PROPOSAL` | Fact conflict, code/doc drift, source priority conflict, duplicate L4, or source conflict detected. |
| `BLOCKED` | Target L4 unknown, shape unknown, authorization missing, source/implementation/verification evidence missing, entry coverage BLOCKED/PENDING. |

## Blocking Rules

Block or generate proposal (do not write directly) when:

- target L4 unknown
- existing shape unknown
- safe insertion point unknown for direct write
- proposed update would rewrite whole document
- proposed update would delete existing facts
- proposed update injects New-Rail fixed sections into legacy-shaped doc
- revision history format unknown and no proposal mode selected
- source evidence missing
- implementation evidence missing for confirmed fact (no direct confirmed write without implementation evidence and verification evidence)
- verification evidence missing for confirmed fact
- fact conflicts with existing business_domain
- duplicate L4 candidate detected
- write authorization missing
- entry coverage audit BLOCKED/PENDING when required
- library_driven mode missing business_domain target confirmation
