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

import { createHash } from "node:crypto";
import type { LoopRunIdentity } from "./loop-executor-types";
import { validateLoopRunIdentity } from "./loop-run-state";
import type { LoopArtifactKind, LoopArtifactStore, LoopStoredArtifact } from "./loop-artifact-store";
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

function utf8Length(s: string): number {
  return utf8(s).length;
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
 * Plain-object scan with an exact key allowlist. Rejects arrays, non-plain
 * prototypes, symbol/__proto__ keys, accessors, missing descriptors and any
 * reflection that throws (Proxy traps). Produces a fresh null-prototype
 * record with non-configurable, non-writable data properties.
 */
function scanPlain(v: unknown, allowed: readonly string[], label: string): Record<string, unknown> {
  if (v === null || typeof v !== "object") {
    throw new Error(`${label} must be an object`);
  }
  if (Array.isArray(v)) {
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
  if (Array.isArray(v)) {
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
 * Bounded JSON-safe value scan with cycle protection (depth cap + node
 * budget). Used before canonicalizing reviewer findings so that untrusted
 * output can never break serialization.
 */
function isJsonSafeValue(v: unknown, depth: number, budget: { nodes: number }): boolean {
  if (v === null || typeof v === "string" || typeof v === "boolean") return true;
  if (typeof v === "number") return Number.isFinite(v);
  if (Array.isArray(v)) {
    if (depth >= MAX_FINDING_DEPTH) return false;
    for (const item of v) {
      budget.nodes -= 1;
      if (budget.nodes < 0) return false;
      if (!isJsonSafeValue(item, depth + 1, budget)) return false;
    }
    return true;
  }
  if (typeof v === "object") {
    if (depth >= MAX_FINDING_DEPTH) return false;
    let rec: Record<string, unknown>;
    try { rec = scanPlainRecord(v, "finding value"); } catch { return false; }
    for (const key of Object.keys(rec)) {
      budget.nodes -= 1;
      if (budget.nodes < 0) return false;
      if (!isJsonSafeValue(rec[key], depth + 1, budget)) return false;
    }
    return true;
  }
  // functions, symbols, undefined
  return false;
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
  if (v !== v.trim()) return { ok: false, reason: `${label} must be trimmed` };
  if (v.startsWith("/")) return { ok: false, reason: `${label} must be repository-relative` };
  if (v.includes("\\")) return { ok: false, reason: `${label} must not contain backslash` };
  if (NON_CONTROL_RE.test(v)) return { ok: false, reason: `${label} contains control characters` };
  if (v.endsWith("/")) return { ok: false, reason: `${label} must not end with a slash` };
  for (const segment of v.split("/")) {
    if (segment.length === 0) return { ok: false, reason: `${label} has an empty segment` };
    if (segment === "." || segment === "..") return { ok: false, reason: `${label} has a dot segment` };
  }
  if (utf8Length(v) > MAX_PATH_BYTES) return { ok: false, reason: `${label} exceeds the byte limit` };
  return { ok: true, value: v };
}

function validatePathPolicy(v: unknown): { ok: true; allowedRoots: string[]; deniedPaths: string[] } | { ok: false; reason: string } {
  let rec: Record<string, unknown>;
  try { rec = scanPlain(v, PATH_POLICY_KEYS, "pathPolicy"); } catch {
    return { ok: false, reason: "pathPolicy invalid" };
  }
  if (!Array.isArray(rec.allowedRoots)) return { ok: false, reason: "pathPolicy.allowedRoots must be an array" };
  if (rec.allowedRoots.length < 1 || rec.allowedRoots.length > MAX_ALLOWED_ROOTS) {
    return { ok: false, reason: "pathPolicy.allowedRoots count out of range" };
  }
  if (!Array.isArray(rec.deniedPaths)) return { ok: false, reason: "pathPolicy.deniedPaths must be an array" };
  if (rec.deniedPaths.length > MAX_DENIED_PATHS) {
    return { ok: false, reason: "pathPolicy.deniedPaths count out of range" };
  }
  const allowedRoots: string[] = [];
  const seenAllowed = new Set<string>();
  for (let i = 0; i < rec.allowedRoots.length; i++) {
    const r = validateRepoRelativePath(rec.allowedRoots[i], `pathPolicy.allowedRoots[${i}]`);
    if (!r.ok) return { ok: false, reason: (r as { ok: false; reason: string }).reason };
    if (seenAllowed.has(r.value)) return { ok: false, reason: "pathPolicy.allowedRoots must be unique" };
    seenAllowed.add(r.value);
    allowedRoots.push(r.value);
  }
  const deniedPaths: string[] = [];
  const seenDenied = new Set<string>();
  for (let i = 0; i < rec.deniedPaths.length; i++) {
    const r = validateRepoRelativePath(rec.deniedPaths[i], `pathPolicy.deniedPaths[${i}]`);
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
  if (!Array.isArray(rec.allowedExecutableIds)) return { ok: false, reason: "commandPolicy.allowedExecutableIds must be an array" };
  if (rec.allowedExecutableIds.length < 1 || rec.allowedExecutableIds.length > MAX_EXEC_IDS) {
    return { ok: false, reason: "commandPolicy.allowedExecutableIds count out of range" };
  }
  const allowedExecutableIds: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < rec.allowedExecutableIds.length; i++) {
    const id = rec.allowedExecutableIds[i];
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
  if (utf8Length(v) > maxBytes) return { ok: false, reason: "rawRequirement exceeds the byte limit" };
  return { ok: true, value: v };
}

function validateStringArray(v: unknown, label: string): { ok: true; values: string[] } | { ok: false; reason: string } {
  if (!Array.isArray(v)) return { ok: false, reason: `${label} must be an array` };
  const values: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < v.length; i++) {
    const item = v[i];
    if (typeof item !== "string") return { ok: false, reason: `${label}[${i}] must be a string` };
    if (item.trim().length === 0) return { ok: false, reason: `${label}[${i}] must be non-empty` };
    if (NON_CONTROL_RE.test(item)) return { ok: false, reason: `${label}[${i}] contains control characters` };
    if (seen.has(item)) return { ok: false, reason: `${label} must be unique` };
    seen.add(item);
    values.push(item);
  }
  return { ok: true, values };
}

function validateEnumArray(
  v: unknown, label: string, allowed: readonly string[],
): { ok: true; values: string[] } | { ok: false; reason: string } {
  if (!Array.isArray(v)) return { ok: false, reason: `${label} must be an array` };
  const values: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < v.length; i++) {
    const item = v[i];
    if (typeof item !== "string") return { ok: false, reason: `${label}[${i}] must be a string` };
    if (item.trim().length === 0) return { ok: false, reason: `${label}[${i}] must be non-empty` };
    if (NON_CONTROL_RE.test(item)) return { ok: false, reason: `${label}[${i}] contains control characters` };
    if (!allowed.includes(item)) return { ok: false, reason: `${label}[${i}] is not a canonical value` };
    if (seen.has(item)) return { ok: false, reason: `${label} must be unique` };
    seen.add(item);
    values.push(item);
  }
  return { ok: true, values };
}

function validateRequirementSummary(v: unknown): { ok: true; summary: CanonicalSummary } | { ok: false; reason: string } {
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
  }
  if (rec.repositoryScope !== "single_repository" && rec.repositoryScope !== "multi_repository") {
    return { ok: false, reason: "requirement summary repositoryScope invalid" };
  }
  if (rec.complexity !== "direct" && rec.complexity !== "complex") {
    return { ok: false, reason: "requirement summary complexity invalid" };
  }
  const arrays: Record<string, string[]> = Object.create(null) as Record<string, string[]>;
  for (const field of SUMMARY_STRING_ARRAY_FIELDS) {
    const r = validateStringArray(rec[field], `requirement summary ${field}`);
    if (!r.ok) return { ok: false, reason: (r as { ok: false; reason: string }).reason };
    arrays[field] = r.values;
  }
  const riskFlagsResult = validateEnumArray(rec.riskFlags, "requirement summary riskFlags", RISK_FLAGS);
  if (!riskFlagsResult.ok) return { ok: false, reason: (riskFlagsResult as { ok: false; reason: string }).reason };
  const requestedSideEffectsResult = validateEnumArray(rec.requestedSideEffects, "requirement summary requestedSideEffects", REQUESTED_SIDE_EFFECTS);
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
  plan: unknown, label: string, allowedExecutableIds: Set<string>,
): { ok: true; plan: LoopDeliveryCommandStep[] } | { ok: false; reason: string } {
  if (!Array.isArray(plan) || plan.length < 1 || plan.length > MAX_PLAN_STEPS) {
    return { ok: false, reason: `${label} count out of range` };
  }
  const stepIds = new Set<string>();
  const validated: LoopDeliveryCommandStep[] = [];
  for (let i = 0; i < plan.length; i++) {
    let scanned: Record<string, unknown>;
    try { scanned = scanPlain(plan[i], STEP_KEYS, `${label}[${i}]`); } catch {
      return { ok: false, reason: `${label}[${i}] step invalid` };
    }
    if (typeof scanned.id !== "string" || !STEP_ID_RE.test(scanned.id)) {
      return { ok: false, reason: `${label}[${i}].id invalid` };
    }
    if (stepIds.has(scanned.id)) return { ok: false, reason: `${label}[${i}].id duplicate` };
    stepIds.add(scanned.id);
    if (typeof scanned.executableId !== "string" || !allowedExecutableIds.has(scanned.executableId)) {
      return { ok: false, reason: `${label}[${i}].executableId not allowed` };
    }
    let args: string[] | undefined;
    if (scanned.args !== undefined) {
      if (!Array.isArray(scanned.args) || scanned.args.length > MAX_STEP_ARGS) {
        return { ok: false, reason: `${label}[${i}].args invalid` };
      }
      let totalBytes = 0;
      const argsCopy: string[] = [];
      for (let j = 0; j < scanned.args.length; j++) {
        const arg = scanned.args[j];
        if (typeof arg !== "string") return { ok: false, reason: `${label}[${i}].args[${j}] not a string` };
        if (arg.includes(NUL)) return { ok: false, reason: `${label}[${i}].args[${j}] contains NUL` };
        const argBytes = utf8Length(arg);
        if (argBytes > MAX_ARG_BYTES) return { ok: false, reason: `${label}[${i}].args[${j}] too long` };
        totalBytes += argBytes;
        argsCopy.push(arg);
      }
      if (totalBytes > MAX_ARGS_TOTAL_BYTES) return { ok: false, reason: `${label}[${i}].args total too large` };
      args = argsCopy;
    }
    let timeoutMs: number | undefined;
    if (scanned.timeoutMs !== undefined) {
      const t = validateInt(scanned.timeoutMs, MIN_STEP_TIMEOUT_MS, MAX_STEP_TIMEOUT_MS, -1, `${label}[${i}].timeoutMs`);
      if (!t.ok || t.value < 0) return { ok: false, reason: `${label}[${i}].timeoutMs out of range` };
      timeoutMs = t.value;
    }
    let maxStdoutBytes: number | undefined;
    if (scanned.maxStdoutBytes !== undefined) {
      const s = validateInt(scanned.maxStdoutBytes, 1, MAX_STEP_OUTPUT_BYTES, -1, `${label}[${i}].maxStdoutBytes`);
      if (!s.ok || s.value < 0) return { ok: false, reason: `${label}[${i}].maxStdoutBytes out of range` };
      maxStdoutBytes = s.value;
    }
    let maxStderrBytes: number | undefined;
    if (scanned.maxStderrBytes !== undefined) {
      const s = validateInt(scanned.maxStderrBytes, 1, MAX_STEP_OUTPUT_BYTES, -1, `${label}[${i}].maxStderrBytes`);
      if (!s.ok || s.value < 0) return { ok: false, reason: `${label}[${i}].maxStderrBytes out of range` };
      maxStderrBytes = s.value;
    }
    validated.push({
      id: scanned.id as string,
      executableId: scanned.executableId as string,
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
  allowedExecutableIds: Set<string>,
): { ok: true; design: CanonicalDesign } | { ok: false; reason: string } {
  let rec: Record<string, unknown>;
  try { rec = scanPlain(v, DESIGN_KEYS, "technical design"); } catch {
    return { ok: false, reason: "technical design malformed" };
  }
  if (rec.schema !== "loop_technical_design_v1") return { ok: false, reason: "technical design schema mismatch" };
  if (typeof rec.approach !== "string" || rec.approach.trim().length === 0 || rec.approach !== rec.approach.trim()) {
    return { ok: false, reason: "technical design approach must be trimmed non-empty" };
  }
  const arrays: Record<string, string[]> = Object.create(null) as Record<string, string[]>;
  for (const field of DESIGN_STRING_ARRAY_FIELDS) {
    const r = validateStringArray(rec[field], `technical design ${field}`);
    if (!r.ok) return { ok: false, reason: (r as { ok: false; reason: string }).reason };
    arrays[field] = r.values;
  }
  if (!Array.isArray(rec.allowedPaths) || rec.allowedPaths.length < 1 || rec.allowedPaths.length > MAX_DESIGN_ALLOWED_PATHS) {
    return { ok: false, reason: "technical design allowedPaths count out of range" };
  }
  const allowedPaths: string[] = [];
  const seenPaths = new Set<string>();
  for (let i = 0; i < rec.allowedPaths.length; i++) {
    const r = validateRepoRelativePath(rec.allowedPaths[i], `technical design allowedPaths[${i}]`);
    if (!r.ok) return { ok: false, reason: (r as { ok: false; reason: string }).reason };
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
  const testPlanResult = validatePlan(rec.testPlan, "testPlan", allowedExecutableIds);
  if (!testPlanResult.ok) return { ok: false, reason: (testPlanResult as { ok: false; reason: string }).reason };
  const reviewPlanResult = validatePlan(rec.reviewPlan, "reviewPlan", allowedExecutableIds);
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
    if (utf8Length(value) > maxBytes) return { ok: false, reason: `technical design ${field} exceeds the byte limit` };
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

function validateReview(v: unknown): { ok: true; review: CanonicalReview } | { ok: false; reason: string } {
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
  if (!Array.isArray(rec.findings)) return { ok: false, reason: "solution review findings must be an array" };
  const budget = { nodes: MAX_FINDING_NODES };
  const findings: unknown[] = [];
  for (let i = 0; i < rec.findings.length; i++) {
    budget.nodes -= 1;
    if (budget.nodes < 0) return { ok: false, reason: "solution review findings too large" };
    let finding: Record<string, unknown>;
    try { finding = scanPlainRecord(rec.findings[i], `solution review findings[${i}]`); } catch {
      return { ok: false, reason: "solution review findings item invalid" };
    }
    if (!isJsonSafeValue(finding, 0, budget)) return { ok: false, reason: "solution review findings item invalid" };
    findings.push(finding);
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

function canonicalIdentity(identity: LoopRunIdentity): Record<string, unknown> {
  return {
    runId: identity.runId,
    requirementId: identity.requirementId,
    repository: identity.repository,
    repositoryPath: identity.repositoryPath,
    baseBranch: identity.baseBranch,
    expectedBaseSha: identity.expectedBaseSha,
    taskBranch: identity.taskBranch,
    controlRoot: identity.controlRoot,
    createdAt: identity.createdAt,
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

    // Terminal — exactly one terminal per path, always the last trace entry.
    const terminal = (
      route: LoopRequirementDesignRoute,
      reasonCode: LoopRequirementDesignReasonCode,
      message: string,
    ): LoopRequirementDesignResult => {
      // Persist orchestration_result only when the requirement was stored and
      // the terminal is not itself a clock/deadline/put/internal failure —
      // those stop all further side effects.
      if (requirementStored && route !== "failed") {
        if (!deadlineExpired()) {
          const payload = buildOrchestrationResultPayload(
            identity, route, reasonCode, designRounds, requirementArtifactRef,
            designArtifactRefs, solutionReviewArtifactRefs, executorInputArtifactRef,
            executorInputDigest, elapsedMs,
          );
          let stored: LoopStoredArtifact;
          try {
            stored = this.artifactStore.put("orchestration_result", payload);
          } catch {
            // put threw → failed / ARTIFACT_STORE_FAILED; no further puts.
            return finish("failed", "ARTIFACT_STORE_FAILED", "artifact store failed");
          }
          const afterClock = readClock();
          if (afterClock === "CLOCK_INVALID") {
            return finish("failed", "CLOCK_INVALID", "clock invalid");
          }
          if (deadlineExpired()) {
            return finish("failed", "TOTAL_TIMEOUT", "deadline exceeded");
          }
          if (stored.kind !== "orchestration_result" ||
              stored.digest !== sha256Hex(payload) ||
              stored.sizeBytes !== payload.length) {
            return finish("failed", "ARTIFACT_STORE_FAILED", "stored artifact mismatch");
          }
          orchestrationResultArtifactRef = stored.artifactRef;
          addTrace("orchestration_result_stored", designRounds, "stored", stored.artifactRef);
        } else {
          return finish("failed", "TOTAL_TIMEOUT", "deadline exceeded");
        }
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

    // Helper: put with descriptor verification. Clock/deadline after-checks
    // happen in the caller so a successful put keeps its real ref even when
    // the run must stop afterwards.
    const putAndVerify = (
      kind: LoopArtifactKind, bytes: Uint8Array,
    ): { ok: true; ref: string; digest: string; sizeBytes: number } | { ok: false } => {
      let stored: LoopStoredArtifact;
      try {
        stored = this.artifactStore.put(kind, bytes);
      } catch {
        return { ok: false };
      }
      if (stored.kind !== kind || stored.digest !== sha256Hex(bytes) || stored.sizeBytes !== bytes.length) {
        return { ok: false };
      }
      return { ok: true, ref: stored.artifactRef, digest: stored.digest, sizeBytes: stored.sizeBytes };
    };

    // ═══════════════════════════════════════ request validation
    let req: Record<string, unknown>;
    try {
      req = scanPlain(request, REQUEST_KEYS, "request");
    } catch {
      return terminal("failed", "INVALID_INPUT", "invalid request");
    }

    try {
      validateLoopRunIdentity(req.identity);
    } catch {
      return terminal("failed", "INVALID_INPUT", "invalid identity");
    }
    const identity = deepFreeze(canonicalIdentity(req.identity as LoopRunIdentity)) as unknown as LoopRunIdentity;

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
    if (deadlineExpired()) return terminal("failed", "TOTAL_TIMEOUT", "deadline exceeded");
    let rawSummary: unknown;
    try {
      rawSummary = this.agent.normalize(normalizeInput);
    } catch {
      return terminal("blocked", "DEPENDENCY_FAILED", "requirement normalization failed");
    }
    const afterNormalizeClock = readClock();
    if (afterNormalizeClock === "CLOCK_INVALID") {
      return terminal("failed", "CLOCK_INVALID", "clock invalid");
    }
    if (deadlineExpired()) return terminal("failed", "TOTAL_TIMEOUT", "deadline exceeded");
    const summaryResult = validateRequirementSummary(rawSummary);
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
    if (deadlineExpired()) return terminal("failed", "TOTAL_TIMEOUT", "deadline exceeded");
    const requirementPut = putAndVerify("requirement_summary", requirementPayload);
    if (!requirementPut.ok) {
      return terminal("failed", "ARTIFACT_STORE_FAILED", "artifact store failed");
    }
    const afterRequirementClock = readClock();
    if (afterRequirementClock === "CLOCK_INVALID") {
      requirementArtifactRef = requirementPut.ref;
      requirementStored = true;
      addTrace("requirement_stored", 0, "stored", requirementPut.ref);
      return terminal("failed", "CLOCK_INVALID", "clock invalid");
    }
    if (deadlineExpired()) {
      requirementArtifactRef = requirementPut.ref;
      requirementStored = true;
      addTrace("requirement_stored", 0, "stored", requirementPut.ref);
      return terminal("failed", "TOTAL_TIMEOUT", "deadline exceeded");
    }
    requirementArtifactRef = requirementPut.ref;
    requirementStored = true;
    addTrace("requirement_stored", 0, "stored", requirementPut.ref);

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
      if (deadlineExpired()) return terminal("failed", "TOTAL_TIMEOUT", "deadline exceeded");
      let rawDesign: unknown;
      try {
        rawDesign = this.agent.design(designInput);
      } catch {
        return terminal("blocked", "DEPENDENCY_FAILED", "technical design failed");
      }
      const afterDesignClock = readClock();
      if (afterDesignClock === "CLOCK_INVALID") {
        return terminal("failed", "CLOCK_INVALID", "clock invalid");
      }
      if (deadlineExpired()) return terminal("failed", "TOTAL_TIMEOUT", "deadline exceeded");
      const designResult = validateDesign(rawDesign, allowedRoots, deniedPaths, allowedExecutableIdSet);
      if (!designResult.ok) {
        return terminal("blocked", "DEPENDENCY_RESULT_INVALID", "technical design malformed");
      }
      const design = deepFreeze(designResult.design) as unknown as CanonicalDesign;
      const designBytes = utf8(JSON.stringify(canonicalDesign(design)));
      if (designBytes.length > limits.maxAgentOutputBytes) {
        return terminal("blocked", "DEPENDENCY_RESULT_INVALID", "technical design too large");
      }
      const designPayload = buildDesignPayload(identity, requirementArtifactRef, round, design);
      if (deadlineExpired()) return terminal("failed", "TOTAL_TIMEOUT", "deadline exceeded");
      const designPut = putAndVerify("technical_design", designPayload);
      if (!designPut.ok) {
        return terminal("failed", "ARTIFACT_STORE_FAILED", "artifact store failed");
      }
      const afterDesignPutClock = readClock();
      if (afterDesignPutClock === "CLOCK_INVALID") {
        designArtifactRefs.push(designPut.ref);
        addTrace("design_stored", round, "stored", designPut.ref);
        return terminal("failed", "CLOCK_INVALID", "clock invalid");
      }
      if (deadlineExpired()) {
        designArtifactRefs.push(designPut.ref);
        addTrace("design_stored", round, "stored", designPut.ref);
        return terminal("failed", "TOTAL_TIMEOUT", "deadline exceeded");
      }
      designArtifactRefs.push(designPut.ref);
      addTrace("design_stored", round, "stored", designPut.ref);

      // ═══════════════════════════════════════ solution review
      addTrace("review_started", round, "started", null);
      const reviewInput = deepFreeze({
        identity,
        round,
        requirement: summary,
        design,
        requirementArtifactRef,
        designArtifactRef: designPut.ref,
      });
      if (deadlineExpired()) return terminal("failed", "TOTAL_TIMEOUT", "deadline exceeded");
      let rawReview: unknown;
      try {
        rawReview = this.reviewer.review(reviewInput);
      } catch {
        return terminal("blocked", "DEPENDENCY_FAILED", "solution review failed");
      }
      const afterReviewClock = readClock();
      if (afterReviewClock === "CLOCK_INVALID") {
        return terminal("failed", "CLOCK_INVALID", "clock invalid");
      }
      if (deadlineExpired()) return terminal("failed", "TOTAL_TIMEOUT", "deadline exceeded");
      const reviewResult = validateReview(rawReview);
      if (!reviewResult.ok) {
        return terminal("blocked", "DEPENDENCY_RESULT_INVALID", "solution review malformed");
      }
      const review = deepFreeze(reviewResult.review) as unknown as CanonicalReview;
      const reviewBytes = utf8(JSON.stringify(canonicalReview(review)));
      if (reviewBytes.length > limits.maxAgentOutputBytes) {
        return terminal("blocked", "DEPENDENCY_RESULT_INVALID", "solution review too large");
      }
      const reviewPayload = buildReviewPayload(identity, designPut.ref, round, review);
      if (deadlineExpired()) return terminal("failed", "TOTAL_TIMEOUT", "deadline exceeded");
      const reviewPut = putAndVerify("solution_review", reviewPayload);
      if (!reviewPut.ok) {
        return terminal("failed", "ARTIFACT_STORE_FAILED", "artifact store failed");
      }
      const afterReviewPutClock = readClock();
      if (afterReviewPutClock === "CLOCK_INVALID") {
        solutionReviewArtifactRefs.push(reviewPut.ref);
        addTrace("review_stored", round, "stored", reviewPut.ref);
        return terminal("failed", "CLOCK_INVALID", "clock invalid");
      }
      if (deadlineExpired()) {
        solutionReviewArtifactRefs.push(reviewPut.ref);
        addTrace("review_stored", round, "stored", reviewPut.ref);
        return terminal("failed", "TOTAL_TIMEOUT", "deadline exceeded");
      }
      solutionReviewArtifactRefs.push(reviewPut.ref);
      addTrace("review_stored", round, "stored", reviewPut.ref);

      if (review.status === "PASS") {
        // The executor input object is only exposed when its artifact was
        // durably persisted — never on a failed put.
        const builtExecutorInput = deepFreeze(buildExecutorInput(identity, summary, design, limits)) as unknown as LoopDirectExecutorInput;
        const executorInputBytes = utf8(JSON.stringify(canonicalExecutorInput(builtExecutorInput)));
        if (deadlineExpired()) return terminal("failed", "TOTAL_TIMEOUT", "deadline exceeded");
        const executorInputPut = putAndVerify("executor_input", executorInputBytes);
        if (!executorInputPut.ok) {
          return terminal("failed", "ARTIFACT_STORE_FAILED", "artifact store failed");
        }
        executorInput = builtExecutorInput;
        executorInputArtifactRef = executorInputPut.ref;
        executorInputDigest = executorInputPut.digest;
        addTrace("executor_input_stored", round, "stored", executorInputPut.ref);
        const afterExecutorInputClock = readClock();
        if (afterExecutorInputClock === "CLOCK_INVALID") {
          return terminal("failed", "CLOCK_INVALID", "clock invalid");
        }
        if (deadlineExpired()) {
          return terminal("failed", "TOTAL_TIMEOUT", "deadline exceeded");
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
