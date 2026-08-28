# C03-E W4 — Spawn Runner Reference Graph & Path-A Freeze (E2-T7 / Decision-073)

> Scope of W4 (wiring-design §7, §10 step 4): **freeze markers + this reference
> graph + a mechanical "new Path-B assembly imports no frozen symbol" tripwire.**
> W4 does **not** delete Path-A code and does **not** change Path-A test
> behaviour. Physical deletion is a separate decision after the Path-B periphery
> is complete and the E5 real canary passes end to end.
>
> This document closes the open question in wiring-design §11 ("the exact set of
> the three custom spawn runners is fixed by the W4 reference graph").

## 1. Layers

| Layer | Meaning | Real process? |
| --- | --- | --- |
| **L0 process** | Modules that actually call `child_process.spawn`/`execFile` for an Agent CLI | yes |
| **L1 legacy real-dispatch / sidecar** | Path-A-era per-Agent real gateways, shadow sidecars and dispatch runners built on L0 | yes, when enabled |
| **L2 gateway** | The capability gateways the chain kernel talks to | deterministic = shadow only; real = dormant (D-071) |
| **Path-A orchestration** | First-generation D0x delivery orchestration that drives Codex directly through the POSIX runner | yes for Codex |
| **Path-B assembly (NEW, W1–W3)** | `createCapabilityGateway` factory, `scripts/loop-run.ts`, `runProduction` | **no direct process surface** |

## 2. L0 — Agent CLI process modules (frozen)

| Module | Process mechanism | Production importers | W4 disposition |
| --- | --- | --- | --- |
| `execution/kimi-cli-command-executor.ts` | `spawn` (`:85`) | gateway.ts, kimi-gateway-real-dispatch, kimi-gateway-shadow-sidecar, core/kimi-runtime-shadow-attachment, contracts | FROZEN banner |
| `execution/hermes-cli-command-executor.ts` | `spawn` (`:112`; wiring's legacy `:259` drifted here) | gateway.ts, hermes-gateway-real-dispatch(-contract/phase2-shadow), hermes-gateway-shadow-sidecar, core/hermes-runtime-shadow-attachment | FROZEN banner |
| `execution/codex-adapter.ts` | `execFile("codex", …)` (`:71`), only when `SDLC_EXECUTION_MODE=codex` | execution/index.ts barrel only | FROZEN banner |
| `execution/codex-cli-process-runner.ts` | `spawn` (`:8`), header already states it stays unwired | gateway.ts, codex-real-dispatch-real-runner, index.ts | FROZEN banner |
| `execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-process-runner.ts` | `spawn` (`:132`) | **none (no production importer — dead/dormant)** | FROZEN banner |

The broader `hermes-gateway-real-dispatch-phase-2-*` family (contracts, rollout
plans, guardrails, observability, enablement/checklist templates) is **pure
evaluation/type/documentation code with no process surface**. It is part of the
legacy Hermes phase-2 canary lineage, frozen as a whole and has no Path-B
assembly importer; it is not individually banner-marked (it is reached only via
the frozen core modules above).

## 3. L1 — legacy real-dispatch / shadow sidecar (frozen)

| Module | Role | Production importers | W4 disposition |
| --- | --- | --- | --- |
| `execution/codex-real-dispatch-runner.ts` | Codex dispatch runner (types + predicates) | gateway.ts, real-capability-gateway, codex-adapter, codex-real-dispatch-real-runner, multi-agent-fake-runners(test-only), index | FROZEN banner |
| `execution/codex-real-dispatch-real-runner.ts` | builds the real Codex runner on the L0 process runner | gateway.ts, codex-cli-process-runner, index | FROZEN banner |
| `execution/kimi-gateway-real-dispatch.ts` | Kimi legacy real gateway (`executeKimiGatewayRequest`) | gateway.ts, kimi fallback policy | FROZEN banner |
| `execution/hermes-gateway-real-dispatch.ts` | Hermes legacy real gateway (`dispatchHermesGatewayReal`) | gateway.ts, hermes guardrails/observability/fallback/phase2-shadow, execution/types | FROZEN banner |
| `execution/kimi-gateway-shadow-sidecar.ts` | Kimi shadow sidecar | core/kimi-runtime-shadow-attachment, attachment contract | FROZEN banner |
| `execution/hermes-gateway-shadow-sidecar.ts` | Hermes shadow sidecar | core/hermes-runtime-shadow-attachment, attachment contract | FROZEN banner |
| `core/kimi-runtime-shadow-attachment.ts` | attaches the Kimi sidecar on the Path-A line | Path-A lineage | FROZEN banner |
| `core/hermes-runtime-shadow-attachment.ts` | attaches the Hermes sidecar on the Path-A line | Path-A lineage | FROZEN banner |

## 4. L2 — gateways (NOT frozen; the Path-B seam)

- `execution/gateway.ts` — `ExecutionGateway` / `createDeterministicCapabilityGateway`.
  It still **imports** L0/L1 modules and carries Path-A-era **env-gated** real
  attach branches (`isCodexRealDispatchEnabled` gateway.ts:716,
  `isHermesGatewayRealDispatchEnabled` :742). These are dormant: every gate is
  fail-closed (`env.<FLAG> === "enabled"`, Hermes additionally requires several
  flags together — `hermes-gateway-real-dispatch-contract.ts:21`,
  `getHermesGatewayRealDispatchRequiredFlags`), and **no production module sets
  those env vars** (only readiness/guardrail/contract text references the flag
  strings, plus comments). W4 does not cut these imports (that is the post-E5
  physical-deletion batch); the default deterministic path therefore cannot be
  silently driven to a real spawn.
- `execution/real-capability-gateway.ts` — Path-B real gateway. Its use of
  `codex-real-dispatch-runner` is **intentional and adapter-mediated** (the real
  gateway is where a real Codex call belongs); the whole real gateway stays
  dormant under D-071 and is reachable only via the factory's three-condition
  real branch (W2).
- `execution/capability-gateway-source.ts` — the **only** Path-B factory. It
  imports only L2 (`createDeterministicCapabilityGateway`, `RealCapabilityGateway`)
  and core binding logic — **zero L0/L1 imports**.

## 5. Path-A orchestration (frozen, banners added)

| Module | Era / size | How it reaches an Agent | Successor on Path B |
| --- | --- | --- | --- |
| `core/loop-requirement-design-orchestrator.ts` (D08, ~2483) | requirement/design routing | via Path-A lineage + sidecar attachment | requirement-intake node |
| `core/loop-production-coordinator.ts` (D09, ~1760) | coordinator | via D05/sidecars | loop-run assembles the B graph directly |
| `core/loop-autonomous-delivery-loop.ts` (D06, ~3707) | fix loop | drives D05 (Codex via POSIX runner) | Re-Gate mechanism |
| `core/loop-codex-implementation-adapter.ts` (D05) | Codex implementation adapter | builds a Codex CLI command run through the injected `LoopPosixProcessRunner` (wiring's "`:526` direct spawn"; line numbers have drifted) | canonical capability gateway |

D05/D06 do **not** import L0 Agent CLI executors directly; D05 runs Codex through
the injected POSIX process runner plus `loop-codex-prompt/output`, and D06 reaches
agents through D05 / the runtime shadow attachments.

## 6. The "three custom spawn runners" (closes wiring §11)

The three Path-A custom Agent process drivers are precisely:

1. **Codex** — `execution/codex-adapter.ts` (`execFile codex`) plus the
   `codex-cli-process-runner` + `codex-real-dispatch(-real)-runner` chain used by
   D05/gateway.
2. **Kimi** — `execution/kimi-cli-command-executor.ts` (`spawn`) wrapped by
   `kimi-gateway-real-dispatch` / `kimi-gateway-shadow-sidecar`.
3. **Hermes** — `execution/hermes-cli-command-executor.ts` (`spawn`) wrapped by
   `hermes-gateway-real-dispatch` / `hermes-gateway-shadow-sidecar` (and the
   dormant phase-2 code-review canary process runner).

## 7. New Path-B assembly imports NONE of them (mechanical, section B-7)

The W1–W3 assembly surface — `execution/capability-gateway-source.ts`,
`scripts/loop-run.ts`, and `runtime.ts` — imports only L2 abstractions and core
(non-Agent) modules. Verified import surface:

- `capability-gateway-source.ts`: core store types, binding registry,
  `./gateway`, `./real-capability-gateway` — no L0/L1.
- `scripts/loop-run.ts`: node fs/path, production-entry parser, POSIX runner +
  git workspace (**Git only**, on the inherited-reuse list), factory type,
  runtime, executor types — no Agent process/sidecar.
- `runtime.ts`: core modules, `./execution/gateway`,
  `./execution/capability-gateway-source`, a **type-only** import of
  `RealCapabilityGatewayDeps` — no L0/L1.

`scripts/validate-skill-contracts.rb` section B-7 mechanically fails if any of
these three files imports a frozen module name, and fails if a file on the frozen
list is missing the FROZEN banner marker.

## 8. Inherited-reuse list (NOT frozen — required for Path B to be complete)

- `core/loop-git-workspace.ts` (D03): attempt-workspace prepare/isolate, injected
  into the real gateway via `attemptWorkspace`; W3 uses its read-only `inspect`.
- `core/loop-posix-process-runner.ts`: the generic, allowlisted POSIX/Git runner
  (no Agent semantics); used for Git and as the injected process abstraction.
- `loop-delivery-publisher.ts`: its three spawn sites are **Git** operations
  (commit/PR), not Agent sources; publishing stays a separate post-chain step.
- governance tail: `runtime.ts` already produces `governance_tail_result`; the
  executor side reuses the existing tail capability.

## 9. Physical-deletion condition

Deferred (not W4): after the Path-B periphery (requirement entry, publishing,
tail seams) is complete and the E5 real canary proves end-to-end delivery with
real evidence, a separate deletion decision removes Path A and cuts the L0/L1
imports inside `gateway.ts`. Until then Path A is frozen: no evolution, no new
Path-B dependency, default path stays 100% deterministic.
