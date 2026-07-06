# Hermes Runtime Shadow Attachment Final Readiness Review

## Verdict

**READY_WITH_CONSTRAINTS**

## Scope

Runtime shadow attachment only. This review covers the Hermes runtime sidecar metadata stack. It does not cover Gateway real dispatch.

## Confirmed Guarantees

- **Default disabled** — Runtime does not call Hermes builder without `SDLC_HERMES_RUNTIME_ATTACHMENT=enabled`
- **Wired to Runtime only as optional sidecar metadata** — `hermes_runtime_shadow_attachment` field on RuntimeResult
- **Not wired to Gateway primary dispatch** — Gateway behavior unchanged
- **Omitted when disabled** — No field, no call, no side effects
- **Never writes undefined key** — Field omitted entirely when absent
- **Does not change final_status** — Runtime result final_status unaffected
- **Does not change routing** — No agent selection or routing changes
- **Does not affect primary Gateway result** — Gateway dispatch path unchanged
- **Uses fake builder/fake runner in tests** — No real Hermes CLI in any test
- **No real Hermes CLI in tests** — All tests use dependency injection
- **No persisted audit** — `persistsAudit: false`
- **No file writes** — `writesFiles: false`
- **No raw prompt/artifacts/secrets** — All metadata sanitized, summary only
- **Has auditMetadata** — In-memory sidecar audit metadata
- **Has observabilitySummary** — Summary with outcome/count/booleans, no raw text

## Constraints

1. Hermes is still not wired to primary Gateway dispatch.
2. Hermes real dispatch must remain behind separate Gateway real dispatch contract.
3. Runtime sidecar metadata must remain optional and omitted when disabled.
4. No Runtime final_status or routing may depend on Hermes sidecar output.
5. No persisted audit or observability is allowed without a separate contract.

## Not Included

- No Hermes Gateway real dispatch
- No Gateway routing change
- No Hermes default routing
- No policy memory mutation
- No persisted audit/observability
- No code review/validation final decision ownership by Hermes

## Recommended Next PR

**Hermes Gateway Real Dispatch Contract**

Hermes runtime sidecar stack is complete and readiness-reviewed. The next step is a Gateway real dispatch contract following Kimi's pattern — contract-only, requiring multiple flags, default-off, not wired to primary Gateway dispatch.
