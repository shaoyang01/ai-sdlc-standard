# Source Handling Rules

## Supported Sources

| Source Type | Examples | Handling |
| --- | --- | --- |
| User Conversation | Current chat, delegated context, user correction. | Treat the latest explicit user instruction as highest priority unless the user says otherwise. |
| Lark / Feishu | Doc, Wiki, Base export, message summary. | Record link or identifier, captured time, and whether content was read directly or summarized. |
| Markdown | Requirement docs, issue text, exported notes. | Preserve headings and explicit scope statements. |
| HTML | Rendered requirement or solution docs. | Extract semantic content; do not treat visual emphasis as business priority unless text says so. |
| PDF | Exported requirement, PRD, external standard. | Record extraction method and pages/sections used. |
| Screenshot | OCR text or user-provided explanation. | Record whether the text came from OCR or human explanation. |
| Historical Summary | Prior thread summary, meeting summary, legacy notes. | Treat as lower confidence unless linked to source artifacts. |

## Required Source Metadata

Each source entry should include:

- Source Type
- Source Location / Reference
- Captured At
- Parsed By
- Source Priority
- Confidence: high / medium / low
- Missing Context
- Conflicts

## Priority Rules

Default priority order:

1. Latest explicit user instruction in the current conversation.
2. User-confirmed requirement artifact.
3. Current source document explicitly selected by the user.
4. Existing `library/{requirement_id}/00-需求资料/` current version.
5. Existing downstream Gate artifact, when the Gate is still valid.
6. Historical chat summary or unverified delegated context.

Override the default only when the user explicitly sets source priority.

## Latest Instruction Rule

When newer user input contradicts older material:

- Record the contradiction.
- Treat the newer instruction as the proposed current direction.
- Determine whether it is a supplement, change, or new requirement.
- Apply `ai-sdlc/change-control.md` when the requirement already has downstream artifacts.

## Multi-Source Consistency

For multiple sources, compare:

- Business goal
- In Scope
- Out of Scope
- Success criteria
- Compatibility expectations
- Data or system boundaries
- Delivery constraints

If differences only affect wording, record a note and continue.

If differences affect behavior or scope, record `来源冲突` and block downstream specification until priority is confirmed.

## Missing Context

Record missing context when a source references:

- Unavailable attachment
- Missing screenshot
- Unreadable link
- Unavailable API or data schema
- Unnamed system or module
- Ambiguous role or owner
- Acceptance criteria hidden in another document

Do not fill missing context with guesses.
