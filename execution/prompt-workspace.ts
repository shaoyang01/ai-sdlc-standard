// Prompt Workspace — C03-E E5 W3 (plan C: workspace file-pointer transport)
// ============================================================================
// The ONLY prompt-layer module that touches the filesystem, and it touches
// exactly one thing: staging the (potentially very large) task input into the
// attempt workspace so the Agent CLI can READ it itself instead of receiving it
// through argv/stdin.
//
// Why this exists (W3 probe evidence, docs/reports/c03-e5-task-set-and-acceptance-audit.md §4.2):
//   - argv is capped per-argument (runner MAX_ARG_B = 4096 B) and stdin is
//     capped at 1 MiB, while a real requirement document measured 37,266 B and
//     the chain (requirement → design → implementation record) grows at every
//     hop. Any transport-of-content ceiling eventually breaks.
//   - hermes 0.20.6 does not resolve a relative path against the process cwd
//     (probed: relative FAIL, absolute PASS), so a pointer may have to be
//     absolute — which is why normalizeWorkspacePaths() exists below.
//
// Hard properties:
//   - staged file names are derived ONLY from closed enums + a safe integer,
//     never from caller free text (same discipline as the hermes usage file).
//   - every staged pointer carries a sha256 of its bytes so the journal can
//     prove WHAT was fed to the agent without storing the content itself.
//   - nothing here parses agent output, decides retries, or writes the journal.

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";

/** Staged inputs live in one predictable subdirectory of the attempt workspace. */
export const PROMPT_INPUT_DIRNAME = "prompt-input";

/** A pointer must be a single safe path segment under PROMPT_INPUT_DIRNAME. */
const SEGMENT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export type PromptWorkspaceErrorCode =
  | "PROMPT_WORKSPACE_INVALID_INPUT"
  | "PROMPT_WORKSPACE_UNSAFE_PATH"
  | "PROMPT_WORKSPACE_STAGE_FAILED";

export class PromptWorkspaceError extends Error {
  readonly code: PromptWorkspaceErrorCode;
  constructor(code: PromptWorkspaceErrorCode, message: string) {
    super(message);
    this.name = "PromptWorkspaceError";
    this.code = code;
  }
}

function fail(code: PromptWorkspaceErrorCode, message: string): never {
  throw new PromptWorkspaceError(code, message);
}

export interface PromptInputPointer {
  /** Path relative to the attempt workspace, e.g. `prompt-input/x.md`. */
  readonly relativePath: string;
  /** Absolute path (hermes needs it — it ignores the process cwd). */
  readonly absolutePath: string;
  /** sha256 of the staged bytes. */
  readonly digest: string;
  readonly bytes: number;
}

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Reject anything that is not one safe segment inside PROMPT_INPUT_DIRNAME:
 * no `..`, no separators, no absolute paths, no control characters, no
 * leading dot. Fail-closed — a pointer we cannot vouch for is never staged.
 */
export function assertPromptPointerSegment(relativePath: string): string {
  if (typeof relativePath !== "string" || relativePath.length === 0) {
    fail("PROMPT_WORKSPACE_INVALID_INPUT", "relativePath must be a non-empty string");
  }
  const prefix = `${PROMPT_INPUT_DIRNAME}/`;
  if (!relativePath.startsWith(prefix)) {
    fail("PROMPT_WORKSPACE_UNSAFE_PATH", "relativePath must live under prompt-input/");
  }
  const segment = relativePath.slice(prefix.length);
  if (!SEGMENT_RE.test(segment) || segment.includes("..")) {
    fail("PROMPT_WORKSPACE_UNSAFE_PATH", "relativePath segment rejected");
  }
  if (relativePath !== `${PROMPT_INPUT_DIRNAME}/${segment}`) {
    fail("PROMPT_WORKSPACE_UNSAFE_PATH", "relativePath is not a single segment");
  }
  return relativePath;
}

export interface StagePromptInputRequest {
  /** Attempt workspace root; must already be an allowed runner cwd. */
  readonly workspaceDir: string;
  readonly content: string;
  readonly capability: string;
  readonly executionRole: string;
  readonly attempt: number;
}

/**
 * Write `content` into the attempt workspace and return its pointer. The file
 * name comes from closed enums + a safe integer only, so a hostile capability
 * name or runId can never steer the path.
 */
export function stagePromptInput(req: StagePromptInputRequest): PromptInputPointer {
  if (typeof req.workspaceDir !== "string" || req.workspaceDir.length === 0) {
    fail("PROMPT_WORKSPACE_INVALID_INPUT", "workspaceDir must be a non-empty string");
  }
  if (typeof req.content !== "string" || req.content.length === 0) {
    fail("PROMPT_WORKSPACE_INVALID_INPUT", "content must be a non-empty string");
  }
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(req.capability)) {
    fail("PROMPT_WORKSPACE_INVALID_INPUT", "capability is not a canonical id");
  }
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(req.executionRole)) {
    fail("PROMPT_WORKSPACE_INVALID_INPUT", "executionRole is not a canonical id");
  }
  if (!Number.isSafeInteger(req.attempt) || req.attempt < 1) {
    fail("PROMPT_WORKSPACE_INVALID_INPUT", "attempt must be a safe integer >= 1");
  }

  const segment = `${req.capability}-${req.executionRole}-${req.attempt}.md`;
  const relativePath = assertPromptPointerSegment(`${PROMPT_INPUT_DIRNAME}/${segment}`);
  const absolutePath = join(req.workspaceDir, PROMPT_INPUT_DIRNAME, segment);

  try {
    mkdirSync(join(req.workspaceDir, PROMPT_INPUT_DIRNAME), { recursive: true });
    writeFileSync(absolutePath, req.content, "utf8");
  } catch (e) {
    fail("PROMPT_WORKSPACE_STAGE_FAILED", `cannot stage prompt input (${(e as Error).message})`);
  }

  return Object.freeze({
    relativePath,
    absolutePath,
    digest: sha256Hex(req.content),
    bytes: Buffer.byteLength(req.content, "utf8"),
  });
}

/**
 * Replace the attempt-workspace absolute prefix with a stable placeholder so an
 * invocationDigest describes the SHAPE of a call, not the temp directory it
 * happened to run in. Used for digest input only — never for the real argv.
 */
export function normalizeWorkspacePaths(text: string, workspaceDir: string): string {
  if (typeof workspaceDir !== "string" || workspaceDir.length === 0) return text;
  const root = resolve(workspaceDir);
  const prefix = root.endsWith(sep) ? root : root + sep;
  return text.split(prefix).join("$WORKSPACE/").split(root).join("$WORKSPACE");
}
