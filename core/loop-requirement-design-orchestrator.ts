// LOOP Executor Kernel — Requirement, Design and Direct-Path Orchestration (D08)
// ==============================================================================
// Standalone LOOP kernel orchestrator that:
//   1. Validates a natural-language single-repo requirement request
//      (fail-closed, exact-key, defensive snapshot before any dependency call).
//   2. Normalizes it through the injected agent into a canonical requirement
//      summary and persists it as a D01 artifact.
//   3. Routes deterministically: multi-repo pending / paused (ambiguity,
//      product decision, missing permission, high-risk acceptance) / speckit
//      pending (complex) / direct candidate. No fallback, no shadow success.
//   4. Direct path: bounded technical design rounds gated by the injected
//      solution reviewer (PASS / NEEDS_REVISION / BLOCKED, no fallback PASS).
//   5. Persists the canonical artifact chain through the injected D01 store:
//      requirement_summary → technical_design → solution_review →
//      executor_input → orchestration_result.
//   6. Produces the Direct Executor Input for D09 — losslessly mappable to
//      the current LoopAutonomousDeliveryRequest (never validated through
//      D06 here; D08 only plans and routes).
//
// No child_process, fs, Git, network, process.env, Runtime, Graph, Execution
// Gateway, global Agent registry, or D03/D05/D06/D07 calls. All dependencies
// are injected and all dependency outputs are treated as untrusted. The
// orchestrator is synchronous by contract; dependency exceptions are never
// propagated. Every path has exactly one terminal trace entry, and the
// terminal entry is always the last one.
//
// R1 hardening: stored-artifact descriptors are validated as untrusted plain
// data records (exact-key descriptor snapshot, strict ref/digest/size binding);
// every side effect is guarded by a fresh tri-state clock gate (active /
// expired / clock_invalid); the identity is captured once through a descriptor
// snapshot and never re-read from the original object; all external arrays
// are counted and byte-budgeted before any copy.
//
// R2 hardening: every untrusted array — request policy arrays and all agent /
// reviewer output arrays — is captured exactly once through a shared
// descriptor-snapshot scanner (own length data descriptor → item cap →
// ownKeys → per-index data descriptors) into a fresh plain snapshot; the
// original array is never read or returned afterwards, so Proxy traps and
// caller mutation cannot feed canonical data. Untrusted string budgets use a
// bounded UTF-8 counter that never materializes a full encoded copy and
// distinguishes invalid surrogates from over-budget.

import { createHash } from "node:crypto";
import type { LoopRunIdentity } from "./loop-executor-types";
import { validateLoopRunIdentity } from "./loop-run-state";
import type { LoopArtifactKind, LoopArtifactStore } from "./loop-artifact-store";
import type { LoopDeliveryCommandStep } from "./loop-autonomous-delivery-loop";

// ═══════════════════════════════════════ Types

export type LoopRequirementDesignRoute =
  | "direct"
  | "speckit_pending"
  | "multi_repo_pending"
  | "paused"
  | "blocked"
  | "failed";

export type LoopRequirementDesignReasonCode =
  | "DIRECT_READY"
  | "MULTI_REPOSITORY"
  | "AMBIGUITY_REQUIRES_INPUT"
  | "PRODUCT_DECISION_REQUIRED"
  | "PERMISSION_REQUIRED"
  | "HIGH_RISK_ACCEPTANCE_REQUIRED"
  | "COMPLEX_REQUIREMENT"
  | "DEPENDENCY_FAILED"
  | "DEPENDENCY_RESULT_INVALID"
  | "SOLUTION_REVIEW_BLOCKED"
  | "DESIGN_REVISION_EXHAUSTED"
  | "INVALID_INPUT"
  | "TOTAL_TIMEOUT"
  | "CLOCK_INVALID"
  | "ARTIFACT_STORE_FAILED"
  | "INTERNAL_ERROR";

export type LoopRequirementDesignTraceKind =
  | "normalization_started"
  | "requirement_stored"
  | "route_selected"
  | "design_started"
  | "design_stored"
  | "review_started"
  | "review_stored"
  | "executor_input_stored"
  | "orchestration_result_stored"
  | "terminal";

export interface LoopRequirementDesignTraceEntry {
  readonly sequence: number;
  readonly kind: LoopRequirementDesignTraceKind;
  readonly round: number;
  readonly outcome: string;
  readonly artifactRef: string | null;
  readonly elapsedMs: number;
}

/** Direct Executor Input consumed by D09 (losslessly mappable to LoopAutonomousDeliveryRequest). */
export interface LoopDirectExecutorInput {
  readonly schema: "loop_direct_executor_input_v1";
  readonly identity: LoopRunIdentity;
  readonly requirement: Readonly<{
    readonly objective: string;
    readonly acceptanceCriteria: readonly string[];
    readonly constraints: readonly string[];
  }>;
  readonly designSummary: Readonly<{
    readonly approach: string;
    readonly components: readonly string[];
    readonly interfaces: readonly string[];
    readonly dataChanges: readonly string[];
    readonly riskControls: readonly string[];
  }>;
  readonly implementationConstraints: readonly string[];
  readonly allowedPaths: readonly string[];
  readonly testPlan: readonly LoopDeliveryCommandStep[];
  readonly reviewPlan: readonly LoopDeliveryCommandStep[];
  readonly maxFixRounds: number;
  readonly maxTotalDurationMs: number;
  readonly commitSubject: string;
  readonly prTitle: string;
}

export interface LoopRequirementDesignResult {
  readonly route: LoopRequirementDesignRoute;
  readonly reasonCode: LoopRequirementDesignReasonCode;
  readonly safeMessage: string;
  readonly designRounds: number;
  readonly requirementArtifactRef?: string;
  readonly designArtifactRefs: readonly string[];
  readonly solutionReviewArtifactRefs: readonly string[];
  readonly executorInputArtifactRef?: string;
  readonly orchestrationResultArtifactRef?: string;
  readonly executorInput?: LoopDirectExecutorInput;
  readonly elapsedMs: number;
  readonly trace: readonly LoopRequirementDesignTraceEntry[];
}

export interface LoopRequirementDesignOrchestratorOptions {
  readonly agent: Readonly<{
    normalize(input: unknown): unknown;
    design(input: unknown): unknown;
  }>;
  readonly reviewer: Readonly<{ review(input: unknown): unknown }>;
  readonly artifactStore: Pick<LoopArtifactStore, "put">;
  readonly clock?: Readonly<{ nowMs(): number }>;
}

interface ResolvedLimits {
  maxDesignRounds: number;
  maxTotalDurationMs: number;
  maxRequirementBytes: number;
  maxAgentOutputBytes: number;
  maxFixRounds: number;
  executorMaxTotalDurationMs: number;
}

interface CanonicalSummary {
  schema: string;
  title: string;
  objective: string;
  acceptanceCriteria: string[];
  constraints: string[];
  ambiguities: string[];
  productChoices: string[];
  missingPermissions: string[];
  riskFlags: string[];
  repositoryScope: string;
  complexity: string;
  requestedSideEffects: string[];
}

interface CanonicalDesign {
  schema: string;
  approach: string;
  components: string[];
  interfaces: string[];
  dataChanges: string[];
  allowedPaths: string[];
  implementationConstraints: string[];
  testPlan: LoopDeliveryCommandStep[];
  reviewPlan: LoopDeliveryCommandStep[];
  riskControls: string[];
  commitSubject: string;
  prTitle: string;
}

interface CanonicalReview {
  schema: string;
  status: "PASS" | "NEEDS_REVISION" | "BLOCKED";
  findings: unknown[];
  directPathEligible: boolean;
}

// ═══════════════════════════════════════ Constants

const MAX_SAFE_MESSAGE = 256;
const STEP_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const EXEC_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const MAX_STEP_ARGS = 128;
const MAX_ARG_BYTES = 4096;
const MAX_ARGS_TOTAL_BYTES = 32768;
const MAX_PLAN_STEPS = 32;
const MIN_STEP_TIMEOUT_MS = 100;
const MAX_STEP_TIMEOUT_MS = 600000;
const MAX_STEP_OUTPUT_BYTES = 16777216;
const MAX_PATH_BYTES = 512;
const MAX_ALLOWED_ROOTS = 64;
const MAX_DENIED_PATHS = 64;
const MAX_EXEC_IDS = 32;
const MAX_DESIGN_ALLOWED_PATHS = 128;
const MAX_FINDING_DEPTH = 64;
const MAX_FINDING_NODES = 10000;
const MAX_OUTPUT_STRING_ARRAY_ITEMS = 256;
const MAX_REVIEW_FINDINGS = 256;
const SHA256_HEX_RE = /^[0-9a-f]{64}$/;

const IDENTITY_KEYS = [
  "runId", "requirementId", "repository", "repositoryPath", "baseBranch",
  "expectedBaseSha", "taskBranch", "controlRoot", "createdAt",
];
const DESCRIPTOR_KEYS = ["artifactRef", "kind", "digest", "sizeBytes"];

const DEFAULT_MAX_DESIGN_ROUNDS = 2;
const MIN_MAX_DESIGN_ROUNDS = 1;
const DEFAULT_MAX_TOTAL_DURATION_MS = 120000;
const MIN_MAX_TOTAL_DURATION_MS = 1000;
const MAX_MAX_TOTAL_DURATION_MS = 600000;
const DEFAULT_MAX_REQUIREMENT_BYTES = 65536;
const MIN_MAX_REQUIREMENT_BYTES = 1;
const MAX_MAX_REQUIREMENT_BYTES = 262144;
const DEFAULT_MAX_AGENT_OUTPUT_BYTES = 131072;
const MIN_MAX_AGENT_OUTPUT_BYTES = 1;
const MAX_MAX_AGENT_OUTPUT_BYTES = 1048576;
const DEFAULT_MAX_FIX_ROUNDS = 4;
const MIN_MAX_FIX_ROUNDS = 0;
const MAX_MAX_FIX_ROUNDS = 4;
const DEFAULT_EXECUTOR_MAX_TOTAL_DURATION_MS = 1800000;
const MIN_EXECUTOR_MAX_TOTAL_DURATION_MS = 1000;
const MAX_EXECUTOR_MAX_TOTAL_DURATION_MS = 3600000;

const OPTION_KEYS = ["agent", "reviewer", "artifactStore", "clock"];
const REQUEST_KEYS = ["identity", "rawRequirement", "pathPolicy", "commandPolicy", "limits"];
const PATH_POLICY_KEYS = ["allowedRoots", "deniedPaths"];
const COMMAND_POLICY_KEYS = ["allowedExecutableIds"];
const LIMITS_KEYS = [
  "maxDesignRounds", "maxTotalDurationMs", "maxRequirementBytes",
  "maxAgentOutputBytes", "maxFixRounds", "executorMaxTotalDurationMs",
];
const SUMMARY_KEYS = [
  "schema", "title", "objective", "acceptanceCriteria", "constraints",
  "ambiguities", "productChoices", "missingPermissions", "riskFlags",
  "repositoryScope", "complexity", "requestedSideEffects",
];
const DESIGN_KEYS = [
  "schema", "approach", "components", "interfaces", "dataChanges",
  "allowedPaths", "implementationConstraints", "testPlan", "reviewPlan",
  "riskControls", "commitSubject", "prTitle",
];
const REVIEW_KEYS = ["schema", "status", "findings", "directPathEligible"];
const STEP_KEYS = ["id", "executableId", "args", "timeoutMs", "maxStdoutBytes", "maxStderrBytes"];

const RISK_FLAGS = [
  "credential_required", "security_sensitive", "data_migration",
  "external_system_change", "high_risk_acceptance_required", "irreversible_side_effect",
];
const REQUESTED_SIDE_EFFECTS = [
  "source_change", "commit", "push", "pull_request", "external_system", "irreversible",
];
const SUMMARY_STRING_ARRAY_FIELDS = [
  "acceptanceCriteria", "constraints", "ambiguities", "productChoices", "missingPermissions",
];
const DESIGN_STRING_ARRAY_FIELDS = [
  "components", "interfaces", "dataChanges", "riskControls", "implementationConstraints",
];

const NON_CONTROL_RE = /[\x00-\x1f\x7f-\x9f]/;
const NUL = "\x00";
const LONE_SURROGATE_RE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

// ═══════════════════════════════════════ Helpers

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

type Utf8BudgetResult =
  | { status: "valid"; bytes: number }
  | { status: "over_budget" }
  | { status: "invalid_surrogate" };

/**
 * Bounded UTF-8 byte counter. Walks UTF-16 code units directly and never
 * materializes an encoded copy: ASCII counts 1, U+0080..U+07FF counts 2,
 * non-surrogate U+0800..U+FFFF counts 3, a valid surrogate pair counts 4
 * (the consumed low surrogate is skipped). A lone high/low surrogate is
 * invalid. Counting stops as soon as the remaining budget would be exceeded
 * and the addition is only performed when the next unit provably fits, so
 * the accumulator can never overflow.
 */
function countUtf8Budgeted(s: string, remaining: number): Utf8BudgetResult {
  let bytes = 0;
  for (let i = 0; i < s.length; i++) {
    const unit = s.charCodeAt(i);
    let add: number;
    if (unit < 0x80) {
      add = 1;
    } else if (unit < 0x800) {
      add = 2;
    } else if (unit >= 0xd800 && unit <= 0xdbff) {
      if (i + 1 >= s.length) return { status: "invalid_surrogate" };
      const low = s.charCodeAt(i + 1);
      if (low < 0xdc00 || low > 0xdfff) return { status: "invalid_surrogate" };
      add = 4;
      i += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return { status: "invalid_surrogate" };
    } else {
      add = 3;
    }
    if (add > remaining - bytes) return { status: "over_budget" };
    bytes += add;
  }
  return { status: "valid", bytes };
}

/**
 * Charges the bounded UTF-8 length of every given string against the output
 * budget. Returns the total charged bytes, or null when any string is
 * invalid (lone surrogate) or exceeds the remaining budget.
 */
function chargeUtf8(strings: readonly string[], budget: OutputBudget): number | null {
  let total = 0;
  for (const s of strings) {
    const counted = countUtf8Budgeted(s, budget.bytes);
    if (counted.status !== "valid") return null;
    budget.bytes -= counted.bytes;
    total += counted.bytes;
  }
  return total;
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function safeMessage(msg: string): string {
  return msg.replace(NON_CONTROL_RE, " ").slice(0, MAX_SAFE_MESSAGE);
}

function deepFreeze<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item);
    return Object.freeze(value) as unknown as T;
  }
  for (const key of Object.keys(value as Record<string, unknown>)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return Object.freeze(value) as unknown as T;
}

/**
 * No-throw untrusted array classification (R3). Array.isArray on a revoked
 * Proxy throws a TypeError; untrusted values must never make that exception
 * observable. Returns the classification only — "array", "non_array" or
 * "unclassifiable" when Array.isArray itself threw — and never propagates or
 * leaks the original exception, and never guesses via instanceof, constructor
 * or prototype chains.
 */
type ArrayClass = "array" | "non_array" | "unclassifiable";

function classifyArray(v: unknown): ArrayClass {
  try {
    return Array.isArray(v) ? "array" : "non_array";
  } catch {
    return "unclassifiable";
  }
}

/**
 * Plain-object scan with an exact key allowlist. Rejects arrays, non-plain
 * prototypes, symbol/__proto__ keys, accessors, missing descriptors and any
 * reflection that throws (Proxy traps). Produces a fresh null-prototype
 * record with non-configurable, non-writable data properties.
 */
function scanPlain(v: unknown, allowed: readonly string[], label: string): Record<string, unknown> {
  if (v === null || typeof v !== "object") {
    throw new Error(`${label} must be an object`);
  }
  if (classifyArray(v) !== "non_array") {
    throw new Error(`${label} must not be an array`);
  }
  let proto: unknown;
  try { proto = Object.getPrototypeOf(v); } catch {
    throw new Error(`${label} getPrototypeOf threw`);
  }
  if (proto !== Object.prototype && proto !== null) {
    throw new Error(`${label} has bad prototype`);
  }
  let keys: Array<string | symbol>;
  try { keys = Reflect.ownKeys(v) as Array<string | symbol>; } catch {
    throw new Error(`${label} ownKeys threw`);
  }
  const out = Object.create(null) as Record<string, unknown>;
  for (const k of keys) {
    if (typeof k === "symbol") throw new Error(`${label} has symbol key`);
    if (k === "__proto__") throw new Error(`${label} has __proto__ key`);
    if (!allowed.includes(k)) throw new Error(`${label} has unknown key`);
    let desc: PropertyDescriptor;
    try { desc = Object.getOwnPropertyDescriptor(v, k)!; } catch {
      throw new Error(`${label} getDescriptor threw`);
    }
    if (!desc) throw new Error(`${label} missing descriptor`);
    if ("get" in desc || "set" in desc) throw new Error(`${label} has accessor`);
    if (!("value" in desc)) throw new Error(`${label} no value`);
    Object.defineProperty(out, k, {
      value: desc.value, writable: false, enumerable: true, configurable: false,
    });
  }
  return out;
}

/**
 * Plain-record scan without a key allowlist (used for reviewer findings).
 * Rejects arrays, non-plain prototypes, symbol/__proto__ keys, accessors,
 * missing descriptors and reflection throws.
 */
function scanPlainRecord(v: unknown, label: string): Record<string, unknown> {
  if (v === null || typeof v !== "object") {
    throw new Error(`${label} must be an object`);
  }
  if (classifyArray(v) !== "non_array") {
    throw new Error(`${label} must not be an array`);
  }
  let proto: unknown;
  try { proto = Object.getPrototypeOf(v); } catch {
    throw new Error(`${label} getPrototypeOf threw`);
  }
  if (proto !== Object.prototype && proto !== null) {
    throw new Error(`${label} has bad prototype`);
  }
  let keys: Array<string | symbol>;
  try { keys = Reflect.ownKeys(v) as Array<string | symbol>; } catch {
    throw new Error(`${label} ownKeys threw`);
  }
  const out = Object.create(null) as Record<string, unknown>;
  for (const k of keys) {
    if (typeof k === "symbol") throw new Error(`${label} has symbol key`);
    if (k === "__proto__") throw new Error(`${label} has __proto__ key`);
    let desc: PropertyDescriptor;
    try { desc = Object.getOwnPropertyDescriptor(v, k)!; } catch {
      throw new Error(`${label} getDescriptor threw`);
    }
    if (!desc) throw new Error(`${label} missing descriptor`);
    if ("get" in desc || "set" in desc) throw new Error(`${label} has accessor`);
    if (!("value" in desc)) throw new Error(`${label} no value`);
    Object.defineProperty(out, k, {
      value: desc.value, writable: false, enumerable: true, configurable: false,
    });
  }
  return out;
}

/**
 * Shared untrusted external-array scanner (R2). Captures the array exactly
 * once through property descriptors in a fixed order — own length data
 * descriptor → item cap → ownKeys → per-index data descriptors — and returns
 * a fresh plain snapshot array built exclusively from descriptor values.
 * The original array is never read afterwards (no length/get/has/iteration
 * on it) and never returned, so Proxy get/has traps and later caller
 * mutation can never feed canonical data. The snapshot is only returned when
 * it is complete: any reflection throw, accessor, hole, non-canonical index,
 * extra/symbol key, or over-cap length fails closed with no partial snapshot.
 * Legal plain and frozen arrays keep working; prototype-chain numeric
 * properties are irrelevant because only own descriptors are consulted.
 */
type ArrayScanResult =
  | { ok: true; values: unknown[]; length: number }
  | { ok: false };

function scanExternalArray(v: unknown, itemCap: number): ArrayScanResult {
  if (classifyArray(v) !== "array") return { ok: false };
  // Compile-time narrowing only — the classification above is the sole
  // authority; no instanceof/constructor/prototype guessing happens here.
  const arr = v as unknown[];
  let lengthDesc: PropertyDescriptor | undefined;
  try {
    lengthDesc = Reflect.getOwnPropertyDescriptor(arr, "length");
  } catch {
    return { ok: false };
  }
  if (!lengthDesc || "get" in lengthDesc || "set" in lengthDesc || !("value" in lengthDesc)) {
    return { ok: false };
  }
  const length = lengthDesc.value;
  if (typeof length !== "number" || !Number.isSafeInteger(length) || length < 0) {
    return { ok: false };
  }
  // Item cap strictly before ownKeys: over-cap arrays are rejected without
  // any ownKeys call or index read.
  if (length > itemCap) return { ok: false };
  let keys: Array<string | symbol>;
  try { keys = Reflect.ownKeys(arr); } catch {
    return { ok: false };
  }
  const snapshot: unknown[] = new Array(length);
  let indexCount = 0;
  for (const k of keys) {
    if (k === "length") {
      // The canonical array length is an own non-configurable data property;
      // a Proxy must report a matching plain data descriptor or fail closed.
      let desc: PropertyDescriptor | undefined;
      try { desc = Reflect.getOwnPropertyDescriptor(arr, k); } catch {
        return { ok: false };
      }
      if (!desc || "get" in desc || "set" in desc || !("value" in desc) ||
          desc.value !== length || desc.configurable !== false) {
        return { ok: false };
      }
      continue;
    }
    if (typeof k !== "string") return { ok: false };
    const idx = Number(k);
    if (!Number.isSafeInteger(idx) || idx < 0 || idx >= length || String(idx) !== k) {
      return { ok: false };
    }
    let desc: PropertyDescriptor | undefined;
    try { desc = Reflect.getOwnPropertyDescriptor(arr, k); } catch {
      return { ok: false };
    }
    if (!desc || "get" in desc || "set" in desc || !("value" in desc)) return { ok: false };
    snapshot[idx] = desc.value;
    indexCount += 1;
  }
  // Every canonical index 0..length-1 must be an own property; sparse arrays
  // (including prototype-filled holes) can never satisfy this and fail here.
  if (indexCount !== length) return { ok: false };
  return { ok: true, values: snapshot, length };
}

/** Remaining output byte budget shared by all validators of one dependency output. */
interface OutputBudget { bytes: number }

/** Descriptor snapshot verified against a canonical loop-artifact:v1 binding. */
interface VerifiedStoredDescriptor {
  artifactRef: string;
  kind: LoopArtifactKind;
  digest: string;
  sizeBytes: number;
}

/**
 * Strict stored-artifact descriptor validation. The put return value is
 * completely untrusted: it is scanned through property descriptors into a
 * fresh plain record and never re-read afterwards. Only an exact
 * kind/digest/size/ref binding — ref strictly equal to
 * loop-artifact:v1:<kind>:sha256:<digest> — is accepted.
 */
function verifyStoredDescriptor(
  stored: unknown,
  expectedKind: LoopArtifactKind,
  expectedDigest: string,
  expectedSizeBytes: number,
): VerifiedStoredDescriptor | null {
  let rec: Record<string, unknown>;
  try {
    rec = scanPlain(stored, DESCRIPTOR_KEYS, "stored artifact descriptor");
  } catch {
    return null;
  }
  for (const key of DESCRIPTOR_KEYS) {
    if (!(key in rec)) return null;
  }
  if (rec.kind !== expectedKind) return null;
  const digest = rec.digest;
  if (typeof digest !== "string" || !SHA256_HEX_RE.test(digest) || digest !== expectedDigest) return null;
  const sizeBytes = rec.sizeBytes;
  if (typeof sizeBytes !== "number" || !Number.isSafeInteger(sizeBytes) || sizeBytes < 0) return null;
  if (sizeBytes !== expectedSizeBytes) return null;
  const artifactRef = rec.artifactRef;
  if (typeof artifactRef !== "string" || NON_CONTROL_RE.test(artifactRef)) return null;
  if (artifactRef !== `loop-artifact:v1:${expectedKind}:sha256:${expectedDigest}`) return null;
  return { artifactRef, kind: rec.kind as LoopArtifactKind, digest, sizeBytes };
}

/**
 * Bounded JSON-safe value scan with cycle protection (depth cap + node
 * budget) and an output byte budget charged for finding keys and string
 * values. Validates untrusted reviewer finding values through the shared
 * descriptor-snapshot scanner and REBUILDS them into fresh records/arrays,
 * so the canonical review retains no reference to any external array or
 * object (Proxy traps and caller mutation can never reach it afterwards).
 * Returns undefined for any invalid value (never a partial canonical copy).
 */
function canonicalizeJsonSafeValue(
  v: unknown, depth: number, budget: { nodes: number; bytes: number },
): unknown | undefined {
  if (v === null || typeof v === "boolean") return v;
  if (typeof v === "string") {
    const counted = countUtf8Budgeted(v, budget.bytes);
    if (counted.status !== "valid") return undefined;
    budget.bytes -= counted.bytes;
    return v;
  }
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  // R3: revoked Proxy values are unclassifiable and fail closed here — they
  // can never be treated as an array or record and never escape.
  const kind = classifyArray(v);
  if (kind === "unclassifiable") return undefined;
  if (kind === "array") {
    if (depth >= MAX_FINDING_DEPTH) return undefined;
    const scanned = scanExternalArray(v, MAX_FINDING_NODES);
    if (!scanned.ok) return undefined;
    const out: unknown[] = new Array(scanned.length);
    for (let i = 0; i < scanned.length; i++) {
      budget.nodes -= 1;
      if (budget.nodes < 0) return undefined;
      const item = canonicalizeJsonSafeValue(scanned.values[i], depth + 1, budget);
      if (item === undefined) return undefined;
      out[i] = item;
    }
    return out;
  }
  if (typeof v === "object") {
    if (depth >= MAX_FINDING_DEPTH) return undefined;
    let rec: Record<string, unknown>;
    try { rec = scanPlainRecord(v, "finding value"); } catch { return undefined; }
    const out: Record<string, unknown> = Object.create(null);
    for (const key of Object.keys(rec)) {
      budget.nodes -= 1;
      if (budget.nodes < 0) return undefined;
      const keyCounted = countUtf8Budgeted(key, budget.bytes);
      if (keyCounted.status !== "valid") return undefined;
      budget.bytes -= keyCounted.bytes;
      const item = canonicalizeJsonSafeValue(rec[key], depth + 1, budget);
      if (item === undefined) return undefined;
      out[key] = item;
    }
    return out;
  }
  // functions, symbols, undefined
  return undefined;
}

function validateInt(
  value: unknown, min: number, max: number, defaultVal: number, label: string,
): { ok: true; value: number } | { ok: false; reason: string } {
  if (value === undefined) return { ok: true, value: defaultVal };
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    return { ok: false, reason: `${label} out of range` };
  }
  return { ok: true, value };
}

function validateRepoRelativePath(v: unknown, label: string): { ok: true; value: string } | { ok: false; reason: string } {
  if (typeof v !== "string") return { ok: false, reason: `${label} must be a string` };
  if (v.length === 0) return { ok: false, reason: `${label} must be non-empty` };
  // R3: the bounded UTF-8 budget runs before any scale-dependent work — trim,
  // split and segment allocation — so oversized or invalid-surrogate inputs
  // fail without materializing a trimmed copy or a segment array. The counter
  // itself never materializes an encoded copy of the input.
  const counted = countUtf8Budgeted(v, MAX_PATH_BYTES);
  if (counted.status === "over_budget") return { ok: false, reason: `${label} exceeds the byte limit` };
  if (counted.status === "invalid_surrogate") return { ok: false, reason: `${label} contains invalid UTF-16` };
  if (v !== v.trim()) return { ok: false, reason: `${label} must be trimmed` };
  if (v.startsWith("/")) return { ok: false, reason: `${label} must be repository-relative` };
  if (v.includes("\\")) return { ok: false, reason: `${label} must not contain backslash` };
  if (NON_CONTROL_RE.test(v)) return { ok: false, reason: `${label} contains control characters` };
  if (v.endsWith("/")) return { ok: false, reason: `${label} must not end with a slash` };
  for (const segment of v.split("/")) {
    if (segment.length === 0) return { ok: false, reason: `${label} has an empty segment` };
    if (segment === "." || segment === "..") return { ok: false, reason: `${label} has a dot segment` };
  }
  return { ok: true, value: v };
}

function validatePathPolicy(v: unknown): { ok: true; allowedRoots: string[]; deniedPaths: string[] } | { ok: false; reason: string } {
  let rec: Record<string, unknown>;
  try { rec = scanPlain(v, PATH_POLICY_KEYS, "pathPolicy"); } catch {
    return { ok: false, reason: "pathPolicy invalid" };
  }
  // Nested arrays are captured through the shared descriptor-snapshot
  // scanner; no plain length/index read, `in`, spread or iteration ever
  // touches the original arrays, and no reflection error can escape.
  const rootsScanned = scanExternalArray(rec.allowedRoots, MAX_ALLOWED_ROOTS);
  if (!rootsScanned.ok) return { ok: false, reason: "pathPolicy.allowedRoots must be an array" };
  if (rootsScanned.length < 1) {
    return { ok: false, reason: "pathPolicy.allowedRoots count out of range" };
  }
  const deniedScanned = scanExternalArray(rec.deniedPaths, MAX_DENIED_PATHS);
  if (!deniedScanned.ok) return { ok: false, reason: "pathPolicy.deniedPaths must be an array" };
  const allowedRoots: string[] = [];
  const seenAllowed = new Set<string>();
  for (let i = 0; i < rootsScanned.length; i++) {
    const r = validateRepoRelativePath(rootsScanned.values[i], `pathPolicy.allowedRoots[${i}]`);
    if (!r.ok) return { ok: false, reason: (r as { ok: false; reason: string }).reason };
    if (seenAllowed.has(r.value)) return { ok: false, reason: "pathPolicy.allowedRoots must be unique" };
    seenAllowed.add(r.value);
    allowedRoots.push(r.value);
  }
  const deniedPaths: string[] = [];
  const seenDenied = new Set<string>();
  for (let i = 0; i < deniedScanned.length; i++) {
    const r = validateRepoRelativePath(deniedScanned.values[i], `pathPolicy.deniedPaths[${i}]`);
    if (!r.ok) return { ok: false, reason: (r as { ok: false; reason: string }).reason };
    if (seenDenied.has(r.value)) return { ok: false, reason: "pathPolicy.deniedPaths must be unique" };
    seenDenied.add(r.value);
    deniedPaths.push(r.value);
  }
  return { ok: true, allowedRoots, deniedPaths };
}

function validateCommandPolicy(v: unknown): { ok: true; allowedExecutableIds: string[] } | { ok: false; reason: string } {
  let rec: Record<string, unknown>;
  try { rec = scanPlain(v, COMMAND_POLICY_KEYS, "commandPolicy"); } catch {
    return { ok: false, reason: "commandPolicy invalid" };
  }
  const idsScanned = scanExternalArray(rec.allowedExecutableIds, MAX_EXEC_IDS);
  if (!idsScanned.ok) return { ok: false, reason: "commandPolicy.allowedExecutableIds must be an array" };
  if (idsScanned.length < 1) {
    return { ok: false, reason: "commandPolicy.allowedExecutableIds count out of range" };
  }
  const allowedExecutableIds: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < idsScanned.length; i++) {
    const id = idsScanned.values[i];
    if (typeof id !== "string" || !EXEC_ID_RE.test(id)) {
      return { ok: false, reason: `commandPolicy.allowedExecutableIds[${i}] invalid` };
    }
    if (seen.has(id)) return { ok: false, reason: "commandPolicy.allowedExecutableIds must be unique" };
    seen.add(id);
    allowedExecutableIds.push(id);
  }
  return { ok: true, allowedExecutableIds };
}

function validateLimits(v: unknown): { ok: true; limits: ResolvedLimits } | { ok: false; reason: string } {
  if (v === undefined) {
    return { ok: true, limits: (resolveLimits({}) as { ok: true; limits: ResolvedLimits }).limits };
  }
  let rec: Record<string, unknown>;
  try { rec = scanPlain(v, LIMITS_KEYS, "limits"); } catch {
    return { ok: false, reason: "limits invalid" };
  }
  const resolved = resolveLimits(rec);
  if (!resolved.ok) return { ok: false, reason: (resolved as { ok: false; reason: string }).reason };
  return { ok: true, limits: resolved.limits };
}

function resolveLimits(rec: Record<string, unknown>): { ok: true; limits: ResolvedLimits } | { ok: false; reason: string } {
  const maxDesignRounds = validateInt(rec.maxDesignRounds, MIN_MAX_DESIGN_ROUNDS, 2, DEFAULT_MAX_DESIGN_ROUNDS, "maxDesignRounds");
  if (!maxDesignRounds.ok) return { ok: false, reason: (maxDesignRounds as { ok: false; reason: string }).reason };
  const maxTotalDurationMs = validateInt(rec.maxTotalDurationMs, MIN_MAX_TOTAL_DURATION_MS, MAX_MAX_TOTAL_DURATION_MS, DEFAULT_MAX_TOTAL_DURATION_MS, "maxTotalDurationMs");
  if (!maxTotalDurationMs.ok) return { ok: false, reason: (maxTotalDurationMs as { ok: false; reason: string }).reason };
  const maxRequirementBytes = validateInt(rec.maxRequirementBytes, MIN_MAX_REQUIREMENT_BYTES, MAX_MAX_REQUIREMENT_BYTES, DEFAULT_MAX_REQUIREMENT_BYTES, "maxRequirementBytes");
  if (!maxRequirementBytes.ok) return { ok: false, reason: (maxRequirementBytes as { ok: false; reason: string }).reason };
  const maxAgentOutputBytes = validateInt(rec.maxAgentOutputBytes, MIN_MAX_AGENT_OUTPUT_BYTES, MAX_MAX_AGENT_OUTPUT_BYTES, DEFAULT_MAX_AGENT_OUTPUT_BYTES, "maxAgentOutputBytes");
  if (!maxAgentOutputBytes.ok) return { ok: false, reason: (maxAgentOutputBytes as { ok: false; reason: string }).reason };
  const maxFixRounds = validateInt(rec.maxFixRounds, MIN_MAX_FIX_ROUNDS, MAX_MAX_FIX_ROUNDS, DEFAULT_MAX_FIX_ROUNDS, "maxFixRounds");
  if (!maxFixRounds.ok) return { ok: false, reason: (maxFixRounds as { ok: false; reason: string }).reason };
  const executorMaxTotalDurationMs = validateInt(rec.executorMaxTotalDurationMs, MIN_EXECUTOR_MAX_TOTAL_DURATION_MS, MAX_EXECUTOR_MAX_TOTAL_DURATION_MS, DEFAULT_EXECUTOR_MAX_TOTAL_DURATION_MS, "executorMaxTotalDurationMs");
  if (!executorMaxTotalDurationMs.ok) return { ok: false, reason: (executorMaxTotalDurationMs as { ok: false; reason: string }).reason };
  return {
    ok: true,
    limits: {
      maxDesignRounds: maxDesignRounds.value,
      maxTotalDurationMs: maxTotalDurationMs.value,
      maxRequirementBytes: maxRequirementBytes.value,
      maxAgentOutputBytes: maxAgentOutputBytes.value,
      maxFixRounds: maxFixRounds.value,
      executorMaxTotalDurationMs: executorMaxTotalDurationMs.value,
    },
  };
}

function validateRawRequirement(v: unknown, maxBytes: number): { ok: true; value: string } | { ok: false; reason: string } {
  if (typeof v !== "string") return { ok: false, reason: "rawRequirement must be a string" };
  const trimmed = v.trim();
  if (trimmed.length === 0 || trimmed !== v) return { ok: false, reason: "rawRequirement must be trimmed non-empty" };
  if (v.includes(NUL)) return { ok: false, reason: "rawRequirement must not contain NUL" };
  if (LONE_SURROGATE_RE.test(v)) return { ok: false, reason: "rawRequirement must be valid UTF-8 text" };
  const counted = countUtf8Budgeted(v, maxBytes);
  if (counted.status !== "valid") return { ok: false, reason: "rawRequirement exceeds the byte limit" };
  return { ok: true, value: v };
}

function validateStringArray(
  v: unknown, label: string, budget: OutputBudget, maxItems: number,
): { ok: true; values: string[] } | { ok: false; reason: string } {
  const scanned = scanExternalArray(v, maxItems);
  if (!scanned.ok) return { ok: false, reason: `${label} must be a canonical array` };
  const values: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < scanned.length; i++) {
    const item = scanned.values[i]!;
    if (typeof item !== "string") return { ok: false, reason: `${label}[${i}] must be a string` };
    if (item.trim().length === 0) return { ok: false, reason: `${label}[${i}] must be non-empty` };
    if (NON_CONTROL_RE.test(item)) return { ok: false, reason: `${label}[${i}] contains control characters` };
    if (seen.has(item)) return { ok: false, reason: `${label} must be unique` };
    seen.add(item);
    const counted = countUtf8Budgeted(item, budget.bytes);
    if (counted.status === "invalid_surrogate") return { ok: false, reason: `${label}[${i}] contains invalid UTF-16` };
    if (counted.status === "over_budget") return { ok: false, reason: `${label} exceeds the output byte budget` };
    budget.bytes -= counted.bytes;
    values.push(item);
  }
  return { ok: true, values };
}

function validateEnumArray(
  v: unknown, label: string, allowed: readonly string[], budget: OutputBudget,
): { ok: true; values: string[] } | { ok: false; reason: string } {
  const scanned = scanExternalArray(v, MAX_OUTPUT_STRING_ARRAY_ITEMS);
  if (!scanned.ok) return { ok: false, reason: `${label} must be a canonical array` };
  const values: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < scanned.length; i++) {
    const item = scanned.values[i]!;
    if (typeof item !== "string") return { ok: false, reason: `${label}[${i}] must be a string` };
    if (item.trim().length === 0) return { ok: false, reason: `${label}[${i}] must be non-empty` };
    if (NON_CONTROL_RE.test(item)) return { ok: false, reason: `${label}[${i}] contains control characters` };
    if (!allowed.includes(item)) return { ok: false, reason: `${label}[${i}] is not a canonical value` };
    if (seen.has(item)) return { ok: false, reason: `${label} must be unique` };
    seen.add(item);
    const counted = countUtf8Budgeted(item, budget.bytes);
    if (counted.status === "invalid_surrogate") return { ok: false, reason: `${label}[${i}] contains invalid UTF-16` };
    if (counted.status === "over_budget") return { ok: false, reason: `${label} exceeds the output byte budget` };
    budget.bytes -= counted.bytes;
    values.push(item);
  }
  return { ok: true, values };
}

function validateRequirementSummary(v: unknown, budget: OutputBudget): { ok: true; summary: CanonicalSummary } | { ok: false; reason: string } {
  let rec: Record<string, unknown>;
  try { rec = scanPlain(v, SUMMARY_KEYS, "requirement summary"); } catch {
    return { ok: false, reason: "requirement summary malformed" };
  }
  if (rec.schema !== "loop_requirement_summary_v1") return { ok: false, reason: "requirement summary schema mismatch" };
  for (const field of ["title", "objective"] as const) {
    const value = rec[field];
    if (typeof value !== "string") return { ok: false, reason: `requirement summary ${field} must be a string` };
    if (value.trim().length === 0 || value !== value.trim()) {
      return { ok: false, reason: `requirement summary ${field} must be trimmed non-empty` };
    }
    const charged = chargeUtf8([value], budget);
    if (charged === null) return { ok: false, reason: `requirement summary ${field} exceeds the output byte budget` };
  }
  if (rec.repositoryScope !== "single_repository" && rec.repositoryScope !== "multi_repository") {
    return { ok: false, reason: "requirement summary repositoryScope invalid" };
  }
  if (rec.complexity !== "direct" && rec.complexity !== "complex") {
    return { ok: false, reason: "requirement summary complexity invalid" };
  }
  const fixedBytes = chargeUtf8([
    rec.schema as string, rec.repositoryScope as string, rec.complexity as string,
  ], budget);
  if (fixedBytes === null) return { ok: false, reason: "requirement summary exceeds the output byte budget" };
  const arrays: Record<string, string[]> = Object.create(null) as Record<string, string[]>;
  for (const field of SUMMARY_STRING_ARRAY_FIELDS) {
    const r = validateStringArray(rec[field], `requirement summary ${field}`, budget, MAX_OUTPUT_STRING_ARRAY_ITEMS);
    if (!r.ok) return { ok: false, reason: (r as { ok: false; reason: string }).reason };
    arrays[field] = r.values;
  }
  const riskFlagsResult = validateEnumArray(rec.riskFlags, "requirement summary riskFlags", RISK_FLAGS, budget);
  if (!riskFlagsResult.ok) return { ok: false, reason: (riskFlagsResult as { ok: false; reason: string }).reason };
  const requestedSideEffectsResult = validateEnumArray(rec.requestedSideEffects, "requirement summary requestedSideEffects", REQUESTED_SIDE_EFFECTS, budget);
  if (!requestedSideEffectsResult.ok) return { ok: false, reason: (requestedSideEffectsResult as { ok: false; reason: string }).reason };
  return {
    ok: true,
    summary: {
      schema: rec.schema as string,
      title: rec.title as string,
      objective: rec.objective as string,
      acceptanceCriteria: arrays.acceptanceCriteria,
      constraints: arrays.constraints,
      ambiguities: arrays.ambiguities,
      productChoices: arrays.productChoices,
      missingPermissions: arrays.missingPermissions,
      riskFlags: riskFlagsResult.values,
      repositoryScope: rec.repositoryScope as string,
      complexity: rec.complexity as string,
      requestedSideEffects: requestedSideEffectsResult.values,
    },
  };
}

function validatePlan(
  plan: unknown, label: string, allowedExecutableIds: Set<string>, budget: OutputBudget,
): { ok: true; plan: LoopDeliveryCommandStep[] } | { ok: false; reason: string } {
  const scanned = scanExternalArray(plan, MAX_PLAN_STEPS);
  if (!scanned.ok) return { ok: false, reason: `${label} must be a canonical array` };
  if (scanned.length < 1) {
    return { ok: false, reason: `${label} count out of range` };
  }
  const stepIds = new Set<string>();
  const validated: LoopDeliveryCommandStep[] = [];
  for (let i = 0; i < scanned.length; i++) {
    const stepValue = scanned.values[i];
    let scannedStep: Record<string, unknown>;
    try { scannedStep = scanPlain(stepValue, STEP_KEYS, `${label}[${i}]`); } catch {
      return { ok: false, reason: `${label}[${i}] step invalid` };
    }
    if (typeof scannedStep.id !== "string" || !STEP_ID_RE.test(scannedStep.id)) {
      return { ok: false, reason: `${label}[${i}].id invalid` };
    }
    if (stepIds.has(scannedStep.id)) return { ok: false, reason: `${label}[${i}].id duplicate` };
    stepIds.add(scannedStep.id);
    const idBytes = chargeUtf8([scannedStep.id as string], budget);
    if (idBytes === null) return { ok: false, reason: `${label}[${i}].id exceeds the output byte budget` };
    if (typeof scannedStep.executableId !== "string" || !allowedExecutableIds.has(scannedStep.executableId)) {
      return { ok: false, reason: `${label}[${i}].executableId not allowed` };
    }
    const executableIdBytes = chargeUtf8([scannedStep.executableId as string], budget);
    if (executableIdBytes === null) return { ok: false, reason: `${label}[${i}].executableId exceeds the output byte budget` };
    let args: string[] | undefined;
    if (scannedStep.args !== undefined) {
      const argsScanned = scanExternalArray(scannedStep.args, MAX_STEP_ARGS);
      if (!argsScanned.ok) {
        return { ok: false, reason: `${label}[${i}].args invalid` };
      }
      let totalBytes = 0;
      const argsCopy: string[] = [];
      for (let j = 0; j < argsScanned.length; j++) {
        const arg = argsScanned.values[j]!;
        if (typeof arg !== "string") return { ok: false, reason: `${label}[${i}].args[${j}] not a string` };
        if (arg.includes(NUL)) return { ok: false, reason: `${label}[${i}].args[${j}] contains NUL` };
        const argBytes = chargeUtf8([arg], budget);
        if (argBytes === null) return { ok: false, reason: `${label}[${i}].args exceeds the output byte budget` };
        if (argBytes > MAX_ARG_BYTES) return { ok: false, reason: `${label}[${i}].args[${j}] too long` };
        if (totalBytes > MAX_ARGS_TOTAL_BYTES - argBytes) return { ok: false, reason: `${label}[${i}].args total too large` };
        totalBytes += argBytes;
        argsCopy.push(arg);
      }
      args = argsCopy;
    }
    let timeoutMs: number | undefined;
    if (scannedStep.timeoutMs !== undefined) {
      const t = validateInt(scannedStep.timeoutMs, MIN_STEP_TIMEOUT_MS, MAX_STEP_TIMEOUT_MS, -1, `${label}[${i}].timeoutMs`);
      if (!t.ok || t.value < 0) return { ok: false, reason: `${label}[${i}].timeoutMs out of range` };
      timeoutMs = t.value;
    }
    let maxStdoutBytes: number | undefined;
    if (scannedStep.maxStdoutBytes !== undefined) {
      const s = validateInt(scannedStep.maxStdoutBytes, 1, MAX_STEP_OUTPUT_BYTES, -1, `${label}[${i}].maxStdoutBytes`);
      if (!s.ok || s.value < 0) return { ok: false, reason: `${label}[${i}].maxStdoutBytes out of range` };
      maxStdoutBytes = s.value;
    }
    let maxStderrBytes: number | undefined;
    if (scannedStep.maxStderrBytes !== undefined) {
      const s = validateInt(scannedStep.maxStderrBytes, 1, MAX_STEP_OUTPUT_BYTES, -1, `${label}[${i}].maxStderrBytes`);
      if (!s.ok || s.value < 0) return { ok: false, reason: `${label}[${i}].maxStderrBytes out of range` };
      maxStderrBytes = s.value;
    }
    validated.push({
      id: scannedStep.id as string,
      executableId: scannedStep.executableId as string,
      args,
      timeoutMs,
      maxStdoutBytes,
      maxStderrBytes,
    });
  }
  return { ok: true, plan: validated };
}

function pathIsWithin(root: string, path: string): boolean {
  return path === root || path.startsWith(root + "/");
}

function validateDesign(
  v: unknown, allowedRoots: readonly string[], deniedPaths: readonly string[],
  allowedExecutableIds: Set<string>, budget: OutputBudget,
): { ok: true; design: CanonicalDesign } | { ok: false; reason: string } {
  let rec: Record<string, unknown>;
  try { rec = scanPlain(v, DESIGN_KEYS, "technical design"); } catch {
    return { ok: false, reason: "technical design malformed" };
  }
  if (rec.schema !== "loop_technical_design_v1") return { ok: false, reason: "technical design schema mismatch" };
  if (typeof rec.approach !== "string" || rec.approach.trim().length === 0 || rec.approach !== rec.approach.trim()) {
    return { ok: false, reason: "technical design approach must be trimmed non-empty" };
  }
  const approachBytes = chargeUtf8([rec.approach as string], budget);
  if (approachBytes === null) return { ok: false, reason: "technical design approach exceeds the output byte budget" };
  const schemaBytes = chargeUtf8([rec.schema as string], budget);
  if (schemaBytes === null) return { ok: false, reason: "technical design exceeds the output byte budget" };
  const arrays: Record<string, string[]> = Object.create(null) as Record<string, string[]>;
  for (const field of DESIGN_STRING_ARRAY_FIELDS) {
    const r = validateStringArray(rec[field], `technical design ${field}`, budget, MAX_OUTPUT_STRING_ARRAY_ITEMS);
    if (!r.ok) return { ok: false, reason: (r as { ok: false; reason: string }).reason };
    arrays[field] = r.values;
  }
  const allowedPathsScanned = scanExternalArray(rec.allowedPaths, MAX_DESIGN_ALLOWED_PATHS);
  if (!allowedPathsScanned.ok || allowedPathsScanned.length < 1) {
    return { ok: false, reason: "technical design allowedPaths count out of range" };
  }
  const allowedPaths: string[] = [];
  const seenPaths = new Set<string>();
  for (let i = 0; i < allowedPathsScanned.length; i++) {
    const pathValue = allowedPathsScanned.values[i];
    const r = validateRepoRelativePath(pathValue, `technical design allowedPaths[${i}]`);
    if (!r.ok) return { ok: false, reason: (r as { ok: false; reason: string }).reason };
    const pathBytes = chargeUtf8([r.value], budget);
    if (pathBytes === null) return { ok: false, reason: "technical design allowedPaths exceeds the output byte budget" };
    if (seenPaths.has(r.value)) return { ok: false, reason: "technical design allowedPaths must be unique" };
    seenPaths.add(r.value);
    const path = r.value;
    // Denied paths take precedence: a path under a denied path is forbidden
    // even when it is also under an allowed root.
    if (deniedPaths.some((d) => pathIsWithin(d, path))) {
      return { ok: false, reason: `technical design allowedPaths[${i}] is denied` };
    }
    if (!allowedRoots.some((root) => pathIsWithin(root, path))) {
      return { ok: false, reason: `technical design allowedPaths[${i}] not under an allowed root` };
    }
    allowedPaths.push(path);
  }
  const testPlanResult = validatePlan(rec.testPlan, "testPlan", allowedExecutableIds, budget);
  if (!testPlanResult.ok) return { ok: false, reason: (testPlanResult as { ok: false; reason: string }).reason };
  const reviewPlanResult = validatePlan(rec.reviewPlan, "reviewPlan", allowedExecutableIds, budget);
  if (!reviewPlanResult.ok) return { ok: false, reason: (reviewPlanResult as { ok: false; reason: string }).reason };
  // D06 also requires step ids to be unique across both plans — enforce here so
  // the executor input maps losslessly to LoopAutonomousDeliveryRequest.
  const allIds = new Set<string>();
  for (const step of [...testPlanResult.plan, ...reviewPlanResult.plan]) {
    if (allIds.has(step.id)) return { ok: false, reason: "step id duplicated across plans" };
    allIds.add(step.id);
  }
  for (const field of ["commitSubject", "prTitle"] as const) {
    const value = rec[field];
    if (typeof value !== "string") return { ok: false, reason: `technical design ${field} must be a string` };
    if (value.trim().length === 0 || value !== value.trim()) {
      return { ok: false, reason: `technical design ${field} must be trimmed non-empty` };
    }
    if (NON_CONTROL_RE.test(value)) return { ok: false, reason: `technical design ${field} must be a single line` };
    const maxBytes = field === "commitSubject" ? 72 : 120;
    const fixedCounted = countUtf8Budgeted(value, maxBytes);
    if (fixedCounted.status !== "valid") return { ok: false, reason: `technical design ${field} exceeds the byte limit` };
    const fieldBytes = chargeUtf8([value], budget);
    if (fieldBytes === null) return { ok: false, reason: `technical design ${field} exceeds the output byte budget` };
  }
  return {
    ok: true,
    design: {
      schema: rec.schema as string,
      approach: rec.approach as string,
      components: arrays.components,
      interfaces: arrays.interfaces,
      dataChanges: arrays.dataChanges,
      allowedPaths,
      implementationConstraints: arrays.implementationConstraints,
      testPlan: testPlanResult.plan,
      reviewPlan: reviewPlanResult.plan,
      riskControls: arrays.riskControls,
      commitSubject: rec.commitSubject as string,
      prTitle: rec.prTitle as string,
    },
  };
}

function validateReview(v: unknown, budget: OutputBudget): { ok: true; review: CanonicalReview } | { ok: false; reason: string } {
  let rec: Record<string, unknown>;
  try { rec = scanPlain(v, REVIEW_KEYS, "solution review"); } catch {
    return { ok: false, reason: "solution review malformed" };
  }
  if (rec.schema !== "loop_solution_review_v1") return { ok: false, reason: "solution review schema mismatch" };
  if (rec.status !== "PASS" && rec.status !== "NEEDS_REVISION" && rec.status !== "BLOCKED") {
    return { ok: false, reason: "solution review status invalid" };
  }
  if (typeof rec.directPathEligible !== "boolean") {
    return { ok: false, reason: "solution review directPathEligible must be a boolean" };
  }
  const fixedBytes = chargeUtf8([rec.schema as string, rec.status as string], budget);
  if (fixedBytes === null) return { ok: false, reason: "solution review exceeds the output byte budget" };
  const findingsScanned = scanExternalArray(rec.findings, MAX_REVIEW_FINDINGS);
  if (!findingsScanned.ok) return { ok: false, reason: "solution review findings must be a canonical array" };
  const budget2 = { nodes: MAX_FINDING_NODES, bytes: budget.bytes };
  const findings: unknown[] = [];
  for (let i = 0; i < findingsScanned.length; i++) {
    budget2.nodes -= 1;
    if (budget2.nodes < 0) return { ok: false, reason: "solution review findings too large" };
    const findingValue = findingsScanned.values[i];
    let finding: Record<string, unknown>;
    try { finding = scanPlainRecord(findingValue, `solution review findings[${i}]`); } catch {
      return { ok: false, reason: "solution review findings item invalid" };
    }
    const canonical = canonicalizeJsonSafeValue(finding, 0, budget2);
    if (canonical === undefined) return { ok: false, reason: "solution review findings item invalid" };
    findings.push(canonical);
  }
  const status = rec.status as CanonicalReview["status"];
  const directPathEligible = rec.directPathEligible as boolean;
  // Consistency contract — any contradiction is malformed (no fallback PASS).
  if (status === "PASS") {
    if (directPathEligible !== true || findings.length !== 0) {
      return { ok: false, reason: "solution review PASS must have directPathEligible true and empty findings" };
    }
  } else if (status === "NEEDS_REVISION") {
    if (directPathEligible !== false || findings.length === 0) {
      return { ok: false, reason: "solution review NEEDS_REVISION must have directPathEligible false and findings" };
    }
  } else {
    if (directPathEligible !== false || findings.length === 0) {
      return { ok: false, reason: "solution review BLOCKED must have directPathEligible false and findings" };
    }
  }
  return { ok: true, review: { schema: rec.schema as string, status, findings, directPathEligible } };
}

// ═══════════════════════════════════════ Canonical payload builders

function canonicalIdentity(identity: object): Record<string, unknown> {
  const rec = identity as Record<string, unknown>;
  return {
    runId: rec.runId,
    requirementId: rec.requirementId,
    repository: rec.repository,
    repositoryPath: rec.repositoryPath,
    baseBranch: rec.baseBranch,
    expectedBaseSha: rec.expectedBaseSha,
    taskBranch: rec.taskBranch,
    controlRoot: rec.controlRoot,
    createdAt: rec.createdAt,
  };
}

function canonicalSummary(summary: CanonicalSummary): Record<string, unknown> {
  return {
    schema: summary.schema,
    title: summary.title,
    objective: summary.objective,
    acceptanceCriteria: [...summary.acceptanceCriteria],
    constraints: [...summary.constraints],
    ambiguities: [...summary.ambiguities],
    productChoices: [...summary.productChoices],
    missingPermissions: [...summary.missingPermissions],
    riskFlags: [...summary.riskFlags],
    repositoryScope: summary.repositoryScope,
    complexity: summary.complexity,
    requestedSideEffects: [...summary.requestedSideEffects],
  };
}

function canonicalDesign(design: CanonicalDesign): Record<string, unknown> {
  return {
    schema: design.schema,
    approach: design.approach,
    components: [...design.components],
    interfaces: [...design.interfaces],
    dataChanges: [...design.dataChanges],
    allowedPaths: [...design.allowedPaths],
    implementationConstraints: [...design.implementationConstraints],
    testPlan: design.testPlan.map((s) => ({
      id: s.id,
      executableId: s.executableId,
      args: s.args !== undefined ? [...s.args] : undefined,
      timeoutMs: s.timeoutMs,
      maxStdoutBytes: s.maxStdoutBytes,
      maxStderrBytes: s.maxStderrBytes,
    })),
    reviewPlan: design.reviewPlan.map((s) => ({
      id: s.id,
      executableId: s.executableId,
      args: s.args !== undefined ? [...s.args] : undefined,
      timeoutMs: s.timeoutMs,
      maxStdoutBytes: s.maxStdoutBytes,
      maxStderrBytes: s.maxStderrBytes,
    })),
    riskControls: [...design.riskControls],
    commitSubject: design.commitSubject,
    prTitle: design.prTitle,
  };
}

function canonicalReview(review: CanonicalReview): Record<string, unknown> {
  return {
    schema: review.schema,
    status: review.status,
    findings: deepFreeze([...review.findings]) as unknown as unknown[],
    directPathEligible: review.directPathEligible,
  };
}

function canonicalExecutorInput(
  input: LoopDirectExecutorInput,
): Record<string, unknown> {
  return {
    schema: input.schema,
    identity: canonicalIdentity(input.identity),
    requirement: {
      objective: input.requirement.objective,
      acceptanceCriteria: [...input.requirement.acceptanceCriteria],
      constraints: [...input.requirement.constraints],
    },
    designSummary: {
      approach: input.designSummary.approach,
      components: [...input.designSummary.components],
      interfaces: [...input.designSummary.interfaces],
      dataChanges: [...input.designSummary.dataChanges],
      riskControls: [...input.designSummary.riskControls],
    },
    implementationConstraints: [...input.implementationConstraints],
    allowedPaths: [...input.allowedPaths],
    testPlan: input.testPlan.map((s) => ({
      id: s.id,
      executableId: s.executableId,
      args: s.args !== undefined ? [...s.args] : undefined,
      timeoutMs: s.timeoutMs,
      maxStdoutBytes: s.maxStdoutBytes,
      maxStderrBytes: s.maxStderrBytes,
    })),
    reviewPlan: input.reviewPlan.map((s) => ({
      id: s.id,
      executableId: s.executableId,
      args: s.args !== undefined ? [...s.args] : undefined,
      timeoutMs: s.timeoutMs,
      maxStdoutBytes: s.maxStdoutBytes,
      maxStderrBytes: s.maxStderrBytes,
    })),
    maxFixRounds: input.maxFixRounds,
    maxTotalDurationMs: input.maxTotalDurationMs,
    commitSubject: input.commitSubject,
    prTitle: input.prTitle,
  };
}

function buildRequirementPayload(
  identity: LoopRunIdentity, rawRequirement: string, summary: CanonicalSummary,
): Uint8Array {
  const payload: Record<string, unknown> = Object.create(null);
  payload.schema = "loop_requirement_artifact_v1";
  payload.identity = canonicalIdentity(identity);
  payload.rawRequirementDigestSha256 = sha256Hex(utf8(rawRequirement));
  payload.requirement_summary = canonicalSummary(summary);
  return utf8(JSON.stringify(payload));
}

function buildDesignPayload(
  identity: LoopRunIdentity, requirementArtifactRef: string, round: number, design: CanonicalDesign,
): Uint8Array {
  const payload: Record<string, unknown> = Object.create(null);
  payload.schema = "loop_technical_design_artifact_v1";
  payload.identity = canonicalIdentity(identity);
  payload.requirementArtifactRef = requirementArtifactRef;
  payload.round = round;
  payload.design = canonicalDesign(design);
  return utf8(JSON.stringify(payload));
}

function buildReviewPayload(
  identity: LoopRunIdentity, designArtifactRef: string, round: number, review: CanonicalReview,
): Uint8Array {
  const payload: Record<string, unknown> = Object.create(null);
  payload.schema = "loop_solution_review_artifact_v1";
  payload.identity = canonicalIdentity(identity);
  payload.designArtifactRef = designArtifactRef;
  payload.round = round;
  payload.review = canonicalReview(review);
  return utf8(JSON.stringify(payload));
}

function buildOrchestrationResultPayload(
  identity: LoopRunIdentity,
  route: LoopRequirementDesignRoute,
  reasonCode: LoopRequirementDesignReasonCode,
  rounds: number,
  requirementArtifactRef: string | undefined,
  designArtifactRefs: readonly string[],
  solutionReviewArtifactRefs: readonly string[],
  executorInputArtifactRef: string | undefined,
  executorInputDigest: string | null,
  elapsedMs: number,
): Uint8Array {
  const payload: Record<string, unknown> = Object.create(null);
  payload.schema = "loop_requirement_orchestration_result_v1";
  payload.identity = canonicalIdentity(identity);
  payload.route = route;
  payload.reason_code = reasonCode;
  payload.rounds = rounds;
  payload.requirement_artifact_ref = requirementArtifactRef ?? null;
  payload.design_artifact_refs = [...designArtifactRefs];
  payload.solution_review_artifact_refs = [...solutionReviewArtifactRefs];
  payload.executor_input_artifact_ref = executorInputArtifactRef ?? null;
  payload.executor_input_digest_sha256 = executorInputDigest;
  payload.elapsed_ms = elapsedMs;
  return utf8(JSON.stringify(payload));
}

// ═══════════════════════════════════════ Route selection

function selectRoute(summary: CanonicalSummary): { route: LoopRequirementDesignRoute; reasonCode: LoopRequirementDesignReasonCode; message: string } {
  // 1. multi-repository takes the highest precedence.
  if (summary.repositoryScope === "multi_repository") {
    return { route: "multi_repo_pending", reasonCode: "MULTI_REPOSITORY", message: "multi-repository requirement pending" };
  }
  // 2. ambiguity requires human input.
  if (summary.ambiguities.length > 0) {
    return { route: "paused", reasonCode: "AMBIGUITY_REQUIRES_INPUT", message: "ambiguities require input" };
  }
  // 3. product decisions require human input.
  if (summary.productChoices.length > 0) {
    return { route: "paused", reasonCode: "PRODUCT_DECISION_REQUIRED", message: "product decisions require input" };
  }
  // 4. missing permissions require human input.
  if (summary.missingPermissions.length > 0) {
    return { route: "paused", reasonCode: "PERMISSION_REQUIRED", message: "permissions required" };
  }
  // 5. high-risk acceptance gates.
  if (
    summary.riskFlags.includes("credential_required") ||
    summary.riskFlags.includes("high_risk_acceptance_required") ||
    summary.riskFlags.includes("irreversible_side_effect") ||
    summary.requestedSideEffects.includes("irreversible")
  ) {
    return { route: "paused", reasonCode: "HIGH_RISK_ACCEPTANCE_REQUIRED", message: "high-risk acceptance required" };
  }
  // 6. complex requirements are routed to speckit (planned, never executed here).
  if (
    summary.complexity === "complex" ||
    summary.riskFlags.includes("security_sensitive") ||
    summary.riskFlags.includes("data_migration") ||
    summary.riskFlags.includes("external_system_change") ||
    summary.requestedSideEffects.includes("external_system")
  ) {
    return { route: "speckit_pending", reasonCode: "COMPLEX_REQUIREMENT", message: "complex requirement pending" };
  }
  // 7. everything else is a direct candidate.
  return { route: "direct", reasonCode: "DIRECT_READY", message: "direct execution input ready" };
}

// ═══════════════════════════════════════ Orchestrator

export class LoopRequirementDesignOrchestrator {
  private readonly agent: { normalize(input: unknown): unknown; design(input: unknown): unknown };
  private readonly reviewer: { review(input: unknown): unknown };
  private readonly artifactStore: Pick<LoopArtifactStore, "put">;
  private readonly clock: { nowMs(): number };

  constructor(options: LoopRequirementDesignOrchestratorOptions) {
    const opts = scanPlain(options, OPTION_KEYS, "options");
    const agent = opts.agent;
    if (!agent || typeof agent !== "object" ||
        typeof (agent as Record<string, unknown>).normalize !== "function" ||
        typeof (agent as Record<string, unknown>).design !== "function") {
      throw new Error("agent must provide normalize and design methods");
    }
    this.agent = agent as { normalize(input: unknown): unknown; design(input: unknown): unknown };
    const reviewer = opts.reviewer;
    if (!reviewer || typeof reviewer !== "object" ||
        typeof (reviewer as Record<string, unknown>).review !== "function") {
      throw new Error("reviewer must provide review method");
    }
    this.reviewer = reviewer as { review(input: unknown): unknown };
    const artifactStore = opts.artifactStore;
    if (!artifactStore || typeof artifactStore !== "object" ||
        typeof (artifactStore as Record<string, unknown>).put !== "function") {
      throw new Error("artifactStore must provide put method");
    }
    this.artifactStore = artifactStore as Pick<LoopArtifactStore, "put">;
    if (opts.clock !== undefined) {
      const clock = opts.clock;
      if (!clock || typeof clock !== "object" || typeof (clock as Record<string, unknown>).nowMs !== "function") {
        throw new Error("clock must provide nowMs method");
      }
      this.clock = clock as { nowMs(): number };
    } else {
      this.clock = { nowMs: () => Date.now() };
    }
  }

  execute(request: unknown): LoopRequirementDesignResult {
    // ═══════════════════════════════════════ per-execution state
    const trace: LoopRequirementDesignTraceEntry[] = [];
    let traceSeq = 0;
    let startMs = 0;
    let lastClockMs = -1;
    let designRounds = 0;
    let requirementStored = false;
    const designArtifactRefs: string[] = [];
    const solutionReviewArtifactRefs: string[] = [];
    let requirementArtifactRef: string | undefined;
    let executorInputArtifactRef: string | undefined;
    let executorInputDigest: string | null = null;
    let orchestrationResultArtifactRef: string | undefined;
    let executorInput: LoopDirectExecutorInput | undefined;
    let elapsedMs = 0;

    const addTrace = (
      kind: LoopRequirementDesignTraceKind, round: number, outcome: string, artifactRef: string | null,
    ): void => {
      traceSeq += 1;
      elapsedMs = Math.max(0, lastClockMs - startMs);
      trace.push({ sequence: traceSeq, kind, round, outcome, artifactRef, elapsedMs });
    };

    // Clock read — must be finite, nonnegative, safe integer and never go
    // backward. Returns null when valid, CLOCK_INVALID otherwise.
    const readClock = (): LoopRequirementDesignReasonCode | null => {
      let now: number;
      try { now = this.clock.nowMs(); } catch { return "CLOCK_INVALID"; }
      if (typeof now !== "number" || !Number.isFinite(now) || !Number.isSafeInteger(now) || now < 0) {
        return "CLOCK_INVALID";
      }
      if (lastClockMs !== -1 && now < lastClockMs) return "CLOCK_INVALID";
      lastClockMs = now;
      return null;
    };

    const deadlineExpired = (): boolean => lastClockMs - startMs > maxTotalDurationMs;

    // Fresh tri-state clock gate: every gate takes a NEW clock sample and maps
    // expired / clock_invalid so that no dependency or put is reached without
    // a current, valid, monotonic sample.
    const gate = (): "active" | "expired" | "clock_invalid" => {
      const reason = readClock();
      if (reason !== null) return "clock_invalid";
      return deadlineExpired() ? "expired" : "active";
    };

    // Terminal — exactly one terminal per path, always the last trace entry.
    const terminal = (
      route: LoopRequirementDesignRoute,
      reasonCode: LoopRequirementDesignReasonCode,
      message: string,
    ): LoopRequirementDesignResult => {
      // Persist orchestration_result only when the requirement was stored and
      // the terminal is not itself a clock/deadline/put/internal failure —
      // those stop all further side effects. A fresh pre-put gate guards this
      // put even for non-direct routes.
      if (requirementStored && route !== "failed") {
        const g = gate();
        if (g === "clock_invalid") return finish("failed", "CLOCK_INVALID", "clock invalid");
        if (g === "expired") return finish("failed", "TOTAL_TIMEOUT", "deadline exceeded");
        const payload = buildOrchestrationResultPayload(
          identity, route, reasonCode, designRounds, requirementArtifactRef,
          designArtifactRefs, solutionReviewArtifactRefs, executorInputArtifactRef,
          executorInputDigest, elapsedMs,
        );
        const storedPut = putAndVerify("orchestration_result", payload);
        if (!storedPut.ok) return finish("failed", "ARTIFACT_STORE_FAILED", "artifact store failed");
        orchestrationResultArtifactRef = storedPut.descriptor.artifactRef;
        addTrace("orchestration_result_stored", designRounds, "stored", storedPut.descriptor.artifactRef);
        const after = gate();
        if (after === "clock_invalid") return finish("failed", "CLOCK_INVALID", "clock invalid");
        if (after === "expired") return finish("failed", "TOTAL_TIMEOUT", "deadline exceeded");
      }
      return finish(route, reasonCode, message);
    };

    const finish = (
      route: LoopRequirementDesignRoute,
      reasonCode: LoopRequirementDesignReasonCode,
      message: string,
    ): LoopRequirementDesignResult => {
      addTrace("terminal", designRounds, reasonCode, orchestrationResultArtifactRef ?? null);
      return deepFreeze({
        route,
        reasonCode,
        safeMessage: safeMessage(message),
        designRounds,
        requirementArtifactRef,
        designArtifactRefs: [...designArtifactRefs],
        solutionReviewArtifactRefs: [...solutionReviewArtifactRefs],
        executorInputArtifactRef,
        orchestrationResultArtifactRef,
        executorInput,
        elapsedMs,
        trace: [...trace],
      }) as unknown as LoopRequirementDesignResult;
    };

    // Helper: put with strict descriptor verification. The payload digest is
    // computed once before the put and reused for the descriptor binding; no
    // artifactStore.read and no re-serialization happen here. Post-put clock
    // checks happen in the caller so a successful put keeps its real ref even
    // when the run must stop afterwards.
    const putAndVerify = (
      kind: LoopArtifactKind, bytes: Uint8Array,
    ): { ok: true; descriptor: VerifiedStoredDescriptor } | { ok: false } => {
      const expectedDigest = sha256Hex(bytes);
      let stored: unknown;
      try {
        stored = this.artifactStore.put(kind, bytes);
      } catch {
        return { ok: false };
      }
      const descriptor = verifyStoredDescriptor(stored, kind, expectedDigest, bytes.length);
      if (descriptor === null) return { ok: false };
      return { ok: true, descriptor };
    };

    // Fresh gate that maps failures to the terminal contract, or null when the
    // next side effect may run.
    const checkGate = (): LoopRequirementDesignResult | null => {
      const state = gate();
      if (state === "clock_invalid") return terminal("failed", "CLOCK_INVALID", "clock invalid");
      if (state === "expired") return terminal("failed", "TOTAL_TIMEOUT", "deadline exceeded");
      return null;
    };

    // ═══════════════════════════════════════ request validation
    let req: Record<string, unknown>;
    try {
      req = scanPlain(request, REQUEST_KEYS, "request");
    } catch {
      return terminal("failed", "INVALID_INPUT", "invalid request");
    }

    // ═══════════════════════════════════════ identity single snapshot
    // The identity is untrusted nested input. It is captured exactly once
    // through a descriptor-based exact-key scan; validateLoopRunIdentity runs
    // on the safe snapshot, and every later read (payloads, inputs, result)
    // uses the frozen snapshot — never the original object. Proxy get traps,
    // accessors and later caller mutation can therefore never feed canonical
    // data.
    let identityRecord: Record<string, unknown>;
    try {
      identityRecord = scanPlain(req.identity, IDENTITY_KEYS, "identity");
    } catch {
      return terminal("failed", "INVALID_INPUT", "invalid identity");
    }
    try {
      validateLoopRunIdentity(identityRecord);
    } catch {
      return terminal("failed", "INVALID_INPUT", "invalid identity");
    }
    const identity = deepFreeze(canonicalIdentity(identityRecord)) as unknown as LoopRunIdentity;

    const pathPolicyResult = validatePathPolicy(req.pathPolicy);
    if (!pathPolicyResult.ok) return terminal("failed", "INVALID_INPUT", "invalid pathPolicy");
    const allowedRoots = deepFreeze(pathPolicyResult.allowedRoots) as unknown as string[];
    const deniedPaths = deepFreeze(pathPolicyResult.deniedPaths) as unknown as string[];

    const commandPolicyResult = validateCommandPolicy(req.commandPolicy);
    if (!commandPolicyResult.ok) return terminal("failed", "INVALID_INPUT", "invalid commandPolicy");
    const allowedExecutableIds = deepFreeze(commandPolicyResult.allowedExecutableIds) as unknown as string[];
    const allowedExecutableIdSet = new Set<string>(allowedExecutableIds);

    const limitsResult = validateLimits(req.limits);
    if (!limitsResult.ok) return terminal("failed", "INVALID_INPUT", "invalid limits");
    const limits = deepFreeze(limitsResult.limits) as unknown as ResolvedLimits;
    const maxTotalDurationMs = limits.maxTotalDurationMs;

    const rawRequirementResult = validateRawRequirement(req.rawRequirement, limits.maxRequirementBytes);
    if (!rawRequirementResult.ok) return terminal("failed", "INVALID_INPUT", "invalid rawRequirement");

    // ═══════════════════════════════════════ clock start
    const startClock = readClock();
    if (startClock === "CLOCK_INVALID") {
      return terminal("failed", "CLOCK_INVALID", "clock invalid before start");
    }
    startMs = lastClockMs;
    if (deadlineExpired()) {
      return terminal("failed", "TOTAL_TIMEOUT", "deadline exceeded before start");
    }

    // ═══════════════════════════════════════ defensive snapshot
    // Fresh plain values, frozen — later caller mutation cannot affect execution.
    const rawRequirement = rawRequirementResult.value;
    const pathPolicy = deepFreeze({ allowedRoots, deniedPaths }) as unknown as { allowedRoots: string[]; deniedPaths: string[] };
    const commandPolicy = deepFreeze({ allowedExecutableIds }) as unknown as { allowedExecutableIds: string[] };
    const normalizeInput = deepFreeze({
      identity, rawRequirement, pathPolicy, commandPolicy, limits,
    });

    // ═══════════════════════════════════════ normalization
    addTrace("normalization_started", 0, "started", null);
    {
      const early = checkGate();
      if (early !== null) return early;
    }
    let rawSummary: unknown;
    try {
      rawSummary = this.agent.normalize(normalizeInput);
    } catch {
      return terminal("blocked", "DEPENDENCY_FAILED", "requirement normalization failed");
    }
    {
      const early = checkGate();
      if (early !== null) return early;
    }
    const summaryBudget: OutputBudget = { bytes: limits.maxAgentOutputBytes };
    const summaryResult = validateRequirementSummary(rawSummary, summaryBudget);
    if (!summaryResult.ok) {
      return terminal("blocked", "DEPENDENCY_RESULT_INVALID", "requirement summary malformed");
    }
    const summary = deepFreeze(summaryResult.summary) as unknown as CanonicalSummary;
    const summaryBytes = utf8(JSON.stringify(canonicalSummary(summary)));
    if (summaryBytes.length > limits.maxAgentOutputBytes) {
      return terminal("blocked", "DEPENDENCY_RESULT_INVALID", "requirement summary too large");
    }

    // ═══════════════════════════════════════ requirement artifact
    const requirementPayload = buildRequirementPayload(identity, rawRequirement, summary);
    {
      const early = checkGate();
      if (early !== null) return early;
    }
    const requirementPut = putAndVerify("requirement_summary", requirementPayload);
    if (!requirementPut.ok) {
      return terminal("failed", "ARTIFACT_STORE_FAILED", "artifact store failed");
    }
    // Durable fact recorded only after descriptor verification. A failed
    // post-put gate keeps the real ref and stored trace but stops every
    // following side effect (no orchestration_result is written).
    requirementArtifactRef = requirementPut.descriptor.artifactRef;
    requirementStored = true;
    addTrace("requirement_stored", 0, "stored", requirementPut.descriptor.artifactRef);
    {
      const early = checkGate();
      if (early !== null) return early;
    }

    // ═══════════════════════════════════════ routing
    const route = selectRoute(summary);
    addTrace("route_selected", 0, route.route, null);
    if (route.route !== "direct") {
      return terminal(route.route, route.reasonCode, route.message);
    }

    // ═══════════════════════════════════════ design loop
    let previousDesign: CanonicalDesign | null = null;
    let reviewFindings: unknown[] = [];
    for (let round = 1; round <= limits.maxDesignRounds; round++) {
      designRounds = round;
      addTrace("design_started", round, "started", null);
      const designInput = deepFreeze({
        identity,
        round,
        requirement: summary,
        pathPolicy,
        commandPolicy,
        limits,
        previousDesign,
        reviewFindings: deepFreeze([...reviewFindings]) as unknown as unknown[],
      });
      {
        const early = checkGate();
        if (early !== null) return early;
      }
      let rawDesign: unknown;
      try {
        rawDesign = this.agent.design(designInput);
      } catch {
        return terminal("blocked", "DEPENDENCY_FAILED", "technical design failed");
      }
      {
        const early = checkGate();
        if (early !== null) return early;
      }
      const designBudget: OutputBudget = { bytes: limits.maxAgentOutputBytes };
      const designResult = validateDesign(rawDesign, allowedRoots, deniedPaths, allowedExecutableIdSet, designBudget);
      if (!designResult.ok) {
        return terminal("blocked", "DEPENDENCY_RESULT_INVALID", "technical design malformed");
      }
      const design = deepFreeze(designResult.design) as unknown as CanonicalDesign;
      const designBytes = utf8(JSON.stringify(canonicalDesign(design)));
      if (designBytes.length > limits.maxAgentOutputBytes) {
        return terminal("blocked", "DEPENDENCY_RESULT_INVALID", "technical design too large");
      }
      const designPayload = buildDesignPayload(identity, requirementArtifactRef, round, design);
      {
        const early = checkGate();
        if (early !== null) return early;
      }
      const designPut = putAndVerify("technical_design", designPayload);
      if (!designPut.ok) {
        return terminal("failed", "ARTIFACT_STORE_FAILED", "artifact store failed");
      }
      designArtifactRefs.push(designPut.descriptor.artifactRef);
      addTrace("design_stored", round, "stored", designPut.descriptor.artifactRef);
      {
        const early = checkGate();
        if (early !== null) return early;
      }

      // ═══════════════════════════════════════ solution review
      addTrace("review_started", round, "started", null);
      const reviewInput = deepFreeze({
        identity,
        round,
        requirement: summary,
        design,
        requirementArtifactRef,
        designArtifactRef: designPut.descriptor.artifactRef,
      });
      {
        const early = checkGate();
        if (early !== null) return early;
      }
      let rawReview: unknown;
      try {
        rawReview = this.reviewer.review(reviewInput);
      } catch {
        return terminal("blocked", "DEPENDENCY_FAILED", "solution review failed");
      }
      {
        const early = checkGate();
        if (early !== null) return early;
      }
      const reviewBudget: OutputBudget = { bytes: limits.maxAgentOutputBytes };
      const reviewResult = validateReview(rawReview, reviewBudget);
      if (!reviewResult.ok) {
        return terminal("blocked", "DEPENDENCY_RESULT_INVALID", "solution review malformed");
      }
      const review = deepFreeze(reviewResult.review) as unknown as CanonicalReview;
      const reviewBytes = utf8(JSON.stringify(canonicalReview(review)));
      if (reviewBytes.length > limits.maxAgentOutputBytes) {
        return terminal("blocked", "DEPENDENCY_RESULT_INVALID", "solution review too large");
      }
      const reviewPayload = buildReviewPayload(identity, designPut.descriptor.artifactRef, round, review);
      {
        const early = checkGate();
        if (early !== null) return early;
      }
      const reviewPut = putAndVerify("solution_review", reviewPayload);
      if (!reviewPut.ok) {
        return terminal("failed", "ARTIFACT_STORE_FAILED", "artifact store failed");
      }
      solutionReviewArtifactRefs.push(reviewPut.descriptor.artifactRef);
      addTrace("review_stored", round, "stored", reviewPut.descriptor.artifactRef);
      {
        const early = checkGate();
        if (early !== null) return early;
      }

      if (review.status === "PASS") {
        // The executor input object is only exposed when its artifact was
        // durably persisted and its descriptor verified — never on a failed
        // put or an expired/invalid gate.
        const builtExecutorInput = deepFreeze(buildExecutorInput(identity, summary, design, limits)) as unknown as LoopDirectExecutorInput;
        const executorInputBytes = utf8(JSON.stringify(canonicalExecutorInput(builtExecutorInput)));
        {
          const early = checkGate();
          if (early !== null) return early;
        }
        const executorInputPut = putAndVerify("executor_input", executorInputBytes);
        if (!executorInputPut.ok) {
          return terminal("failed", "ARTIFACT_STORE_FAILED", "artifact store failed");
        }
        executorInput = builtExecutorInput;
        executorInputArtifactRef = executorInputPut.descriptor.artifactRef;
        executorInputDigest = executorInputPut.descriptor.digest;
        addTrace("executor_input_stored", round, "stored", executorInputPut.descriptor.artifactRef);
        {
          const early = checkGate();
          if (early !== null) return early;
        }
        return terminal("direct", "DIRECT_READY", "direct execution input ready");
      }

      if (review.status === "BLOCKED") {
        return terminal("blocked", "SOLUTION_REVIEW_BLOCKED", "solution review blocked");
      }

      // NEEDS_REVISION — continue with the next round when budget remains.
      if (round === limits.maxDesignRounds) {
        return terminal("paused", "DESIGN_REVISION_EXHAUSTED", "design revision budget exhausted");
      }
      previousDesign = design;
      reviewFindings = [...review.findings];
    }

    // Unreachable — fail closed.
    return terminal("failed", "INTERNAL_ERROR", "unexpected orchestration state");
  }
}

function buildExecutorInput(
  identity: LoopRunIdentity,
  summary: CanonicalSummary,
  design: CanonicalDesign,
  limits: ResolvedLimits,
): LoopDirectExecutorInput {
  return {
    schema: "loop_direct_executor_input_v1",
    identity: { ...identity },
    requirement: {
      objective: summary.objective,
      acceptanceCriteria: [...summary.acceptanceCriteria],
      constraints: [...summary.constraints],
    },
    designSummary: {
      approach: design.approach,
      components: [...design.components],
      interfaces: [...design.interfaces],
      dataChanges: [...design.dataChanges],
      riskControls: [...design.riskControls],
    },
    implementationConstraints: [...design.implementationConstraints],
    allowedPaths: [...design.allowedPaths],
    testPlan: design.testPlan.map((s) => ({ ...s, args: s.args !== undefined ? [...s.args] : undefined })),
    reviewPlan: design.reviewPlan.map((s) => ({ ...s, args: s.args !== undefined ? [...s.args] : undefined })),
    maxFixRounds: limits.maxFixRounds,
    maxTotalDurationMs: limits.executorMaxTotalDurationMs,
    commitSubject: design.commitSubject,
    prTitle: design.prTitle,
  };
}

// ═══════════════════════════════════════ Additive canonical parsers (D08-owned)
// =============================================================================
// The strict canonical parsers for the artifacts this module produces
// (`loop_requirement_orchestration_result_v1` and
// `loop_direct_executor_input_v1`). They are the SINGLE authority for the
// serialized route/reason vocabulary, canonical key order and canonical bytes
// of these artifacts — they co-evolve with the producers above and never
// duplicate another module's schema. No-throw, fail-closed, bounded defensive
// copy, strict UTF-8, exact keys, canonical property order, canonical-bytes
// rebuild with byte-identical round-trip, artifact-ref/digest/identity binding.
//
// The canonical route/reason values are the same unions as the public types:
const ORCHESTRATION_ROUTE_VALUES: readonly string[] = [
  "direct", "speckit_pending", "multi_repo_pending", "paused", "blocked", "failed",
];
const ORCHESTRATION_REASON_CODE_VALUES: readonly string[] = [
  "DIRECT_READY", "MULTI_REPOSITORY", "AMBIGUITY_REQUIRES_INPUT", "PRODUCT_DECISION_REQUIRED",
  "PERMISSION_REQUIRED", "HIGH_RISK_ACCEPTANCE_REQUIRED", "COMPLEX_REQUIREMENT", "DEPENDENCY_FAILED",
  "DEPENDENCY_RESULT_INVALID", "SOLUTION_REVIEW_BLOCKED", "DESIGN_REVISION_EXHAUSTED", "INVALID_INPUT",
  "TOTAL_TIMEOUT", "CLOCK_INVALID", "ARTIFACT_STORE_FAILED", "INTERNAL_ERROR",
];

// Exact serialized property orders produced by the builders above.
const ORCHESTRATION_RESULT_KEYS = [
  "schema", "identity", "route", "reason_code", "rounds", "requirement_artifact_ref",
  "design_artifact_refs", "solution_review_artifact_refs", "executor_input_artifact_ref",
  "executor_input_digest_sha256", "elapsed_ms",
] as const;
const EXECUTOR_INPUT_KEYS = [
  "schema", "identity", "requirement", "designSummary", "implementationConstraints", "allowedPaths",
  "testPlan", "reviewPlan", "maxFixRounds", "maxTotalDurationMs", "commitSubject", "prTitle",
] as const;
const EXECUTOR_REQUIREMENT_KEYS = ["objective", "acceptanceCriteria", "constraints"] as const;
const EXECUTOR_DESIGN_SUMMARY_KEYS = ["approach", "components", "interfaces", "dataChanges", "riskControls"] as const;
const EXECUTOR_STEP_KEYS = ["id", "executableId", "args", "timeoutMs", "maxStdoutBytes", "maxStderrBytes"] as const;

// ═══════════════════════════════════════ Parser contracts

export type LoopCanonicalParseFailureReason = "invalid_input" | "invalid_bytes" | "too_large";

export interface LoopCanonicalParseSuccess<T> {
  readonly ok: true;
  readonly value: Readonly<T>;
  readonly text: string;
  readonly bytes: Uint8Array;
  readonly digestSha256: string;
  readonly sizeBytes: number;
}

export interface LoopCanonicalParseFailure {
  readonly ok: false;
  readonly reason: LoopCanonicalParseFailureReason;
  readonly diagnostic: string;
}

export type LoopCanonicalParseResult<T> = LoopCanonicalParseSuccess<T> | LoopCanonicalParseFailure;

/** Canonical value parsed from `loop_requirement_orchestration_result_v1` bytes. */
export interface LoopParsedOrchestrationResult {
  readonly schema: "loop_requirement_orchestration_result_v1";
  readonly identity: Readonly<LoopRunIdentity>;
  readonly route: LoopRequirementDesignRoute;
  readonly reasonCode: LoopRequirementDesignReasonCode;
  readonly rounds: number;
  readonly requirementArtifactRef: string | null;
  readonly designArtifactRefs: readonly string[];
  readonly solutionReviewArtifactRefs: readonly string[];
  readonly executorInputArtifactRef: string | null;
  readonly executorInputDigestSha256: string | null;
  readonly elapsedMs: number;
}

export interface LoopParseOrchestrationOptions {
  readonly maxBytes?: number;
  readonly expectedIdentity?: Readonly<LoopRunIdentity>;
}

export interface LoopParseExecutorInputOptions {
  readonly maxBytes?: number;
  readonly expectedIdentity?: Readonly<LoopRunIdentity>;
}

// ═══════════════════════════════════════ Parser toolkit

const PARSER_MAX_ARTIFACT_BYTES_BOUND = 16_777_216;
const DEFAULT_MAX_ORCHESTRATION_RESULT_BYTES = 1_048_576;
const DEFAULT_MAX_EXECUTOR_INPUT_BYTES = 1_048_576;
const PARSER_MAX_SAFE_MESSAGE_LENGTH = 256;
const PARSER_MAX_STRING_UTF8_BYTES = 65_536;
const PARSER_REF_RE = /^loop-artifact:v1:([a-z_]+):sha256:([0-9a-f]{64})$/;
const PARSER_SHA256_RE = /^[0-9a-f]{64}$/;
const PARSER_SHA40_RE = /^[0-9a-f]{40}$/;
const PARSER_CONTROL_RE = /[\x00-\x1f\x7f-\x9f]/;

// ECMAScript TypedArray intrinsics captured once at module load. Applied via
// direct call they read the internal [[TypedArrayName]] and [[ArrayLength]]
// slots, so callers cannot forge them with `Symbol.toStringTag` spoofing,
// tampered `length` properties, or Proxy traps; proxy-trap/revoked-proxy
// reflection fails closed instead of throwing.
const PARSER_TYPED_ARRAY_PROTOTYPE = Object.getPrototypeOf(Uint8Array.prototype);
const PARSER_BYTE_LENGTH_GETTER = Object.getOwnPropertyDescriptor(PARSER_TYPED_ARRAY_PROTOTYPE, "byteLength")!.get!;
const PARSER_TO_STRING_TAG_GETTER = Object.getOwnPropertyDescriptor(PARSER_TYPED_ARRAY_PROTOTYPE, Symbol.toStringTag)!.get!;

class ParserValidationError extends Error {
  readonly reason: LoopCanonicalParseFailureReason;
  readonly diagnostic: string;

  constructor(reason: LoopCanonicalParseFailureReason, diagnostic: string) {
    super(diagnostic);
    this.name = "ParserValidationError";
    this.reason = reason;
    this.diagnostic = diagnostic;
  }
}

function parserValidationFail(reason: LoopCanonicalParseFailureReason, diagnostic: string): never {
  throw new ParserValidationError(reason, diagnostic);
}

function parserAsFailure(error: unknown, fallbackDiagnostic: string): LoopCanonicalParseFailure {
  if (error instanceof ParserValidationError) {
    return { ok: false, reason: error.reason, diagnostic: error.diagnostic };
  }
  return { ok: false, reason: "invalid_input", diagnostic: fallbackDiagnostic };
}

function parserIsPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || classifyArray(value) !== "non_array") return false;
  let proto: unknown;
  try {
    proto = Object.getPrototypeOf(value);
  } catch {
    return false;
  }
  return proto === Object.prototype || proto === null;
}

/**
 * Exact-key descriptor snapshot of a plain record: own keys must equal the
 * allowed keys exactly (count and canonical order); every key must be a data
 * descriptor; symbols, `__proto__`, accessors, non-plain prototypes and any
 * reflection failure (Proxy traps / revoked Proxies) fail closed. The result
 * is a fresh null-prototype record never read from the original afterwards.
 */
function parserScanPlainObject(value: unknown, allowed: readonly string[], label: string): Record<string, unknown> {
  if (!parserIsPlainRecord(value)) parserValidationFail("invalid_input", `${label} must be a plain object`);
  let keys: Array<string | symbol>;
  try {
    keys = Reflect.ownKeys(value);
  } catch {
    parserValidationFail("invalid_input", `${label} ownKeys reflection failed`);
  }
  if (keys.length !== allowed.length) {
    parserValidationFail("invalid_input", `${label} must have exactly the canonical keys`);
  }
  const out = Object.create(null) as Record<string, unknown>;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]!;
    if (typeof key === "symbol") parserValidationFail("invalid_input", `${label} must not carry symbol keys`);
    if (key === "__proto__") parserValidationFail("invalid_input", `${label} must not carry __proto__`);
    if (key !== allowed[i]) {
      parserValidationFail("invalid_input", `${label} must have the canonical keys in canonical order`);
    }
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch {
      parserValidationFail("invalid_input", `${label} descriptor reflection failed`);
    }
    if (descriptor === undefined) parserValidationFail("invalid_input", `${label} key descriptor is missing`);
    if (descriptor.get !== undefined || descriptor.set !== undefined) {
      parserValidationFail("invalid_input", `${label} must not carry accessors`);
    }
    if (!("value" in descriptor)) parserValidationFail("invalid_input", `${label} key has no value`);
    Object.defineProperty(out, key, {
      value: descriptor.value,
      writable: false,
      enumerable: true,
      configurable: false,
    });
  }
  return out;
}

/** Dense descriptor-snapshot array scan; sparse/extra-key/over-cap arrays fail. */
function parserScanPlainArray(value: unknown, label: string, maxItems: number): unknown[] {
  if (classifyArray(value) !== "array") parserValidationFail("invalid_input", `${label} must be an array`);
  let proto: unknown;
  try {
    proto = Object.getPrototypeOf(value as object);
  } catch {
    parserValidationFail("invalid_input", `${label} array prototype reflection failed`);
  }
  if (proto !== Array.prototype) parserValidationFail("invalid_input", `${label} has a non-plain array prototype`);
  let keys: Array<string | symbol>;
  try {
    keys = Reflect.ownKeys(value as object);
  } catch {
    parserValidationFail("invalid_input", `${label} ownKeys reflection failed`);
  }
  const snapshot = new Map<string | symbol, unknown>();
  for (const key of keys) {
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch {
      parserValidationFail("invalid_input", `${label} descriptor reflection failed`);
    }
    if (descriptor === undefined || descriptor.get !== undefined || descriptor.set !== undefined || !("value" in descriptor)) {
      parserValidationFail("invalid_input", `${label} has an invalid property descriptor`);
    }
    snapshot.set(key, descriptor.value);
  }
  const lengthValue = snapshot.get("length");
  if (typeof lengthValue !== "number" || !Number.isSafeInteger(lengthValue) || lengthValue < 0) {
    parserValidationFail("invalid_input", `${label} length must be a non-negative safe integer`);
  }
  if (lengthValue > maxItems) parserValidationFail("invalid_input", `${label} exceeds the element bound`);
  let indexCount = 0;
  for (const key of keys) {
    if (key === "length") continue;
    if (typeof key !== "string") parserValidationFail("invalid_input", `${label} must not carry extra own properties`);
    const idx = Number(key);
    if (!Number.isSafeInteger(idx) || idx < 0 || idx >= lengthValue || String(idx) !== key) {
      parserValidationFail("invalid_input", `${label} must not carry extra own properties`);
    }
    indexCount += 1;
  }
  if (indexCount !== lengthValue) parserValidationFail("invalid_input", `${label} must be a dense array`);
  const out: unknown[] = new Array(lengthValue);
  for (let i = 0; i < lengthValue; i++) {
    out[i] = snapshot.get(String(i));
  }
  return out;
}

function parserResolveMaxBytes(maxBytes: number | undefined, fallback: number): number {
  const resolved = maxBytes ?? fallback;
  if (typeof resolved !== "number" || !Number.isSafeInteger(resolved) || resolved < 1 || resolved > PARSER_MAX_ARTIFACT_BYTES_BOUND) {
    parserValidationFail("invalid_input", "maxBytes must be a safe positive integer within the allowed bound");
  }
  return resolved;
}

/** Bounded defensive copy + byte-level gates shared by the D08 parsers. */
function parserTakeCanonicalBytes(
  input: Uint8Array,
  maxBytes: number,
  trailingLf: boolean,
): { bytes: Uint8Array; text: string; parsed: unknown } {
  if (input === null || typeof input !== "object") parserValidationFail("invalid_input", "bytes must be a Uint8Array");
  let tag: unknown;
  let byteLength: unknown;
  try {
    tag = PARSER_TO_STRING_TAG_GETTER.call(input);
    byteLength = PARSER_BYTE_LENGTH_GETTER.call(input);
  } catch {
    parserValidationFail("invalid_input", "bytes must be a Uint8Array");
  }
  if (tag !== "Uint8Array") parserValidationFail("invalid_input", "bytes must be a Uint8Array");
  if (typeof byteLength !== "number" || !Number.isSafeInteger(byteLength) || byteLength < 0) {
    parserValidationFail("invalid_input", "bytes length must be a non-negative safe integer");
  }
  if (byteLength > maxBytes) parserValidationFail("too_large", "artifact bytes exceed the size limit");
  let snapshot: Uint8Array;
  try {
    snapshot = new Uint8Array(input);
  } catch {
    parserValidationFail("invalid_input", "bytes snapshot failed");
  }
  if (snapshot.length !== byteLength) parserValidationFail("invalid_input", "bytes snapshot length mismatch");
  // No BOM, no CR, no NUL; exactly one trailing LF (or none for D08 artifacts).
  if (snapshot.length >= 3 && snapshot[0] === 0xef && snapshot[1] === 0xbb && snapshot[2] === 0xbf) {
    parserValidationFail("invalid_bytes", "artifact bytes must not carry a BOM");
  }
  for (let i = 0; i < snapshot.length; i++) {
    if (snapshot[i] === 0x0d || snapshot[i] === 0x00) parserValidationFail("invalid_bytes", "artifact bytes must not contain CR or NUL");
  }
  if (trailingLf) {
    if (snapshot.length === 0 || snapshot[snapshot.length - 1] !== 0x0a) {
      parserValidationFail("invalid_bytes", "artifact bytes must end with exactly one LF");
    }
    for (let i = 0; i < snapshot.length - 1; i++) {
      if (snapshot[i] === 0x0a) parserValidationFail("invalid_bytes", "artifact bytes must not contain an embedded LF");
    }
  } else {
    for (let i = 0; i < snapshot.length; i++) {
      if (snapshot[i] === 0x0a) parserValidationFail("invalid_bytes", "artifact bytes must not contain an LF");
    }
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(snapshot);
  } catch {
    parserValidationFail("invalid_bytes", "artifact bytes are not strict UTF-8");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parserValidationFail("invalid_bytes", "artifact bytes are not valid JSON");
  }
  return { bytes: snapshot, text, parsed };
}

function parserAsNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    parserValidationFail("invalid_input", `${label} must be a trimmed non-empty string`);
  }
  return value;
}

function parserAsBoundedString(value: unknown, label: string, maxUtf8Bytes: number): string {
  const text = parserAsNonEmptyString(value, label);
  if (PARSER_CONTROL_RE.test(text)) parserValidationFail("invalid_input", `${label} must not contain control characters`);
  const counted = countUtf8Budgeted(text, maxUtf8Bytes);
  if (counted.status !== "valid") parserValidationFail("invalid_input", `${label} exceeds the byte bound`);
  return text;
}

function parserAsSafeInt(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    parserValidationFail("invalid_input", `${label} must be a safe integer within bounds`);
  }
  return value;
}

function parserAsNullableString(value: unknown, label: string): string | null {
  if (value === null) return null;
  return parserAsNonEmptyString(value, label);
}

function parserAsSha256(value: unknown, label: string): string {
  const s = parserAsNonEmptyString(value, label);
  if (!PARSER_SHA256_RE.test(s)) parserValidationFail("invalid_input", `${label} must be a 64-char lowercase SHA-256 hex`);
  return s;
}

function parserAsNullableSha256(value: unknown, label: string): string | null {
  if (value === null) return null;
  return parserAsSha256(value, label);
}

function parserArtifactRefOf(value: unknown, label: string, expectedKind: string): { ref: string; kind: string; digest: string } {
  const s = parserAsNonEmptyString(value, label);
  const m = s.match(PARSER_REF_RE);
  if (m === null || m[1] !== expectedKind) {
    parserValidationFail("invalid_input", `${label} must be a canonical ${expectedKind} artifact ref`);
  }
  return { ref: s, kind: m[1]!, digest: m[2]! };
}

function parserAsNullableRef(value: unknown, label: string, expectedKind: string): string | null {
  if (value === null) return null;
  return parserArtifactRefOf(value, label, expectedKind).ref;
}

/** Canonical frozen identity built from an exact-key identity record. */
function parserCanonicalIdentity(record: Record<string, unknown>): Readonly<LoopRunIdentity> {
  return Object.freeze({
    runId: record.runId as string,
    requirementId: record.requirementId as string,
    repository: record.repository as string,
    repositoryPath: record.repositoryPath as string,
    baseBranch: record.baseBranch as string,
    expectedBaseSha: record.expectedBaseSha as string,
    taskBranch: record.taskBranch as string,
    controlRoot: record.controlRoot as string,
    createdAt: record.createdAt as string,
  });
}

function parserValidateIdentity(value: unknown, label: string): Readonly<LoopRunIdentity> {
  const rec = parserScanPlainObject(value, IDENTITY_KEYS, label);
  try {
    validateLoopRunIdentity(rec);
  } catch {
    parserValidationFail("invalid_input", `${label} is not a valid loop run identity`);
  }
  return parserCanonicalIdentity(rec);
}

function parserSameIdentity(a: Readonly<LoopRunIdentity>, b: Readonly<LoopRunIdentity>): boolean {
  return a.runId === b.runId && a.requirementId === b.requirementId && a.repository === b.repository
    && a.repositoryPath === b.repositoryPath && a.baseBranch === b.baseBranch
    && a.expectedBaseSha === b.expectedBaseSha && a.taskBranch === b.taskBranch
    && a.controlRoot === b.controlRoot && a.createdAt === b.createdAt;
}

function parserByteEquals(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** Canonical round-trip guard on the raw parsed object (canonical key order already enforced). */
function parserRequireRoundTrip(intake: { bytes: Uint8Array; text: string; parsed: unknown }, trailingLf: boolean): void {
  const rebuilt = utf8(JSON.stringify(intake.parsed) + (trailingLf ? "\n" : ""));
  if (!parserByteEquals(intake.bytes, rebuilt)) {
    parserValidationFail("invalid_bytes", "artifact bytes are not canonical (round-trip mismatch)");
  }
}

function parserCanonicalParseSuccess<T>(
  value: Readonly<T>,
  canonicalText: string,
  digestSha256: string,
  sizeBytes: number,
): LoopCanonicalParseSuccess<T> {
  return {
    ok: true,
    value,
    text: canonicalText,
    bytes: utf8(canonicalText),
    digestSha256,
    sizeBytes,
  };
}

/** Repository-relative path list; strictly sorted ascending and unique, or unique only. */
function parserValidatePathList(value: unknown, label: string, requireSorted: boolean): string[] {
  const arr = parserScanPlainArray(value, label, MAX_DESIGN_ALLOWED_PATHS);
  const out: string[] = [];
  for (let i = 0; i < arr.length; i++) {
    const r = validateRepoRelativePath(arr[i], `${label}[${i}]`);
    if (!r.ok) parserValidationFail("invalid_input", `${label}[${i}] is not a safe repository-relative path`);
    if (requireSorted) {
      if (i > 0 && out[i - 1]! >= r.value) {
        parserValidationFail("invalid_input", `${label} must be strictly ascending without duplicates`);
      }
    } else if (out.includes(r.value)) {
      parserValidationFail("invalid_input", `${label} must not contain duplicates`);
    }
    out.push(r.value);
  }
  return out;
}

/** Canonical executor-input command step with only the present optional keys. */
function parserValidateStep(value: unknown, label: string): LoopDeliveryCommandStep {
  if (!parserIsPlainRecord(value)) parserValidationFail("invalid_input", `${label} must be a plain object`);
  let keys: Array<string | symbol>;
  try {
    keys = Reflect.ownKeys(value);
  } catch {
    parserValidationFail("invalid_input", `${label} ownKeys reflection failed`);
  }
  if (keys.length < 2 || keys.length > EXECUTOR_STEP_KEYS.length) {
    parserValidationFail("invalid_input", `${label} must have exactly the canonical keys in canonical order`);
  }
  const present: string[] = [];
  let lastIndex = -1;
  for (const key of keys) {
    if (typeof key === "symbol") parserValidationFail("invalid_input", `${label} must not carry symbol keys`);
    const idx = (EXECUTOR_STEP_KEYS as readonly string[]).indexOf(key as string);
    if (idx <= lastIndex) {
      parserValidationFail("invalid_input", `${label} must have exactly the canonical keys in canonical order`);
    }
    lastIndex = idx;
    present.push(key as string);
  }
  if (present[0] !== "id" || present[1] !== "executableId") {
    parserValidationFail("invalid_input", `${label} must carry id and executableId first`);
  }
  // Descriptor snapshot over the PRESENT canonical keys (absent optional keys
  // are legitimate: the serializer omits undefined-valued keys).
  const rec = Object.create(null) as Record<string, unknown>;
  for (const key of present) {
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch {
      parserValidationFail("invalid_input", `${label} descriptor reflection failed`);
    }
    if (descriptor === undefined) parserValidationFail("invalid_input", `${label} key descriptor is missing`);
    if (descriptor.get !== undefined || descriptor.set !== undefined) {
      parserValidationFail("invalid_input", `${label} must not carry accessors`);
    }
    if (!("value" in descriptor)) parserValidationFail("invalid_input", `${label} key has no value`);
    Object.defineProperty(rec, key, {
      value: descriptor.value,
      writable: false,
      enumerable: true,
      configurable: false,
    });
  }
  const id = parserAsBoundedString(rec.id, `${label}.id`, PARSER_MAX_SAFE_MESSAGE_LENGTH);
  if (!STEP_ID_RE.test(id)) parserValidationFail("invalid_input", `${label}.id is not a canonical step id`);
  const executableId = parserAsBoundedString(rec.executableId, `${label}.executableId`, PARSER_MAX_SAFE_MESSAGE_LENGTH);
  if (!EXEC_ID_RE.test(executableId)) parserValidationFail("invalid_input", `${label}.executableId is not canonical`);
  const step: Record<string, unknown> = Object.create(null);
  step.id = id;
  step.executableId = executableId;
  if (rec.args !== undefined) {
    const args = parserScanPlainArray(rec.args, `${label}.args`, MAX_STEP_ARGS);
    const argValues: string[] = [];
    let totalBytes = 0;
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (typeof arg !== "string" || arg.includes(NUL)) {
        parserValidationFail("invalid_input", `${label}.args[${i}] must be a NUL-free string`);
      }
      if (PARSER_CONTROL_RE.test(arg)) parserValidationFail("invalid_input", `${label}.args[${i}] must not contain control characters`);
      const counted = countUtf8Budgeted(arg, MAX_ARG_BYTES);
      if (counted.status !== "valid") parserValidationFail("invalid_input", `${label}.args[${i}] exceeds the per-arg byte bound`);
      if (totalBytes > MAX_ARGS_TOTAL_BYTES - counted.bytes) {
        parserValidationFail("invalid_input", `${label}.args total exceeds the byte bound`);
      }
      totalBytes += counted.bytes;
      argValues.push(arg);
    }
    step.args = argValues;
  }
  if (rec.timeoutMs !== undefined) {
    step.timeoutMs = parserAsSafeInt(rec.timeoutMs, `${label}.timeoutMs`, MIN_STEP_TIMEOUT_MS, MAX_STEP_TIMEOUT_MS);
  }
  if (rec.maxStdoutBytes !== undefined) {
    step.maxStdoutBytes = parserAsSafeInt(rec.maxStdoutBytes, `${label}.maxStdoutBytes`, 1, MAX_STEP_OUTPUT_BYTES);
  }
  if (rec.maxStderrBytes !== undefined) {
    step.maxStderrBytes = parserAsSafeInt(rec.maxStderrBytes, `${label}.maxStderrBytes`, 1, MAX_STEP_OUTPUT_BYTES);
  }
  return Object.freeze(step) as unknown as LoopDeliveryCommandStep;
}

function parserValidatePlan(value: unknown, label: string): readonly LoopDeliveryCommandStep[] {
  const arr = parserScanPlainArray(value, label, MAX_PLAN_STEPS);
  const steps: LoopDeliveryCommandStep[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < arr.length; i++) {
    const step = parserValidateStep(arr[i], `${label}[${i}]`);
    if (seen.has(step.id)) parserValidationFail("invalid_input", `${label} must not repeat step ids`);
    seen.add(step.id);
    steps.push(step);
  }
  return Object.freeze(steps);
}

// ═══════════════════════════════════════ Parser implementations

/**
 * Strict canonical parser for `loop_requirement_orchestration_result_v1`
 * (D08 orchestration result artifact). Fail-closed, no-throw. When
 * `expectedIdentity` is provided, the embedded identity must match exactly.
 */
export function parseLoopOrchestrationResultBytes(
  bytes: Uint8Array,
  options?: Readonly<LoopParseOrchestrationOptions>,
): LoopCanonicalParseResult<LoopParsedOrchestrationResult> {
  try {
    const maxBytes = parserResolveMaxBytes(options?.maxBytes, DEFAULT_MAX_ORCHESTRATION_RESULT_BYTES);
    const intake = parserTakeCanonicalBytes(bytes, maxBytes, false);
    const rec = parserScanPlainObject(intake.parsed, ORCHESTRATION_RESULT_KEYS, "orchestration result");
    if (rec.schema !== "loop_requirement_orchestration_result_v1") parserValidationFail("invalid_input", "orchestration result schema mismatch");
    const identity = parserValidateIdentity(rec.identity, "orchestration result identity");
    if (options?.expectedIdentity !== undefined && !parserSameIdentity(identity, options.expectedIdentity)) {
      parserValidationFail("invalid_input", "orchestration result identity binding mismatch");
    }
    if (typeof rec.route !== "string" || !ORCHESTRATION_ROUTE_VALUES.includes(rec.route)) {
      parserValidationFail("invalid_input", "orchestration result route is not canonical");
    }
    if (typeof rec.reason_code !== "string" || !ORCHESTRATION_REASON_CODE_VALUES.includes(rec.reason_code)) {
      parserValidationFail("invalid_input", "orchestration result reason_code is not canonical");
    }
    const rounds = parserAsSafeInt(rec.rounds, "orchestration result rounds", 0, 100);
    const requirementRef = parserAsNullableRef(rec.requirement_artifact_ref, "orchestration result requirement_artifact_ref", "requirement_summary");
    const designRefs = parserScanPlainArray(rec.design_artifact_refs, "orchestration result design_artifact_refs", 100);
    const designRefValues: string[] = [];
    for (let i = 0; i < designRefs.length; i++) {
      designRefValues.push(parserArtifactRefOf(designRefs[i], `orchestration result design_artifact_refs[${i}]`, "technical_design").ref);
    }
    const reviewRefs = parserScanPlainArray(rec.solution_review_artifact_refs, "orchestration result solution_review_artifact_refs", 100);
    const reviewRefValues: string[] = [];
    for (let i = 0; i < reviewRefs.length; i++) {
      reviewRefValues.push(parserArtifactRefOf(reviewRefs[i], `orchestration result solution_review_artifact_refs[${i}]`, "solution_review").ref);
    }
    const executorRef = parserAsNullableRef(rec.executor_input_artifact_ref, "orchestration result executor_input_artifact_ref", "executor_input");
    const executorDigest = parserAsNullableSha256(rec.executor_input_digest_sha256, "orchestration result executor_input_digest_sha256");
    const elapsedMs = parserAsSafeInt(rec.elapsed_ms, "orchestration result elapsed_ms", 0, MAX_MAX_TOTAL_DURATION_MS);
    if ((executorRef === null) !== (executorDigest === null)) {
      parserValidationFail("invalid_input", "orchestration result executor ref and digest must be both present or both absent");
    }
    const value: Readonly<LoopParsedOrchestrationResult> = deepFreeze({
      schema: "loop_requirement_orchestration_result_v1",
      identity,
      route: rec.route as LoopRequirementDesignRoute,
      reasonCode: rec.reason_code as LoopRequirementDesignReasonCode,
      rounds,
      requirementArtifactRef: requirementRef,
      designArtifactRefs: Object.freeze(designRefValues),
      solutionReviewArtifactRefs: Object.freeze(reviewRefValues),
      executorInputArtifactRef: executorRef,
      executorInputDigestSha256: executorDigest,
      elapsedMs,
    });
    parserRequireRoundTrip(intake, false);
    return parserCanonicalParseSuccess(value, JSON.stringify(intake.parsed), sha256Hex(intake.bytes), intake.bytes.length);
  } catch (error) {
    return parserAsFailure(error, "unexpected failure while parsing orchestration result");
  }
}

/**
 * Strict canonical parser for `loop_direct_executor_input_v1`
 * (D08 direct executor input artifact). Fail-closed, no-throw. When
 * `expectedIdentity` is provided, the embedded identity must match exactly.
 */
export function parseLoopDirectExecutorInputBytes(
  bytes: Uint8Array,
  options?: Readonly<LoopParseExecutorInputOptions>,
): LoopCanonicalParseResult<LoopDirectExecutorInput> {
  try {
    const maxBytes = parserResolveMaxBytes(options?.maxBytes, DEFAULT_MAX_EXECUTOR_INPUT_BYTES);
    const intake = parserTakeCanonicalBytes(bytes, maxBytes, false);
    const rec = parserScanPlainObject(intake.parsed, EXECUTOR_INPUT_KEYS, "executor input");
    if (rec.schema !== "loop_direct_executor_input_v1") parserValidationFail("invalid_input", "executor input schema mismatch");
    const identity = parserValidateIdentity(rec.identity, "executor input identity");
    if (options?.expectedIdentity !== undefined && !parserSameIdentity(identity, options.expectedIdentity)) {
      parserValidationFail("invalid_input", "executor input identity binding mismatch");
    }
    const requirement = parserScanPlainObject(rec.requirement, EXECUTOR_REQUIREMENT_KEYS, "executor input requirement");
    const objective = parserAsBoundedString(requirement.objective, "executor input requirement.objective", PARSER_MAX_STRING_UTF8_BYTES);
    const acceptanceCriteriaRaw = parserScanPlainArray(requirement.acceptanceCriteria, "executor input requirement.acceptanceCriteria", MAX_OUTPUT_STRING_ARRAY_ITEMS);
    const acceptanceCriteria: string[] = [];
    for (let i = 0; i < acceptanceCriteriaRaw.length; i++) {
      acceptanceCriteria.push(parserAsBoundedString(acceptanceCriteriaRaw[i], `executor input requirement.acceptanceCriteria[${i}]`, PARSER_MAX_STRING_UTF8_BYTES));
    }
    const constraintsRaw = parserScanPlainArray(requirement.constraints, "executor input requirement.constraints", MAX_OUTPUT_STRING_ARRAY_ITEMS);
    const constraints: string[] = [];
    for (let i = 0; i < constraintsRaw.length; i++) {
      constraints.push(parserAsBoundedString(constraintsRaw[i], `executor input requirement.constraints[${i}]`, PARSER_MAX_STRING_UTF8_BYTES));
    }
    const designSummary = parserScanPlainObject(rec.designSummary, EXECUTOR_DESIGN_SUMMARY_KEYS, "executor input designSummary");
    const approach = parserAsBoundedString(designSummary.approach, "executor input designSummary.approach", PARSER_MAX_STRING_UTF8_BYTES);
    const stringArrayField = (raw: unknown, label: string): readonly string[] => {
      const arr = parserScanPlainArray(raw, label, MAX_OUTPUT_STRING_ARRAY_ITEMS);
      const out: string[] = [];
      for (let i = 0; i < arr.length; i++) {
        out.push(parserAsBoundedString(arr[i], `${label}[${i}]`, PARSER_MAX_STRING_UTF8_BYTES));
      }
      return Object.freeze(out);
    };
    const components = stringArrayField(designSummary.components, "executor input designSummary.components");
    const interfaces = stringArrayField(designSummary.interfaces, "executor input designSummary.interfaces");
    const dataChanges = stringArrayField(designSummary.dataChanges, "executor input designSummary.dataChanges");
    const riskControls = stringArrayField(designSummary.riskControls, "executor input designSummary.riskControls");
    const implementationConstraints = stringArrayField(rec.implementationConstraints, "executor input implementationConstraints");
    const allowedPaths = Object.freeze(parserValidatePathList(rec.allowedPaths, "executor input allowedPaths", false));
    const testPlan = parserValidatePlan(rec.testPlan, "executor input testPlan");
    const reviewPlan = parserValidatePlan(rec.reviewPlan, "executor input reviewPlan");
    const allStepIds = new Set<string>();
    for (const step of [...testPlan, ...reviewPlan]) {
      if (allStepIds.has(step.id)) parserValidationFail("invalid_input", "executor input step ids must be unique across both plans");
      allStepIds.add(step.id);
    }
    const maxFixRounds = parserAsSafeInt(rec.maxFixRounds, "executor input maxFixRounds", 0, MAX_MAX_FIX_ROUNDS);
    const maxTotalDurationMs = parserAsSafeInt(rec.maxTotalDurationMs, "executor input maxTotalDurationMs", MIN_EXECUTOR_MAX_TOTAL_DURATION_MS, MAX_EXECUTOR_MAX_TOTAL_DURATION_MS);
    const commitSubject = parserAsBoundedString(rec.commitSubject, "executor input commitSubject", 72);
    const prTitle = parserAsBoundedString(rec.prTitle, "executor input prTitle", 120);
    const value: Readonly<LoopDirectExecutorInput> = deepFreeze({
      schema: "loop_direct_executor_input_v1",
      identity,
      requirement: { objective, acceptanceCriteria: Object.freeze(acceptanceCriteria), constraints: Object.freeze(constraints) },
      designSummary: { approach, components, interfaces, dataChanges, riskControls },
      implementationConstraints,
      allowedPaths,
      testPlan,
      reviewPlan,
      maxFixRounds,
      maxTotalDurationMs,
      commitSubject,
      prTitle,
    });
    parserRequireRoundTrip(intake, false);
    return parserCanonicalParseSuccess(value, JSON.stringify(intake.parsed), sha256Hex(intake.bytes), intake.bytes.length);
  } catch (error) {
    return parserAsFailure(error, "unexpected failure while parsing executor input");
  }
}
