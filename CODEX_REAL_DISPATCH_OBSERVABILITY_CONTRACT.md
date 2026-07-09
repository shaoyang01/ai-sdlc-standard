# Codex Real Dispatch Observability Contract

## Verdict

**APPROVED_FOR_PLANNING**

This contract is observability-contract-only. It does not implement observability collection, invoke real Codex, or change Runtime or Gateway behavior.

## Purpose

Define the exact sanitized observability fields and signal boundaries a future Codex real dispatch implementation PR may expose.

This contract follows:

- `Codex Real Dispatch Readiness Review` — established `READY_WITH_CONSTRAINTS` for `code_generation` only.
- `Codex Real Dispatch Fallback Policy` — requires fallback observability to expose only sanitized summary fields.

## Scope

- Adapter: Codex
- Capability: `codex_real_dispatch`
- Request type: `code_generation` only
- Status: `contract_only`
- Default: disabled
- Persistence: none
- Location: in-memory only

## Allowed Summary Fields

Future Codex real dispatch observability may include only these fields:

- `request_type`
- `request_id`
- `node`
- `agent`
- `success`
- `outcome`
- `duration_ms`
- `prompt_char_count`
- `output_char_count`
- `truncated`
- `warning_count`
- `has_warnings`
- `fallback_reason`
- `fallback_action`
- `stage`
- `safe_message`

## Allowed Signals

| Signal | Purpose |
|--------|---------|
| `requestType` | Request type identifier |
| `fallbackReason` | Why fallback occurred |
| `fallbackAction` | How fallback was handled |
| `success` | Whether Codex dispatch succeeded |
| `durationMs` | Execution duration |
| `promptCharCount` | Length of prompt sent |
| `outputCharCount` | Length of output received |
| `truncated` | Whether output was truncated |
| `warningCount` | Number of warnings |
| `hasWarnings` | Whether warnings exist |

## Prohibited Fields

The following fields must never appear in observability output:

- `raw_prompt`
- `full_prompt`
- `raw_stdout`
- `full_stdout`
- `raw_stderr`
- `full_stderr`
- `raw_output`
- `full_output`
- `raw_artifacts`
- `full_patch`
- `patch_content`
- `secret`
- `secrets`
- `token`
- `tokens`
- `api_key`
- `api_keys`
- `password`
- `passwords`
- `private_key`
- `private_keys`
- `credential`
- `credentials`
- `environment_variables`

## Prohibited Signals

| Signal | Why Prohibited |
|--------|----------------|
| `rawPrompt` / `fullPrompt` | Could leak requirement or prompt content |
| `rawStdout` / `fullStdout` | Could leak model output |
| `rawStderr` / `fullStderr` | Could leak CLI errors or paths |
| `rawArtifacts` | Could leak raw artifact content |
| `fullPatch` | Could leak generated code |
| `secrets` / `tokens` / `apiKeys` / `passwords` / `privateKeys` | Could leak credentials |

## Retention Policy

| Property | Value |
|----------|-------|
| Persisted | `false` |
| In-memory only | `true` |
| Disk writes | prohibited |
| Network export | prohibited |
| Audit log persistence | prohibited |
| Observability log persistence | prohibited |

## Observability Shape

```ts
{
  request_type: "string enum",
  request_id: "string",
  node: "string",
  agent: "codex",
  success: "boolean",
  outcome: "string enum",
  duration_ms: "number",
  prompt_char_count: "number",
  output_char_count: "number",
  truncated: "boolean",
  warning_count: "number",
  has_warnings: "boolean",
  fallback_reason: "string enum | undefined",
  fallback_action: "string enum | undefined",
  stage: "string enum",
  safe_message: "string | undefined",
}
```

## Observability Safety Rules

1. Observability is in-memory summary metadata only.
2. Observability must not be persisted to disk, database, or network.
3. Observability must not change Gateway primary/final result.
4. Observability must not change Runtime `final_status` / routing.
5. Observability must not make Codex final owner of any decision.
6. Observability must not include raw prompt or full prompt.
7. Observability must not include raw stdout, full stdout, raw stderr, or full stderr.
8. Observability must not include raw artifacts or full patch content.
9. Observability must not include secrets, tokens, API keys, passwords, or private keys.
10. Observability must use counts and booleans instead of raw text where possible.
11. Observability must truncate any human-readable message to a bounded safe length.
12. Observability must omit rather than leak unsafe data.

## Non-Goals

- Do not implement observability collection logic in Gateway in this PR.
- Do not invoke real Codex CLI.
- Do not change Runtime graph transitions.
- Do not change Runtime `final_status` semantics.
- Do not change Execution Gateway primary dispatch behavior.
- Do not change Execution Gateway final result shape.
- Do not expand supported request types beyond `code_generation`.
- Do not make Codex output a routing signal.
- Do not make Codex the default agent for any node.
- Do not make Codex the final owner of review, code_review, or validation decisions.
- Do not add package scripts, CI steps, or default environment values that enable real Codex.
- Do not persist raw prompts, raw artifacts, secrets, full stdout, or full stderr.
- Do not invoke real Codex CLI in tests.

## Required Work Before Implementation

1. Operational guardrails contract enforcing prompt/output limits and prohibited content.
2. Prompt builder that consumes `ImplementationExecutorInput`.
3. Output parser/sanitizer that converts Codex CLI stdout into `code_patch` artifacts.
4. Gateway integration contract defining how observability attaches to `ExecutionResult`.
5. Fake-runner tests proving observability paths without real Codex CLI.
6. Controlled rollout plan reviewed and approved by operator.

## Recommended Next PR

**Codex Real Dispatch Guardrails Contract**
