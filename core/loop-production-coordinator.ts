// [FROZEN: PATH A RETIREMENT (C03-E W4 / Decision-073)]
// Legacy Path-A module (first-generation sdlc-* D0x runtime / Agent direct-drive).
// FROZEN: do not evolve; new Path-B assembly must not import it (enforced by
// scripts/validate-skill-contracts.rb section B-7). Physical deletion is a
// separate decision after the Path-B periphery is complete and the E5 real
// canary passes. See docs/reports/c03-e-w4-spawn-reference-graph.md

// LOOP Executor Kernel — Production Coordinator (D09-B)
// ======================================================
// Bounded, single-run, fail-closed coordinator for the governed production
// delivery chain:
//
//   fixed orchestration_result artifact ref
//   → orchestration parser (direct / DIRECT_READY)
//   → executor_input ref from the orchestration artifact
//   → executor-input parser
//   → D03 prepare
//   → pristine workspace gate (no D06 replay on recovered/dirty workspaces)
//   → D06 execute
//   → D06 delivery artifact read-back + parser
//   → injected Shared Documentation Governance Tail dependency
//   → Tail immutable exact-key snapshot + completed reason gate
//   → coordinator-owned pre-A1 cross-binding (before any A1 put)
//   → A1 build / store / read-back / parse + post-A1 second defense
//   → D03 post-Tail inspect
//   → publisher factory create(remaining budget) → D07 governed publish
//   → D07 publish-result read-back + full-chain binding
//   → D09 succeeded
//
// Boundaries (accepted D09-B contract):
// - The ONLY root input is a fixed `loop-artifact:v1:orchestration_result:...`
//   artifact ref. No in-memory requirement/design/executor-input objects and
//   no floating or unbound refs are accepted. There is no
//   `recoveryPublishIntentArtifactRef` input: D09-B cannot safely carry
//   publish-intent recovery across processes (no D06/Tail/A1 recovery
//   artifacts exist), so that path is rejected at the request boundary and
//   full crash recovery stays with D10.
// - The Shared Documentation Governance Tail is an injected typed dependency.
//   This module never re-implements Gate Runner / Sync / Reconcile / Entry
//   Coverage / the full Tail, and the tail dependency never builds or stores
//   A1, never calls D07, and never commits/pushes/creates PRs.
// - Only `completed / GOVERNANCE_TAIL_COMPLETED` tail results may carry a
//   completion package; pending/in_progress/blocked/failed never reach A1 or
//   D07. The tail result is captured ONCE through a descriptor-based
//   exact-key snapshot (with a bounded, reference-isolated completion-package
//   snapshot); the original tail object is never read afterwards.
// - D06 may only run when the workspace is proven to be the pristine
//   pre-implementation workspace (task HEAD == expected base, no changes,
//   empty status digest). A recovered/dirty/advanced workspace without
//   trusted upstream recovery facts is blocked; D06 is never replayed.
// - Before the A1 builder and any `governance_tail_result` put, the
//   coordinator cross-binds the Tail completion package to the parsed D06
//   artifact (implementation files exact; final workspace path/branch/HEAD;
//   `task_has_changes` true; files superset). The A1 read-back is followed by
//   a second cross-binding defense.
// - A1 is built (real `buildLoopGovernanceTailResult`), stored, read back,
//   parsed and cross-bound by the coordinator; any verification failure
//   prevents D07.
// - D07 requests always include `governanceTailResultArtifactRef`; there is
//   no standalone fallback. D07 only creates a Draft PR. The publisher is
//   created through an injected `LoopDeliveryPublisherFactory` with the
//   CURRENT remaining D09 budget (never the initial full budget).
// - One shared deadline starts at the first valid `execute()` clock sample
//   (`identity.createdAt` is never used as the deadline origin). D06 receives
//   `min(executor budget, remaining budget)`; the Tail and D07 are gated by
//   the remaining budget before invocation.
// - Ambiguous D06/D07 side-effect windows are blocked, never re-executed;
//   the persisted governed publish result must bind the FULL verified chain
//   (orchestration ref, executor ref, delivery ref, governance ref,
//   implementation files, final files) and agree with the in-memory publish
//   facts, otherwise `PUBLISH_READBACK_AMBIGUOUS`.
// - No `production_coordinator_state` / `production_coordinator_result`
//   artifacts and no new Artifact Store kinds.
//
// The four canonical parsers are producer-owned contracts:
//   - `parseLoopOrchestrationResultBytes` / `parseLoopDirectExecutorInputBytes`
//     live in loop-requirement-design-orchestrator.ts (D08);
//   - `parseLoopDeliveryResultBytes` lives in loop-autonomous-delivery-loop.ts
//     (D06);
//   - `parseLoopDeliveryPublishResultBytes` lives in loop-delivery-publisher.ts
//     (D07).
// This module only imports and consumes them; it defines no producer schema
// mirrors, key orders or vocabularies of its own.
// - F-008 (R2): the coordinator-owned typed records — the request, the
//   identity, the Shared Tail top-level result and the completion package
//   root — are order-independent: caller property insertion order is never
//   part of the public contract. Descriptor values are captured exactly once
//   and the internal snapshots are rebuilt in fixed field order (frozen,
//   reference-isolated). The producer-owned canonical artifact parsers
//   (D08/D06/D07) and the A1 parser remain strictly order-sensitive.

import { createHash } from "node:crypto";
import { validateLoopRunIdentity } from "./loop-run-state";
import type { LoopRunIdentity } from "./loop-executor-types";
import type { LoopArtifactKind, LoopArtifactStore, LoopStoredArtifact } from "./loop-artifact-store";
import type { LoopGitWorkspaceManager, LoopGitWorkspaceSnapshot } from "./loop-git-workspace";
import {
  parseLoopDirectExecutorInputBytes,
  parseLoopOrchestrationResultBytes,
  type LoopCanonicalParseResult as LoopD08ParseResult,
  type LoopDirectExecutorInput,
  type LoopParsedOrchestrationResult,
} from "./loop-requirement-design-orchestrator";
import {
  parseLoopDeliveryResultBytes,
  type LoopAutonomousDeliveryLoop,
  type LoopAutonomousDeliveryReasonCode,
  type LoopAutonomousDeliveryRequest,
  type LoopAutonomousDeliveryResult,
  type LoopAutonomousDeliveryStatus,
  type LoopCanonicalParseResult as LoopD06ParseResult,
  type LoopParsedDeliveryFinalWorkspace,
  type LoopParsedDeliveryResult,
} from "./loop-autonomous-delivery-loop";
import {
  parseLoopDeliveryPublishResultBytes,
  type LoopCanonicalParseResult as LoopD07ParseResult,
  type LoopDeliveryPublisher,
  type LoopDeliveryPublishRequest,
  type LoopDeliveryPublishResult,
  type LoopParsedPublishResult,
} from "./loop-delivery-publisher";
import {
  buildLoopGovernanceTailResult,
  parseLoopGovernanceTailResultBytes,
  LOOP_GOVERNANCE_TAIL_RESULT_MAX_BYTES,
  LOOP_GOVERNANCE_TAIL_RESULT_SCHEMA,
  type LoopGovernanceTailBusinessDomainSync,
  type LoopGovernanceTailDocFlow,
  type LoopGovernanceTailEntryCoverage,
  type LoopGovernanceTailFinalWorkspace,
  type LoopGovernanceTailManifest,
  type LoopGovernanceTailReconcile,
  type LoopGovernanceTailReGate,
  type LoopGovernanceTailResult,
  type LoopGovernanceTailResultBuildSuccess,
  type LoopGovernanceTailTailGate,
} from "./loop-governance-tail-result";

// ═══════════════════════════════════════ Bounds

const MAX_ARTIFACT_BYTES_BOUND = 16_777_216;
const DEFAULT_MAX_TOTAL_DURATION_MS = 1_800_000;
const MIN_MAX_TOTAL_DURATION_MS = 1_000;
const MAX_MAX_TOTAL_DURATION_MS = 3_600_000;
const DEFAULT_MAX_ORCHESTRATION_RESULT_BYTES = 1_048_576;
const DEFAULT_MAX_EXECUTOR_INPUT_BYTES = 1_048_576;
const DEFAULT_MAX_DELIVERY_RESULT_BYTES = 131_072;
const DEFAULT_MAX_PUBLISH_RESULT_BYTES = 65_536;
const DEFAULT_MAX_A1_BYTES = LOOP_GOVERNANCE_TAIL_RESULT_MAX_BYTES;
const MAX_SAFE_MESSAGE_LENGTH = 256;
const REF_RE = /^loop-artifact:v1:([a-z_]+):sha256:([0-9a-f]{64})$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const SHA40_RE = /^[0-9a-f]{40}$/;

// D07 publisher minimum total duration (its own contract bound); a D07 call
// with less remaining shared budget is refused before any factory create.
const MIN_PUBLISH_BUDGET_MS = MIN_MAX_TOTAL_DURATION_MS;

// The D03 snapshot digest of a pristine workspace: SHA-256 over the empty
// `git status --porcelain=v1 -z --untracked-files=all` output (the same
// digest semantics used by loop-git-workspace.ts).
const EMPTY_TASK_STATUS_DIGEST_SHA256 = createHash("sha256").update(new Uint8Array(0)).digest("hex");

// ═══════════════════════════════════════ Snapshot key contracts
// (coordinator-owned request/identity/Tail contracts — NOT producer schemas;
// F-008: exact-key by membership, order-independent — caller property
// insertion order is never a contract)

const COORDINATOR_OPTION_KEYS = [
  "artifactStore", "workspaceManager", "deliveryLoop", "publisherFactory", "sharedGovernanceTail",
  "clock", "maxTotalDurationMs", "maxOrchestrationResultBytes", "maxExecutorInputBytes",
  "maxDeliveryResultBytes", "maxPublishResultBytes", "maxA1Bytes",
] as const;

const REQUEST_KEYS = ["identity", "orchestrationResultArtifactRef"] as const;

const IDENTITY_KEYS = [
  "runId", "requirementId", "repository", "repositoryPath", "baseBranch", "expectedBaseSha",
  "taskBranch", "controlRoot", "createdAt",
] as const;

const TAIL_RESULT_KEYS = ["status", "reasonCode", "safeMessage", "completionPackage"] as const;
const TAIL_RESULT_STATUSES: readonly string[] = ["pending", "in_progress", "blocked", "failed", "completed"];
const TAIL_COMPLETED_REASON = "GOVERNANCE_TAIL_COMPLETED";
// A1 Tail-owned completion package root fields (the coordinator snapshots
// these structurally; the real A1 builder remains the semantic validator).
const TAIL_PACKAGE_ROOT_KEYS = [
  "final_workspace", "implementation_files", "files", "docflow", "business_domain_sync",
  "reconcile", "entry_coverage", "regate", "manifest", "tail_gate", "blocking_items", "elapsed_ms",
] as const;
const MAX_TAIL_SNAPSHOT_DEPTH = 16;
const MAX_TAIL_SNAPSHOT_NODES = 4096;
const MAX_TAIL_SNAPSHOT_ARRAY_ITEMS = 4096;
const MAX_TAIL_SNAPSHOT_STRING_UTF8_BYTES = 65_536;
const CONTROL_RE = /[\x00-\x1f\x7f-\x9f]/;

// ═══════════════════════════════════════ Internal toolkit
// (generic, fail-closed, descriptor-based; no producer schema vocabulary)

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  let proto: unknown;
  try {
    proto = Object.getPrototypeOf(value);
  } catch {
    return false;
  }
  return proto === Object.prototype || proto === null;
}

/**
 * Exact-key descriptor snapshot of a plain record (F-008): own keys must
 * equal the allowed keys exactly (count and membership — NOT caller
 * insertion order); every key must be a data descriptor. Symbols,
 * `__proto__`, accessors, non-plain prototypes and any reflection failure
 * (Proxy traps / revoked Proxies) fail closed. Descriptor values are
 * captured exactly once in the input's actual key order, then the snapshot
 * is rebuilt in the internal `allowed` order — so property insertion order
 * is never part of the contract, the caller object is never read again (no
 * getters, no TOCTOU), and the result is a fresh null-prototype record that
 * shares no reference with the input.
 */
function scanExactRecord(value: unknown, allowed: readonly string[], label: string): Record<string, unknown> {
  if (!isPlainRecord(value)) throw new Error(`${label} must be a plain object`);
  let keys: Array<string | symbol>;
  try {
    keys = Reflect.ownKeys(value);
  } catch {
    throw new Error(`${label} ownKeys reflection failed`);
  }
  if (keys.length !== allowed.length) throw new Error(`${label} must have exactly the canonical keys`);
  const allowedSet = new Set<string>(allowed);
  // One-time descriptor capture in the input's actual key order. The
  // caller's insertion order is a presentation detail, never a contract.
  const captured = Object.create(null) as Record<string, unknown>;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]!;
    if (typeof key === "symbol") throw new Error(`${label} must not carry symbol keys`);
    if (key === "__proto__") throw new Error(`${label} must not carry __proto__`);
    if (!allowedSet.has(key)) throw new Error(`${label} contains an unknown key`);
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch {
      throw new Error(`${label} descriptor reflection failed`);
    }
    if (descriptor === undefined) throw new Error(`${label} key descriptor is missing`);
    if (descriptor.get !== undefined || descriptor.set !== undefined) {
      throw new Error(`${label} must not carry accessors`);
    }
    if (!("value" in descriptor)) throw new Error(`${label} key has no value`);
    captured[key] = descriptor.value;
  }
  // Rebuild in the internal canonical order; the caller's insertion order is
  // never preserved and never required.
  const out = Object.create(null) as Record<string, unknown>;
  for (const key of allowed) {
    if (!(key in captured)) throw new Error(`${label} is missing the canonical key ${key}`);
    Object.defineProperty(out, key, {
      value: captured[key],
      writable: false,
      enumerable: true,
      configurable: false,
    });
  }
  return out;
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value === null || typeof value !== "object") return value as Readonly<T>;
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item);
    Object.freeze(value);
    return value as Readonly<T>;
  }
  for (const key of Object.getOwnPropertyNames(value)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  Object.freeze(value);
  return value as Readonly<T>;
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function byteEquals(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function sameStringArray(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function deepFrozenEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepFrozenEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (isPlainRecord(a) && isPlainRecord(b)) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (let i = 0; i < ka.length; i++) {
      if (ka[i] !== kb[i]) return false;
      if (!deepFrozenEqual(a[ka[i]!], b[ka[i]!])) return false;
    }
    return true;
  }
  return false;
}

function sanitizeSafeMessage(message: string): string {
  const cleaned = message.replace(CONTROL_RE, " ");
  return cleaned.length > MAX_SAFE_MESSAGE_LENGTH ? cleaned.slice(0, MAX_SAFE_MESSAGE_LENGTH) : cleaned;
}

// ═══════════════════════════════════════ Coordinator public contracts

export type LoopProductionCoordinatorStatus = "succeeded" | "blocked" | "failed";

export type LoopProductionCoordinatorReasonCode =
  | "DELIVERY_SUCCEEDED"
  | "INVALID_INPUT"
  | "ORCHESTRATION_NOT_DIRECT"
  | "ORCHESTRATION_VERIFICATION_FAILED"
  | "EXECUTOR_INPUT_VERIFICATION_FAILED"
  | "WORKSPACE_PREPARE_BLOCKED"
  | "BASE_BRANCH_DRIFT"
  | "WORKSPACE_DRIFT"
  | "DELIVERY_FAILED"
  | "DELIVERY_BLOCKED"
  | "DELIVERY_READBACK_AMBIGUOUS"
  | "GOVERNANCE_TAIL_NOT_COMPLETED"
  | "GOVERNANCE_TAIL_FAILED"
  | "GOVERNANCE_TAIL_INVALID"
  | "A1_BUILD_FAILED"
  | "A1_VERIFICATION_FAILED"
  | "FINAL_WORKSPACE_DRIFT"
  | "PUBLISH_FAILED"
  | "PUBLISH_BLOCKED"
  | "GOVERNED_PUBLISH_VIOLATION"
  | "PUBLISH_READBACK_AMBIGUOUS"
  | "TOTAL_TIMEOUT"
  | "CLOCK_INVALID"
  | "INTERNAL_ERROR";

export type LoopProductionCoordinatorTraceStage =
  | "orchestration_verify"
  | "executor_input_verify"
  | "workspace_prepare"
  | "delivery_execute"
  | "delivery_readback"
  | "governance_tail"
  | "a1_build"
  | "a1_store_readback"
  | "post_tail_inspect"
  | "governed_publish"
  | "publish_readback"
  | "terminal";

export interface LoopProductionCoordinatorTraceEntry {
  readonly sequence: number;
  readonly stage: LoopProductionCoordinatorTraceStage;
  readonly outcome: string;
  readonly artifactRef: string | null;
  readonly elapsedMs: number;
}

/** Shared Documentation Governance Tail — injected typed dependency (D09-B orchestrates it). */
export interface LoopSharedGovernanceTailInput {
  readonly identity: Readonly<LoopRunIdentity>;
  readonly orchestrationResultArtifactRef: string;
  readonly executorInputArtifactRef: string;
  readonly deliveryResultArtifactRef: string;
  readonly implementationFiles: readonly string[];
  readonly finalWorkspace: Readonly<LoopParsedDeliveryFinalWorkspace>;
  readonly remainingMs: number;
}

export type LoopSharedGovernanceTailStatus = "pending" | "in_progress" | "blocked" | "failed" | "completed";

/**
 * Completion package carried ONLY by `completed / GOVERNANCE_TAIL_COMPLETED`
 * tail results. It holds the tail-owned A1 input fields; the coordinator
 * snapshots it structurally and composes the full A1 input, which the real
 * A1 builder validates completely.
 */
export interface LoopGovernanceTailCompletionPackage {
  readonly final_workspace: Readonly<LoopGovernanceTailFinalWorkspace>;
  readonly implementation_files: readonly string[];
  readonly files: readonly string[];
  readonly docflow: Readonly<LoopGovernanceTailDocFlow>;
  readonly business_domain_sync: Readonly<LoopGovernanceTailBusinessDomainSync>;
  readonly reconcile: Readonly<LoopGovernanceTailReconcile>;
  readonly entry_coverage: Readonly<LoopGovernanceTailEntryCoverage>;
  readonly regate: Readonly<LoopGovernanceTailReGate>;
  readonly manifest: Readonly<LoopGovernanceTailManifest>;
  readonly tail_gate: Readonly<LoopGovernanceTailTailGate>;
  readonly blocking_items: readonly unknown[];
  readonly elapsed_ms: number;
}

export interface LoopSharedGovernanceTailResult {
  readonly status: LoopSharedGovernanceTailStatus;
  readonly reasonCode: string;
  readonly safeMessage: string;
  readonly completionPackage?: Readonly<LoopGovernanceTailCompletionPackage>;
}

export interface LoopSharedGovernanceTailDependency {
  run(input: Readonly<LoopSharedGovernanceTailInput>): LoopSharedGovernanceTailResult | Promise<LoopSharedGovernanceTailResult>;
}

export interface LoopProductionCoordinatorRequest {
  readonly identity: Readonly<LoopRunIdentity>;
  /** The ONLY root input: a fixed `loop-artifact:v1:orchestration_result:sha256:<digest>` ref. */
  readonly orchestrationResultArtifactRef: string;
}

/**
 * D07 publisher factory: creates the publisher with the CURRENT remaining D09
 * shared budget, so D07 can never inherit a fresh independent budget and the
 * whole chain stays inside the shared deadline.
 */
export interface LoopDeliveryPublisherFactory {
  create(maxTotalDurationMs: number): Pick<LoopDeliveryPublisher, "execute">;
}

export interface LoopProductionCoordinatorResult {
  readonly status: LoopProductionCoordinatorStatus;
  readonly reasonCode: LoopProductionCoordinatorReasonCode;
  readonly safeMessage: string;
  readonly causeCode?: string;
  readonly orchestrationResultArtifactRef: string;
  readonly executorInputArtifactRef?: string;
  readonly deliveryResultArtifactRef?: string;
  readonly governanceTailResultArtifactRef?: string;
  readonly publishResultArtifactRef?: string;
  readonly commitSha?: string;
  readonly prNumber?: number;
  readonly prUrl?: string;
  readonly files: readonly string[];
  readonly finalGovernedWorkspace?: Readonly<LoopGovernanceTailCompletionPackage["final_workspace"]>;
  readonly elapsedMs: number;
  readonly trace: readonly LoopProductionCoordinatorTraceEntry[];
}

export interface LoopProductionCoordinatorOptions {
  readonly artifactStore: Pick<LoopArtifactStore, "read" | "put">;
  readonly workspaceManager: Pick<LoopGitWorkspaceManager, "prepare" | "inspect">;
  readonly deliveryLoop: Pick<LoopAutonomousDeliveryLoop, "execute">;
  readonly publisherFactory: LoopDeliveryPublisherFactory;
  readonly sharedGovernanceTail: LoopSharedGovernanceTailDependency;
  readonly clock?: Readonly<{ nowMs(): number }>;
  readonly maxTotalDurationMs?: number;
  readonly maxOrchestrationResultBytes?: number;
  readonly maxExecutorInputBytes?: number;
  readonly maxDeliveryResultBytes?: number;
  readonly maxPublishResultBytes?: number;
  readonly maxA1Bytes?: number;
}

interface RequestSnapshot {
  readonly identity: Readonly<LoopRunIdentity>;
  readonly orchestrationResultArtifactRef: string;
}

interface CoordinatorInternalState {
  readonly identity: Readonly<LoopRunIdentity>;
  readonly orchestrationResultArtifactRef: string;
  readonly maxTotalDurationMs: number;
  readonly maxDeliveryResultBytes: number;
  readonly maxPublishResultBytes: number;
  readonly maxA1Bytes: number;
  startMs: number;
  lastClockMs: number;
  clockError: boolean;
  deadlineExceeded: boolean;
  trace: LoopProductionCoordinatorTraceEntry[];
  sequence: number;
}

type ClockGate = "active" | "expired" | "clock_invalid";

/** Immutable Tail result snapshot (F-004): the ONLY Tail data read afterwards. */
interface CanonicalTailResultSnapshot {
  readonly status: LoopSharedGovernanceTailStatus;
  readonly reasonCode: string;
  readonly safeMessage: string;
  readonly completionPackage?: Readonly<LoopGovernanceTailCompletionPackage>;
}

type TailSnapshotResult =
  | { ok: true; value: Readonly<CanonicalTailResultSnapshot> }
  | { ok: false; message: string };

/**
 * Bounded, single-run, fail-closed production coordinator. `execute()` never
 * throws; every dependency exception is caught and mapped to a terminal
 * result. The caller request/identity are captured exactly once through
 * descriptor-based snapshots before any dependency call or await; the original
 * request object is never read afterwards (getters, caller mutation and
 * Proxy traps can never feed the chain).
 */
export class LoopProductionCoordinator {
  private readonly artifactStore: Pick<LoopArtifactStore, "read" | "put">;
  private readonly workspaceManager: Pick<LoopGitWorkspaceManager, "prepare" | "inspect">;
  private readonly deliveryLoop: Pick<LoopAutonomousDeliveryLoop, "execute">;
  private readonly publisherFactory: LoopDeliveryPublisherFactory;
  private readonly sharedGovernanceTail: LoopSharedGovernanceTailDependency;
  private readonly clock: Readonly<{ nowMs(): number }>;
  private readonly maxTotalDurationMs: number;
  private readonly maxOrchestrationResultBytes: number;
  private readonly maxExecutorInputBytes: number;
  private readonly maxDeliveryResultBytes: number;
  private readonly maxPublishResultBytes: number;
  private readonly maxA1Bytes: number;

  constructor(options: LoopProductionCoordinatorOptions) {
    if (options === null || typeof options !== "object" || Array.isArray(options)) {
      throw new Error("options must be a plain object");
    }
    const own = Object.getOwnPropertyNames(options);
    if (own.length === 0 || own.some((k) => !(COORDINATOR_OPTION_KEYS as readonly string[]).includes(k))) {
      throw new Error("options must contain only canonical keys");
    }
    const store = options.artifactStore;
    if (!store || typeof store.read !== "function" || typeof store.put !== "function") {
      throw new Error("artifactStore must provide read and put");
    }
    const workspace = options.workspaceManager;
    if (!workspace || typeof workspace.prepare !== "function" || typeof workspace.inspect !== "function") {
      throw new Error("workspaceManager must provide prepare and inspect");
    }
    const delivery = options.deliveryLoop;
    if (!delivery || typeof delivery.execute !== "function") {
      throw new Error("deliveryLoop must provide execute");
    }
    const publisherFactory = options.publisherFactory;
    if (publisherFactory === null || typeof publisherFactory !== "object" || Array.isArray(publisherFactory)) {
      throw new Error("publisherFactory must be a plain dependency object");
    }
    const factoryProto = Object.getPrototypeOf(publisherFactory);
    if (factoryProto !== Object.prototype && factoryProto !== null) {
      throw new Error("publisherFactory must be a plain dependency object");
    }
    if (typeof publisherFactory.create !== "function") {
      throw new Error("publisherFactory must provide create");
    }
    const tail = options.sharedGovernanceTail;
    if (!tail || typeof tail.run !== "function") {
      throw new Error("sharedGovernanceTail must provide run");
    }
    const clock = options.clock ?? { nowMs: () => Date.now() };
    if (!clock || typeof clock.nowMs !== "function") {
      throw new Error("clock must provide nowMs");
    }
    const maxTotalDurationMs = options.maxTotalDurationMs ?? DEFAULT_MAX_TOTAL_DURATION_MS;
    if (typeof maxTotalDurationMs !== "number" || !Number.isSafeInteger(maxTotalDurationMs)
      || maxTotalDurationMs < MIN_MAX_TOTAL_DURATION_MS || maxTotalDurationMs > MAX_MAX_TOTAL_DURATION_MS) {
      throw new Error("maxTotalDurationMs must be a safe integer within the allowed bound");
    }
    const bound = (value: number | undefined, fallback: number, label: string): number => {
      const resolved = value ?? fallback;
      if (typeof resolved !== "number" || !Number.isSafeInteger(resolved) || resolved < 1 || resolved > MAX_ARTIFACT_BYTES_BOUND) {
        throw new Error(`${label} must be a safe positive integer within the allowed bound`);
      }
      return resolved;
    };
    this.artifactStore = store;
    this.workspaceManager = workspace;
    this.deliveryLoop = delivery;
    this.publisherFactory = publisherFactory;
    this.sharedGovernanceTail = tail;
    this.clock = clock;
    this.maxTotalDurationMs = maxTotalDurationMs;
    this.maxOrchestrationResultBytes = bound(options.maxOrchestrationResultBytes, DEFAULT_MAX_ORCHESTRATION_RESULT_BYTES, "maxOrchestrationResultBytes");
    this.maxExecutorInputBytes = bound(options.maxExecutorInputBytes, DEFAULT_MAX_EXECUTOR_INPUT_BYTES, "maxExecutorInputBytes");
    this.maxDeliveryResultBytes = bound(options.maxDeliveryResultBytes, DEFAULT_MAX_DELIVERY_RESULT_BYTES, "maxDeliveryResultBytes");
    this.maxPublishResultBytes = bound(options.maxPublishResultBytes, DEFAULT_MAX_PUBLISH_RESULT_BYTES, "maxPublishResultBytes");
    this.maxA1Bytes = bound(options.maxA1Bytes, DEFAULT_MAX_A1_BYTES, "maxA1Bytes");
  }

  async execute(request: LoopProductionCoordinatorRequest): Promise<LoopProductionCoordinatorResult> {
    // F-006: the request/identity are snapshotted exactly once BEFORE the
    // first clock sample, first dependency call and first await. `zeroState`
    // therefore never touches the caller object again (no getter triggers).
    const requestSnapshot = this.snapshotRequest(request);
    if (requestSnapshot === null) {
      return this.zeroState("failed", "INVALID_INPUT", "invalid coordinator request", "");
    }
    // The D09 deadline starts at the first valid `execute()` clock sample
    // (never `identity.createdAt`).
    const startSample = this.sampleClock();
    if (startSample === null) {
      return this.zeroState("failed", "CLOCK_INVALID", "clock invalid", requestSnapshot.orchestrationResultArtifactRef);
    }
    const state = this.createState(requestSnapshot, startSample);
    try {
      return await this.runChain(state);
    } catch {
      const elapsed = Math.max(0, state.lastClockMs - state.startMs);
      this.addTrace(state, "terminal", "failed", null, elapsed);
      return this.buildResult(state, "failed", "INTERNAL_ERROR", "internal coordinator failure", undefined, elapsed);
    }
  }

  // ── state machine ──

  /**
   * F-006: descriptor-based exact-key snapshot of the caller request. Rejects
   * accessors, symbol/`__proto__` keys, unknown/missing keys, non-plain
   * prototypes and any reflection failure (Proxy traps / revoked Proxies).
   * The identity is captured exactly once, validated on the safe snapshot and
   * rebuilt as a fresh frozen canonical identity; the caller identity object
   * is never stored or read afterwards.
   */
  private snapshotRequest(request: LoopProductionCoordinatorRequest): RequestSnapshot | null {
    try {
      if (request === null || typeof request !== "object" || Array.isArray(request)) return null;
      const rec = scanExactRecord(request, REQUEST_KEYS, "request");
      const identityRecord = scanExactRecord(rec.identity, IDENTITY_KEYS, "request identity");
      validateLoopRunIdentity(identityRecord);
      const identity = Object.freeze({
        runId: identityRecord.runId as string,
        requirementId: identityRecord.requirementId as string,
        repository: identityRecord.repository as string,
        repositoryPath: identityRecord.repositoryPath as string,
        baseBranch: identityRecord.baseBranch as string,
        expectedBaseSha: identityRecord.expectedBaseSha as string,
        taskBranch: identityRecord.taskBranch as string,
        controlRoot: identityRecord.controlRoot as string,
        createdAt: identityRecord.createdAt as string,
      });
      const ref = rec.orchestrationResultArtifactRef;
      if (typeof ref !== "string") return null;
      const refMatch = REF_RE.exec(ref);
      if (refMatch === null || refMatch[1] !== "orchestration_result") return null;
      return Object.freeze({ identity, orchestrationResultArtifactRef: ref });
    } catch {
      return null;
    }
  }

  private createState(snapshot: RequestSnapshot, startMs: number): CoordinatorInternalState {
    return {
      identity: snapshot.identity,
      orchestrationResultArtifactRef: snapshot.orchestrationResultArtifactRef,
      maxTotalDurationMs: this.maxTotalDurationMs,
      maxDeliveryResultBytes: this.maxDeliveryResultBytes,
      maxPublishResultBytes: this.maxPublishResultBytes,
      maxA1Bytes: this.maxA1Bytes,
      startMs,
      lastClockMs: startMs,
      clockError: false,
      deadlineExceeded: false,
      trace: [],
      sequence: 0,
    };
  }

  private async runChain(state: CoordinatorInternalState): Promise<LoopProductionCoordinatorResult> {
    // ── orchestration artifact (fixed root input) ──
    const gate0 = this.gate(state);
    if (gate0 === "clock_invalid") return this.deadlineTerminal(state, "clock_invalid");
    if (gate0 === "expired") return this.deadlineTerminal(state, "expired");
    const orchestration = await this.readAndParseOrchestration(state);
    if (orchestration.ok === false) {
      return this.terminalize(state, orchestration.status, orchestration.reasonCode, orchestration.message);
    }
    const orchestrationValue = orchestration.value;
    this.addTrace(state, "orchestration_verify", "verified", orchestrationValue.executorInputArtifactRef, this.elapsed(state));

    if (orchestrationValue.route !== "direct" || orchestrationValue.reasonCode !== "DIRECT_READY") {
      return this.terminalize(state, "blocked", "ORCHESTRATION_NOT_DIRECT", "orchestration route is not direct / DIRECT_READY");
    }
    if (orchestrationValue.executorInputArtifactRef === null || orchestrationValue.executorInputDigestSha256 === null) {
      return this.terminalize(state, "failed", "ORCHESTRATION_VERIFICATION_FAILED", "orchestration result carries no executor input ref");
    }
    const executorRef = orchestrationValue.executorInputArtifactRef;
    const executorRefDigest = REF_RE.exec(executorRef)![2]!;
    if (orchestrationValue.executorInputDigestSha256 !== executorRefDigest) {
      return this.terminalize(state, "failed", "ORCHESTRATION_VERIFICATION_FAILED", "orchestration executor digest does not bind to the ref");
    }

    // ── executor input artifact (ref taken from the verified orchestration) ──
    const gate1 = this.gate(state);
    if (gate1 === "clock_invalid") return this.deadlineTerminal(state, "clock_invalid");
    if (gate1 === "expired") return this.deadlineTerminal(state, "expired");
    const executor = await this.readAndParseExecutorInput(state, executorRef);
    if (executor.ok === false) {
      return this.terminalize(state, executor.status, executor.reasonCode, executor.message);
    }
    const executorValue = executor.value;
    this.addTrace(state, "executor_input_verify", "verified", executorRef, this.elapsed(state));

    // ── D03 prepare ──
    const gate2 = this.gate(state);
    if (gate2 === "clock_invalid") return this.deadlineTerminal(state, "clock_invalid");
    if (gate2 === "expired") return this.deadlineTerminal(state, "expired");
    const prepared = await this.prepareWorkspace(state);
    if (prepared.ok === false) {
      return this.terminalize(state, prepared.status, prepared.reasonCode, prepared.message);
    }
    const snapshot = prepared.value;
    this.addTrace(state, "workspace_prepare", snapshot.state, null, this.elapsed(state));

    // ── F-001 pristine workspace gate ──
    // D06 may only run when the workspace is still the initial pristine
    // pre-implementation workspace. A `recovered` snapshot is acceptable ONLY
    // when it strictly proves the same pristine state (same HEAD as the
    // expected base, no changes, empty canonical git-status digest). Anything
    // else is `blocked / WORKSPACE_DRIFT` — D06 is never replayed.
    const pristine = this.assertPristineWorkspace(state, snapshot);
    if (pristine.ok === false) {
      return this.terminalize(state, "blocked", "WORKSPACE_DRIFT", pristine.message);
    }

    // ── D06 execute (bounded by the shared remaining budget) ──
    const gate3 = this.gate(state);
    if (gate3 === "clock_invalid") return this.deadlineTerminal(state, "clock_invalid");
    if (gate3 === "expired") return this.deadlineTerminal(state, "expired");
    const remaining3 = state.deadlineExceeded ? 0 : this.remainingMs(state);
    if (remaining3 < MIN_MAX_TOTAL_DURATION_MS) {
      return this.terminalize(state, "failed", "TOTAL_TIMEOUT", "insufficient remaining budget for delivery execution");
    }
    const d06Budget = Math.min(executorValue.maxTotalDurationMs, remaining3);
    let deliveryResult: LoopAutonomousDeliveryResult;
    try {
      deliveryResult = await this.deliveryLoop.execute({
        identity: state.identity,
        workspace: {
          workspacePath: snapshot.workspacePath,
          taskBranch: snapshot.taskBranch,
          expectedTaskHeadSha: snapshot.taskHeadSha,
          expectedPreStatusDigestSha256: snapshot.taskStatusDigestSha256,
        },
        requirement: this.executorRequirementText(executorValue),
        designSummary: this.executorDesignSummaryText(executorValue),
        implementationConstraints: executorValue.implementationConstraints,
        allowedPaths: executorValue.allowedPaths,
        testPlan: executorValue.testPlan,
        reviewPlan: executorValue.reviewPlan,
        maxFixRounds: executorValue.maxFixRounds,
        maxTotalDurationMs: d06Budget,
      });
    } catch {
      return this.terminalize(state, "failed", "INTERNAL_ERROR", "delivery loop threw unexpectedly");
    }
    this.addTrace(state, "delivery_execute", deliveryResult.status, deliveryResult.deliveryResultArtifactRef ?? null, this.elapsed(state));
    if (deliveryResult.status === "failed") {
      return this.terminalize(state, "failed", "DELIVERY_FAILED", "delivery execution failed");
    }
    if (deliveryResult.status === "blocked") {
      return this.terminalize(state, "blocked", "DELIVERY_BLOCKED", "delivery execution blocked");
    }

    // ── D06 delivery artifact read-back + parser (artifact is the authority) ──
    const gate4 = this.gate(state);
    if (gate4 === "clock_invalid") return this.deadlineTerminal(state, "clock_invalid");
    if (gate4 === "expired") return this.deadlineTerminal(state, "expired");
    const deliveryRef = deliveryResult.deliveryResultArtifactRef;
    if (deliveryRef === undefined) {
      return this.terminalize(state, "blocked", "DELIVERY_READBACK_AMBIGUOUS", "delivery succeeded without a persisted artifact");
    }
    if (deliveryResult.finalWorkspace === undefined) {
      return this.terminalize(state, "blocked", "DELIVERY_READBACK_AMBIGUOUS", "delivery succeeded without a final workspace");
    }
    if (deliveryResult.finalWorkspace.taskBranch !== state.identity.taskBranch) {
      return this.terminalize(state, "blocked", "DELIVERY_READBACK_AMBIGUOUS", "delivery workspace branch does not bind to the identity");
    }
    const readback = await this.readAndParseDelivery(state, deliveryRef, {
      workspacePath: deliveryResult.finalWorkspace.workspacePath,
      taskBranch: deliveryResult.finalWorkspace.taskBranch,
      taskHeadSha: deliveryResult.finalWorkspace.taskHeadSha,
      statusDigestSha256: deliveryResult.finalWorkspace.statusDigestSha256,
      taskHasChanges: deliveryResult.finalWorkspace.taskHasChanges,
    });
    if (readback.ok === false) {
      return this.terminalize(state, "blocked", "DELIVERY_READBACK_AMBIGUOUS", readback.message);
    }
    const deliveryParsed = readback.value;
    if (!sameStringArray(deliveryParsed.files, deliveryResult.files)) {
      return this.terminalize(state, "blocked", "DELIVERY_READBACK_AMBIGUOUS", "delivery artifact files do not match the in-memory result");
    }
    if (deliveryParsed.finalWorkspace === null) {
      return this.terminalize(state, "blocked", "DELIVERY_READBACK_AMBIGUOUS", "delivery artifact carries no final workspace");
    }
    const deliveryFinalWorkspace = deliveryParsed.finalWorkspace;
    this.addTrace(state, "delivery_readback", "verified", deliveryRef, this.elapsed(state));

    // ── injected Shared Documentation Governance Tail ──
    const gate5 = this.gate(state);
    if (gate5 === "clock_invalid") return this.deadlineTerminal(state, "clock_invalid");
    if (gate5 === "expired") return this.deadlineTerminal(state, "expired");
    const tailInput: Readonly<LoopSharedGovernanceTailInput> = {
      identity: state.identity,
      orchestrationResultArtifactRef: state.orchestrationResultArtifactRef,
      executorInputArtifactRef: executorRef,
      deliveryResultArtifactRef: deliveryRef,
      implementationFiles: deliveryParsed.files,
      finalWorkspace: deliveryFinalWorkspace,
      remainingMs: Math.max(0, this.remainingMs(state)),
    };
    let tailResult: LoopSharedGovernanceTailResult;
    try {
      tailResult = await this.sharedGovernanceTail.run(tailInput);
    } catch {
      return this.terminalize(state, "failed", "GOVERNANCE_TAIL_FAILED", "shared governance tail threw");
    }

    // ── F-004 immutable Tail snapshot + completed reason matrix ──
    // The top-level result is captured exactly once through a descriptor-based
    // exact-key snapshot (rejecting accessors/symbols/`__proto__`/non-plain
    // prototypes/reflection failures); the completion package is captured into
    // a bounded, reference-isolated plain snapshot. The original tail object
    // is never read afterwards.
    const tailShape = this.scanTailResult(tailResult);
    if (tailShape.ok === false) {
      return this.terminalize(state, "failed", "GOVERNANCE_TAIL_INVALID", tailShape.message);
    }
    const tailSnapshot = tailShape.value;
    this.addTrace(state, "governance_tail", tailSnapshot.status, null, this.elapsed(state));
    if (tailSnapshot.status !== "completed") {
      if (tailSnapshot.status === "failed") {
        return this.terminalize(state, "failed", "GOVERNANCE_TAIL_FAILED", "shared governance tail failed");
      }
      return this.terminalize(state, "blocked", "GOVERNANCE_TAIL_NOT_COMPLETED", "shared governance tail is not completed");
    }
    if (tailSnapshot.completionPackage === undefined) {
      return this.terminalize(state, "failed", "GOVERNANCE_TAIL_INVALID", "completed tail result carries no completion package");
    }
    const tailPackage = tailSnapshot.completionPackage;

    // ── F-002 coordinator-owned pre-A1 cross-binding (before ANY A1 put) ──
    // The Tail completion package must bind exactly to the parsed D06
    // artifact: implementation files (length, order, per-item), final
    // workspace provenance (path/branch/HEAD, `task_has_changes` true) and
    // files superset. Only the status digest may differ (Shared Tail writes).
    // A mismatch prevents the A1 builder AND any `governance_tail_result` put.
    const preA1 = this.verifyPreA1Binding(tailPackage, deliveryParsed, deliveryFinalWorkspace);
    if (preA1.ok === false) {
      return this.terminalize(state, "failed", "A1_VERIFICATION_FAILED", preA1.message);
    }

    // ── A1 build (the real A1 builder validates the untrusted completion package) ──
    const gate6 = this.gate(state);
    if (gate6 === "clock_invalid") return this.deadlineTerminal(state, "clock_invalid");
    if (gate6 === "expired") return this.deadlineTerminal(state, "expired");
    let built: Readonly<LoopGovernanceTailResultBuildSuccess>;
    try {
      const a1Input: Record<string, unknown> = {
        schema: LOOP_GOVERNANCE_TAIL_RESULT_SCHEMA,
        status: "completed",
        reason_code: TAIL_COMPLETED_REASON,
        identity: state.identity,
        orchestration_result_artifact_ref: state.orchestrationResultArtifactRef,
        executor_input_artifact_ref: executorRef,
        delivery_result_artifact_ref: deliveryRef,
        final_workspace: tailPackage.final_workspace,
        implementation_files: tailPackage.implementation_files,
        files: tailPackage.files,
        docflow: tailPackage.docflow,
        business_domain_sync: tailPackage.business_domain_sync,
        reconcile: tailPackage.reconcile,
        entry_coverage: tailPackage.entry_coverage,
        regate: tailPackage.regate,
        manifest: tailPackage.manifest,
        tail_gate: tailPackage.tail_gate,
        blocking_items: tailPackage.blocking_items,
        elapsed_ms: tailPackage.elapsed_ms,
      };
      const builtResult = buildLoopGovernanceTailResult(a1Input, this.maxA1Bytes);
      if (builtResult.ok === false) {
        return this.terminalize(state, "failed", "A1_BUILD_FAILED", "governance tail result build failed");
      }
      built = builtResult;
    } catch {
      return this.terminalize(state, "failed", "A1_BUILD_FAILED", "governance tail result build failed");
    }
    this.addTrace(state, "a1_build", "verified", null, this.elapsed(state));

    // ── A1 store / read-back / parse + canonical value comparison ──
    const gate7 = this.gate(state);
    if (gate7 === "clock_invalid") return this.deadlineTerminal(state, "clock_invalid");
    if (gate7 === "expired") return this.deadlineTerminal(state, "expired");
    const a1 = this.storeReadBackA1(state, built);
    if (a1.ok === false) {
      return this.terminalize(state, "failed", "A1_VERIFICATION_FAILED", a1.message);
    }
    const a1Ref = a1.value.artifactRef;
    const a1Value = a1.value.value;

    // ── F-002 post-A1 second cross-binding defense (read-back facts) ──
    const postA1 = this.verifyPostA1Binding(a1Value, deliveryParsed, deliveryFinalWorkspace);
    if (postA1.ok === false) {
      return this.terminalize(state, "failed", "A1_VERIFICATION_FAILED", postA1.message);
    }
    this.addTrace(state, "a1_store_readback", "verified", a1Ref, this.elapsed(state));

    // ── D03 post-Tail inspect (A1 final workspace must equal the snapshot) ──
    const gate8 = this.gate(state);
    if (gate8 === "clock_invalid") return this.deadlineTerminal(state, "clock_invalid");
    if (gate8 === "expired") return this.deadlineTerminal(state, "expired");
    const inspected = await this.postTailInspect(state, a1Value);
    if (inspected.ok === false) {
      return this.terminalize(state, "blocked", "FINAL_WORKSPACE_DRIFT", inspected.message);
    }
    this.addTrace(state, "post_tail_inspect", "verified", null, this.elapsed(state));

    // ── F-003 D07 governed publish with the CURRENT remaining budget ──
    const gate9 = this.gate(state);
    if (gate9 === "clock_invalid") return this.deadlineTerminal(state, "clock_invalid");
    if (gate9 === "expired") return this.deadlineTerminal(state, "expired");
    const remaining9 = state.deadlineExceeded ? 0 : this.remainingMs(state);
    if (remaining9 < MIN_PUBLISH_BUDGET_MS) {
      return this.terminalize(state, "failed", "TOTAL_TIMEOUT", "insufficient remaining budget for governed publish");
    }
    const publishRequest: LoopDeliveryPublishRequest = {
      identity: state.identity,
      deliveryResultArtifactRef: deliveryRef,
      commitSubject: executorValue.commitSubject,
      prTitle: executorValue.prTitle,
      governanceTailResultArtifactRef: a1Ref,
    };
    let publisher: Pick<LoopDeliveryPublisher, "execute">;
    try {
      publisher = this.publisherFactory.create(remaining9);
    } catch {
      return this.terminalize(state, "failed", "PUBLISH_FAILED", "publisher factory create failed");
    }
    if (publisher === null || typeof publisher !== "object" || typeof publisher.execute !== "function") {
      return this.terminalize(state, "failed", "PUBLISH_FAILED", "publisher factory returned an invalid publisher");
    }
    let publishResult: LoopDeliveryPublishResult;
    try {
      publishResult = await publisher.execute(publishRequest);
    } catch {
      return this.terminalize(state, "failed", "PUBLISH_FAILED", "publisher threw unexpectedly");
    }
    this.addTrace(state, "governed_publish", publishResult.status, publishResult.publishResultArtifactRef ?? null, this.elapsed(state));
    if (publishResult.status === "failed") {
      return this.terminalize(state, "failed", "PUBLISH_FAILED", "governed publish failed");
    }
    if (publishResult.status === "blocked") {
      return this.terminalize(state, "blocked", "PUBLISH_BLOCKED", "governed publish blocked");
    }
    if (publishResult.governanceTailResultArtifactRef !== a1Ref) {
      return this.terminalize(state, "failed", "GOVERNED_PUBLISH_VIOLATION", "publish result is not bound to the governance tail artifact");
    }
    const publishRef = publishResult.publishResultArtifactRef;
    if (publishRef === undefined) {
      return this.terminalize(state, "blocked", "PUBLISH_READBACK_AMBIGUOUS", "publish succeeded without a persisted result artifact");
    }

    // ── F-007 D07 publish-result read-back + FULL chain binding ──
    // The persisted governed result must bind the whole verified chain:
    // orchestration ref, executor ref, delivery ref, governance ref,
    // implementation files and final files — plus every available
    // commit/push/PR fact must agree with the in-memory publish result.
    const gate10 = this.gate(state);
    if (gate10 === "clock_invalid") return this.deadlineTerminal(state, "clock_invalid");
    if (gate10 === "expired") return this.deadlineTerminal(state, "expired");
    const publishParsed = await this.readAndParsePublishResult(state, publishRef, {
      expectedOrchestrationResultArtifactRef: state.orchestrationResultArtifactRef,
      expectedExecutorInputArtifactRef: executorRef,
      expectedDeliveryResultArtifactRef: deliveryRef,
      expectedGovernanceTailResultArtifactRef: a1Ref,
      expectedImplementationFiles: deliveryParsed.files,
      expectedFiles: a1Value.files,
    });
    if (publishParsed.ok === false) {
      return this.terminalize(state, "blocked", "PUBLISH_READBACK_AMBIGUOUS", publishParsed.message);
    }
    const publishValue = publishParsed.value;
    if (publishValue.status !== "succeeded" || publishValue.reasonCode !== "PUBLISH_SUCCEEDED") {
      return this.terminalize(state, "blocked", "PUBLISH_READBACK_AMBIGUOUS", "persisted publish result is not succeeded");
    }
    const factMismatch = this.publishReadbackFactMismatch(publishValue, publishResult);
    if (factMismatch !== null) {
      return this.terminalize(state, "blocked", "PUBLISH_READBACK_AMBIGUOUS", factMismatch);
    }
    this.addTrace(state, "publish_readback", "verified", publishRef, this.elapsed(state));

    // ── D09 succeeded ──
    const elapsed = this.elapsed(state);
    this.addTrace(state, "terminal", "succeeded", publishRef, elapsed);
    return this.buildResult(state, "succeeded", "DELIVERY_SUCCEEDED", "governed production delivery succeeded", undefined, elapsed, {
      executorInputArtifactRef: executorRef,
      deliveryResultArtifactRef: deliveryRef,
      governanceTailResultArtifactRef: a1Ref,
      publishResultArtifactRef: publishRef,
      commitSha: publishValue.commitSha ?? undefined,
      prNumber: publishValue.prNumber ?? undefined,
      prUrl: publishValue.prUrl ?? undefined,
      files: publishValue.files,
      finalGovernedWorkspace: a1Value.final_workspace,
    });
  }

  // ── stage helpers ──

  private async readAndParseOrchestration(
    state: CoordinatorInternalState,
  ): Promise<{ ok: true; value: LoopParsedOrchestrationResult } | { ok: false; status: "failed"; reasonCode: LoopProductionCoordinatorReasonCode; message: string }> {
    const refDigest = REF_RE.exec(state.orchestrationResultArtifactRef)![2]!;
    let bytes: Buffer;
    try {
      bytes = this.artifactStore.read(state.orchestrationResultArtifactRef, refDigest);
    } catch {
      return { ok: false, status: "failed", reasonCode: "ORCHESTRATION_VERIFICATION_FAILED", message: "orchestration artifact read failed" };
    }
    if (sha256Hex(bytes) !== refDigest || bytes.length > this.maxOrchestrationResultBytes) {
      return { ok: false, status: "failed", reasonCode: "ORCHESTRATION_VERIFICATION_FAILED", message: "orchestration artifact digest mismatch" };
    }
    const parsed: LoopD08ParseResult<LoopParsedOrchestrationResult> = parseLoopOrchestrationResultBytes(bytes, {
      maxBytes: this.maxOrchestrationResultBytes,
      expectedIdentity: state.identity,
    });
    if (parsed.ok === false) {
      return { ok: false, status: "failed", reasonCode: "ORCHESTRATION_VERIFICATION_FAILED", message: `orchestration artifact parse failed (${parsed.reason})` };
    }
    return { ok: true, value: parsed.value };
  }

  private async readAndParseExecutorInput(
    state: CoordinatorInternalState,
    executorRef: string,
  ): Promise<{ ok: true; value: LoopDirectExecutorInput } | { ok: false; status: "failed"; reasonCode: LoopProductionCoordinatorReasonCode; message: string }> {
    const refDigest = REF_RE.exec(executorRef)![2]!;
    let bytes: Buffer;
    try {
      bytes = this.artifactStore.read(executorRef, refDigest);
    } catch {
      return { ok: false, status: "failed", reasonCode: "EXECUTOR_INPUT_VERIFICATION_FAILED", message: "executor input artifact read failed" };
    }
    if (sha256Hex(bytes) !== refDigest || bytes.length > this.maxExecutorInputBytes) {
      return { ok: false, status: "failed", reasonCode: "EXECUTOR_INPUT_VERIFICATION_FAILED", message: "executor input artifact digest mismatch" };
    }
    const parsed: LoopD08ParseResult<LoopDirectExecutorInput> = parseLoopDirectExecutorInputBytes(bytes, {
      maxBytes: this.maxExecutorInputBytes,
      expectedIdentity: state.identity,
    });
    if (parsed.ok === false) {
      return { ok: false, status: "failed", reasonCode: "EXECUTOR_INPUT_VERIFICATION_FAILED", message: `executor input artifact parse failed (${parsed.reason})` };
    }
    return { ok: true, value: parsed.value };
  }

  private async prepareWorkspace(
    state: CoordinatorInternalState,
  ): Promise<{ ok: true; value: LoopGitWorkspaceSnapshot } | { ok: false; status: "blocked"; reasonCode: LoopProductionCoordinatorReasonCode; message: string }> {
    let snapshot: LoopGitWorkspaceSnapshot;
    try {
      snapshot = await this.workspaceManager.prepare(state.identity);
    } catch (e) {
      const code = (e as { code?: string } | null)?.code;
      if (code === "BASE_SHA_MISMATCH") {
        return { ok: false, status: "blocked", reasonCode: "BASE_BRANCH_DRIFT", message: "workspace base drifted" };
      }
      if (code === "SOURCE_WORKSPACE_DRIFT") {
        return { ok: false, status: "blocked", reasonCode: "WORKSPACE_DRIFT", message: "source workspace drifted" };
      }
      return { ok: false, status: "blocked", reasonCode: "WORKSPACE_PREPARE_BLOCKED", message: "workspace prepare blocked" };
    }
    if (snapshot.baseDrifted || snapshot.currentBaseSha !== state.identity.expectedBaseSha) {
      return { ok: false, status: "blocked", reasonCode: "BASE_BRANCH_DRIFT", message: "workspace base drifted" };
    }
    if (snapshot.runId !== state.identity.runId || snapshot.repository !== state.identity.repository
      || snapshot.repositoryPath !== state.identity.repositoryPath || snapshot.taskBranch !== state.identity.taskBranch) {
      return { ok: false, status: "blocked", reasonCode: "WORKSPACE_DRIFT", message: "workspace identity binding mismatch" };
    }
    if (snapshot.sourceHeadSha !== state.identity.expectedBaseSha || snapshot.sourceBranch !== state.identity.baseBranch) {
      return { ok: false, status: "blocked", reasonCode: "WORKSPACE_DRIFT", message: "source workspace invariance violation" };
    }
    return { ok: true, value: snapshot };
  }

  /**
   * F-001: prove the workspace is still the initial pristine pre-implementation
   * state before D06 may run. `created` and `recovered` snapshots are both
   * acceptable ONLY when every fact below holds (task HEAD still on the
   * expected base, no changes, empty canonical git-status digest, base /
   * identity / source invariance intact). Any advanced/dirty/unknown state is
   * blocked — D06 is never replayed on the same orchestration ref.
   */
  private assertPristineWorkspace(
    state: CoordinatorInternalState,
    snapshot: LoopGitWorkspaceSnapshot,
  ): { ok: true } | { ok: false; message: string } {
    if (snapshot.taskHeadSha !== state.identity.expectedBaseSha) {
      return { ok: false, message: "task HEAD is not the pristine pre-implementation head" };
    }
    if (snapshot.taskHasChanges !== false) {
      return { ok: false, message: "task workspace carries changes" };
    }
    if (snapshot.taskStatusDigestSha256 !== EMPTY_TASK_STATUS_DIGEST_SHA256) {
      return { ok: false, message: "task workspace status digest is not pristine" };
    }
    return { ok: true };
  }

  private async readAndParseDelivery(
    state: CoordinatorInternalState,
    deliveryRef: string,
    expectedMaterial: Readonly<{ workspacePath: string; taskBranch: string; taskHeadSha: string; statusDigestSha256: string; taskHasChanges: boolean }>,
  ): Promise<{ ok: true; value: LoopParsedDeliveryResult } | { ok: false; status: "blocked"; reasonCode: LoopProductionCoordinatorReasonCode; message: string }> {
    const refDigest = REF_RE.exec(deliveryRef)![2]!;
    let bytes: Buffer;
    try {
      bytes = this.artifactStore.read(deliveryRef, refDigest);
    } catch {
      return { ok: false, status: "blocked", reasonCode: "DELIVERY_READBACK_AMBIGUOUS", message: "delivery artifact read failed" };
    }
    if (sha256Hex(bytes) !== refDigest || bytes.length > this.maxDeliveryResultBytes) {
      return { ok: false, status: "blocked", reasonCode: "DELIVERY_READBACK_AMBIGUOUS", message: "delivery artifact digest mismatch" };
    }
    const parsed: LoopD06ParseResult<LoopParsedDeliveryResult> = parseLoopDeliveryResultBytes(bytes, {
      maxBytes: this.maxDeliveryResultBytes,
      expectedMaterial,
    });
    if (parsed.ok === false) {
      return { ok: false, status: "blocked", reasonCode: "DELIVERY_READBACK_AMBIGUOUS", message: `delivery artifact parse failed (${parsed.reason})` };
    }
    if (parsed.value.status !== "succeeded") {
      return { ok: false, status: "blocked", reasonCode: "DELIVERY_READBACK_AMBIGUOUS", message: "delivery artifact is not succeeded" };
    }
    return { ok: true, value: parsed.value };
  }

  /**
   * F-004: descriptor-based exact-key snapshot of the tail result. The
   * top-level keys are exactly `status / reasonCode / safeMessage` (with
   * `completionPackage` present only for completed results). F-008: caller
   * property insertion order is NOT a contract — the snapshot is rebuilt in
   * the fixed internal order. Accessors, symbols, `__proto__`, extra/missing
   * keys, non-plain prototypes and reflection failures are rejected; the
   * completed reason matrix is:
   *   completed ⟺ reasonCode === GOVERNANCE_TAIL_COMPLETED ⟺ package present.
   * All later reads use only the returned frozen snapshot.
   */
  private scanTailResult(tailResult: LoopSharedGovernanceTailResult): TailSnapshotResult {
    try {
      const rec = this.scanTailTopLevel(tailResult);
      const status = rec.status;
      const reasonCode = rec.reasonCode;
      const safeMessage = rec.safeMessage;
      if (typeof status !== "string" || !TAIL_RESULT_STATUSES.includes(status)) {
        throw new Error("tail result status is not canonical");
      }
      if (typeof reasonCode !== "string" || reasonCode.length === 0 || CONTROL_RE.test(reasonCode)) {
        throw new Error("tail result reasonCode is invalid");
      }
      if (typeof safeMessage !== "string" || CONTROL_RE.test(safeMessage) || safeMessage.length > MAX_SAFE_MESSAGE_LENGTH) {
        throw new Error("tail result safeMessage is invalid");
      }
      if (status === "completed") {
        if (reasonCode !== TAIL_COMPLETED_REASON) {
          throw new Error("completed tail result must carry reasonCode GOVERNANCE_TAIL_COMPLETED");
        }
        if (rec.completionPackage === undefined) {
          throw new Error("completed tail result must carry a completion package");
        }
        const packageSnapshot = this.captureTailCompletionPackage(rec.completionPackage);
        return {
          ok: true,
          value: Object.freeze({
            status: status as LoopSharedGovernanceTailStatus,
            reasonCode: reasonCode as string,
            safeMessage: safeMessage as string,
            completionPackage: packageSnapshot,
          }),
        };
      }
      if (reasonCode === TAIL_COMPLETED_REASON) {
        throw new Error("non-completed tail result must not carry the completed reason code");
      }
      if (rec.completionPackage !== undefined) {
        throw new Error("non-completed tail result must not carry a completion package");
      }
      return {
        ok: true,
        value: Object.freeze({
          status: status as LoopSharedGovernanceTailStatus,
          reasonCode: reasonCode as string,
          safeMessage: safeMessage as string,
        }),
      };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "tail result is not readable" };
    }
  }

  /**
   * Top-level tail result (F-008): exactly `status / reasonCode /
   * safeMessage` (+ `completionPackage` only for completed results), with
   * caller insertion order NOT part of the contract. Descriptor values are
   * captured exactly once in the input's actual key order; unknown keys,
   * accessors, symbols, `__proto__`, non-plain prototypes and reflection
   * failures are rejected. The presence of `completionPackage` is decided
   * from the already-captured `status` value — the original tail object is
   * never re-read afterwards — and the snapshot is rebuilt in the fixed
   * internal `TAIL_RESULT_KEYS` order.
   */
  private scanTailTopLevel(tailResult: unknown): Record<string, unknown> {
    if (!isPlainRecord(tailResult)) throw new Error("tail result is not a plain object");
    let keys: Array<string | symbol>;
    try {
      keys = Reflect.ownKeys(tailResult);
    } catch {
      throw new Error("tail result ownKeys reflection failed");
    }
    if (keys.length < 3 || keys.length > TAIL_RESULT_KEYS.length) {
      throw new Error("tail result must have exactly the canonical keys");
    }
    const allowedSet = new Set<string>(TAIL_RESULT_KEYS);
    const captured = Object.create(null) as Record<string, unknown>;
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]!;
      if (typeof key === "symbol") throw new Error("tail result must not carry symbol keys");
      if (key === "__proto__") throw new Error("tail result must not carry __proto__");
      if (!allowedSet.has(key)) throw new Error("tail result contains an unknown key");
      let descriptor: PropertyDescriptor | undefined;
      try {
        descriptor = Object.getOwnPropertyDescriptor(tailResult, key);
      } catch {
        throw new Error("tail result descriptor reflection failed");
      }
      if (descriptor === undefined) throw new Error("tail result key descriptor is missing");
      if (descriptor.get !== undefined || descriptor.set !== undefined) {
        throw new Error("tail result must not carry accessors");
      }
      if (!("value" in descriptor)) throw new Error("tail result key has no value");
      captured[key] = descriptor.value;
    }
    for (const key of ["status", "reasonCode", "safeMessage"]) {
      if (!(key in captured)) throw new Error(`tail result is missing the canonical key ${key}`);
    }
    // The completion-package presence matrix is decided by the captured
    // status value only; the original object is never re-read.
    if (captured.status === "completed") {
      if (!("completionPackage" in captured)) {
        throw new Error("completed tail result must carry a completion package");
      }
    } else if ("completionPackage" in captured) {
      throw new Error("non-completed tail result must not carry a completion package");
    }
    const out = Object.create(null) as Record<string, unknown>;
    for (const key of TAIL_RESULT_KEYS) {
      if (!(key in captured)) continue;
      Object.defineProperty(out, key, {
        value: captured[key],
        writable: false,
        enumerable: true,
        configurable: false,
      });
    }
    return out;
  }

  /**
   * Bounded, descriptor-based, reference-isolated snapshot of the completion
   * package. The root keys are exactly the A1 Tail-owned fields (F-008:
   * exact-key by membership — caller insertion order is not a contract; the
   * snapshot is rebuilt in the fixed `TAIL_PACKAGE_ROOT_KEYS` order); every
   * nested plain record/array is rebuilt fresh with depth/node/array/string
   * bounds; cycles, accessors, symbols, `__proto__`, non-plain prototypes
   * and reflection failures are rejected. This is structural safety capture
   * only — the real A1 builder remains the full semantic validator.
   */
  private captureTailCompletionPackage(value: unknown): Readonly<LoopGovernanceTailCompletionPackage> {
    const rec = scanExactRecord(value, TAIL_PACKAGE_ROOT_KEYS, "tail completion package");
    const budget = { nodes: MAX_TAIL_SNAPSHOT_NODES };
    const ancestors = new Set<object>();
    const captured: Record<string, unknown> = Object.create(null);
    for (const key of TAIL_PACKAGE_ROOT_KEYS) {
      captured[key] = this.captureTailValue(rec[key], 1, budget, ancestors);
    }
    return deepFreeze(captured) as unknown as LoopGovernanceTailCompletionPackage;
  }

  private captureTailValue(
    value: unknown,
    depth: number,
    budget: { nodes: number },
    ancestors: Set<object>,
  ): unknown {
    if (depth > MAX_TAIL_SNAPSHOT_DEPTH) throw new Error("tail package exceeds the depth bound");
    if (value === null) return null;
    if (typeof value === "boolean") return value;
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new Error("tail package contains a non-finite number");
      return value;
    }
    if (typeof value === "string") {
      if (value.length > MAX_TAIL_SNAPSHOT_STRING_UTF8_BYTES) throw new Error("tail package string exceeds the byte bound");
      if (CONTROL_RE.test(value)) throw new Error("tail package string must not contain control characters");
      return value;
    }
    if (typeof value !== "object") throw new Error("tail package contains an unsupported value");
    budget.nodes -= 1;
    if (budget.nodes < 0) throw new Error("tail package exceeds the node bound");
    if (ancestors.has(value)) throw new Error("tail package must not contain cycles");
    let isArray: boolean;
    try {
      isArray = Array.isArray(value);
    } catch {
      throw new Error("tail package array reflection failed");
    }
    if (isArray) {
      let proto: unknown;
      try {
        proto = Object.getPrototypeOf(value);
      } catch {
        throw new Error("tail package array prototype reflection failed");
      }
      if (proto !== Array.prototype) throw new Error("tail package array has a non-plain prototype");
      let keys: Array<string | symbol>;
      try {
        keys = Reflect.ownKeys(value);
      } catch {
        throw new Error("tail package array reflection failed");
      }
      const snapshot = new Map<string | symbol, unknown>();
      for (const key of keys) {
        let descriptor: PropertyDescriptor | undefined;
        try {
          descriptor = Object.getOwnPropertyDescriptor(value, key);
        } catch {
          throw new Error("tail package array descriptor reflection failed");
        }
        if (descriptor === undefined || descriptor.get !== undefined || descriptor.set !== undefined || !("value" in descriptor)) {
          throw new Error("tail package array has an invalid descriptor");
        }
        snapshot.set(key, descriptor.value);
      }
      const lengthValue = snapshot.get("length");
      if (typeof lengthValue !== "number" || !Number.isSafeInteger(lengthValue) || lengthValue < 0) {
        throw new Error("tail package array length is invalid");
      }
      if (lengthValue > MAX_TAIL_SNAPSHOT_ARRAY_ITEMS) throw new Error("tail package array exceeds the element bound");
      let indexCount = 0;
      for (const key of keys) {
        if (key === "length") continue;
        if (typeof key !== "string") throw new Error("tail package array has extra own properties");
        const idx = Number(key);
        if (!Number.isSafeInteger(idx) || idx < 0 || idx >= lengthValue || String(idx) !== key) {
          throw new Error("tail package array has extra own properties");
        }
        indexCount += 1;
      }
      if (indexCount !== lengthValue) throw new Error("tail package array must be dense");
      const out: unknown[] = new Array(lengthValue);
      ancestors.add(value);
      try {
        for (let i = 0; i < lengthValue; i++) {
          out[i] = this.captureTailValue(snapshot.get(String(i)), depth + 1, budget, ancestors);
        }
      } finally {
        ancestors.delete(value);
      }
      return out;
    }
    let proto: unknown;
    try {
      proto = Object.getPrototypeOf(value);
    } catch {
      throw new Error("tail package record prototype reflection failed");
    }
    if (proto !== Object.prototype && proto !== null) throw new Error("tail package record has a non-plain prototype");
    let keys: Array<string | symbol>;
    try {
      keys = Reflect.ownKeys(value);
    } catch {
      throw new Error("tail package record reflection failed");
    }
    const out = Object.create(null) as Record<string, unknown>;
    ancestors.add(value);
    try {
      for (const key of keys) {
        if (typeof key === "symbol") throw new Error("tail package record has a symbol key");
        if (key === "__proto__") throw new Error("tail package record has a __proto__ key");
        let descriptor: PropertyDescriptor | undefined;
        try {
          descriptor = Object.getOwnPropertyDescriptor(value, key);
        } catch {
          throw new Error("tail package record descriptor reflection failed");
        }
        if (descriptor === undefined || descriptor.get !== undefined || descriptor.set !== undefined || !("value" in descriptor)) {
          throw new Error("tail package record has an invalid descriptor");
        }
        out[key] = this.captureTailValue(descriptor.value, depth + 1, budget, ancestors);
      }
    } finally {
      ancestors.delete(value);
    }
    return out;
  }

  /**
   * F-002: coordinator-owned pre-A1 cross-binding of the Tail completion
   * package to the parsed D06 delivery artifact. Runs BEFORE the A1 builder
   * and before any `governance_tail_result` put. Exact, order-preserving
   * comparisons only — never sorted, never deduped.
   */
  private verifyPreA1Binding(
    tailPackage: Readonly<LoopGovernanceTailCompletionPackage>,
    deliveryParsed: Readonly<LoopParsedDeliveryResult>,
    deliveryFinalWorkspace: Readonly<LoopParsedDeliveryFinalWorkspace>,
  ): { ok: true } | { ok: false; message: string } {
    if (tailPackage.implementation_files.length !== deliveryParsed.files.length) {
      return { ok: false, message: "pre-A1 implementation files length mismatch" };
    }
    for (let i = 0; i < tailPackage.implementation_files.length; i++) {
      if (tailPackage.implementation_files[i] !== deliveryParsed.files[i]) {
        return { ok: false, message: "pre-A1 implementation files mismatch" };
      }
    }
    if (tailPackage.final_workspace.workspace_path !== deliveryFinalWorkspace.workspacePath) {
      return { ok: false, message: "pre-A1 workspace path mismatch" };
    }
    if (tailPackage.final_workspace.task_branch !== deliveryFinalWorkspace.taskBranch) {
      return { ok: false, message: "pre-A1 task branch mismatch" };
    }
    if (tailPackage.final_workspace.task_head_sha !== deliveryFinalWorkspace.taskHeadSha) {
      return { ok: false, message: "pre-A1 task head mismatch" };
    }
    if (tailPackage.final_workspace.task_has_changes !== true) {
      return { ok: false, message: "pre-A1 tail task_has_changes must be true" };
    }
    if (deliveryFinalWorkspace.taskHasChanges !== true) {
      return { ok: false, message: "pre-A1 delivery task_has_changes must be true" };
    }
    const filesSet = new Set<string>(tailPackage.files);
    for (const f of tailPackage.implementation_files) {
      if (!filesSet.has(f)) {
        return { ok: false, message: "pre-A1 files must include every implementation file" };
      }
    }
    return { ok: true };
  }

  /**
   * F-002: post-A1 read-back second defense — the persisted A1 value must
   * still bind exactly to the D06 files and final workspace. This is a second
   * defense; it never replaces the pre-put cross-binding above.
   */
  private verifyPostA1Binding(
    a1Value: Readonly<LoopGovernanceTailResult>,
    deliveryParsed: Readonly<LoopParsedDeliveryResult>,
    deliveryFinalWorkspace: Readonly<LoopParsedDeliveryFinalWorkspace>,
  ): { ok: true } | { ok: false; message: string } {
    if (!sameStringArray(a1Value.implementation_files, deliveryParsed.files)) {
      return { ok: false, message: "A1 implementation files do not bind to the delivery files" };
    }
    const fw = a1Value.final_workspace;
    if (fw.workspace_path !== deliveryFinalWorkspace.workspacePath
      || fw.task_branch !== deliveryFinalWorkspace.taskBranch
      || fw.task_head_sha !== deliveryFinalWorkspace.taskHeadSha
      || fw.task_has_changes !== true
      || deliveryFinalWorkspace.taskHasChanges !== true) {
      return { ok: false, message: "A1 final workspace does not bind to the delivery workspace" };
    }
    const filesSet = new Set<string>(a1Value.files);
    for (const f of a1Value.implementation_files) {
      if (!filesSet.has(f)) {
        return { ok: false, message: "A1 files must include every implementation file" };
      }
    }
    return { ok: true };
  }

  private storeReadBackA1(
    state: CoordinatorInternalState,
    built: Readonly<LoopGovernanceTailResultBuildSuccess>,
  ): { ok: true; value: { artifactRef: string; value: Readonly<LoopGovernanceTailResult> } } | { ok: false; message: string } {
    let stored: LoopStoredArtifact;
    try {
      stored = this.artifactStore.put("governance_tail_result" as LoopArtifactKind, built.bytes);
    } catch {
      return { ok: false, message: "A1 artifact store put failed" };
    }
    const expectedRef = `loop-artifact:v1:governance_tail_result:sha256:${built.digestSha256}`;
    if (stored.kind !== "governance_tail_result" || stored.digest !== built.digestSha256
      || stored.sizeBytes !== built.sizeBytes || stored.artifactRef !== expectedRef) {
      return { ok: false, message: "A1 store descriptor mismatch" };
    }
    let readBack: Buffer;
    try {
      readBack = this.artifactStore.read(stored.artifactRef, stored.digest);
    } catch {
      return { ok: false, message: "A1 artifact read-back failed" };
    }
    if (sha256Hex(readBack) !== built.digestSha256 || readBack.length !== built.sizeBytes) {
      return { ok: false, message: "A1 artifact read-back digest mismatch" };
    }
    const parsed = parseLoopGovernanceTailResultBytes(readBack, this.maxA1Bytes);
    if (parsed.ok === false) {
      return { ok: false, message: "A1 artifact read-back parse failed" };
    }
    if (!deepFrozenEqual(parsed.value, built.value)) {
      return { ok: false, message: "A1 canonical value comparison mismatch" };
    }
    return { ok: true, value: { artifactRef: stored.artifactRef, value: parsed.value } };
  }

  private async postTailInspect(
    state: CoordinatorInternalState,
    a1Value: Readonly<LoopGovernanceTailResult>,
  ): Promise<{ ok: true; value: LoopGitWorkspaceSnapshot } | { ok: false; message: string }> {
    let snapshot: LoopGitWorkspaceSnapshot;
    try {
      snapshot = await this.workspaceManager.inspect(state.identity);
    } catch {
      return { ok: false, message: "post-tail workspace inspect failed" };
    }
    const fw = a1Value.final_workspace;
    if (snapshot.workspacePath !== fw.workspace_path || snapshot.taskBranch !== fw.task_branch
      || snapshot.taskHeadSha !== fw.task_head_sha || snapshot.taskStatusDigestSha256 !== fw.status_digest_sha256
      || snapshot.taskHasChanges !== fw.task_has_changes) {
      return { ok: false, message: "post-tail workspace does not match the A1 final workspace" };
    }
    if (snapshot.baseDrifted || snapshot.currentBaseSha !== state.identity.expectedBaseSha) {
      return { ok: false, message: "post-tail workspace base drifted" };
    }
    return { ok: true, value: snapshot };
  }

  /** F-007: publish read-back binds the FULL verified chain via producer-owned parser options. */
  private async readAndParsePublishResult(
    state: CoordinatorInternalState,
    publishRef: string,
    expected: Readonly<{
      expectedOrchestrationResultArtifactRef: string;
      expectedExecutorInputArtifactRef: string;
      expectedDeliveryResultArtifactRef: string;
      expectedGovernanceTailResultArtifactRef: string;
      expectedImplementationFiles: readonly string[];
      expectedFiles: readonly string[];
    }>,
  ): Promise<{ ok: true; value: LoopParsedPublishResult } | { ok: false; status: "blocked"; reasonCode: LoopProductionCoordinatorReasonCode; message: string }> {
    const refDigest = REF_RE.exec(publishRef)![2]!;
    let bytes: Buffer;
    try {
      bytes = this.artifactStore.read(publishRef, refDigest);
    } catch {
      return { ok: false, status: "blocked", reasonCode: "PUBLISH_READBACK_AMBIGUOUS", message: "publish result artifact read failed" };
    }
    if (sha256Hex(bytes) !== refDigest || bytes.length > this.maxPublishResultBytes) {
      return { ok: false, status: "blocked", reasonCode: "PUBLISH_READBACK_AMBIGUOUS", message: "publish result artifact digest mismatch" };
    }
    const parsed: LoopD07ParseResult<LoopParsedPublishResult> = parseLoopDeliveryPublishResultBytes(bytes, {
      maxBytes: this.maxPublishResultBytes,
      expectedMode: "governed",
      expectedOrchestrationResultArtifactRef: expected.expectedOrchestrationResultArtifactRef,
      expectedExecutorInputArtifactRef: expected.expectedExecutorInputArtifactRef,
      expectedDeliveryResultArtifactRef: expected.expectedDeliveryResultArtifactRef,
      expectedGovernanceTailResultArtifactRef: expected.expectedGovernanceTailResultArtifactRef,
      expectedImplementationFiles: expected.expectedImplementationFiles,
      expectedFiles: expected.expectedFiles,
    });
    if (parsed.ok === false) {
      return { ok: false, status: "blocked", reasonCode: "PUBLISH_READBACK_AMBIGUOUS", message: `publish result artifact parse failed (${parsed.reason})` };
    }
    return { ok: true, value: parsed.value };
  }

  /**
   * F-007: persisted publish facts must agree with the in-memory D07 result
   * on every available commit/push/PR fact. Any mismatch is
   * `PUBLISH_READBACK_AMBIGUOUS` — never a success, never a fresh replay.
   */
  private publishReadbackFactMismatch(
    publishValue: Readonly<LoopParsedPublishResult>,
    publishResult: LoopDeliveryPublishResult,
  ): string | null {
    const fields: Array<[string, unknown, unknown]> = [
      ["status", publishValue.status, publishResult.status],
      ["reasonCode", publishValue.reasonCode, publishResult.reasonCode],
      ["recoveryStage", publishValue.recoveryStage, publishResult.recoveryStage],
      ["deliveryResultArtifactRef", publishValue.deliveryResultArtifactRef, publishResult.deliveryResultArtifactRef],
      ["governanceTailResultArtifactRef", publishValue.governanceTailResultArtifactRef ?? null, publishResult.governanceTailResultArtifactRef ?? null],
      ["publishIntentArtifactRef", publishValue.publishIntentArtifactRef ?? null, publishResult.publishIntentArtifactRef ?? null],
      ["precommitHeadSha", publishValue.precommitHeadSha ?? null, publishResult.precommitHeadSha ?? null],
      ["commitSha", publishValue.commitSha ?? null, publishResult.commitSha ?? null],
      ["remoteBranchSha", publishValue.remoteBranchSha ?? null, publishResult.remoteBranchSha ?? null],
      ["prNumber", publishValue.prNumber ?? null, publishResult.prNumber ?? null],
      ["prUrl", publishValue.prUrl ?? null, publishResult.prUrl ?? null],
      ["commitCreated", publishValue.commitCreated, publishResult.commitCreated],
      ["commitRecovered", publishValue.commitRecovered, publishResult.commitRecovered],
      ["pushCreated", publishValue.pushCreated, publishResult.pushCreated],
      ["pushRecovered", publishValue.pushRecovered, publishResult.pushRecovered],
      ["prCreated", publishValue.prCreated, publishResult.prCreated],
      ["prRecovered", publishValue.prRecovered, publishResult.prRecovered],
      ["prBodySha256", publishValue.prBodySha256 ?? null, publishResult.prBodySha256 ?? null],
    ];
    for (const [name, persisted, inMemory] of fields) {
      if (persisted !== inMemory) {
        return `persisted publish ${name} does not match the in-memory result`;
      }
    }
    if (!sameStringArray(publishValue.files, publishResult.files)) {
      return "persisted publish files do not match the in-memory result";
    }
    return null;
  }

  // ── deadline / clock ──

  private sampleClock(): number | null {
    let now: unknown;
    try {
      now = this.clock.nowMs();
    } catch {
      return null;
    }
    if (typeof now !== "number" || !Number.isFinite(now) || !Number.isSafeInteger(now) || now < 0) {
      return null;
    }
    return now;
  }

  private gate(state: CoordinatorInternalState): ClockGate {
    const now = this.sampleClock();
    if (now === null) {
      state.clockError = true;
      return "clock_invalid";
    }
    if (now < state.lastClockMs) {
      state.clockError = true;
      return "clock_invalid";
    }
    state.lastClockMs = now;
    if (now - state.startMs > state.maxTotalDurationMs) {
      state.deadlineExceeded = true;
      return "expired";
    }
    return "active";
  }

  private remainingMs(state: CoordinatorInternalState): number {
    return state.maxTotalDurationMs - (state.lastClockMs - state.startMs);
  }

  private elapsed(state: CoordinatorInternalState): number {
    return Math.max(0, state.lastClockMs - state.startMs);
  }

  private addTrace(state: CoordinatorInternalState, stage: LoopProductionCoordinatorTraceStage, outcome: string, artifactRef: string | null, elapsedMs: number): void {
    state.sequence += 1;
    state.trace.push(Object.freeze({
      sequence: state.sequence,
      stage,
      outcome,
      artifactRef,
      elapsedMs: Math.max(0, elapsedMs),
    }));
  }

  private deadlineTerminal(state: CoordinatorInternalState, gate: ClockGate): LoopProductionCoordinatorResult {
    const elapsed = this.elapsed(state);
    if (gate === "clock_invalid") {
      this.addTrace(state, "terminal", "failed", null, elapsed);
      return this.buildResult(state, "failed", "CLOCK_INVALID", "clock invalid", undefined, elapsed);
    }
    this.addTrace(state, "terminal", "failed", null, elapsed);
    return this.buildResult(state, "failed", "TOTAL_TIMEOUT", "total timeout reached", undefined, elapsed);
  }

  private terminalize(
    state: CoordinatorInternalState,
    status: LoopProductionCoordinatorStatus,
    reasonCode: LoopProductionCoordinatorReasonCode,
    message: string,
  ): LoopProductionCoordinatorResult {
    const elapsed = this.elapsed(state);
    this.addTrace(state, "terminal", status, null, elapsed);
    return this.buildResult(state, status, reasonCode, message, undefined, elapsed);
  }

  private zeroState(
    status: LoopProductionCoordinatorStatus,
    reasonCode: LoopProductionCoordinatorReasonCode,
    message: string,
    orchestrationRef: string,
  ): LoopProductionCoordinatorResult {
    // The caller request is NEVER re-read here (no getters / Proxy traps);
    // only the already-captured snapshot fact (or "") is surfaced.
    return deepFreeze({
      status,
      reasonCode,
      safeMessage: sanitizeSafeMessage(message),
      orchestrationResultArtifactRef: orchestrationRef,
      files: Object.freeze([]),
      elapsedMs: 0,
      trace: Object.freeze([]),
    }) as LoopProductionCoordinatorResult;
  }

  private buildResult(
    state: CoordinatorInternalState,
    status: LoopProductionCoordinatorStatus,
    reasonCode: LoopProductionCoordinatorReasonCode,
    message: string,
    causeCode: string | undefined,
    elapsedMs: number,
    facts?: Partial<Omit<LoopProductionCoordinatorResult, "status" | "reasonCode" | "safeMessage" | "causeCode" | "elapsedMs" | "trace">>,
  ): LoopProductionCoordinatorResult {
    const result: LoopProductionCoordinatorResult = {
      status,
      reasonCode,
      safeMessage: sanitizeSafeMessage(message),
      causeCode,
      orchestrationResultArtifactRef: state.orchestrationResultArtifactRef,
      files: Object.freeze(facts?.files ? [...facts.files] : []),
      elapsedMs: Math.max(0, elapsedMs),
      trace: Object.freeze([...state.trace]),
      ...(facts?.executorInputArtifactRef !== undefined ? { executorInputArtifactRef: facts.executorInputArtifactRef } : {}),
      ...(facts?.deliveryResultArtifactRef !== undefined ? { deliveryResultArtifactRef: facts.deliveryResultArtifactRef } : {}),
      ...(facts?.governanceTailResultArtifactRef !== undefined ? { governanceTailResultArtifactRef: facts.governanceTailResultArtifactRef } : {}),
      ...(facts?.publishResultArtifactRef !== undefined ? { publishResultArtifactRef: facts.publishResultArtifactRef } : {}),
      ...(facts?.commitSha !== undefined ? { commitSha: facts.commitSha } : {}),
      ...(facts?.prNumber !== undefined ? { prNumber: facts.prNumber } : {}),
      ...(facts?.prUrl !== undefined ? { prUrl: facts.prUrl } : {}),
      ...(facts?.finalGovernedWorkspace !== undefined ? { finalGovernedWorkspace: facts.finalGovernedWorkspace } : {}),
    };
    return deepFreeze(result);
  }

  // ── lossless D06 request mapping (deterministic canonical JSON) ──

  private executorRequirementText(executor: LoopDirectExecutorInput): string {
    return JSON.stringify({
      objective: executor.requirement.objective,
      acceptanceCriteria: [...executor.requirement.acceptanceCriteria],
      constraints: [...executor.requirement.constraints],
    });
  }

  private executorDesignSummaryText(executor: LoopDirectExecutorInput): string {
    return JSON.stringify({
      approach: executor.designSummary.approach,
      components: [...executor.designSummary.components],
      interfaces: [...executor.designSummary.interfaces],
      dataChanges: [...executor.designSummary.dataChanges],
      riskControls: [...executor.designSummary.riskControls],
    });
  }
}
