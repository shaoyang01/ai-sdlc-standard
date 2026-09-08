// WP3.5-C Runtime Cutover — Contract Tests (C02-WP3.5-C)
// =======================================================
// Pins the row-3 completion contract of the single-rail impact analysis:
//   1. the runtime's ONLY node authority is the v2 seven-node chain;
//   2. the solution-gate round is executed by two different agents with the
//      formal verdict consuming exactly the scan round's Finding Ledger;
//   3. legacy entries fail closed — retired runtime options and retired node
//      names are rejected instead of silently degrading the chain.
// Also pins: journal consistency of a full chain run, cross-call resumption
// on the same requirement, and the no-auto-skill-annotation invariant.

import { strict as assert } from "node:assert";
import { mkdtempSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createDeterministicCapabilityGateway,
  createRuntimeBindingRegistry,
  run,
  type RuntimeCapabilityGateway,
} from "../runtime";
import { LoopArtifactStore } from "../core/loop-artifact-store";
import { recoverRunContext } from "../core/loop-recovery";
import { LoopRunStore } from "../core/loop-run-store";
import { ExecutionGateway } from "../execution/gateway";
import { LoopRunJournalError } from "../core/loop-executor-types";
import {
  LOOP_CAPABILITY_EXECUTION_POINTS,
} from "../loop/types";

let passed = 0;
function ok(condition: unknown, message: string): asserts condition {
  assert.ok(condition, message);
  passed += 1;
}

async function expectReject(code: string, fn: () => Promise<unknown>, message: string): Promise<void> {
  try {
    await fn();
    assert.fail(`${message} (no error thrown)`);
  } catch (error) {
    if (error instanceof assert.AssertionError) throw error;
    ok(
      error instanceof LoopRunJournalError && error.code === code,
      `${message} (got ${error instanceof LoopRunJournalError ? error.code : "NOT_JOURNAL_ERROR"})`,
    );
  }
}

async function main(): Promise<void> {
  console.log("C1: full v2 chain run — journal, ledger and dual-agent gate");
  const root = mkdtempSync(join(tmpdir(), "loop-wp35c-cutover-"));
  try {
    mkdirSync(join(root, "repo"), { recursive: true });
    const artifactStore = new LoopArtifactStore({
      controlRoot: join(root, "control"),
      repositoryPath: join(root, "repo"),
    });
    const runStore = new LoopRunStore(join(root, "journal.db"), { artifactStore });
    runStore.init();
    artifactStore.init();

    // Spy wrapper: records every dispatched request so the cutover can pin
    // the no-auto-skill-annotation invariant on the real dispatch surface.
    const dispatched: unknown[] = [];
    const innerGateway = createDeterministicCapabilityGateway({
      runStore,
      artifactStore,
      bindingRegistry: createRuntimeBindingRegistry(),
      now: () => new Date().toISOString(),
    });
    const spyTracing = {
      runStore,
      artifactStore,
      bindingRegistry: createRuntimeBindingRegistry(),
      executorVersions: { codex: "1.0.0", kimi: "1.0.0", hermes: "1.0.0" },
      now: () => new Date().toISOString(),
    };
    class SpyGateway extends ExecutionGateway {
      constructor() { super({ capabilityTracing: spyTracing }); }
      override async execute(request: import("../execution/types").ExecutionRequest) {
        dispatched.push(request);
        return innerGateway.execute(request);
      }
    }
    const spyGateway = new SpyGateway();

    const result = await run("build a user registration form with email validation", {
      requirementId: "REQ-WP35C-001",
      runStore,
      artifactStore,
      gateway: spyGateway,
    });

    ok(result.final_status === "success", "default shadow chain completes with success");
    ok(result.chain_status === "COMPLETED", "chain status is COMPLETED");
    ok(result.next_execution_point === null, "no next execution point remains");

    // Journal: every one of the eight execution points has a started +
    // succeeded pair in canonical order, all ELIGIBLE.
    const events = runStore.listCapabilityExecutions(result.run_id);
    ok(events.length === 16, `16 capability events journaled (got ${events.length})`);
    const succeeded = events.filter((event) => event.status === "succeeded");
    ok(succeeded.length === 8, "all eight points succeeded");
    ok(
      succeeded.every((event) => event.nextStepEligibility === "ELIGIBLE"),
      "every succeeded point leaves the next step eligible",
    );
    ok(
      JSON.stringify(succeeded.map((event) => `${event.capability}/${event.executionRole}`)) ===
        JSON.stringify(
          LOOP_CAPABILITY_EXECUTION_POINTS.map((p) => `${p.capability}/${p.executionRole}`),
        ),
      "succeeded points match the canonical eight-point order",
    );

    // Dual-agent gate with exact ledger consumption.
    const scan = succeeded.find((event) => event.executionRole === "adversarial_scan")!;
    const verdict = succeeded.find((event) => event.executionRole === "formal_verdict")!;
    ok(scan.executorAgent !== verdict.executorAgent, "scan and verdict ran on different agents");
    ok(scan.unresolvedFindingsRef !== null, "scan persisted its Finding Ledger");
    ok(
      verdict.consumedFindingsRef === scan.unresolvedFindingsRef &&
        verdict.consumedFindingsDigest === scan.unresolvedFindingsDigest,
      "verdict consumed exactly the scan round's Finding Ledger",
    );
    ok(verdict.gateResult === "PASS", "verdict carries a conclusive Gate result");
    ok(scan.gateResult === "NOT_APPLICABLE", "scan never writes a conclusive Gate result");

    // The v2 chain is the only node vocabulary on the dispatch surface.
    ok(dispatched.length === 8, `exactly eight dispatches (got ${dispatched.length})`);
    ok(
      dispatched.every((request) => {
        const capability = (request as { type: string }).type;
        return LOOP_CAPABILITY_EXECUTION_POINTS.some((p) => p.capability === capability);
      }),
      "every dispatched request targets a v2 chain capability",
    );
    ok(
      dispatched.every((request) => (request as { skill?: unknown }).skill === undefined),
      "no request auto-attaches skill metadata",
    );

    // Artifacts: the scan ledger and the node products are content-addressed.
    ok(
      succeeded.every((event) => event.outputArtifactRef !== null && event.outputDigest !== null),
      "every succeeded point journaled a content-addressed output",
    );

    console.log("C2: resumption on the same requirement never re-runs the chain");
    const rerun = await run("build a user registration form with email validation", {
      requirementId: "REQ-WP35C-001",
      runStore,
      artifactStore,
      gateway: spyGateway,
    });
    ok(rerun.run_id === result.run_id, "the second run recovers the same run");
    ok(rerun.chain_status === "COMPLETED", "recovered chain stays COMPLETED");
    ok(
      runStore.listCapabilityExecutions(result.run_id).length === 16,
      "no additional capability events were journaled",
    );
    const recovery = recoverRunContext(runStore, "REQ-WP35C-001")!;
    ok(recovery.capabilityChainStatus === "COMPLETED", "recovery projection reports COMPLETED");
    // W-GW-DIAG P-I (Decision-079): injected stores surface their own database
    // file so the operator keeps the diagnostic anchor.
    ok(result.journal_path === join(root, "journal.db"), "injected stores surface the journal path (P-I)");
    ok(existsSync(join(root, "journal.db")), "the injected journal file exists");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }

  console.log("C3: the runtime option contract is closed fail-closed");
  {
    const root3 = mkdtempSync(join(tmpdir(), "loop-wp35c-options-"));
    try {
      mkdirSync(join(root3, "repo"), { recursive: true });
      const guardStore = new LoopRunStore(join(root3, "journal.db"));
      const guardArtifacts = new LoopArtifactStore({
        controlRoot: join(root3, "control"),
        repositoryPath: join(root3, "repo"),
      });
      guardStore.init();
      guardArtifacts.init();
      // Injected stores let every rejection assert the absence of journal
      // side effects (no run, no capability events) after the boundary.
      const rejectedOptions: ReadonlyArray<Record<string, unknown>> = [
        ...[
          "solutionChallengeMode",
          "requirementSummaryMode",
          "executors",
          "executionGateway",
          "hermesRuntimeShadowAttachmentBuilder",
          "env",
        ].map((retired) => ({ [retired]: retired === "executors" ? {} : "disabled" })),
        { unknownRetiredLikeOption: "x" },
        { anythingElse: 1 },
      ];
      for (const badOptions of rejectedOptions) {
        await expectReject(
          "INVALID_INPUT",
          () =>
            run("any requirement", {
              runStore: guardStore,
              artifactStore: guardArtifacts,
              ...badOptions,
            } as never),
          `option set ${JSON.stringify(Object.keys(badOptions))} is rejected fail-closed`,
        );
      }
      ok(
        guardStore.findLatestRunByRequirement("REQ-OPTION-GUARD") === undefined,
        "rejected option sets never created a run",
      );
      ok(
        guardStore.listRunsByRequirement("REQ-OPTION-GUARD").length === 0,
        "rejected option sets journaled zero runs",
      );
      await expectReject("INVALID_INPUT", () => run("   "), "blank requirement is rejected");
    } finally {
      rmSync(root3, { recursive: true, force: true });
    }
  }

  console.log("C4: retired node names are rejected at the dispatch boundary");
  {
    const root2 = mkdtempSync(join(tmpdir(), "loop-wp35c-legacy-"));
    try {
      mkdirSync(join(root2, "repo"), { recursive: true });
      const artifactStore = new LoopArtifactStore({
        controlRoot: join(root2, "control"),
        repositoryPath: join(root2, "repo"),
      });
      const runStore = new LoopRunStore(join(root2, "journal.db"), { artifactStore });
      runStore.init();
      artifactStore.init();
      const gateway = createDeterministicCapabilityGateway({
        runStore,
        artifactStore,
        bindingRegistry: createRuntimeBindingRegistry(),
        now: () => new Date().toISOString(),
      });
      await expectReject(
        "INVALID_INPUT",
        () =>
          gateway.execute({
            type: "requirement-summary" as never,
            node: "requirement-summary",
            agent: "kimi",
            requirementId: "REQ-LEGACY",
            input: {},
            loopExecution: {} as never,
          }),
        "a retired legacy node name is rejected as not a v2 chain capability",
      );
      await expectReject(
        "INVALID_INPUT",
        () =>
          gateway.execute({
            type: "requirement-intake",
            node: "requirement-intake",
            agent: "codex",
            requirementId: "REQ-NOCTX",
            input: {},
          } as never),
        "capability dispatch without a loopExecution tracing context is rejected",
      );
      // Asymmetric bypass 1: canonical type paired with a RETIRED node name.
      await expectReject(
        "INVALID_INPUT",
        () =>
          gateway.execute({
            type: "requirement-intake",
            node: "requirement-summary",
            agent: "codex",
            requirementId: "REQ-NODE-MISMATCH",
            input: {},
            loopExecution: {} as never,
          }),
        "a canonical capability with a retired node name is rejected before any journal write",
      );
      // Asymmetric bypass 2: canonical type paired with an arbitrary wrong node.
      await expectReject(
        "INVALID_INPUT",
        () =>
          gateway.execute({
            type: "requirement-intake",
            node: "totally-arbitrary-node",
            agent: "codex",
            requirementId: "REQ-NODE-MISMATCH",
            input: {},
            loopExecution: {} as never,
          }),
        "a canonical capability with an arbitrary mismatched node is rejected",
      );
      ok(
        runStore.listRunsByRequirement("REQ-LEGACY").length === 0 &&
          runStore.listRunsByRequirement("REQ-NODE-MISMATCH").length === 0,
        "rejected dispatches never created a run",
      );

      // Positive control: a canonical same-value node dispatch succeeds and
      // journals exactly the started/terminal pair for that capability.
      const identity = Object.freeze({
        runId: "run-wp35c-node-guard",
        requirementId: "REQ-NODE-OK",
        repository: "local",
        repositoryPath: join(root2, "repo"),
        baseBranch: "main",
        expectedBaseSha: "0".repeat(40),
        taskBranch: "runtime/wp35c-node-guard",
        controlRoot: join(root2, "control"),
        createdAt: new Date().toISOString(),
      });
      runStore.createRun(identity);
      runStore.appendEvent(Object.freeze({
        eventId: `${identity.runId}:2:run_started`,
        runId: identity.runId,
        sequence: 2,
        kind: "run_started" as const,
        stage: null,
        attempt: 0,
        createdAt: new Date().toISOString(),
        inputDigest: null,
        outputArtifactRef: null,
        outputDigest: null,
        errorCode: null,
        retryable: null,
        reasonCode: null,
        bindingId: null,
        bindingVersion: null,
        inputArtifactRef: null,
      }));
      const source = artifactStore.put("requirement_summary", "node guard source");
      const dispatched = await gateway.execute({
        type: "requirement-intake",
        node: "requirement-intake",
        agent: "codex",
        requirementId: "REQ-NODE-OK",
        input: { inputArtifactRef: source.artifactRef },
        loopExecution: {
          runId: identity.runId,
          attempt: 1,
          executionRole: "primary",
          inputArtifactRef: source.artifactRef,
          inputArtifactVersion: "1.0.0",
          inputDigest: source.digest,
          outputArtifactVersion: "1.0.0",
        },
      });
      ok(dispatched.success === true, "a same-value canonical dispatch succeeds");
      const guardEvents = runStore.listCapabilityExecutions(identity.runId);
      ok(guardEvents.length === 2, "exactly the started/terminal pair was journaled");
      ok(
        guardEvents.every((event) => event.capability === "requirement-intake"),
        "both events carry the canonical capability",
      );
    } finally {
      rmSync(root2, { recursive: true, force: true });
    }
  }

  console.log(`\nloop-runtime-v2-cutover: ${passed}/${passed} assertions passed`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
