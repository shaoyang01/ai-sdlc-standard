// E5-L2 Real Adapter Canary — Decision-075 layer 2 (separately authorized).
// ============================================================================
// Drives ONE minimal canonical capability execution point per provider through
// the PRODUCTION path: RealCapabilityGateway → RealCapabilityAdapter →
// LoopPosixProcessRunner → the real Agent CLI on this machine.
//
// Chain scaffolding: the eight-point chain is enforced by the capability
// entry (every point needs its predecessor succeeded), so points BEFORE the
// canary target are executed through the deterministic gateway in the same
// journal. They are scaffolding only — the canary EVIDENCE is the real
// dispatch's started/terminal events, process evidence and output/promotion
// digests. This mirrors E2-P hygiene: closed summary only, no raw CLI stdout.
//
// Per-provider targets (Q1 binding, minimal non-implementation class):
//   kimi   → requirement-intake / primary
//   codex  → solution-gate / adversarial_scan
//   hermes → solution-gate / formal_verdict
//
// W3 plan C: the task input is staged in the attempt workspace and the CLI
// receives only a short instruction shell naming the file. `--scale-file <path>`
// swaps the synthetic requirement for a real one (measured 37,266 B) to prove
// the transport no longer bounds input size.
//
// codex runs at TWO sandbox tiers (Current User ruling, 2026-08-30):
//   1. the production tier (`--sandbox read-only`) through the real adapter —
//      this is the canary verdict;
//   2. `danger-full-access` via a harness-level direct call, ONLY to prove the
//      file-pointer architecture works for codex when the macOS seatbelt is
//      available at all. This session runs inside a seatbelt and cannot nest
//      one (`/usr/bin/sandbox-exec` returns exit 71 even by hand), so tier 1
//      is expected to be environmentally blocked here. The two results are
//      recorded separately and never substitute for each other (INV-E13).
//
// Usage:  npx tsx scripts/e5l2-real-adapter-canary.ts --provider kimi|codex|hermes
//                                                     [--scale-file <path>]
// Exit:   0 = canary PASS, 2 = canary FAIL (fail-closed evidence recorded),
//         1 = harness/wiring error. Isolated mkdtemp fixture; removed only on
//         harness error (kept on FAIL for reviewer inspection).
//
// INV-E13: this canary does NOT prove a full autonomous run (E5-L3) and its
// result never substitutes for E2-P reachability or L3 evidence.

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { LoopArtifactStore } from "../core/loop-artifact-store";
import { LoopRunStore } from "../core/loop-run-store";
import { LoopCapabilityEntry } from "../core/loop-capability-entry";
import type { LoopCapabilityExecutionEvent } from "../core/loop-capability-execution";
import { INITIAL_BINDING_REGISTRY } from "../core/agent-capability-bindings";
import { createDeterministicCapabilityGateway, type ExecutionGateway } from "../execution/gateway";
import { createCapabilityGateway } from "../execution/capability-gateway-source";
import { RealCapabilityAdapter, extractCodexFinalText } from "../execution/real-capability-adapter";
import { LoopPosixProcessRunner } from "../core/loop-posix-process-runner";
import { materializeProducerRevision } from "../runtime";
import type { LoopRunIdentity } from "../core/loop-executor-types";
import { AGENT_CLI_PROFILES, type AgentCliProviderId } from "../execution/agent-cli-profile";

const PROVIDERS: readonly AgentCliProviderId[] = ["kimi", "codex", "hermes"];

const TARGET_BY_PROVIDER: Readonly<Record<AgentCliProviderId, { capability: string; executionRole: string }>> =
  Object.freeze({
    kimi: { capability: "requirement-intake", executionRole: "primary" },
    codex: { capability: "solution-gate", executionRole: "adversarial_scan" },
    hermes: { capability: "solution-gate", executionRole: "formal_verdict" },
  });

const SYNTHETIC_REQUIREMENT_TEXT = [
  "E5-L2 canary fixture requirement (business-neutral, synthetic).",
  "Consider a trivial command-line tool `hello` that prints one greeting line.",
  "For intake: produce the normalized requirement summary for this fixture.",
  "For adversarial scan: review the upstream solution summary and report findings ([] when none).",
  "For formal verdict: issue the solution-gate verdict for this synthetic fixture.",
].join("\n");

/** Overridden by --scale-file so the transport can be proved against real size. */
let REQUIREMENT_TEXT = SYNTHETIC_REQUIREMENT_TEXT;

function die(message: string): never {
  process.stderr.write(`E5L2_CANARY_ERROR ${message}\n`);
  process.exit(1);
}

function resolveProvider(provider: AgentCliProviderId): { id: string; executablePath: string } {
  const basename = AGENT_CLI_PROFILES[provider].executableBasename;
  // -a: a PATH hit is not proof of a working CLI. Under the managed node
  // runtime, ~/.nvm/**/bin/codex shadows the real one and dies instantly
  // (vendored binary missing: exit 1, ~40ms, 0 bytes of output) — a silent
  // PATH pick produced phantom FAILs in W3. Enumerate every candidate and
  // promote the first one that actually runs `--version`.
  const which = spawnSync("/usr/bin/which", ["-a", basename], { encoding: "utf8" });
  if (which.status !== 0 || !which.stdout.trim()) {
    die(`executable not found on PATH: ${basename}`);
  }
  const candidates = [...new Set(which.stdout.trim().split("\n").map((l) => l.trim()).filter(Boolean))];
  let lastError = "no candidates";
  for (const raw of candidates) {
    let resolved: string;
    try {
      resolved = realpathSync(raw);
    } catch {
      continue;
    }
    const probe = spawnSync(resolved, ["--version"], { encoding: "utf8", timeout: 15_000 });
    if (probe.status === 0) return { id: provider, executablePath: resolved };
    lastError = `${resolved} exits ${probe.status} on --version`;
  }
  die(`no runnable ${basename} on PATH (last: ${lastError})`);
}

function lastEventFor(
  runStore: LoopRunStore,
  runId: string,
  capability: string,
  executionRole: string,
): LoopCapabilityExecutionEvent | undefined {
  const events = runStore.listCapabilityExecutions(runId);
  return [...events]
    .reverse()
    .find((ev) => ev.capability === capability && ev.executionRole === executionRole && ev.status === "succeeded");
}

function effectiveOutput(event: LoopCapabilityExecutionEvent): {
  artifactRef: string;
  version: string;
  digest: string;
} {
  if (
    event.outputArtifactRef === null ||
    event.outputArtifactVersion === null ||
    event.outputDigest === null
  ) {
    die(`predecessor ${event.capability}/${event.executionRole} has no effective output`);
  }
  return {
    artifactRef: event.outputArtifactRef,
    version: event.outputArtifactVersion,
    digest: event.outputDigest,
  };
}

/**
 * codex tier-2 probe — HARNESS DIRECT, not the adapter path.
 * Only purpose: prove the staged file pointer is readable by codex when the
 * macOS seatbelt can be applied at all. This session runs inside a seatbelt
 * (hand-run /usr/bin/sandbox-exec returns exit 71), so the production tier is
 * expected to be environmentally blocked here. Recorded separately from the
 * canary verdict and never allowed to substitute for it (INV-E13).
 */
async function codexTierTwoProbe(
  runner: LoopPosixProcessRunner,
  exe: { id: string; executablePath: string },
  workspace: string,
): Promise<Record<string, unknown>> {
  const relPath = "prompt-input/solution-gate-adversarial_scan-1.md";
  const expected = [...REQUIREMENT_TEXT.split("\n")].reverse().find((l) => l.trim().length > 0) ?? "";
  const shell =
    `Read the file at ${relPath} (relative to the working directory). ` +
    `Reply with ONLY its last non-empty line, verbatim, and nothing else.`;
  try {
    const res = await runner.run({
      executableId: exe.id,
      args: ["exec", "--json", "--sandbox", "danger-full-access", "--skip-git-repo-check", shell],
      cwd: workspace,
      timeoutMs: 180000,
      maxStdoutBytes: 256 * 1024,
      maxStderrBytes: 64 * 1024,
    });
    let finalText: string | null = null;
    try {
      finalText = extractCodexFinalText(res.stdout);
    } catch {
      finalText = null;
    }
    return Object.freeze({
      tier: "danger-full-access",
      route: "harness-direct (NOT the adapter path)",
      exitCode: res.exitCode,
      durationMs: res.durationMs,
      stdoutBytes: res.stdoutBytesReceived,
      filePointerRead: finalText !== null && finalText.includes(expected),
    });
  } catch (error) {
    return Object.freeze({
      tier: "danger-full-access",
      route: "harness-direct (NOT the adapter path)",
      error: error instanceof Error ? error.message : String(error),
      filePointerRead: false,
    });
  }
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const flag = argv.indexOf("--provider");
  const provider = flag >= 0 ? (argv[flag + 1] as AgentCliProviderId | undefined) : undefined;
  if (!provider || !(PROVIDERS as readonly string[]).includes(provider)) {
    die("usage: tsx scripts/e5l2-real-adapter-canary.ts --provider kimi|codex|hermes [--scale-file <path>]");
  }

  const scaleFlag = argv.indexOf("--scale-file");
  const scaleFile = scaleFlag >= 0 ? argv[scaleFlag + 1] : undefined;
  if (scaleFile !== undefined) {
    try {
      REQUIREMENT_TEXT = readFileSync(scaleFile, "utf8");
    } catch {
      die(`cannot read --scale-file: ${String(scaleFile)}`);
    }
    process.stdout.write(
      `E5L2_CANARY_SCALE source=${scaleFile} bytes=${Buffer.byteLength(REQUIREMENT_TEXT, "utf8")}\n`,
    );
  }

  /** codex tier-2 result (harness direct); null for every other provider. */
  let secondaryProbe: Record<string, unknown> | null = null;

  const exe = resolveProvider(provider);
  const profile = AGENT_CLI_PROFILES[provider];

  // ── isolated fixture (canonicalized: /tmp is a symlink on macOS and the
  // runner only accepts canonical paths) ──
  const root = realpathSync(mkdtempSync(join(tmpdir(), `e5l2-canary-${provider}-`)));
  const repo = join(root, "repo");
  const control = join(root, "control");
  const workspace = join(root, "workspace");
  mkdirSync(repo);
  mkdirSync(control);
  mkdirSync(workspace);

  const now = (): string => new Date().toISOString();
  const ts36 = Date.now().toString(36);
  const identity: LoopRunIdentity = Object.freeze({
    runId: `run-e5l2-${provider}-${ts36}`,
    requirementId: `REQ-E5L2-${provider.toUpperCase()}-${ts36}`,
    repository: "e5l2-canary-fixture",
    repositoryPath: repo,
    baseBranch: "main",
    expectedBaseSha: "1".repeat(40),
    taskBranch: `feature/e5l2-canary-${provider}`,
    controlRoot: control,
    createdAt: now(),
  });

  const artifactStore = new LoopArtifactStore({ controlRoot: control, repositoryPath: repo });
  const runStore = new LoopRunStore(join(root, "journal.db"), { artifactStore });
  artifactStore.init();
  runStore.init();

  // ── production runner: real CLI on the allowlist, prompt via stdin ──
  const runner = new LoopPosixProcessRunner({
    executables: [{ id: exe.id, executablePath: exe.executablePath, allowDynamicArgs: true, stdinMode: "optional" }],
    allowedCwdRoots: [workspace],
    fixedEnv: {
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      HOME: process.env.HOME ?? "/tmp",
      TMPDIR: tmpdir(),
      LANG: "en_US.UTF-8",
      LC_ALL: "en_US.UTF-8",
    },
    allowedRequestEnvKeys: [],
  });
  const adapter = new RealCapabilityAdapter(runner);
  const realGateway = createCapabilityGateway({
    source: "real",
    runStore,
    artifactStore,
    bindingRegistry: INITIAL_BINDING_REGISTRY,
    now,
    realDeps: { adapter, attemptWorkspace: () => workspace },
  });
  const deterministicGateway = createDeterministicCapabilityGateway({
    runStore,
    artifactStore,
    bindingRegistry: INITIAL_BINDING_REGISTRY,
    now,
  });

  const entryWith = (gateway: ExecutionGateway): LoopCapabilityEntry =>
    new LoopCapabilityEntry({
      runStore,
      artifactStore,
      bindingRegistry: INITIAL_BINDING_REGISTRY,
      gateway,
      now,
    });

  // ── observed CLI version (provenance, through the same allowlist kernel) ──
  const versionRun = await runner.run({
    executableId: exe.id,
    args: ["--version"],
    cwd: workspace,
    timeoutMs: 30000,
    maxStdoutBytes: 4096,
    maxStderrBytes: 4096,
  });
  const observedVersion = versionRun.stdout.trim().split("\n")[0] ?? "";

  const closeSummary = (summary: Record<string, unknown>): void => {
    const path = join(root, "canary-summary.json");
    const payload: Record<string, unknown> = {
      ...summary,
      // W3: how big was the task input, and did it travel by pointer?
      inputBytes: Buffer.byteLength(REQUIREMENT_TEXT, "utf8"),
      scaleFile: scaleFile ?? null,
    };
    if (secondaryProbe !== null) payload.secondaryProbe = secondaryProbe;
    writeFileSync(path, JSON.stringify(payload, null, 2));
    process.stdout.write(`E5L2_CANARY_SUMMARY ${JSON.stringify(payload)}\n`);
  };

  // ── chain scaffolding + canary dispatch ──
  const source = artifactStore.put("requirement_summary", REQUIREMENT_TEXT);

  const intakeReq = {
    requirementId: identity.requirementId,
    identity,
    capability: "requirement-intake" as const,
    executionRole: "primary" as const,
    inputArtifactRef: source.artifactRef,
    inputArtifactVersion: "1.0.0",
    inputDigest: source.digest,
    outputArtifactVersion: "1.0.0",
    input: { requirement: REQUIREMENT_TEXT },
  };

  let dispatchLog: Array<Record<string, unknown>> = [];

  const runPoint = async (
    gateway: ExecutionGateway,
    request: Record<string, unknown>,
    isReal: boolean,
  ): Promise<boolean> => {
    const before = runStore.listCapabilityExecutions(identity.runId).length;
    let dispatched: { execution: { success: boolean } };
    try {
      dispatched = await entryWith(gateway).execute(
        request as unknown as Parameters<LoopCapabilityEntry["execute"]>[0],
      );
    } catch (error) {
      const events = runStore.listCapabilityExecutions(identity.runId);
      const lastSucceeded = [...events].reverse().find((ev) => ev.status === "succeeded");
      process.stderr.write(
        `E5L2_CANARY_POINT_ERROR point=${String(request.capability)}/${String(request.executionRole)} ` +
          `error=${error instanceof Error ? `${error.name}: ${error.message}` : String(error)} ` +
          `reqInput=${JSON.stringify({
            ref: request.inputArtifactRef,
            version: request.inputArtifactVersion,
            digest: request.inputDigest,
          })} ` +
          `lastSucceeded=${lastSucceeded ? JSON.stringify({
            point: `${lastSucceeded.capability}/${lastSucceeded.executionRole}`,
            outRef: lastSucceeded.outputArtifactRef,
            outVersion: lastSucceeded.outputArtifactVersion,
            outDigest: lastSucceeded.outputDigest,
            eligible: lastSucceeded.nextStepEligibility,
          }) : "none"}\n`,
      );
      throw error;
    }
    const events = runStore.listCapabilityExecutions(identity.runId);
    const terminal = events[events.length - 1];
    const success = dispatched.execution.success === true && terminal.status === "succeeded";
    dispatchLog.push({
      point: `${String(request.capability)}/${String(request.executionRole)}`,
      route: isReal ? "REAL" : "deterministic-scaffolding",
      success,
      terminalStatus: terminal.status,
      errorCode: terminal.errorCode ?? null,
      startedEventId: events[before]?.executionEventId ?? null,
      terminalEventId: terminal.executionEventId,
      outputDigest: terminal.outputDigest ?? null,
      processInvocationDigest: terminal.processInvocationDigest ?? null,
      processExitCode: terminal.processExitCode ?? null,
      processDurationMs: terminal.processDurationMs ?? null,
      processTruncated: terminal.processTruncated ?? null,
    });
    if (success) {
      materializeProducerRevision(runStore, identity.requirementId, identity.runId, terminal, now);
    }
    return success;
  };

  // point 1: requirement-intake (REAL for kimi, scaffolding otherwise)
  const intakeOk = await runPoint(
    provider === "kimi" ? realGateway : deterministicGateway,
    intakeReq,
    provider === "kimi",
  );
  if (provider === "kimi") {
    const verdict = intakeOk ? "PASS" : "FAIL";
    closeSummary({
      schema: "e5l2-real-adapter-canary:v1",
      provider,
      verdict,
      observedVersion,
      profilePinnedVersion: profile.pinnedCliVersion,
      resolvedExecutable: exe.executablePath,
      fixtureRoot: root,
      journalPath: join(root, "journal.db"),
      dispatchLog,
    });
    return verdict === "PASS" ? 0 : 2;
  }
  if (!intakeOk) die("deterministic scaffolding intake failed");

  // scaffolding: intake already done (deterministic) → solution-design (deterministic)
  const intakeEvent = lastEventFor(runStore, identity.runId, "requirement-intake", "primary");
  if (intakeEvent === undefined) die("scaffolding intake missing");
  const intakeOut = effectiveOutput(intakeEvent);
  const designOk = await runPoint(deterministicGateway, {
    requirementId: identity.requirementId,
    capability: "solution-design",
    executionRole: "primary",
    inputArtifactRef: intakeOut.artifactRef,
    inputArtifactVersion: intakeOut.version,
    inputDigest: intakeOut.digest,
    outputArtifactVersion: "1.0.0",
    input: { requirementSummaryRef: intakeOut.artifactRef },
  }, false);
  if (!designOk) die("deterministic scaffolding solution-design failed");
  const designEvent = lastEventFor(runStore, identity.runId, "solution-design", "primary");
  if (designEvent === undefined) die("scaffolding solution-design missing");
  const designOut = effectiveOutput(designEvent);

  if (provider === "codex") {
    // canary point: solution-gate / adversarial_scan (REAL codex)
    await runPoint(realGateway, {
      requirementId: identity.requirementId,
      capability: "solution-gate",
      executionRole: "adversarial_scan",
      inputArtifactRef: designOut.artifactRef,
      inputArtifactVersion: designOut.version,
      inputDigest: designOut.digest,
      outputArtifactVersion: "1.0.0",
      input: { inputText: REQUIREMENT_TEXT },
    }, true);
    // Tier 2 (harness direct): does the pointer work when seatbelt is usable?
    secondaryProbe = await codexTierTwoProbe(runner, exe, workspace);
    process.stdout.write(`E5L2_CANARY_SECONDARY ${JSON.stringify(secondaryProbe)}\n`);
  } else {
    // hermes: scaffolding scan (deterministic) → REAL formal_verdict.
    // The verdict point's predecessor is the adversarial_scan point, so its
    // input triple must be the scan's effective output (solution_review).
    const scanOk = await runPoint(deterministicGateway, {
      requirementId: identity.requirementId,
      capability: "solution-gate",
      executionRole: "adversarial_scan",
      inputArtifactRef: designOut.artifactRef,
      inputArtifactVersion: designOut.version,
      inputDigest: designOut.digest,
      outputArtifactVersion: "1.0.0",
      input: { inputText: REQUIREMENT_TEXT },
    }, false);
    if (!scanOk) die("deterministic scaffolding adversarial_scan failed");
    const scanEvent = lastEventFor(runStore, identity.runId, "solution-gate", "adversarial_scan");
    if (scanEvent === undefined) die("scaffolding adversarial_scan missing");
    const scanOut = effectiveOutput(scanEvent);
    await runPoint(realGateway, {
      requirementId: identity.requirementId,
      capability: "solution-gate",
      executionRole: "formal_verdict",
      inputArtifactRef: scanOut.artifactRef,
      inputArtifactVersion: scanOut.version,
      inputDigest: scanOut.digest,
      outputArtifactVersion: "1.0.0",
      input: { inputText: REQUIREMENT_TEXT },
    }, true);
  }

  const realLog = dispatchLog.find((d) => d.route === "REAL");
  const verdict = realLog?.success === true ? "PASS" : "FAIL";
  closeSummary({
    schema: "e5l2-real-adapter-canary:v1",
    provider,
    verdict,
    observedVersion,
    profilePinnedVersion: profile.pinnedCliVersion,
    resolvedExecutable: exe.executablePath,
    fixtureRoot: root,
    journalPath: join(root, "journal.db"),
    dispatchLog,
  });
  return verdict === "PASS" ? 0 : 2;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    process.stderr.write(
      `E5L2_CANARY_ERROR ${(error instanceof Error ? `${error.name}: ${error.message}` : String(error))}\n`,
    );
    process.exitCode = 1;
  });
