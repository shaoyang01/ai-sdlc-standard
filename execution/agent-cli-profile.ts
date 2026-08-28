// Agent CLI Profiles — C03-E E2 (Decision-071, plan §6 E2 / §9 bounds / §3.2 Q1)
// ============================================================================
// The single machine authority for how the production runtime invokes the
// three real Agent CLIs. This module is PURE DATA + fail-closed lookups:
//   - no child_process, no filesystem, no network, no process.env;
//   - the resolved absolute executable path is NOT pinned here (it is machine
//     specific and is discovered/injected by the production entry, then
//     re-validated by LoopPosixProcessRunner: canonical realpath, exec bit,
//     no symlink, executable allowlist). Only the E2-P-observed basename and
//     version are carried as provenance;
//   - every dynamic requirement (prompt) travels over STDIN only. The
//     argument vector is fully static. E2-P reached the CLIs with an inline
//     prompt ("kimi -p <p>", "codex exec <p>", "hermes -z <p>"); that proved
//     reachability only. The stdin-prompt transport used below is exercised
//     against the FAKE runner in E1～E4 and must be re-proved against the real
//     CLIs in the separately authorized E5 canary (INV-E13: reachability /
//     fake / canary / full-run evidence never substitute for one another).
//
// Source facts pinned here:
//   - Q1 binding (plan §3.2, ACCEPTED): the eight v2 execution points.
//   - E2-P record: docs/reports/c03-e-e2p-provider-reachability-record.md
//       Kimi  0.38.0  (~/.kimi-code/bin/kimi)            exit 0
//       Codex codex-cli 0.150.1 (@openai/codex/bin/codex.js) exit 0
//       Hermes 0.20.5 (~/.local/bin/hermes)              exit 0
//   - §9 bounds (Q4 ACCEPTED).

import type { CapabilityExecutionPoint, NodeCapabilityId, CapabilityExecutionRole } from "../loop/types";

// ── Provider identity ──────────────────────────────────────────────────────
export type AgentCliProviderId = "kimi" | "codex" | "hermes";

export const AGENT_CLI_PROVIDER_IDS: readonly AgentCliProviderId[] = Object.freeze([
  "kimi",
  "codex",
  "hermes",
]);

/** How the dynamic prompt reaches the CLI. E2 first version is stdin-only. */
export type AgentCliPromptTransport = "stdin";

/** Output dialect the adapter must parse into a canonical ExecutionResult. */
export type AgentCliOutputDialect = "text-final" | "jsonl-final";

/**
 * One provider's immutable invocation profile. `staticArgs` contains NO
 * dynamic content. The prompt is written to stdin. `executableBasename` is
 * diagnostic provenance from E2-P, never spawned directly.
 */
export interface AgentCliProfile {
  readonly providerId: AgentCliProviderId;
  /** E2-P observed CLI version (reachability baseline; re-prove in E5). */
  readonly pinnedCliVersion: string;
  /** E2-P observed on-disk basename / relative hint (diagnostic only). */
  readonly executableBasename: string;
  /** Fully static argv (no prompt, no user string). */
  readonly staticArgs: readonly string[];
  readonly promptTransport: AgentCliPromptTransport;
  readonly outputDialect: AgentCliOutputDialect;
  /**
   * Whether this provider emits a separate usage/cost artifact. Hermes uses
   * `--usage-file`; the adapter supplies a path INSIDE the attempt workspace.
   */
  readonly usageFileArg: readonly string[] | null;
  /** Per-attempt timeout by capability class (§9). */
  readonly timeoutMsByCapabilityClass: Readonly<Record<CapabilityClass, number>>;
  /** Bounded stream / artifact limits (§9) shared by every provider. */
  readonly bounds: AgentCliBounds;
}

export type CapabilityClass = "implementation" | "non-implementation";

export interface AgentCliBounds {
  readonly maxStdinBytes: number;
  readonly maxStdoutBytes: number;
  readonly maxStderrBytes: number;
  readonly maxArtifactBytes: number;
  readonly sameBindingMaxRetry: number;
  readonly regateRounds: number;
  readonly runForegroundBudgetMs: number;
}

// ── §9 bounds (Q4 ACCEPTED) — single source, shared by all providers ───────
export const AGENT_CLI_BOUNDS: AgentCliBounds = Object.freeze({
  maxStdinBytes: 1 * 1024 * 1024, // 1 MiB
  maxStdoutBytes: 256 * 1024, // 256 KiB — structured result + safe summary only
  maxStderrBytes: 64 * 1024, // 64 KiB — diagnostic summary, raw never journaled
  maxArtifactBytes: 16 * 1024 * 1024, // 16 MiB, aligned with artifact store
  sameBindingMaxRetry: 1, // retryable infra failure only, same binding, once
  regateRounds: 8,
  runForegroundBudgetMs: 2 * 60 * 60 * 1000, // 2 h; stays resumable, never faked
});

// Per-attempt timeouts (§9). The LoopPosixProcessRunner ceiling was raised to
// MAX_TO=1800000 (a135a36) to accept the 30 min implementation attempt while
// its conservative default stays 120 s; non-implementation stays at 10 min.
const NON_IMPL_TIMEOUT_MS = 10 * 60 * 1000;
const IMPL_TIMEOUT_MS = 30 * 60 * 1000;

const TIMEOUT_BY_CLASS: Readonly<Record<CapabilityClass, number>> = Object.freeze({
  "non-implementation": NON_IMPL_TIMEOUT_MS,
  implementation: IMPL_TIMEOUT_MS,
});

// ── E2-P reachability provenance (INV-E13: this is NOT adapter readiness) ──
export interface E2pReachabilityFact {
  readonly providerId: AgentCliProviderId;
  readonly observedCliVersion: string;
  readonly exitCode: 0;
  readonly recordRef: string;
  readonly evidenceClass: "PROVIDER_REACHABILITY_ONLY";
}

export const E2_P_REACHABILITY_RECORD_REF =
  "docs/reports/c03-e-e2p-provider-reachability-record.md";

export const E2_P_REACHABILITY_FACTS: Readonly<Record<AgentCliProviderId, E2pReachabilityFact>> =
  Object.freeze({
    kimi: Object.freeze({
      providerId: "kimi",
      observedCliVersion: "0.38.0",
      exitCode: 0,
      recordRef: E2_P_REACHABILITY_RECORD_REF,
      evidenceClass: "PROVIDER_REACHABILITY_ONLY",
    }),
    codex: Object.freeze({
      providerId: "codex",
      observedCliVersion: "codex-cli 0.150.1",
      exitCode: 0,
      recordRef: E2_P_REACHABILITY_RECORD_REF,
      evidenceClass: "PROVIDER_REACHABILITY_ONLY",
    }),
    hermes: Object.freeze({
      providerId: "hermes",
      observedCliVersion: "0.20.5",
      exitCode: 0,
      recordRef: E2_P_REACHABILITY_RECORD_REF,
      evidenceClass: "PROVIDER_REACHABILITY_ONLY",
    }),
  });

// ── Profiles ───────────────────────────────────────────────────────────────
function profile(p: AgentCliProfile): AgentCliProfile {
  return Object.freeze({
    ...p,
    staticArgs: Object.freeze([...p.staticArgs]),
    usageFileArg: p.usageFileArg === null ? null : Object.freeze([...p.usageFileArg]),
    timeoutMsByCapabilityClass: TIMEOUT_BY_CLASS,
    bounds: AGENT_CLI_BOUNDS,
  });
}

export const AGENT_CLI_PROFILES: Readonly<Record<AgentCliProviderId, AgentCliProfile>> =
  Object.freeze({
    kimi: profile({
      providerId: "kimi",
      pinnedCliVersion: "0.38.0",
      executableBasename: "kimi",
      // -p / --print: non-interactive run-then-exit. Prompt is fed on stdin.
      staticArgs: ["-p"],
      promptTransport: "stdin",
      outputDialect: "text-final",
      usageFileArg: null,
      timeoutMsByCapabilityClass: TIMEOUT_BY_CLASS,
      bounds: AGENT_CLI_BOUNDS,
    }),
    codex: profile({
      providerId: "codex",
      pinnedCliVersion: "codex-cli 0.150.1",
      executableBasename: "codex",
      // exec = non-interactive headless; --json JSONL; read-only sandbox;
      // never rely on a git repo being present in the attempt workspace.
      staticArgs: ["exec", "--json", "--sandbox", "read-only", "--skip-git-repo-check"],
      promptTransport: "stdin",
      outputDialect: "jsonl-final",
      usageFileArg: null,
      timeoutMsByCapabilityClass: TIMEOUT_BY_CLASS,
      bounds: AGENT_CLI_BOUNDS,
    }),
    hermes: profile({
      providerId: "hermes",
      pinnedCliVersion: "0.20.5",
      executableBasename: "hermes",
      // -z: emit final text only. Usage/cost JSON goes to a workspace file.
      staticArgs: ["-z"],
      promptTransport: "stdin",
      outputDialect: "text-final",
      usageFileArg: ["--usage-file"],
      timeoutMsByCapabilityClass: TIMEOUT_BY_CLASS,
      bounds: AGENT_CLI_BOUNDS,
    }),
  });

// ── Q1 binding projection (plan §3.2, ACCEPTED; no dynamic routing) ────────
const Q1_BINDING: Readonly<
  Record<NodeCapabilityId, Readonly<Partial<Record<CapabilityExecutionRole, AgentCliProviderId>>>>
> = Object.freeze({
    "requirement-intake": Object.freeze({ primary: "kimi" }),
    "solution-design": Object.freeze({ primary: "kimi" }),
    "solution-gate": Object.freeze({ adversarial_scan: "codex", formal_verdict: "hermes" }),
    "task-planning": Object.freeze({ primary: "kimi" }),
    implementation: Object.freeze({ primary: "codex" }),
    "code-review": Object.freeze({ primary: "hermes" }),
    "knowledge-sync": Object.freeze({ primary: "kimi" }),
  });

// ── Errors ─────────────────────────────────────────────────────────────────
export type AgentCliProfileErrorCode =
  | "AGENT_CLI_PROFILE_INVALID_INPUT"
  | "AGENT_CLI_PROFILE_UNKNOWN_PROVIDER"
  | "AGENT_CLI_PROFILE_BINDING_FIREWALL";

export class AgentCliProfileError extends Error {
  readonly code: AgentCliProfileErrorCode;
  constructor(code: AgentCliProfileErrorCode, message: string) {
    super(message);
    this.name = "AgentCliProfileError";
    this.code = code;
  }
}

function fail(code: AgentCliProfileErrorCode, message: string): never {
  throw new AgentCliProfileError(code, message);
}

// ── Lookups ─────────────────────────────────────────────────────────────────
export function getAgentCliProfile(providerId: unknown): AgentCliProfile {
  if (typeof providerId !== "string" || !(AGENT_CLI_PROVIDER_IDS as readonly string[]).includes(providerId)) {
    fail("AGENT_CLI_PROFILE_UNKNOWN_PROVIDER", `unknown agent-cli provider: ${String(providerId)}`);
  }
  return AGENT_CLI_PROFILES[providerId as AgentCliProviderId];
}

function isCapability(v: unknown): v is NodeCapabilityId {
  return typeof v === "string" && (Object.keys(Q1_BINDING) as readonly string[]).includes(v);
}
function isRole(v: unknown): v is CapabilityExecutionRole {
  return v === "primary" || v === "adversarial_scan" || v === "formal_verdict";
}

/** The Q1-bound provider for one canonical execution point (fail-closed). */
export function bindingProviderForPoint(point: unknown): AgentCliProviderId {
  if (point === null || typeof point !== "object") {
    fail("AGENT_CLI_PROFILE_INVALID_INPUT", "execution point must be an object");
  }
  const capability = (point as CapabilityExecutionPoint).capability;
  const role = (point as CapabilityExecutionPoint).executionRole;
  if (!isCapability(capability) || !isRole(role)) {
    fail("AGENT_CLI_PROFILE_INVALID_INPUT", "execution point has unknown capability/role");
  }
  const roles = Q1_BINDING[capability] as Partial<Record<CapabilityExecutionRole, AgentCliProviderId>>;
  const provider = roles[role];
  if (provider === undefined) {
    fail("AGENT_CLI_PROFILE_INVALID_INPUT", `role ${role} is not valid for ${capability}`);
  }
  return provider;
}

/**
 * Module self-check, run by the production entry and by tests. Proves:
 *  1. every one of the eight v2 execution points is Q1-bound to a known
 *     provider with a profile;
 *  2. the solution-gate dual-role firewall holds (scan != verdict);
 *  3. every profile meets its own declared bounds and pins an E2-P version.
 * Returns the count of covered execution points (8) on success.
 */
export function assertAgentCliProfileIntegrity(): number {
  const points = [
    { capability: "requirement-intake", executionRole: "primary" },
    { capability: "solution-design", executionRole: "primary" },
    { capability: "solution-gate", executionRole: "adversarial_scan" },
    { capability: "solution-gate", executionRole: "formal_verdict" },
    { capability: "task-planning", executionRole: "primary" },
    { capability: "implementation", executionRole: "primary" },
    { capability: "code-review", executionRole: "primary" },
    { capability: "knowledge-sync", executionRole: "primary" },
  ] as const satisfies readonly CapabilityExecutionPoint[];

  for (const point of points) {
    const providerId = bindingProviderForPoint(point);
    const profile = getAgentCliProfile(providerId);
    const fact = E2_P_REACHABILITY_FACTS[providerId];
    if (profile.pinnedCliVersion !== fact.observedCliVersion) {
      fail("AGENT_CLI_PROFILE_INVALID_INPUT", `${providerId} pinned version drifts from E2-P fact`);
    }
    if (profile.promptTransport !== "stdin") {
      fail("AGENT_CLI_PROFILE_INVALID_INPUT", `${providerId} must transport prompt over stdin`);
    }
    for (const arg of profile.staticArgs) {
      if (typeof arg !== "string" || arg.length === 0 || /[\x00-\x1f\x7f]/.test(arg)) {
        fail("AGENT_CLI_PROFILE_INVALID_INPUT", `${providerId} static arg invalid`);
      }
    }
  }

  const scan = bindingProviderForPoint({ capability: "solution-gate", executionRole: "adversarial_scan" });
  const verdict = bindingProviderForPoint({ capability: "solution-gate", executionRole: "formal_verdict" });
  if (scan === verdict) {
    fail("AGENT_CLI_PROFILE_BINDING_FIREWALL", "solution-gate scan and verdict share one provider");
  }
  return points.length;
}
