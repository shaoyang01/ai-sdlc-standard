// LOOP Requirement Change Classification Model (C02 WP-1)
// ==========================================================
// Pure functions only. No filesystem, SQLite, child_process, Git, network,
// process.env, ExecutionGateway, or Agent adapter imports.
//
// Canonical change records bind every entry-side classification of one
// Requirement to the run journal: the five canonical change kinds, the
// FULL_REQUIREMENT / DELTA_CHANGE payload form, source references, the
// current change scope, the preserved confirmed-fact boundary, trigger
// evidence, the classification reason and the previous-generation reference.
// Classification uncertainty or source conflict is persisted as a BLOCKED
// record; the model never guesses business facts. Records carry fixed safe
// scalars only — never raw prompts, document content, credentials or
// arbitrary JSON metadata.

import { types as utilTypes } from "node:util";

import { LoopRunJournalError } from "./loop-executor-types";
import { readPlainDataRecord, validateRequirementId } from "./loop-run-state";

export const LOOP_CHANGE_RECORD_SCHEMA_VERSION = 1 as const;

export const LOOP_CHANGE_KINDS = [
  "NEW_REQUIREMENT",
  "SUPPLEMENT",
  "CHANGE",
  "REWORK",
  "FEEDBACK_DRIVEN_CHANGE",
] as const;
export type LoopChangeKind = (typeof LOOP_CHANGE_KINDS)[number];

export const LOOP_CHANGE_PAYLOAD_FORMS = ["FULL_REQUIREMENT", "DELTA_CHANGE"] as const;
export type LoopChangePayloadForm = (typeof LOOP_CHANGE_PAYLOAD_FORMS)[number];

export const LOOP_CHANGE_RECORD_STATUSES = ["CLASSIFIED", "BLOCKED"] as const;
export type LoopChangeRecordStatus = (typeof LOOP_CHANGE_RECORD_STATUSES)[number];

// Source types follow the entry contract's readable source categories.
export const LOOP_CHANGE_SOURCE_TYPES = [
  "CONVERSATION",
  "LARK_DOCUMENT",
  "EXTRACTED_DOCUMENT",
  "VISUAL_CAPTURE",
  "HISTORICAL_RECORD",
] as const;
export type LoopChangeSourceType = (typeof LOOP_CHANGE_SOURCE_TYPES)[number];

// Blocked reason codes follow the entry contract's STOP conditions.
export const LOOP_CHANGE_BLOCKED_REASON_CODES = [
  "BUSINESS_GOAL_UNIDENTIFIABLE",
  "SOURCE_UNREADABLE",
  "SOURCE_PRIORITY_CONFLICT",
  "CLASSIFICATION_UNCERTAIN",
  "AUTHORIZATION_MISSING",
] as const;
export type LoopChangeBlockedReasonCode = (typeof LOOP_CHANGE_BLOCKED_REASON_CODES)[number];

export type LoopChangeSourceRef = Readonly<{
  sourceType: LoopChangeSourceType;
  locator: string;
  priority: number;
  sourceVersion: string | null;
  observedAt: string;
}>;

export type LoopRequirementChangeRecord = Readonly<{
  schemaVersion: typeof LOOP_CHANGE_RECORD_SCHEMA_VERSION;
  changeRecordId: string;
  runId: string;
  requirementId: string;
  sequence: number;
  status: LoopChangeRecordStatus;
  changeKind: LoopChangeKind | null;
  payloadForm: LoopChangePayloadForm | null;
  // WP-1 records the binding to the previous orchestration generation only;
  // generation advancement authority belongs to the orchestration WP.
  previousGeneration: number | null;
  currentChangeScope: string | null;
  confirmedFactsPreserved: readonly string[];
  sourceRefs: readonly LoopChangeSourceRef[];
  triggerEvidence: readonly string[];
  classificationReason: string;
  blockedReasonCode: LoopChangeBlockedReasonCode | null;
  createdAt: string;
}>;

/** Builder input: the record without schemaVersion and changeRecordId. */
export type LoopRequirementChangeDraft = Readonly<{
  runId: string;
  requirementId: string;
  sequence: number;
  status: LoopChangeRecordStatus;
  changeKind: LoopChangeKind | null;
  payloadForm: LoopChangePayloadForm | null;
  previousGeneration: number | null;
  currentChangeScope: string | null;
  confirmedFactsPreserved: readonly string[];
  sourceRefs: readonly LoopChangeSourceRef[];
  triggerEvidence: readonly string[];
  classificationReason: string;
  blockedReasonCode: LoopChangeBlockedReasonCode | null;
  createdAt: string;
}>;

const RECORD_FIELDS = [
  "schemaVersion", "changeRecordId", "runId", "requirementId", "sequence",
  "status", "changeKind", "payloadForm", "previousGeneration",
  "currentChangeScope", "confirmedFactsPreserved", "sourceRefs",
  "triggerEvidence", "classificationReason", "blockedReasonCode", "createdAt",
] as const;

const DRAFT_FIELDS = [
  "runId", "requirementId", "sequence", "status", "changeKind", "payloadForm",
  "previousGeneration", "currentChangeScope", "confirmedFactsPreserved",
  "sourceRefs", "triggerEvidence", "classificationReason", "blockedReasonCode",
  "createdAt",
] as const;

const SOURCE_REF_FIELDS = [
  "sourceType", "locator", "priority", "sourceVersion", "observedAt",
] as const;

const CONTROL_RE = /[\x00-\x1f\x7f-\x9f]/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const ARTIFACT_REF_RE = /^loop-artifact:v1:([a-z_]+):sha256:([0-9a-f]{64})$/;

function invalid(message: string): never {
  throw new LoopRunJournalError("INVALID_INPUT", message);
}

function exactFields(
  record: Record<string, unknown>,
  fields: readonly string[],
  label: string,
): void {
  const keys = Object.keys(record);
  if (
    keys.length !== fields.length ||
    fields.some((field) => !(field in record)) ||
    keys.some((key) => !fields.includes(key))
  ) {
    invalid(`${label} must contain exactly the canonical fields`);
  }
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value || CONTROL_RE.test(value)) {
    invalid(`${label} must be a safe trimmed non-empty string`);
  }
  return value;
}

function nullableText(value: unknown, label: string): string | null {
  return value === null ? null : text(value, label);
}

function positiveInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    invalid(`${label} must be a positive safe integer`);
  }
  return value;
}

function isoTimestamp(value: unknown, label: string): string {
  const result = text(value, label);
  if (!ISO_RE.test(result) || Number.isNaN(Date.parse(result))) {
    invalid(`${label} must be an ISO-8601 timestamp`);
  }
  return result;
}

/**
 * Nested-list counterpart of readPlainDataRecord. Accepts only dense plain
 * arrays with data-descriptor elements: no Proxy, no accessors, no symbol
 * keys, no holes, no extra properties.
 */
function readPlainDataArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) invalid(`${label} must be a plain data array`);
  if (utilTypes.isProxy(value)) invalid(`${label} must not be a Proxy`);
  const arrayValue: readonly unknown[] = value;
  let descriptors: PropertyDescriptorMap;
  try {
    descriptors = Object.getOwnPropertyDescriptors(value as unknown);
  } catch {
    invalid(`${label} must be a plain data array`);
  }
  const elements = new Array<unknown>(arrayValue.length);
  let count = 0;
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string") invalid(`${label} must be a plain data array`);
    if (key === "length") continue;
    if (!/^(0|[1-9][0-9]*)$/.test(key)) invalid(`${label} must be a plain data array`);
    const index = Number(key);
    if (index >= arrayValue.length) invalid(`${label} must be a plain data array`);
    const descriptor = (descriptors as Record<string, PropertyDescriptor>)[key];
    if ("get" in descriptor || "set" in descriptor) invalid(`${label} must be a plain data array`);
    if (!("value" in descriptor)) invalid(`${label} must be a plain data array`);
    elements[index] = descriptor.value;
    count += 1;
  }
  if (count !== arrayValue.length) invalid(`${label} must be a plain data array`);
  return Object.freeze(elements);
}

function textList(value: unknown, label: string): readonly string[] {
  const items = readPlainDataArray(value, label);
  const seen = new Set<string>();
  for (const item of items) {
    const entry = text(item, `${label} element`);
    if (seen.has(entry)) invalid(`${label} elements must be unique`);
    seen.add(entry);
  }
  return Object.freeze([...items]) as readonly string[];
}

/**
 * Trigger evidence entries are either canonical content-addressed artifact
 * references or source-scoped references (`source:<locator>`) that must point
 * back at a locator actually recorded in this record's sourceRefs. Nothing
 * else is evidence.
 */
function evidenceRef(value: unknown, label: string, sourceLocators: ReadonlySet<string>): string {
  const result = text(value, label);
  if (ARTIFACT_REF_RE.test(result)) return result;
  if (result.startsWith("source:") && result.length > "source:".length) {
    const locator = result.slice("source:".length);
    if (!sourceLocators.has(locator)) {
      invalid(`${label} must reference a locator recorded in sourceRefs`);
    }
    return result;
  }
  invalid(`${label} must be a canonical artifact reference or a source-scoped reference`);
}

function sourceRef(value: unknown, label: string): LoopChangeSourceRef {
  if (utilTypes.isProxy(value)) invalid(`${label} must not be a Proxy`);
  const record = readPlainDataRecord(value, label);
  exactFields(record, SOURCE_REF_FIELDS, label);
  if (
    typeof record.sourceType !== "string" ||
    !LOOP_CHANGE_SOURCE_TYPES.includes(record.sourceType as LoopChangeSourceType)
  ) {
    invalid(`${label}.sourceType must be a canonical source type`);
  }
  text(record.locator, `${label}.locator`);
  positiveInteger(record.priority, `${label}.priority`);
  nullableText(record.sourceVersion, `${label}.sourceVersion`);
  isoTimestamp(record.observedAt, `${label}.observedAt`);
  return Object.freeze({
    sourceType: record.sourceType as LoopChangeSourceType,
    locator: record.locator as string,
    priority: record.priority as number,
    sourceVersion: record.sourceVersion as string | null,
    observedAt: record.observedAt as string,
  });
}

function sourceRefList(value: unknown): readonly LoopChangeSourceRef[] {
  const items = readPlainDataArray(value, "sourceRefs");
  if (items.length === 0) invalid("sourceRefs must record at least one source");
  const refs = items.map((item, index) => sourceRef(item, `sourceRefs[${index}]`));
  const priorities = new Set<number>();
  for (const ref of refs) {
    if (priorities.has(ref.priority)) invalid("sourceRefs priorities must be unique");
    priorities.add(ref.priority);
  }
  return Object.freeze(refs);
}

function statusSlug(status: LoopChangeRecordStatus): string {
  return status === "CLASSIFIED" ? "classified" : "blocked";
}

/** Validate the exact fixed-scalar record contract and per-status rules. */
export function validateLoopRequirementChangeRecord(value: unknown): void {
  if (utilTypes.isProxy(value)) invalid("requirement change record must not be a Proxy");
  const record = readPlainDataRecord(value, "requirement change record");
  exactFields(record, RECORD_FIELDS, "requirement change record");
  if (record.schemaVersion !== LOOP_CHANGE_RECORD_SCHEMA_VERSION) {
    invalid("requirement change schema version is unsupported");
  }
  text(record.changeRecordId, "changeRecordId");
  const runId = text(record.runId, "runId");
  validateRequirementId(record.requirementId, "requirementId");
  const sequence = positiveInteger(record.sequence, "sequence");
  if (
    typeof record.status !== "string" ||
    !LOOP_CHANGE_RECORD_STATUSES.includes(record.status as LoopChangeRecordStatus)
  ) {
    invalid("status must be a canonical requirement change status");
  }
  const status = record.status as LoopChangeRecordStatus;
  if (
    record.changeKind !== null &&
    (typeof record.changeKind !== "string" || !LOOP_CHANGE_KINDS.includes(record.changeKind as LoopChangeKind))
  ) {
    invalid("changeKind must be a canonical change kind or null");
  }
  if (
    record.payloadForm !== null &&
    (typeof record.payloadForm !== "string" ||
      !LOOP_CHANGE_PAYLOAD_FORMS.includes(record.payloadForm as LoopChangePayloadForm))
  ) {
    invalid("payloadForm must be a canonical payload form or null");
  }
  if (record.previousGeneration !== null) positiveInteger(record.previousGeneration, "previousGeneration");
  if (record.currentChangeScope !== null) text(record.currentChangeScope, "currentChangeScope");
  const confirmedFacts = textList(record.confirmedFactsPreserved, "confirmedFactsPreserved");
  const refs = sourceRefList(record.sourceRefs);
  const sourceLocators = new Set(refs.map((ref) => ref.locator));
  const evidence = textList(record.triggerEvidence, "triggerEvidence");
  for (const item of evidence) evidenceRef(item, "triggerEvidence element", sourceLocators);
  text(record.classificationReason, "classificationReason");
  if (
    record.blockedReasonCode !== null &&
    (typeof record.blockedReasonCode !== "string" ||
      !LOOP_CHANGE_BLOCKED_REASON_CODES.includes(record.blockedReasonCode as LoopChangeBlockedReasonCode))
  ) {
    invalid("blockedReasonCode must be a canonical blocked reason code or null");
  }
  isoTimestamp(record.createdAt, "createdAt");
  if (record.changeRecordId !== `${runId}:change:${sequence}:${statusSlug(status)}`) {
    invalid("changeRecordId must match run, sequence and status");
  }

  if (status === "BLOCKED") {
    // A blocked record persists the uncertainty itself; it must not carry any
    // classified business fact the entry could not confirm.
    if (
      record.changeKind !== null || record.payloadForm !== null ||
      record.previousGeneration !== null || record.currentChangeScope !== null ||
      confirmedFacts.length !== 0
    ) {
      invalid("blocked requirement change must not carry classified fields");
    }
    if (record.blockedReasonCode === null) {
      invalid("blocked requirement change requires a blocked reason code");
    }
    return;
  }

  if (record.changeKind === null || record.payloadForm === null) {
    invalid("classified requirement change requires changeKind and payloadForm");
  }
  if (record.blockedReasonCode !== null) {
    invalid("classified requirement change must not carry a blocked reason code");
  }
  if (record.currentChangeScope === null) {
    invalid("classified requirement change requires the current change scope");
  }
  if (evidence.length === 0) {
    invalid("classified requirement change requires trigger evidence");
  }
  const changeKind = record.changeKind as LoopChangeKind;
  if (changeKind === "NEW_REQUIREMENT") {
    if (record.payloadForm !== "FULL_REQUIREMENT") {
      invalid("new requirement must use the FULL_REQUIREMENT payload form");
    }
    if (record.previousGeneration !== null) {
      invalid("new requirement must not reference a previous generation");
    }
    if (confirmedFacts.length !== 0) {
      invalid("new requirement must not claim previously confirmed facts");
    }
  } else {
    if (record.payloadForm !== "DELTA_CHANGE") {
      invalid("same-requirement change must use the DELTA_CHANGE payload form");
    }
    if (record.previousGeneration === null) {
      invalid("same-requirement change must reference the previous generation");
    }
    if (confirmedFacts.length === 0) {
      invalid("same-requirement change must state the preserved confirmed facts");
    }
  }
}

/** Fixed-order canonical representation used by the run-journal hash. */
export function canonicalizeLoopRequirementChangeRecord(record: LoopRequirementChangeRecord): string {
  validateLoopRequirementChangeRecord(record);
  return JSON.stringify({
    schemaVersion: record.schemaVersion,
    changeRecordId: record.changeRecordId,
    runId: record.runId,
    requirementId: record.requirementId,
    sequence: record.sequence,
    status: record.status,
    changeKind: record.changeKind,
    payloadForm: record.payloadForm,
    previousGeneration: record.previousGeneration,
    currentChangeScope: record.currentChangeScope,
    confirmedFactsPreserved: record.confirmedFactsPreserved,
    sourceRefs: record.sourceRefs,
    triggerEvidence: record.triggerEvidence,
    classificationReason: record.classificationReason,
    blockedReasonCode: record.blockedReasonCode,
    createdAt: record.createdAt,
  });
}

function deepFreezeRecord(record: LoopRequirementChangeRecord): LoopRequirementChangeRecord {
  for (const ref of record.sourceRefs) Object.freeze(ref);
  Object.freeze(record.sourceRefs);
  Object.freeze(record.confirmedFactsPreserved);
  Object.freeze(record.triggerEvidence);
  return Object.freeze(record);
}

/**
 * The only sanctioned record constructor: validates the draft, derives the
 * schema version and canonical record id, and returns a deep-frozen record.
 * Persisted writes still go exclusively through the run-store append API.
 */
export function createLoopRequirementChangeRecord(draft: unknown): LoopRequirementChangeRecord {
  if (utilTypes.isProxy(draft)) invalid("requirement change draft must not be a Proxy");
  const record = readPlainDataRecord(draft, "requirement change draft");
  exactFields(record, DRAFT_FIELDS, "requirement change draft");
  const slug = record.status === "BLOCKED" ? "blocked" : "classified";
  const candidate = {
    schemaVersion: LOOP_CHANGE_RECORD_SCHEMA_VERSION,
    changeRecordId: `${String(record.runId)}:change:${String(record.sequence)}:${slug}`,
    runId: record.runId,
    requirementId: record.requirementId,
    sequence: record.sequence,
    status: record.status,
    changeKind: record.changeKind,
    payloadForm: record.payloadForm,
    previousGeneration: record.previousGeneration,
    currentChangeScope: record.currentChangeScope,
    confirmedFactsPreserved: record.confirmedFactsPreserved,
    sourceRefs: record.sourceRefs,
    triggerEvidence: record.triggerEvidence,
    classificationReason: record.classificationReason,
    blockedReasonCode: record.blockedReasonCode,
    createdAt: record.createdAt,
  };
  validateLoopRequirementChangeRecord(candidate);
  return deepFreezeRecord(candidate as unknown as LoopRequirementChangeRecord);
}

/**
 * Verify a complete per-run change chain. Sequences are contiguous from one,
 * timestamps monotonic, ids and the Requirement identity consistent, and a
 * NEW_REQUIREMENT classification may only appear as the first classified
 * record of the run. BLOCKED records never close the chain: a later record
 * may carry the resolved classification once the entry can confirm it.
 */
export function validateLoopRequirementChangeChain(
  records: readonly LoopRequirementChangeRecord[],
  expectedRunId: string,
): void {
  const ids = new Set<string>();
  let requirementId: string | null = null;
  let classifiedSeen = false;
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]!;
    validateLoopRequirementChangeRecord(record);
    if (record.runId !== expectedRunId) invalid("requirement change run identity mismatch");
    if (record.sequence !== index + 1) invalid("requirement change sequence must be contiguous from one");
    if (index > 0 && Date.parse(record.createdAt) < Date.parse(records[index - 1]!.createdAt)) {
      invalid("requirement change timestamps must be monotonic");
    }
    if (ids.has(record.changeRecordId)) invalid("requirement change record id must be unique");
    ids.add(record.changeRecordId);
    if (requirementId === null) {
      requirementId = record.requirementId;
    } else if (record.requirementId !== requirementId) {
      invalid("requirement change records must share one Requirement identity");
    }
    if (record.status === "CLASSIFIED") {
      if (record.changeKind === "NEW_REQUIREMENT" && classifiedSeen) {
        invalid("new requirement classification is only valid as the first classified record");
      }
      classifiedSeen = true;
    }
  }
}
