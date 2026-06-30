# Lark/Feishu Output

## Identity

Use `lark-cli` with user identity.

Do not use bot identity unless the user explicitly requests it and the workflow supports it.

## Required Skill Read

Before choosing flags or running `lark-cli docs` commands, read the version-matched embedded docs skill:

```text
lark-cli skills read lark-doc
```

Do not infer create/update flags from memory or `--help` alone. Use the embedded `lark-doc` skill because it is shipped with the installed CLI version.

## Authorization

Before treating Lark/Feishu output as complete, ensure `lark-cli` succeeds.

If authorization is missing, expired, or rejected:

1. Stop the publishing step.
2. Tell the user that Lark/Feishu authorization must be renewed.
3. Do not claim the document was created.
4. Do not silently downgrade to local-only output unless the user approves.

## Output Modes

### Create New Document

Use when:

- The user asks to create a Feishu/Lark document.
- No target document URL or token is provided.

After success:

- Report the document URL.
- Record the URL in `manifest.md` when local filesystem access is available.

### Update Existing Document

Use when:

- The user provides an existing document URL or token.
- The user asks to update or overwrite a known document.

Before updating:

- Confirm whether the update should append, overwrite, or replace a section if the user did not specify.

## Local Backup

If the user asks for both Lark/Feishu and local output:

1. Publish to Lark/Feishu.
2. Write the requested local Markdown or HTML copy under the standard DocFlow path.
3. Record both outputs in `manifest.md`.

If the user asks only for Lark/Feishu:

- Do not force a complete local backup.
- Still update `manifest.md` when possible.
- Do not create a local Gate artifact unless the user asks for a local backup.
- If temporary local content is needed to prepare the Lark/Feishu body, do not record it as a completed DocFlow artifact unless publication succeeds.

## Failure Report

When Lark/Feishu output fails, report:

- Intended artifact node
- Requirement ID
- Whether local content was generated
- Exact reason if visible from `lark-cli`
- Required user action, usually re-authorization
