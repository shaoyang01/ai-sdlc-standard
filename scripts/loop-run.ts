// LOOP production entry CLI — C03-E W3 (E1-T3, wiring §4) + entry trigger (D3)
// ============================================================================
// The SINGLE command-line door into the v2 production chain. It carries NO
// token / command / argv-template / environment surface: argv is a closed
// flag set, the request is a closed-schema JSON file, and the printed result is
// a closed field set (never raw Agent stdout or the process environment).
//
//   tsx scripts/loop-run.ts --request-file <abs path>
//     [--resume <runId>] [--capability-source deterministic|real] [--help]
//   tsx scripts/loop-run.ts --from-intake <00-需求资料 dir or intake.manifest.json>
//     [--prepare-only] [--resume <runId>] [--capability-source deterministic|real]
//
// Entry trigger (Decision-078, design §4): --from-intake reads the intake
// manifest (closed schema loop-intake-manifest:v1), refuses anything but
// status:"confirmed" (the human confirmation gate), resolves expectedBaseSha
// itself via the read-only git runner (chat agents never hand-craft SHAs),
// freezes the production entry request to
// <controlRoot>/loop-runs/<requirementId>/entry-<ts>.json as the audit
// artifact, and either stops (--prepare-only) or runs it through the exact
// same path as --request-file.
//
// W3 boundary: the capability source DEFAULTS to deterministic; --capability-
// source real is refused at runProduction (PRODUCTION_REAL_NOT_AUTHORIZED)
// until separately granted (D2). This command runs only the READ-ONLY git
// preflight (workspaceManager.inspect); it never creates a worktree and
// never spawns an Agent CLI.

import { readFileSync, lstatSync, mkdirSync, writeFileSync } from "node:fs";
import { join, delimiter, isAbsolute } from "node:path";

import {
  parseProductionEntryRequest,
  ProductionEntryError,
  PRODUCTION_ENTRY_SCHEMA,
} from "../core/loop-production-entry";
import {
  parseIntakeManifest,
  IntakeManifestError,
  INTAKE_MANIFEST_SCHEMA,
} from "../core/loop-intake-manifest";
import { BINDING_REGISTRY_VERSION } from "../core/agent-capability-bindings";
import { LoopPosixProcessRunner, LoopPosixProcessRunnerError } from "../core/loop-posix-process-runner";
import { LoopGitWorkspaceManager, LoopGitWorkspaceError } from "../core/loop-git-workspace";
import { LoopArtifactStore } from "../core/loop-artifact-store";
import { LoopRunStore } from "../core/loop-run-store";
import { isCapabilitySource, type CapabilitySource } from "../execution/capability-gateway-source";
import { runProduction, ProductionRunError } from "../runtime";
import { LoopRunJournalError } from "../core/loop-executor-types";

// ── Closed argv contract ──────────────────────────────────────────────
const VALUE_FLAGS = Object.freeze({
  "--request-file": "requestFile",
  "--from-intake": "fromIntake",
  "--resume": "resumeRunId",
  "--capability-source": "capabilitySource",
  "--release": "release",
  "--release-by": "releaseBy",
  "--release-note": "releaseNote",
} as const);
const BOOLEAN_FLAGS = Object.freeze(new Set<string>(["--prepare-only", "--help"]));

const RELEASE_CODES = Object.freeze(["RISK_ACCEPTED", "SCOPE_RESET"] as const);
type ReleaseCode = (typeof RELEASE_CODES)[number];

export interface ParsedLoopRunArgs {
  readonly help: boolean;
  readonly requestFile: string | null;
  readonly fromIntake: string | null;
  readonly prepareOnly: boolean;
  readonly resumeRunId: string | null;
  readonly capabilitySource: CapabilitySource;
  readonly release: ReleaseCode | null;
  readonly releaseBy: string | null;
  readonly releaseNote: string | null;
}

export class LoopRunCliError extends Error {
  constructor(
    public readonly code:
      | "UNKNOWN_FLAG"
      | "POSITIONAL_NOT_ALLOWED"
      | "MISSING_VALUE"
      | "DUPLICATE_FLAG"
      | "MISSING_REQUEST_FILE"
      | "FLAG_CONFLICT"
      | "PREPARE_ONLY_WITHOUT_INTAKE"
      | "INVALID_CAPABILITY_SOURCE"
      | "REQUEST_HAS_NO_SOURCE"
      | "MANIFEST_READ_FAILED"
      | "INTAKE_NOT_CONFIRMED"
      | "BASE_SHA_RESOLVE_FAILED"
      | "INVALID_RELEASE_CODE"
      | "RELEASE_REQUIRES_RESUME"
      | "RELEASE_METADATA_REQUIRED"
      | "RELEASE_FLAG_WITHOUT_RELEASE"
      | "RELEASE_TARGET_NOT_RELEASABLE"
      | "RELEASE_CODE_NOT_APPLICABLE"
      | "RELEASE_CRITICAL_FINDING",
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
  let fromIntake: string | null = null;
  let prepareOnly = false;
  let resumeRunId: string | null = null;
  let capabilitySource: CapabilitySource = "deterministic";
  let release: ReleaseCode | null = null;
  let releaseBy: string | null = null;
  let releaseNote: string | null = null;
  const seen = new Set<string>();

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]!;
    if (!token.startsWith("--")) {
      throw new LoopRunCliError("POSITIONAL_NOT_ALLOWED", `bare positional argument is not allowed: "${token}"`);
    }
    if (BOOLEAN_FLAGS.has(token)) {
      if (seen.has(token)) throw new LoopRunCliError("DUPLICATE_FLAG", `flag ${token} given twice`);
      seen.add(token);
      if (token === "--prepare-only") prepareOnly = true;
      else help = true;
      continue;
    }
    const field = VALUE_FLAGS[token as keyof typeof VALUE_FLAGS];
    if (field === undefined) {
      throw new LoopRunCliError("UNKNOWN_FLAG", `unknown flag "${token}"; the closed flag set is --request-file/--from-intake/--resume/--capability-source/--prepare-only/--release/--release-by/--release-note/--help`);
    }
    if (seen.has(token)) throw new LoopRunCliError("DUPLICATE_FLAG", `flag ${token} given twice`);
    seen.add(token);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new LoopRunCliError("MISSING_VALUE", `flag ${token} requires a value`);
    }
    i += 1;

    if (field === "requestFile") requestFile = value;
    else if (field === "fromIntake") fromIntake = value;
    else if (field === "resumeRunId") resumeRunId = value;
    else if (field === "capabilitySource") {
      if (!isCapabilitySource(value)) {
        throw new LoopRunCliError("INVALID_CAPABILITY_SOURCE", `--capability-source must be deterministic|real, got "${value}"`);
      }
      capabilitySource = value;
    } else if (field === "release") {
      if (!(RELEASE_CODES as readonly string[]).includes(value)) {
        throw new LoopRunCliError("INVALID_RELEASE_CODE", `--release must be one of ${RELEASE_CODES.join(" | ")}, got "${value}"`);
      }
      release = value as ReleaseCode;
    } else if (field === "releaseBy") releaseBy = value;
    else if (field === "releaseNote") releaseNote = value;
  }

  if (requestFile !== null && fromIntake !== null) {
    throw new LoopRunCliError("FLAG_CONFLICT", "--request-file and --from-intake are two request sources; give exactly one");
  }
  if (prepareOnly && fromIntake === null) {
    throw new LoopRunCliError("PREPARE_ONLY_WITHOUT_INTAKE", "--prepare-only requires --from-intake");
  }
  if (release !== null) {
    // W-GW-DIAG P-E: a release always targets an EXISTING run via its frozen
    // request identity — never a fresh run, never an intake dir.
    if (fromIntake !== null || prepareOnly) {
      throw new LoopRunCliError("FLAG_CONFLICT", "--release combines only with --request-file + --resume");
    }
    if (resumeRunId === null) {
      throw new LoopRunCliError("RELEASE_REQUIRES_RESUME", "--release requires --resume <runId>: a release targets an existing run");
    }
    if (releaseBy === null || releaseBy.trim().length === 0 || releaseNote === null || releaseNote.trim().length === 0) {
      throw new LoopRunCliError("RELEASE_METADATA_REQUIRED", "--release requires non-empty --release-by and --release-note (audit fields)");
    }
  } else if (releaseBy !== null || releaseNote !== null) {
    throw new LoopRunCliError("RELEASE_FLAG_WITHOUT_RELEASE", "--release-by/--release-note are only valid together with --release");
  }
  if (!help && requestFile === null && fromIntake === null) {
    throw new LoopRunCliError("MISSING_REQUEST_FILE", "--request-file <abs path> or --from-intake <abs path> is required (or use --help)");
  }
  return Object.freeze({ help, requestFile, fromIntake, prepareOnly, resumeRunId, capabilitySource, release, releaseBy, releaseNote });
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
  "loop-run — v2 production chain entry (C03-E W3 + entry trigger D3)",
  "Usage: tsx scripts/loop-run.ts --request-file <abs path>",
  "         [--resume <runId>] [--capability-source deterministic|real]",
  "         [--help]",
  "       tsx scripts/loop-run.ts --from-intake <00-需求资料 dir or manifest>",
  "         [--prepare-only] [--resume <runId>]",
  "         [--capability-source deterministic|real]",
  "Defaults: --capability-source deterministic. real is dormant (D2 grant).",
  "--from-intake: requires a status:\"confirmed\" intake.manifest.json;",
  "  resolves expectedBaseSha itself, freezes the entry request as an audit",
  "  artifact, then --prepare-only stops or the run proceeds.",
  "--release (with --request-file + --resume <runId>): human decision closing",
  "  a blocked stop; requires --release-by and --release-note (audit).",
].join("\n");

// ── Entry trigger: intake manifest → frozen production request ─────────
const MANIFEST_FILENAME = "intake.manifest.json";
/** Mirrors the versions stamped by existing hand-built request files. */
const EXECUTION_PROFILE_VERSION = "1.0.0";
const SHA40_RE = /^[0-9a-f]{40}$/;

interface PreparedIntake {
  readonly rawRequest: Record<string, unknown>;
  readonly requestPath: string;
  readonly expectedBaseSha: string;
  readonly requirementId: string;
  readonly sourceFilesCount: number;
}

function readConfirmedManifest(intakePath: string): ReturnType<typeof parseIntakeManifest> {
  if (!isAbsolute(intakePath)) {
    throw new LoopRunCliError("MANIFEST_READ_FAILED", "--from-intake requires an absolute path");
  }
  let manifestPath = intakePath;
  try {
    if (lstatSync(intakePath).isDirectory()) manifestPath = join(intakePath, MANIFEST_FILENAME);
  } catch {
    throw new LoopRunCliError("MANIFEST_READ_FAILED", `--from-intake path does not exist: ${intakePath}`);
  }
  let rawManifest: unknown;
  try {
    rawManifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    throw new LoopRunCliError("MANIFEST_READ_FAILED", `cannot read intake manifest at ${manifestPath}: ${(error as Error).message}`);
  }
  const manifest = parseIntakeManifest(rawManifest);
  // The human confirmation gate: only a confirmed manifest may start a run.
  if (manifest.status !== "confirmed") {
    throw new LoopRunCliError("INTAKE_NOT_CONFIRMED", `intake manifest status is "${manifest.status}"; only status:"confirmed" may start a run (human gate, design §3)`);
  }
  return manifest;
}

async function resolveBaseSha(runner: LoopPosixProcessRunner, cwd: string): Promise<string> {
  let stdout = "";
  try {
    const r = await runner.run({
      executableId: "git",
      cwd,
      args: Object.freeze(["rev-parse", "HEAD"]),
      timeoutMs: 15000,
      maxStdoutBytes: 4096,
      maxStderrBytes: 4096,
    });
    if (r.status !== "exited" || r.exitCode !== 0 || r.signal !== null || r.stdoutTruncated) {
      throw new Error(`git rev-parse HEAD did not exit cleanly (status=${r.status}, exit=${r.exitCode})`);
    }
    stdout = r.stdout;
  } catch (error) {
    if (error instanceof LoopPosixProcessRunnerError) {
      throw new LoopRunCliError("BASE_SHA_RESOLVE_FAILED", `git probe failed on repositoryPath: ${error.code}`);
    }
    throw new LoopRunCliError("BASE_SHA_RESOLVE_FAILED", `cannot resolve repositoryPath HEAD: ${(error as Error).message}`);
  }
  const sha = stdout.trim();
  if (!SHA40_RE.test(sha)) {
    throw new LoopRunCliError("BASE_SHA_RESOLVE_FAILED", `git rev-parse HEAD is not a 40-char SHA`);
  }
  return sha;
}

function freezeIntakeRequest(
  manifest: ReturnType<typeof parseIntakeManifest>,
  expectedBaseSha: string,
): { rawRequest: Record<string, unknown>; requestPath: string } {
  const rawRequest: Record<string, unknown> = {
    schema: PRODUCTION_ENTRY_SCHEMA,
    requirementId: manifest.requirementId,
    repository: manifest.repository,
    repositoryPath: manifest.repositoryPath,
    baseBranch: manifest.baseBranch,
    expectedBaseSha,
    taskBranch: manifest.taskBranch,
    controlRoot: manifest.controlRoot,
    sourceFiles: [...manifest.sourceFiles],
    bindingRegistryVersion: BINDING_REGISTRY_VERSION,
    executionProfileVersion: EXECUTION_PROFILE_VERSION,
    mode: "real",
  };
  // Audit artifact (design §4): the frozen request lands under controlRoot so
  // a resume/audit can always reconstruct exactly what was launched.
  const runDir = join(manifest.controlRoot, "loop-runs", manifest.requirementId);
  mkdirSync(runDir, { recursive: true });
  const requestPath = join(runDir, `entry-${Date.now().toString(36)}.json`);
  writeFileSync(requestPath, `${JSON.stringify(rawRequest, null, 2)}\n`);
  return { rawRequest, requestPath };
}

// ── Release mode (W-GW-DIAG P-E): close a blocked stop by human decision ──
//
// Legal matrix (fail-closed; Decision-079):
//   - journal "blocked" with REGATE_ROUND_BUDGET_EXHAUSTED:
//       RISK_ACCEPTED | SCOPE_RESET → the store's own release event.
//   - gate PASS_WITH_RISK stop (no durable block; recovery yields no next
//       point): RISK_ACCEPTED only → every OPEN blocking finding becomes
//       ACCEPTED_RISK bound to the verdict's decisionScopeId, each carrying a
//       hash-verified human_action_required evidence artifact (who + note).
//       SCOPE_RESET is refused here: rework flows through the Re-Gate
//       machinery, not a release. Any other state is not releasable.
interface ReleaseReceipt {
  readonly run_id: string;
  readonly release: ReleaseCode;
  readonly released_by: string;
  readonly decision_scope_id: string | null;
  readonly findings_accepted: readonly string[];
  readonly evidence_ref: string | null;
}

function runReleaseProcedure(
  identity: { readonly controlRoot: string; readonly repositoryPath: string; readonly requirementId: string },
  runId: string,
  release: ReleaseCode,
  releasedBy: string,
  releaseNote: string,
): ReleaseReceipt {
  return runReleaseProcedureWithStores(
    (): { runStore: LoopRunStore; artifactStore: LoopArtifactStore } => {
      const artifactStore = new LoopArtifactStore({
        controlRoot: identity.controlRoot,
        repositoryPath: identity.repositoryPath,
      });
      const runStore = new LoopRunStore(join(identity.controlRoot, "journal.db"), { artifactStore });
      runStore.init();
      artifactStore.init();
      return { runStore, artifactStore };
    },
    identity.requirementId,
    runId,
    release,
    releasedBy,
    releaseNote,
  );
}

/** Store-injection seam (exported for direct testing); the CLI binds real paths. */
export function runReleaseProcedureWithStores(
  buildStores: () => { runStore: LoopRunStore; artifactStore: LoopArtifactStore },
  requirementId: string,
  runId: string,
  release: ReleaseCode,
  releasedBy: string,
  releaseNote: string,
): ReleaseReceipt {
  const { runStore, artifactStore } = buildStores();

  const snapshot = runStore.getSnapshot(runId);
  if (snapshot === undefined) {
    throw new LoopRunCliError("RELEASE_TARGET_NOT_RELEASABLE", `no run ${runId} found in the run's journal`);
  }
  if (snapshot.state.identity.requirementId !== requirementId) {
    throw new LoopRunCliError("RELEASE_TARGET_NOT_RELEASABLE", "run's requirement does not match the request identity");
  }
  const state = snapshot.state;
  if (state.status === "blocked") {
    if (state.blockingReasonCode !== "REGATE_ROUND_BUDGET_EXHAUSTED") {
      throw new LoopRunCliError(
        "RELEASE_CODE_NOT_APPLICABLE",
        `blocked run carries ${state.blockingReasonCode}; no release code applies to it`,
      );
    }
    runStore.releaseRunRegateBlock(runId, { kind: release });
    return {
      run_id: runId,
      release,
      released_by: releasedBy,
      decision_scope_id: null,
      findings_accepted: [],
      evidence_ref: null,
    };
  }

  const execs = runStore.listCapabilityExecutions(runId);
  const verdicts = execs.filter(
    (e) => e.capability === "solution-gate" && e.executionRole === "formal_verdict" && e.status === "succeeded",
  );
  const last = verdicts.at(-1);
  if (last === undefined || last.gateResult !== "PASS_WITH_RISK" || last.decisionScopeId === null) {
    throw new LoopRunCliError(
      "RELEASE_TARGET_NOT_RELEASABLE",
      "run is not at a releasable stop (no PASS_WITH_RISK verdict with a decision scope)",
    );
  }
  if (release !== "RISK_ACCEPTED") {
    throw new LoopRunCliError(
      "RELEASE_CODE_NOT_APPLICABLE",
      "a gate PASS_WITH_RISK stop only accepts RISK_ACCEPTED; rework flows through the Re-Gate machinery, not a release",
    );
  }
  const gate = runStore.computeFindingGate(runId);
  if (gate.blockingFindings.length === 0) {
    throw new LoopRunCliError("RELEASE_TARGET_NOT_RELEASABLE", "no blocking findings to release");
  }
  const findings = runStore.listFindings(runId);
  const byId = new Map(findings.map((f) => [f.findingId, f]));
  const targets: string[] = [];
  for (const id of gate.blockingFindings) {
    const finding = byId.get(id);
    if (finding === undefined) {
      throw new LoopRunCliError("RELEASE_TARGET_NOT_RELEASABLE", `blocking finding ${id} not found in journal`);
    }
    if (finding.status !== "OPEN") continue;
    if (finding.severity === "CRITICAL") {
      throw new LoopRunCliError(
        "RELEASE_CRITICAL_FINDING",
        `finding ${id} is CRITICAL; risk acceptance is not available for critical findings`,
      );
    }
    targets.push(id);
  }
  if (targets.length === 0) {
    throw new LoopRunCliError("RELEASE_TARGET_NOT_RELEASABLE", "all blocking findings are already closed");
  }
  const evidence = artifactStore.put("human_action_required", `${JSON.stringify({
    schema: "loop-release-evidence:v1",
    run_id: runId,
    release,
    released_by: releasedBy,
    note: releaseNote,
    finding_ids: targets,
    decision_scope_id: last.decisionScopeId,
    released_at: new Date().toISOString(),
  }, null, 2)}\n`);
  for (const findingId of targets) {
    runStore.acceptFindingRisk(runId, findingId, {
      riskAcceptedBy: releasedBy,
      riskAcceptanceEvidenceRef: evidence.artifactRef,
      riskAcceptanceEvidenceDigest: evidence.digest,
      decisionScopeId: last.decisionScopeId,
    });
  }
  return {
    run_id: runId,
    release,
    released_by: releasedBy,
    decision_scope_id: last.decisionScopeId,
    findings_accepted: targets,
    evidence_ref: evidence.artifactRef,
  };
}

async function main(argv: readonly string[]): Promise<number> {
  const args = parseLoopRunArgs(argv);
  if (args.help) {
    process.stdout.write(`${HELP_TEXT}\n`);
    return 0;
  }

  // ── Release mode: human decision closes a blocked stop, then exit. The
  // chain itself is (re)started separately via --resume. ──
  if (args.release !== null) {
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(args.requestFile as string, "utf8"));
    } catch (error) {
      process.stderr.write(`LOOP_RUN_ERROR BAD_REQUEST_FILE: ${(error as Error).message}\n`);
      return 1;
    }
    const now = (): string => new Date().toISOString();
    const runId = args.resumeRunId as string;
    const parsed = parseProductionEntryRequest(raw, { now, runId });
    const receipt = runReleaseProcedure(
      parsed.identity,
      runId,
      args.release,
      args.releaseBy as string,
      args.releaseNote as string,
    );
    process.stdout.write(`LOOP_RUN_RELEASED ${JSON.stringify(receipt)}\n`);
    return 0;
  }

  // ── Request acquisition: closed request file OR confirmed intake manifest ──
  let raw: unknown;
  let intakeRunner: LoopPosixProcessRunner | undefined;
  let prepared: PreparedIntake | null = null;
  if (args.fromIntake !== null) {
    const manifest = readConfirmedManifest(args.fromIntake as string);
    // Both the runner construction (cwd-root validation) and the HEAD probe
    // fail closed under one code: the repository named by the manifest is
    // unusable as a run base.
    try {
      const gitPath = findGit();
      intakeRunner = new LoopPosixProcessRunner({
        executables: [{ id: "git", executablePath: gitPath, allowDynamicArgs: true, stdinMode: "optional" }],
        allowedCwdRoots: [manifest.repositoryPath, manifest.controlRoot],
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
    } catch (error) {
      if (error instanceof LoopPosixProcessRunnerError) {
        throw new LoopRunCliError("BASE_SHA_RESOLVE_FAILED", `repositoryPath/controlRoot unusable for git probing: ${error.code}`);
      }
      throw error;
    }
    const expectedBaseSha = await resolveBaseSha(intakeRunner, manifest.repositoryPath);
    const { rawRequest, requestPath } = freezeIntakeRequest(manifest, expectedBaseSha);
    prepared = {
      rawRequest,
      requestPath,
      expectedBaseSha,
      requirementId: manifest.requirementId,
      sourceFilesCount: manifest.sourceFiles.length,
    };
    raw = rawRequest;
    if (args.prepareOnly) {
      // Closed prepared set — no manifest echo, no environment, no stdout of git.
      process.stdout.write(`LOOP_RUN_PREPARED ${JSON.stringify({
        request_path: prepared.requestPath,
        requirement_id: prepared.requirementId,
        expected_base_sha: prepared.expectedBaseSha,
        source_files_count: prepared.sourceFilesCount,
      })}\n`);
      return 0;
    }
  } else {
    // Closed request file → closed-schema parse → identity.
    try {
      raw = JSON.parse(readFileSync(args.requestFile as string, "utf8"));
    } catch (error) {
      process.stderr.write(`LOOP_RUN_ERROR BAD_REQUEST_FILE: ${(error as Error).message}\n`);
      return 1;
    }
  }

  const now = (): string => new Date().toISOString();
  const preReqId = (raw as { requirementId?: unknown })?.requirementId;
  const requirementId = typeof preReqId === "string" ? preReqId : "REQ";
  const runId = args.resumeRunId ?? `run-${requirementId}-${Date.now().toString(36)}`;
  const parsed = parseProductionEntryRequest(raw, { now, runId });

  const requirementText = readRequirementText(parsed.request.sourceFiles);

  // Read-only git preflight runner (inspect only; no worktree is created). The
  // intake path already built one scoped to the manifest's own
  // repositoryPath/controlRoot — the same paths as the parsed identity.
  let runner: LoopPosixProcessRunner;
  if (intakeRunner !== undefined) {
    runner = intakeRunner;
  } else {
    const gitPath = findGit();
    runner = new LoopPosixProcessRunner({
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
  }
  const workspaceManager = new LoopGitWorkspaceManager({ runner, gitExecutableId: "git" });

  const result = await runProduction(parsed, requirementText, {
    capabilitySource: args.capabilitySource,
    inspectWorkspace: (identity) => workspaceManager.inspect(identity),
    // W-GW-PREP (P-B C1, Decision-079): the entry prepares the task worktree
    // (LOCAL `git worktree` under controlRoot — no commit/push/PR, the human
    // Git boundary is untouched). Without it a fresh requirement could never
    // pass inspect's exact-ok check.
    prepareWorkspace: (identity) => workspaceManager.prepare(identity),
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
            error instanceof IntakeManifestError ||
            error instanceof LoopRunJournalError ||
            error instanceof LoopGitWorkspaceError ||
            error instanceof LoopPosixProcessRunnerError
          ) {
        // Known, classifiable failure (incl. read-only preflight infrastructure):
        // report the real code at exit=1, never the generic UNEXPECTED bucket.
        process.stderr.write(`LOOP_RUN_ERROR ${error.code ?? error.name}: ${error.message}\n`);
        process.exitCode = 1;
      } else {
        process.stderr.write("LOOP_RUN_ERROR UNEXPECTED: production entry failed; see journal for details\n");
        process.exitCode = 2;
      }
    });
}

export { main as loopRunMain };
