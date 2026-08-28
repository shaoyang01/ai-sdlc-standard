// LOOP production entry CLI — C03-E W3 (E1-T3, wiring §4)
// ============================================================================
// The SINGLE command-line door into the v2 production chain. It carries NO
// token / command / argv-template / environment surface: argv is a closed
// flag set, the request is a closed-schema JSON file, and the printed result is
// a closed field set (never raw Agent stdout or the process environment).
//
//   tsx scripts/loop-run.ts --request-file <abs path>
//     [--resume <runId>] [--capability-source deterministic|real] [--help]
//
// W3 boundary: the capability source DEFAULTS to deterministic; --capability-
// source real is refused at runProduction (PRODUCTION_REAL_NOT_AUTHORIZED)
// until the separate E5 real canary grant. This command runs only the READ-ONLY
// git preflight (workspaceManager.inspect); it never creates a worktree and
// never spawns an Agent CLI.

import { readFileSync, lstatSync } from "node:fs";
import { join, delimiter } from "node:path";

import {
  parseProductionEntryRequest,
  ProductionEntryError,
} from "../core/loop-production-entry";
import { LoopPosixProcessRunner } from "../core/loop-posix-process-runner";
import { LoopGitWorkspaceManager } from "../core/loop-git-workspace";
import { isCapabilitySource, type CapabilitySource } from "../execution/capability-gateway-source";
import { runProduction, ProductionRunError } from "../runtime";
import { LoopRunJournalError } from "../core/loop-executor-types";

// ── Closed argv contract ──────────────────────────────────────────────
const VALUE_FLAGS = Object.freeze({
  "--request-file": "requestFile",
  "--resume": "resumeRunId",
  "--capability-source": "capabilitySource",
} as const);
const BOOLEAN_FLAGS = Object.freeze(new Set<string>(["--help"]));

export interface ParsedLoopRunArgs {
  readonly help: boolean;
  readonly requestFile: string | null;
  readonly resumeRunId: string | null;
  readonly capabilitySource: CapabilitySource;
}

export class LoopRunCliError extends Error {
  constructor(
    public readonly code:
      | "UNKNOWN_FLAG"
      | "POSITIONAL_NOT_ALLOWED"
      | "MISSING_VALUE"
      | "DUPLICATE_FLAG"
      | "MISSING_REQUEST_FILE"
      | "INVALID_CAPABILITY_SOURCE"
      | "REQUEST_HAS_NO_SOURCE",
    message: string,
  ) {
    super(message);
    this.name = "LoopRunCliError";
  }
}

/**
 * Pure, closed argv parser. Exported for direct fuzz testing. It never touches
 * the filesystem, shell or environment; any token outside the closed contract
 * is rejected fail-closed.
 */
export function parseLoopRunArgs(argv: readonly string[]): ParsedLoopRunArgs {
  let help = false;
  let requestFile: string | null = null;
  let resumeRunId: string | null = null;
  let capabilitySource: CapabilitySource = "deterministic";
  const seen = new Set<string>();

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]!;
    if (!token.startsWith("--")) {
      throw new LoopRunCliError("POSITIONAL_NOT_ALLOWED", `bare positional argument is not allowed: "${token}"`);
    }
    if (BOOLEAN_FLAGS.has(token)) {
      if (seen.has(token)) throw new LoopRunCliError("DUPLICATE_FLAG", `flag ${token} given twice`);
      seen.add(token);
      help = true;
      continue;
    }
    const field = VALUE_FLAGS[token as keyof typeof VALUE_FLAGS];
    if (field === undefined) {
      throw new LoopRunCliError("UNKNOWN_FLAG", `unknown flag "${token}"; the closed flag set is --request-file/--resume/--capability-source/--help`);
    }
    if (seen.has(token)) throw new LoopRunCliError("DUPLICATE_FLAG", `flag ${token} given twice`);
    seen.add(token);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new LoopRunCliError("MISSING_VALUE", `flag ${token} requires a value`);
    }
    i += 1;

    if (field === "requestFile") requestFile = value;
    else if (field === "resumeRunId") resumeRunId = value;
    else if (field === "capabilitySource") {
      if (!isCapabilitySource(value)) {
        throw new LoopRunCliError("INVALID_CAPABILITY_SOURCE", `--capability-source must be deterministic|real, got "${value}"`);
      }
      capabilitySource = value;
    }
  }

  if (!help && requestFile === null) {
    throw new LoopRunCliError("MISSING_REQUEST_FILE", "--request-file <abs path> is required (or use --help)");
  }
  return Object.freeze({ help, requestFile, resumeRunId, capabilitySource });
}

// ── Helpers (no shell, no dynamic command) ─────────────────────────────
function findGit(): string {
  for (const dir of (process.env.PATH || "/usr/bin:/bin").split(delimiter)) {
    const candidate = join(dir, "git");
    try {
      const stat = lstatSync(candidate);
      if (stat.isFile() && (stat.mode & 0o111) !== 0) return candidate;
    } catch {
      // try next PATH entry
    }
  }
  throw new Error("git executable not found on PATH");
}

const MAX_SOURCE_BYTES = 256 * 1024;

function readRequirementText(sourceFiles: readonly string[]): string {
  if (sourceFiles.length === 0) {
    throw new LoopRunCliError("REQUEST_HAS_NO_SOURCE", "request sourceFiles is empty; a production run needs at least one requirement source");
  }
  const parts: string[] = [];
  let total = 0;
  for (const file of sourceFiles) {
    const buf = readFileSync(file);
    total += buf.length;
    if (total > MAX_SOURCE_BYTES) {
      throw new Error("requirement sources exceed the 256KiB total limit");
    }
    parts.push(buf.toString("utf8"));
  }
  return parts.join("\n\n");
}

const HELP_TEXT = [
  "loop-run — v2 production chain entry (C03-E W3)",
  "Usage: tsx scripts/loop-run.ts --request-file <abs path>",
  "         [--resume <runId>] [--capability-source deterministic|real]",
  "         [--help]",
  "Defaults: --capability-source deterministic. real is dormant (E5 grant).",
].join("\n");

async function main(argv: readonly string[]): Promise<number> {
  const args = parseLoopRunArgs(argv);
  if (args.help) {
    process.stdout.write(`${HELP_TEXT}\n`);
    return 0;
  }

  // Closed request file → closed-schema parse → identity.
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(args.requestFile as string, "utf8"));
  } catch (error) {
    process.stderr.write(`LOOP_RUN_ERROR BAD_REQUEST_FILE: ${(error as Error).message}\n`);
    return 1;
  }

  const now = (): string => new Date().toISOString();
  const preReqId = (raw as { requirementId?: unknown })?.requirementId;
  const requirementId = typeof preReqId === "string" ? preReqId : "REQ";
  const runId = args.resumeRunId ?? `run-${requirementId}-${Date.now().toString(36)}`;
  const parsed = parseProductionEntryRequest(raw, { now, runId });

  const requirementText = readRequirementText(parsed.request.sourceFiles);

  // Read-only git preflight runner (inspect only; no worktree is created).
  const gitPath = findGit();
  const runner = new LoopPosixProcessRunner({
    executables: [{ id: "git", executablePath: gitPath, allowDynamicArgs: true, stdinMode: "optional" }],
    allowedCwdRoots: [parsed.identity.repositoryPath, parsed.identity.controlRoot],
    fixedEnv: {
      GIT_TERMINAL_PROMPT: "0",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
      PATH: join(gitPath, ".."),
      LC_ALL: "C",
      LANG: "C",
    },
    allowedRequestEnvKeys: [],
    defaultTimeoutMs: 15000,
  });
  const workspaceManager = new LoopGitWorkspaceManager({ runner, gitExecutableId: "git" });

  const result = await runProduction(parsed, requirementText, {
    capabilitySource: args.capabilitySource,
    inspectWorkspace: (identity) => workspaceManager.inspect(identity),
  });

  // Closed result set — trace summary only, never raw Agent stdout / env.
  const closed = {
    run_id: result.run_id,
    requirement_id: result.requirement_id,
    final_status: result.final_status,
    chain_status: result.chain_status,
    blocking_reason_code: result.blocking_reason_code ?? null,
    next_execution_point: result.next_execution_point,
    trace: result.execution_trace.map((entry) => ({
      capability: entry.capability,
      executionRole: entry.executionRole,
      agent: entry.agent,
      status: entry.status,
    })),
    workspace_root: result.workspace_root,
    journal_path: result.journal_path,
    completed_at: result.completed_at,
    manual_handoff_status: result.manual_handoff_status ?? null,
  };
  process.stdout.write(`LOOP_RUN_RESULT ${JSON.stringify(closed)}\n`);
  return result.chain_status === "BLOCKED" ? 1 : 0;
}

const isMain = process.argv[1] !== undefined && process.argv[1].endsWith("loop-run.ts");
if (isMain) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      // Closed error reporting: code + safe message only, no stdout/env leakage.
      if (
        error instanceof LoopRunCliError ||
        error instanceof ProductionEntryError ||
        error instanceof ProductionRunError ||
        error instanceof LoopRunJournalError
      ) {
        process.stderr.write(`LOOP_RUN_ERROR ${error.code ?? error.name}: ${error.message}\n`);
        process.exitCode = 1;
      } else {
        process.stderr.write("LOOP_RUN_ERROR UNEXPECTED: production entry failed; see journal for details\n");
        process.exitCode = 2;
      }
    });
}

export { main as loopRunMain };
