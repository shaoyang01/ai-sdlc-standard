// LOOP-GW Real Smoke — Q1 three-agent rewrite of codex-runtime-real-smoke.ts
// ============================================================================
// Written per the Q1 STALE notice in scripts/codex-runtime-real-smoke.ts: the
// v2 single-rail chain is Q1-bound across THREE providers (intake/design/
// planning/sync → kimi, gate scan + implementation → codex, gate verdict +
// review → hermes), so a real smoke must inject a RealCapabilityGateway backed
// by all three real CLIs, not the retired codex-only ExecutionGateway path.
//
// Scope (C03-LOOP-GW, G4-R5-H7 re-entry): drive the PRODUCTION ENTRY —
// parseProductionEntryRequest → runProduction — with capabilitySource "real"
// and the injected real gateway surface. runProduction admits "real" exactly
// because the adapter surface is injected here (G4-R5-H7 assembly/
// authorization split); the CLIs themselves still require the operator env
// confirmations below. The attempt workspace is PINNED to the prepared task
// worktree (workspacePathFor(identity) under controlRoot) by runProduction —
// the business root is never an attempt cwd. This script never commits, never
// pushes, and never edits target-repo files itself; only the dispatched agent
// CLIs may touch the attempt workspace.
//
// Required environment confirmation (G4-R5-M1: set by the OPERATOR in the
// invoking shell — the script never enables the dispatch flags itself, per
// the Hermes phase-2 controlled-enablement gate. The script verifies that
// every flag below is present with its value "enabled" and dies fail-closed
// when the operator has not authorized them):
//   SDLC_EXECUTION_MODE
//   SDLC_CODEX_REAL_DISPATCH
//   SDLC_KIMI_GATEWAY_REAL_DISPATCH
//   SDLC_HERMES_GATEWAY_REAL_DISPATCH
//   SDLC_HERMES_GATEWAY_INTEGRATION
//   SDLC_HERMES_CLI_COMMAND_EXECUTION
//
// Timeout note (C03-LOOP-GW brief vs. HEAD): the brief's "120 s per attempt"
// knob belonged to the retired codexRealDispatchConfig path. The Q1 adapter
// takes per-attempt timeouts from AGENT_CLI_PROFILES (E5-T1 ruling,
// 2026-08-31: non-implementation 45 min, implementation 60 min; runner ceiling
// MAX_TO 3600000). There is deliberately no timeoutMs knob here — the profile
// is the single authority.
//
// Usage: env -u NODE_OPTIONS npx tsx scripts/loop-gw-smoke-real.ts
// Exit:  0 = chain completed (final_status success); 2 = fail-closed chain
//        (evidence in journal — a legitimate smoke result); 1 = harness error.

import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { LoopArtifactStore } from "../core/loop-artifact-store";
import { LoopGitWorkspaceManager } from "../core/loop-git-workspace";
import { LoopPosixProcessRunner } from "../core/loop-posix-process-runner";
import { LoopRunStore } from "../core/loop-run-store";
import {
  PRODUCTION_ENTRY_SCHEMA,
  parseProductionEntryRequest,
  ProductionEntryError,
} from "../core/loop-production-entry";
import { RealCapabilityAdapter } from "../execution/real-capability-adapter";
import { AGENT_CLI_PROFILES, type AgentCliProviderId } from "../execution/agent-cli-profile";
import { createRuntimeBindingRegistry, runProduction, ProductionRunError } from "../runtime";

// Target-repo root is machine-specific: the original kimi-session host used
// /Users/eric/..., this machine uses /Users/eric_shaoooo/... (W-GW-FIX re-run
// harness correction, recorded in the C03-LOOP-GW ledger).
const TARGET_REPO = "/Users/eric_shaoooo/meicai/projects/spruce_logistics_gateway";

const REQUIREMENT = [
  "spruce_logistics_gateway 三项缺陷修复：",
  "1. business-gateway-utils 的 GatewayMD5Util：捕获异常后调用 System.exit(-1) 直接杀死进程，改为抛出运行时异常，并新增 JUnit5 离线单测（不依赖网络/容器）覆盖正常摘要与算法缺失两条路径；",
  "2. business-gateway-webflux 的 GatewayDubboSyncInvoker 第 36 行 logger 用错类名：LogManager.getLogger(GatewayDubboAsyncInvoker.class) 应为 GatewayDubboSyncInvoker.class；",
  "3. GatewayInvokeServiceImpl.invokeTest（约 147–400 行）是全仓无调用方的死代码，整段删除，同时删除接口 GatewayInvokeService 中对应的方法声明。",
].join("\n");

// The Q1 real-dispatch path (RealCapabilityGateway → RealCapabilityAdapter →
// profile) reads none of these at runtime; they are the operator's explicit
// authorization surface for this smoke and must be present.
const REQUIRED_ENV: Readonly<Record<string, string>> = Object.freeze({
  SDLC_EXECUTION_MODE: "codex",
  SDLC_CODEX_REAL_DISPATCH: "enabled",
  SDLC_KIMI_GATEWAY_REAL_DISPATCH: "enabled",
  SDLC_HERMES_GATEWAY_REAL_DISPATCH: "enabled",
  SDLC_HERMES_GATEWAY_INTEGRATION: "enabled",
  SDLC_HERMES_CLI_COMMAND_EXECUTION: "enabled",
});

function die(message: string): never {
  process.stderr.write(`LOOP_GW_SMOKE_ERROR ${message}\n`);
  process.exit(1);
}

// Same resolution discipline as scripts/e5l2-real-adapter-canary.ts: a PATH
// hit is not proof of a runnable CLI — probe every candidate with --version.
function resolveCli(provider: AgentCliProviderId): string {
  const basename = AGENT_CLI_PROFILES[provider].executableBasename;
  const which = spawnSync("/usr/bin/which", ["-a", basename], { encoding: "utf8" });
  if (which.status !== 0 || !which.stdout.trim()) {
    die(`executable not found on PATH: ${basename}`);
  }
  const candidates = [...new Set(which.stdout.trim().split("\n").map((l) => l.trim()).filter(Boolean))];
  for (const raw of candidates) {
    let resolved: string;
    try {
      resolved = realpathSync(raw);
    } catch {
      continue;
    }
    const probe = spawnSync(resolved, ["--version"], { encoding: "utf8", timeout: 15_000 });
    if (probe.status === 0) return resolved;
  }
  die(`no runnable ${basename} on PATH`);
}

function git(args: readonly string[], cwd: string): string {
  const probe = spawnSync("git", args, { encoding: "utf8", cwd, timeout: 15_000 });
  if (probe.status !== 0) {
    die(`git ${args.join(" ")} failed in ${cwd}: ${(probe.stderr ?? "").trim()}`);
  }
  return probe.stdout.trim();
}

async function main(): Promise<number> {
  // G4-R5-M1: the operator's shell owns the flag enablement — the smoke
  // verifies every flag is present and exactly "enabled", refusing to run
  // otherwise. It never writes these flags itself.
  for (const [key, value] of Object.entries(REQUIRED_ENV)) {
    if (process.env[key] !== value) {
      die(
        `environment confirmation ${key} must be set to "${value}" by the operator shell ` +
          `(got ${process.env[key] === undefined ? "unset" : `"${process.env[key]}"`})`,
      );
    }
  }

  const spruceRoot = realpathSync(TARGET_REPO);
  const providers: readonly AgentCliProviderId[] = ["kimi", "codex", "hermes"];
  const executables = providers.map((id) => ({
    id,
    executablePath: resolveCli(id),
    allowDynamicArgs: true,
    stdinMode: "optional" as const,
  }));

  // Scratch root for journal + control; the ATTEMPT workspace is the prepared
  // task worktree under controlRoot (workspacePathFor of the parsed identity)
  // — pinned by runProduction, never the business root. realpath: /tmp is a
  // symlink on macOS and the runner only accepts canonical paths.
  const root = realpathSync(mkdtempSync(join(tmpdir(), "loop-gw-smoke-")));
  const control = join(root, "control");
  mkdirSync(control, { recursive: true });

  const artifactStore = new LoopArtifactStore({ controlRoot: control, repositoryPath: spruceRoot });
  const runStore = new LoopRunStore(join(root, "journal.db"), { artifactStore });
  artifactStore.init();
  runStore.init();
  const bindingRegistry = createRuntimeBindingRegistry();

  // Read-only git preflight runner for the workspace manager (inspect +
  // LOCAL worktree prepare; no commit/push/PR — the human Git boundary is
  // untouched).
  const gitRunner = new LoopPosixProcessRunner({
    executables: [{ id: "git", executablePath: "git", allowDynamicArgs: true, stdinMode: "optional" }],
    allowedCwdRoots: [spruceRoot, control],
    fixedEnv: {
      GIT_TERMINAL_PROMPT: "0",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      LC_ALL: "C",
      LANG: "C",
    },
    allowedRequestEnvKeys: [],
    defaultTimeoutMs: 15000,
  });
  const workspaceManager = new LoopGitWorkspaceManager({ runner: gitRunner, gitExecutableId: "git" });

  // The production entry request is minted from the ACTUAL repository state
  // (read-only git queries) — base branch HEAD is the run's expected base.
  const baseBranch = "main";
  const expectedBaseSha = git(["rev-parse", baseBranch], spruceRoot);
  const requirementId = `REQ-LOOP-GW-${Date.now().toString(36)}`;
  const runId = `run-${requirementId}`;
  const parsed = parseProductionEntryRequest(
    {
      schema: PRODUCTION_ENTRY_SCHEMA,
      requirementId,
      repository: "spruce_logistics_gateway",
      repositoryPath: spruceRoot,
      baseBranch,
      expectedBaseSha,
      taskBranch: `runtime/${requirementId}`,
      controlRoot: control,
      sourceFiles: [],
      bindingRegistryVersion: bindingRegistry.version,
      executionProfileVersion: "1.0.0",
      mode: "real",
    },
    { now: () => new Date().toISOString(), runId },
  );

  const requirementText = REQUIREMENT;

  // The agent-CLI dispatch runner: the adapter's CLIs run INSIDE the prepared
  // attempt worktree only (runProduction pins attemptWorkspace to it).
  const agentRunner = new LoopPosixProcessRunner({
    executables,
    allowedCwdRoots: [spruceRoot, control],
    fixedEnv: {
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      HOME: process.env.HOME ?? "/tmp",
      TMPDIR: tmpdir(),
      LANG: "en_US.UTF-8",
      LC_ALL: "en_US.UTF-8",
    },
    allowedRequestEnvKeys: [],
  });
  const adapter = new RealCapabilityAdapter(agentRunner);

  const result = await runProduction(parsed, requirementText, {
    capabilitySource: "real",
    // G4-R5-H7: the injected adapter surface is the production-door
    // authorization; the attemptWorkspace placeholder is overridden by the
    // prepared-worktree pin inside runProduction.
    realGatewayDeps: { adapter, attemptWorkspace: () => spruceRoot },
    runStore,
    artifactStore,
    inspectWorkspace: (identity) => workspaceManager.inspect(identity),
    prepareWorkspace: (identity) => workspaceManager.prepare(identity),
  });

  // Closed summary only — never raw CLI stdout / environment.
  const events = runStore.listCapabilityExecutions(result.run_id);
  const journalTrace = events.map((ev) => ({
    point: `${ev.capability}/${ev.executionRole}`,
    agent: ev.agent,
    status: ev.status,
    errorCode: ev.errorCode ?? null,
    processExitCode: ev.processExitCode ?? null,
    processDurationMs: ev.processDurationMs ?? null,
    processTruncated: ev.processTruncated ?? null,
  }));

  const summary = {
    schema: "loop-gw-smoke-real:v1",
    runId: result.run_id,
    requirementId: result.requirement_id,
    finalStatus: result.final_status,
    chainStatus: result.chain_status,
    blockingReasonCode: result.blocking_reason_code ?? null,
    nextExecutionPoint: result.next_execution_point ?? null,
    trace: result.execution_trace.map((entry) => ({
      capability: entry.capability,
      executionRole: entry.executionRole,
      agent: entry.agent,
      status: entry.status,
    })),
    journalTrace,
    journalPath: result.journal_path,
    fixtureRoot: root,
    expectedBaseSha,
    executables: executables.map((e) => ({ id: e.id, path: e.executablePath })),
  };
  process.stdout.write(`LOOP_GW_SMOKE_SUMMARY ${JSON.stringify(summary, null, 2)}\n`);
  return result.final_status === "success" ? 0 : 2;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    if (
      error instanceof ProductionEntryError ||
      error instanceof ProductionRunError
    ) {
      process.stderr.write(`LOOP_GW_SMOKE_ERROR ${error.code}: ${error.message}\n`);
      process.exitCode = 1;
      return;
    }
    process.stderr.write(`LOOP_GW_SMOKE_ERROR ${message}\n`);
    process.exitCode = 1;
  });
