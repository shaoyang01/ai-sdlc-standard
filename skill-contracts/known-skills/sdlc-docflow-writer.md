# Skill Contract: sdlc-docflow-writer

```yaml
name: sdlc-docflow-writer
category: Producer Skill / Renderer Skill / Publisher Skill
stage: DocFlow artifact generation
status: active
standard_package: ai-sdlc-standard
input_artifacts:
  - user prompt
  - source materials
  - optional specs/**
  - optional existing library/{requirement_id}/manifest.md
output_artifacts:
  - Markdown file
  - HTML file
  - Lark/Feishu document
  - manifest.md update
required_schema:
  - ess/specification-schema.md
  - ess/review-schema.md
  - ess/code-review-schema.md
  - ess/test-feedback-schema.md
required_storage:
  - ai-sdlc/artifact-storage.md
  - ai-sdlc/artifact-versioning.md
side_effects:
  - create library/{requirement_id}/ directories
  - write Markdown or HTML files
  - update manifest.md
  - create or update Lark/Feishu documents through lark-cli
can_modify_code: false
can_modify_docs: true
can_modify_knowledge_base: false
can_execute_commands: true
blocking_conditions:
  - output format cannot be inferred
  - artifact node cannot be inferred
  - requirement_id cannot be safely generated
  - Lark/Feishu authorization is missing or expired
  - required schema sections would be omitted
  - Lark/Feishu update mode is unspecified
```

## Responsibilities

- Infer artifact node from user intent.
- Infer Markdown, HTML, or Lark/Feishu output target.
- Ask for the output target when it cannot be inferred.
- Generate content that follows the matching DocFlow schema.
- Write local files to the standard `library/{requirement_id}/` structure.
- Publish Lark/Feishu documents with user identity through `lark-cli`.
- Keep `manifest.md` aligned with created artifacts when local access is available.

## Non-Responsibilities

- Do not modify production code.
- Do not update `specs/**` as the machine source of truth.
- Do not update `.specify/business_domain/**`; leave knowledge sync to Speckit Sync.
- Do not commit or push git changes.
- Do not silently replace a requested Lark/Feishu document with a local file.

## Gate Rules

- `02-方案审核` is a Gate artifact for entering code implementation.
- `04-代码审核` can become a Gate artifact when Critical or High findings exist.
- `05-测试验收` is a feedback classification artifact, not an automated testing requirement.

## Output Contract

### Artifact Versioning Contract

Any DocFlow requirement artifact created, updated, rendered, or published by
this skill must follow `ai-sdlc/artifact-versioning.md`:

- use the stable path recorded in manifest, not a filename-versioned path;
- include Metadata `Version` and `Status`;
- include `## 修订记录`;
- keep the body to current effective content only;
- update or recommend manifest records with stable path, internal version, and status;
- include `Reviewed Artifact` and `Reviewed Artifact Version` for Gate, review,
  sync, and reconcile artifacts, plus `Gate Artifact Version` when the artifact
  is itself a Gate result.

## Migration Notes

This Skill supersedes the routing role of `html-doc-style`.

`html-doc-style` may remain as a legacy HTML rendering reference. Route DocFlow artifacts through `sdlc-docflow-writer`.
