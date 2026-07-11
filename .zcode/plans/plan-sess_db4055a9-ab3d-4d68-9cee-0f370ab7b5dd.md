# Implementation Plan: Argument Prompt Transport for Kimi CLI

## Overview
Add `promptTransport: "stdin" | "argument"` support to the Kimi CLI adapter so Kimi Code 0.23.5 can be invoked as `kimi -p "<prompt>"` instead of piping the prompt to stdin.

## Files to Modify

### 1. `execution/cli-adapter-contract-types.ts` — Add transport types
- Add `export type KimiPromptTransport = "stdin" | "argument";`
- Add two optional fields to `CliAdapterConfig`:
  - `promptTransport?: KimiPromptTransport`
  - `promptArgument?: string`

### 2. `execution/kimi-cli-adapter-contract.ts` — Parse new env vars
- In `getKimiCliAdapterConfig()`, parse:
  - `SDLC_KIMI_CLI_PROMPT_TRANSPORT` → `promptTransport` (default `"stdin"`)
  - `SDLC_KIMI_CLI_PROMPT_ARGUMENT` → `promptArgument` (default `"-p"`)
- Validation rules (return `enabled: false`):
  - Unknown transport value → reject (`rawMode: "unknown_prompt_transport:${value}"`)
  - Empty `promptArgument` (explicitly `""`) → reject (`rawMode: "empty_prompt_argument"`)
- `promptTransport: "argument"` with absent `promptArgument` → default `"-p"`

### 3. `execution/kimi-cli-executor-contract.ts` — Pass transport through
- Add `promptTransport: KimiPromptTransport` and `promptArgument?: string` to `KimiCliExecutorCommandInput`
- In `buildKimiCliExecutorCommandInput()`, copy these from config

### 4. `execution/kimi-cli-command-executor.ts` — Core transport logic
- In `executeKimiCliCommand()`:
  - Read `promptTransport` from contract (default `"stdin"`)
  - **Argument mode**: build effective args = `[...staticArgs, promptArgument, dynamicPrompt]`, set `stdin: undefined`
  - **Stdin mode**: unchanged (write prompt to stdin)
  - Build sanitized `commandInput` for the result: args include `[REDACTED_PROMPT]` placeholder in the prompt position (not the real prompt text)
  - Pass effective args to runner via `runnerCommandInput`
- In `createDefaultKimiCliProcessRunner()`:
  - Argument mode: do NOT write to stdin (even if `child.stdin` is absent, don't fail — argument mode doesn't need stdin)
  - Stdin mode: existing behavior preserved

### 5. `execution/cli-adapter-audit.ts` — Prompt redaction helper
- Add `buildSanitizedPromptArgs()` helper that takes `(staticArgs, promptArg, placeholder)` and returns args with `[REDACTED_PROMPT]` placeholder

### 6. `execution/kimi-output-normalizer.ts` — New file for `• ` prefix
- Add `normalizeKimiOneShotTextOutput(value: string): string`
  - Trim leading/trailing whitespace
  - Remove exactly one leading `• ` (bullet + space) when present at start
  - No JSON extraction, no fence-stripping, no repair
- Used in the gateway dispatch layer before the output reaches Runtime schema validation

### 7. `execution/kimi-gateway-real-dispatch.ts` — Apply normalizer
- After a successful execution, call `normalizeKimiOneShotTextOutput()` on `summaryPayload` before passing it to Runtime

### 8. `execution/kimi-cli-dry-run.ts` — Update preview for argument mode
- Show `[REDACTED_PROMPT]` in the command preview when transport is argument

## Test Files

### `tests/kimi-cli-command-executor.test.ts` — Add argument mode tests
- **Test A**: Default stdin compatibility (no transport config → stdin mode, prompt in stdin)
- **Test B**: Argument transport command construction (args = `[...static, "-p", prompt]`, stdin is undefined)
- **Test C**: Argument order and shell safety (spaces, quotes, newlines, `;`, `$`, `` ` ``, `|` in prompt — remains one array element, `shell: false`)
- **Test D**: Audit redaction (raw prompt NOT in audit events, observability, commandInput, errors)
- **Test E**: Argument mode with no stdin on child (still succeeds)
- **Test F**: Stdin mode with unavailable stdin (fails safely, existing behavior)

### `tests/kimi-cli-adapter-contract.test.ts` — Config parsing tests
- Test `SDLC_KIMI_CLI_PROMPT_TRANSPORT` parsing (stdin, argument, unknown → disabled, absent → stdin)
- Test `SDLC_KIMI_CLI_PROMPT_ARGUMENT` parsing (absent → "-p", custom value, empty → disabled)

### `tests/kimi-output-normalizer.test.ts` — New file
- **Test G**: Valid JSON payload (passes through unchanged)
- **Test H**: `• ` bullet prefix removed from valid JSON
- **Test I**: Arbitrary prose `Here is the result: {...}` — NOT normalized (only exact bullet prefix allowed), rejected by Runtime schema

### `tests/runtime-kimi-requirement-summary.test.ts` — Add argument mode subtests
- Test that argument mode produces same `execution_source: "kimi_real"` as stdin mode (with fake runner)

## Safety Guarantees
- `shell` remains `false` in all modes
- Prompt is always one array element (never string-concatenated)
- Prompt never written to stdin in argument mode
- `[REDACTED_PROMPT]` placeholder in all audit/observability/commandInput paths
- No real process spawn in any automated test
- All existing behaviors preserved (bounded payload, stdout truncation, timeout, fallback, schema validation)

## NOT Modified
- Runtime graph routing
- tech-design Kimi connection
- Codex or Hermes
- `final_status` or `implementation_outcome`
- No new sidecars, memory features, rollout docs, or architecture registries