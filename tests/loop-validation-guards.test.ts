import { strict as assert } from "node:assert";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CAPABILITY_ARTIFACT_TYPES,
  INITIAL_BINDING_REGISTRY,
  replaceBinding,
  validateBindingRegistry,
  type BindingRegistry,
} from "../core/agent-capability-bindings";
import { createArtifact } from "../core/artifact";
import { LoopArtifactStore } from "../core/loop-artifact-store";
import { LoopCapabilityEntry } from "../core/loop-capability-entry";
import { NODE_CAPABILITY_CONTRACTS } from "../core/node-capability-contracts";
import { recoverRunContext } from "../core/loop-recovery";
import { LoopRunStore } from "../core/loop-run-store";
import type { LoopRunIdentity } from "../core/loop-executor-types";
import type { CodexRunner } from "../execution/codex-real-dispatch-runner";
import { ExecutionGateway } from "../execution/gateway";
import type { ExecutionRequest, ExecutionResult } from "../execution/types";
import type { NodeCapabilityId } from "../loop/types";

let passed = 0;
function ok(value: unknown, message: string): asserts value {
  assert.ok(value, message);
  passed += 1;
}

function equal(actual: unknown, expected: unknown, message: string): void {
  assert.deepEqual(actual, expected, message);
  passed += 1;
}

function throws(fn: () => unknown, message: string): void {
  assert.throws(fn, message);
  passed += 1;
}

const TS = "2026-08-19T12:00:00.000Z";

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    Object.freeze(value);
    for (const key of Object.keys(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

function registrySnapshot(
  version: string,
  change?: (binding: BindingRegistry["bindings"][number]) => BindingRegistry["bindings"][number],
): BindingRegistry {
  return deepFreeze({
    version,
    bindings: INITIAL_BINDING_REGISTRY.bindings.map((binding) => change?.({ ...binding }) ?? { ...binding }),
  }) as BindingRegistry;
}

function identity(root: string, suffix: string): LoopRunIdentity {
  return Object.freeze({
    runId: `run-wp5-${suffix}`,
    requirementId: `REQ-WP5-${suffix}`,
    repository: "example",
    repositoryPath: join(root, "repo"),
    baseBranch: "main",
    expectedBaseSha: "5".repeat(40),
    taskBranch: `feature/wp5-${suffix.toLowerCase()}`,
    controlRoot: join(root, "control"),
    createdAt: TS,
  });
}

function qualifiedResult(request: ExecutionRequest, findings: readonly unknown[] = []): ExecutionResult {
  const capability = request.type as NodeCapabilityId;
  const output: Record<string, unknown> = { result: "capability_completed" };
  if (capability === "solution-challenge" || capability === "code-review") {
    output.unresolvedFindings = [...findings];
  }
  if (capability === "solution-review" || capability === "test-validation") {
    output.gateResult = "PASS";
  }
  return Object.freeze({
    success: true,
    node: request.node,
    agent: request.agent,
    output: Object.freeze(output),
    artifacts: Object.freeze([createArtifact({
      id: `${request.requirementId}:${capability}:qualified`,
      requirementId: request.requirementId,
      node: request.node,
      type: CAPABILITY_ARTIFACT_TYPES[capability],
      content: { node_output: `qualified ${capability} output` },
      agent: request.agent,
      source: "execution_gateway",
      createdAt: TS,
    })]),
  });
}

function runner(run: (request: ExecutionRequest) => Promise<ExecutionResult> | ExecutionResult): CodexRunner {
  return { run: async (request) => run(request) };
}

function gateway(
  runStore: LoopRunStore,
  artifactStore: LoopArtifactStore,
  bindingRegistry: BindingRegistry,
  codexRunner?: CodexRunner,
): ExecutionGateway {
  return new ExecutionGateway({
    env: { SDLC_EXECUTION_MODE: "codex", SDLC_CODEX_REAL_DISPATCH: "enabled" },
    ...(codexRunner === undefined ? {} : { codexRunner }),
    capabilityTracing: {
      runStore,
      artifactStore,
      bindingRegistry,
      executorVersions: { codex: "1.0.0", kimi: "1.0.0", hermes: "1.0.0" },
      now: () => TS,
    },
  });
}

function entry(
  runStore: LoopRunStore,
  artifactStore: LoopArtifactStore,
  bindingRegistry: BindingRegistry,
  codexRunner?: CodexRunner,
): LoopCapabilityEntry {
  return new LoopCapabilityEntry({
    runStore,
    artifactStore,
    bindingRegistry,
    gateway: gateway(runStore, artifactStore, bindingRegistry, codexRunner),
    now: () => TS,
  });
}

async function main(): Promise<void> {
  console.log("WP-5: binding replacement preserves the canonical contract");
  validateBindingRegistry(INITIAL_BINDING_REGISTRY);
  ok(true, "initial registry passes the production validator");
  const contractsBefore = JSON.stringify(NODE_CAPABILITY_CONTRACTS);
  const artifactTypesBefore = JSON.stringify(CAPABILITY_ARTIFACT_TYPES);
  const bindingContractsBefore = INITIAL_BINDING_REGISTRY.bindings.map(({ enabled: _enabled, ...contract }) => contract);
  const replacement = replaceBinding(
    INITIAL_BINDING_REGISTRY,
    "binding-codex-tech-design",
    "binding-kimi-tech-design",
  );
  validateBindingRegistry(replacement.registry);
  ok(true, "replacement snapshot passes the production validator");
  equal(replacement.registry.version, "2", "replacement increments the immutable registry version");
  equal(
    replacement.registry.bindings.map(({ enabled: _enabled, ...contract }) => contract),
    bindingContractsBefore,
    "replacement changes selection flags only and preserves all binding contracts",
  );
  equal(JSON.stringify(NODE_CAPABILITY_CONTRACTS), contractsBefore, "replacement does not mutate node contracts");
  equal(JSON.stringify(CAPABILITY_ARTIFACT_TYPES), artifactTypesBefore, "replacement does not mutate output artifact schemas");
  ok(Object.isFrozen(NODE_CAPABILITY_CONTRACTS), "node contract registry is frozen at runtime");
  ok(NODE_CAPABILITY_CONTRACTS.every((contract) => Object.isFrozen(contract)), "every node contract is frozen at runtime");
  ok(NODE_CAPABILITY_CONTRACTS.every((contract) => Object.isFrozen(contract.inputArtifacts) && Object.isFrozen(contract.prohibited)),
    "nested contract arrays are frozen at runtime");
  throws(
    () => replaceBinding(replacement.registry, "binding-codex-tech-design", "binding-kimi-tech-design"),
    "a disabled source cannot be replayed as a replacement",
  );
  const drifted = registrySnapshot("2", (binding) => binding.capability === "tech-design" && binding.agent === "codex"
    ? { ...binding, outputContract: "drifted-contract:v1" }
    : binding);
  throws(() => validateBindingRegistry(drifted), "runtime validation rejects output contract drift");
  throws(() => new LoopCapabilityEntry({
    runStore: null as unknown as LoopRunStore,
    artifactStore: null as unknown as LoopArtifactStore,
    bindingRegistry: drifted,
    gateway: null as unknown as ExecutionGateway,
  }), "supported entry rejects a drifted registry before any journal can be touched");

  console.log("WP-5: supported entry requires the run store bound to the same artifact store");
  {
    const bindRoot = mkdtempSync(join(tmpdir(), "loop-wp5-binding-"));
    try {
      mkdirSync(join(bindRoot, "repo"));
      const id = identity(bindRoot, "BINDING");
      const artifactStore = new LoopArtifactStore({ controlRoot: id.controlRoot, repositoryPath: id.repositoryPath });
      artifactStore.init();
      const unboundStore = new LoopRunStore(join(bindRoot, "unbound.db"));
      unboundStore.init();
      const boundStore = new LoopRunStore(join(bindRoot, "bound.db"), { artifactStore });
      boundStore.init();
      const otherArtifacts = new LoopArtifactStore({
        controlRoot: join(bindRoot, "other-control"),
        repositoryPath: id.repositoryPath,
      });
      otherArtifacts.init();
      const mismatchedStore = new LoopRunStore(join(bindRoot, "mismatched.db"), { artifactStore: otherArtifacts });
      mismatchedStore.init();
      throws(() => entry(unboundStore, artifactStore, INITIAL_BINDING_REGISTRY),
        "entry rejects an unbound run store");
      throws(() => entry(mismatchedStore, artifactStore, INITIAL_BINDING_REGISTRY),
        "entry rejects a run store bound to a different artifact store instance");
      // The gateway must trace into the same store pair: a gateway writing
      // outputs to a different artifact store would split journal refs from
      // the blobs revisions are verified against.
      throws(() => new LoopCapabilityEntry({
        runStore: boundStore,
        artifactStore,
        bindingRegistry: INITIAL_BINDING_REGISTRY,
        gateway: gateway(boundStore, otherArtifacts, INITIAL_BINDING_REGISTRY),
        now: () => TS,
      }), "entry rejects a gateway tracing a different artifact store");
      const foreignRunStore = new LoopRunStore(join(bindRoot, "foreign.db"), { artifactStore });
      foreignRunStore.init();
      throws(() => new LoopCapabilityEntry({
        runStore: boundStore,
        artifactStore,
        bindingRegistry: INITIAL_BINDING_REGISTRY,
        gateway: gateway(foreignRunStore, artifactStore, INITIAL_BINDING_REGISTRY),
        now: () => TS,
      }), "entry rejects a gateway tracing a different run store");
      throws(() => new LoopCapabilityEntry({
        runStore: boundStore,
        artifactStore,
        bindingRegistry: INITIAL_BINDING_REGISTRY,
        gateway: { execute: async () => Promise.reject(new Error("unused")) } as unknown as ExecutionGateway,
        now: () => TS,
      }), "entry rejects an execute-only object that is not a traced ExecutionGateway");
      ok(entry(boundStore, artifactStore, INITIAL_BINDING_REGISTRY) instanceof LoopCapabilityEntry,
        "entry accepts the same-instance binding");
      // Binding checks are non-virtual (construction-time WeakMap state):
      // neither subclass overrides nor monkey-patched instance members can
      // forge them.
      class OverrideRunStore extends LoopRunStore {
        isBoundToArtifactStore(): boolean { return true; }
      }
      const forgedStore = new OverrideRunStore(join(bindRoot, "forged.db"));
      forgedStore.init();
      throws(() => entry(forgedStore, artifactStore, INITIAL_BINDING_REGISTRY),
        "subclass override cannot forge the artifact store binding");
      Object.assign(unboundStore, { isBoundToArtifactStore: () => true });
      throws(() => entry(unboundStore, artifactStore, INITIAL_BINDING_REGISTRY),
        "monkey-patched instance member cannot forge the artifact store binding");
      class OverrideGateway extends ExecutionGateway {
        isCapabilityTracingBoundTo(): boolean { return true; }
      }
      const forgedGateway = new OverrideGateway({
        env: { SDLC_EXECUTION_MODE: "codex", SDLC_CODEX_REAL_DISPATCH: "enabled" },
        capabilityTracing: {
          runStore: boundStore,
          artifactStore: otherArtifacts,
          bindingRegistry: INITIAL_BINDING_REGISTRY,
          executorVersions: { codex: "1.0.0", kimi: "1.0.0", hermes: "1.0.0" },
          now: () => TS,
        },
      });
      throws(() => new LoopCapabilityEntry({
        runStore: boundStore,
        artifactStore,
        bindingRegistry: INITIAL_BINDING_REGISTRY,
        gateway: forgedGateway,
        now: () => TS,
      }), "subclass override cannot forge the gateway tracing binding");
      forgedStore.close();
      // Post-construction mutation of the caller's configuration objects
      // cannot swap the entry's or the gateway's store wiring: both snapshot
      // and freeze their dependency configuration at construction.
      const originalTracing = {
        runStore: boundStore,
        artifactStore,
        bindingRegistry: INITIAL_BINDING_REGISTRY,
        executorVersions: { codex: "1.0.0", kimi: "1.0.0", hermes: "1.0.0" },
        now: () => TS,
      };
      const stableGatewayOptions = {
        env: { SDLC_EXECUTION_MODE: "codex", SDLC_CODEX_REAL_DISPATCH: "enabled" },
        codexRunner: runner((request) => qualifiedResult(request)),
        capabilityTracing: originalTracing,
      };
      const stableGateway = new ExecutionGateway(stableGatewayOptions);
      const stableEntryOptions = {
        runStore: boundStore,
        artifactStore,
        bindingRegistry: INITIAL_BINDING_REGISTRY,
        gateway: stableGateway,
        now: () => TS,
      };
      const stableEntry = new LoopCapabilityEntry(stableEntryOptions);
      originalTracing.artifactStore = otherArtifacts;
      stableGatewayOptions.capabilityTracing = { ...originalTracing };
      stableEntryOptions.gateway = gateway(boundStore, otherArtifacts, INITIAL_BINDING_REGISTRY);
      stableEntryOptions.artifactStore = otherArtifacts;
      const stableSource = artifactStore.put("requirement_summary", "WP-5 binding stability source");
      const executed = await stableEntry.execute({
        requirementId: id.requirementId,
        identity: id,
        capability: "requirement-intake",
        inputArtifactRef: stableSource.artifactRef,
        inputArtifactVersion: "1.0.0",
        inputDigest: stableSource.digest,
        outputArtifactVersion: "1.0.0",
        input: { requirement: "binding stability" },
      });
      ok(executed.execution.success === true,
        "entry executes against its construction-time dependency snapshot");
      const stableEvents = boundStore.listCapabilityExecutions(id.runId);
      ok(stableEvents.length === 2 && stableEvents[1]?.status === "succeeded",
        "execution journals into the original run store");
      const stableRef = stableEvents[1]?.outputArtifactRef ?? null;
      const stableDigest = stableEvents[1]?.outputDigest ?? null;
      ok(stableRef !== null && stableDigest !== null &&
        artifactStore.read(stableRef, stableDigest).length > 0,
        "output blob stays in the original artifact store");
      foreignRunStore.close();
      unboundStore.close();
      boundStore.close();
      mismatchedStore.close();
      otherArtifacts.close();
      artifactStore.close();
    } finally {
      rmSync(bindRoot, { recursive: true, force: true });
    }
  }
  const gitExpanded = registrySnapshot("2", (binding) => binding.capability === "tech-design" && binding.agent === "codex"
    ? { ...binding, allowedSideEffects: Object.freeze(["workspace-local-write", "git-push"] as unknown as string[]) }
    : binding);
  throws(() => validateBindingRegistry(gitExpanded), "runtime validation rejects automatic Git side-effect expansion");
  const proxiedBindings = Object.freeze(new Proxy([...INITIAL_BINDING_REGISTRY.bindings], {}));
  throws(() => validateBindingRegistry(Object.freeze({ version: "2", bindings: proxiedBindings })),
    "runtime validation rejects a proxied binding array before traversal");
  const accessorBindings = [...INITIAL_BINDING_REGISTRY.bindings];
  Object.defineProperty(accessorBindings, "0", { get: () => INITIAL_BINDING_REGISTRY.bindings[0], enumerable: true });
  Object.freeze(accessorBindings);
  throws(() => validateBindingRegistry(Object.freeze({ version: "2", bindings: accessorBindings })),
    "runtime validation rejects accessor elements before invoking them");
  const overflowingTimeout = registrySnapshot("2", (binding) => binding.bindingId === "binding-codex-tech-design"
    ? { ...binding, timeoutMs: 2_147_483_648 }
    : binding);
  throws(() => validateBindingRegistry(overflowingTimeout), "runtime validation rejects timeout values that Node would clamp");

  console.log("WP-5: unavailable replacement is a recoverable failed attempt and retry is fresh");
  const replacementRoot = mkdtempSync(join(tmpdir(), "loop-wp5-replacement-"));
  try {
    mkdirSync(join(replacementRoot, "repo"));
    const id = identity(replacementRoot, "REPLACEMENT");
    const artifactStore = new LoopArtifactStore({ controlRoot: id.controlRoot, repositoryPath: id.repositoryPath });
    const runStore = new LoopRunStore(join(replacementRoot, "journal.db"), { artifactStore });
    runStore.init();
    artifactStore.init();
    const source = artifactStore.put("requirement_summary", "WP-5 replacement source");
    const successfulRunner = runner((request) => qualifiedResult(request));
    const intake = await entry(runStore, artifactStore, INITIAL_BINDING_REGISTRY, successfulRunner).execute({
      requirementId: id.requirementId,
      identity: id,
      capability: "requirement-intake",
      inputArtifactRef: source.artifactRef,
      inputArtifactVersion: "1.0.0",
      inputDigest: source.digest,
      outputArtifactVersion: "1.0.0",
      input: { requirement: "validate replacement guards" },
    });
    const intakeState = intake.recoveryContext.capabilityStates[0]!;
    const techInput = {
      inputArtifactRef: intakeState.effectiveOutputArtifactRef!,
      inputArtifactVersion: intakeState.effectiveOutputArtifactVersion!,
      inputDigest: intakeState.effectiveOutputDigest!,
    };
    const kimiRegistry = replacement.registry;
    const unavailable = await entry(runStore, artifactStore, kimiRegistry).execute({
      requirementId: id.requirementId,
      capability: "tech-design",
      ...techInput,
      outputArtifactVersion: "1.0.0",
      input: { requirementSummaryRef: techInput.inputArtifactRef },
    });
    ok(unavailable.execution.success === false, "an unavailable replacement cannot report success");
    equal(unavailable.execution.output["reason"], "executor_unavailable", "unavailable executor has a stable result reason");
    const failedTech = unavailable.recoveryContext.capabilityStates[1]!;
    equal(failedTech.status, "failed", "unavailable executor creates a durable failed attempt");
    equal(failedTech.errorCode, "EXECUTOR_UNAVAILABLE", "unavailable attempt has a stable journal code");
    ok(failedTech.retryable === true, "retry_other_binding makes the unavailable attempt recoverable");
    ok(failedTech.effectiveOutputArtifactRef === null, "shadow output never becomes an effective artifact");
    equal(unavailable.recoveryContext.nextCapability, "tech-design", "recovery points to the same capability for retry");

    const codexRegistry = replaceBinding(
      kimiRegistry,
      "binding-kimi-tech-design",
      "binding-codex-tech-design",
    ).registry;
    let freshDispatches = 0;
    const retry = await entry(runStore, artifactStore, codexRegistry, runner((request) => {
      freshDispatches += 1;
      return qualifiedResult(request);
    })).execute({
      requirementId: id.requirementId,
      capability: "tech-design",
      ...techInput,
      outputArtifactVersion: "1.0.0",
      input: { requirementSummaryRef: techInput.inputArtifactRef },
    });
    equal(retry.attempt, 2, "retry is recorded as a new attempt");
    equal(freshDispatches, 1, "retry invokes the selected executor again instead of reusing history");
    ok(retry.execution.success === true, "fresh qualified retry can succeed");
    const techEvents = runStore.listCapabilityExecutions(id.runId).filter((event) => event.capability === "tech-design");
    equal(techEvents.map((event) => event.status), ["started", "failed", "started", "succeeded"],
      "history preserves the failed attempt before the successful retry");
    equal(techEvents[0]?.executorAgent, "kimi", "failed attempt preserves the replacement executor snapshot");
    equal(techEvents[2]?.executorAgent, "codex", "retry records the newly selected executor snapshot");
    equal(techEvents[0]?.inputDigest, techEvents[2]?.inputDigest, "retry preserves the verified input lineage");

    const techState = retry.recoveryContext.capabilityStates[1]!;
    const challenge = await entry(runStore, artifactStore, codexRegistry, runner((request) => qualifiedResult(request, [
      { severity: "P1", evidence: "missing failure recovery proof" },
    ]))).execute({
      requirementId: id.requirementId,
      capability: "solution-challenge",
      inputArtifactRef: techState.effectiveOutputArtifactRef!,
      inputArtifactVersion: techState.effectiveOutputArtifactVersion!,
      inputDigest: techState.effectiveOutputDigest!,
      outputArtifactVersion: "1.0.0",
      input: { designRef: techState.effectiveOutputArtifactRef },
    });
    ok(challenge.execution.success === true, "qualified challenge output is recorded as executed");
    equal(challenge.recoveryContext.capabilityChainStatus, "BLOCKED", "unresolved findings still block progression after replacement");
    equal(challenge.recoveryContext.nextCapability, null, "blocked findings cannot auto-advance to review or Re-Gate");
    ok(challenge.recoveryContext.capabilityStates[2]?.unresolvedFindingsRef !== null,
      "unresolved findings remain durable recovery facts");
    artifactStore.close();
    runStore.close();
  } finally {
    rmSync(replacementRoot, { recursive: true, force: true });
  }

  console.log("WP-5: timeout and unqualified output never become historical success");
  const failureRoot = mkdtempSync(join(tmpdir(), "loop-wp5-failures-"));
  try {
    mkdirSync(join(failureRoot, "repo"));
    const id = identity(failureRoot, "TIMEOUT");
    const artifactStore = new LoopArtifactStore({ controlRoot: id.controlRoot, repositoryPath: id.repositoryPath });
    const runStore = new LoopRunStore(join(failureRoot, "journal.db"), { artifactStore });
    runStore.init();
    artifactStore.init();
    const source = artifactStore.put("requirement_summary", "WP-5 timeout source");
    const timeoutRegistry = registrySnapshot("10", (binding) => binding.bindingId === "binding-codex-requirement-intake"
      ? { ...binding, timeoutMs: 5 }
      : binding);
    const lateRunner = runner((request) => new Promise((resolve) => {
      setTimeout(() => resolve(qualifiedResult(request)), 30);
    }));
    const timedOut = await entry(runStore, artifactStore, timeoutRegistry, lateRunner).execute({
      requirementId: id.requirementId,
      identity: id,
      capability: "requirement-intake",
      inputArtifactRef: source.artifactRef,
      inputArtifactVersion: "1.0.0",
      inputDigest: source.digest,
      outputArtifactVersion: "1.0.0",
      input: { requirement: "timeout must be recoverable" },
    });
    equal(timedOut.execution.output["reason"], "executor_timeout", "timeout has a stable result reason");
    const timeoutState = timedOut.recoveryContext.capabilityStates[0]!;
    equal(timeoutState.status, "failed", "timeout creates a durable failed attempt");
    equal(timeoutState.errorCode, "EXECUTOR_TIMEOUT", "timeout has a stable journal code");
    ok(timeoutState.effectiveOutputArtifactRef === null, "timeout creates no effective output");
    await new Promise((resolve) => setTimeout(resolve, 40));
    equal(runStore.listCapabilityExecutions(id.runId).map((event) => event.status), ["started", "failed"],
      "late executor completion is discarded and cannot rewrite the journal");
    const retryRegistry = registrySnapshot("11");
    let retryDispatches = 0;
    const retry = await entry(runStore, artifactStore, retryRegistry, runner((request) => {
      retryDispatches += 1;
      return qualifiedResult(request);
    })).execute({
      requirementId: id.requirementId,
      capability: "requirement-intake",
      inputArtifactRef: source.artifactRef,
      inputArtifactVersion: "1.0.0",
      inputDigest: source.digest,
      outputArtifactVersion: "1.0.0",
      input: { requirement: "timeout must be recoverable" },
    });
    equal(retry.attempt, 2, "timeout recovery starts a fresh attempt");
    equal(retryDispatches, 1, "timeout recovery invokes the executor again");
    ok(retry.execution.success === true, "qualified timeout retry succeeds without historical substitution");
    artifactStore.close();
    runStore.close();
  } finally {
    rmSync(failureRoot, { recursive: true, force: true });
  }

  const outputRoot = mkdtempSync(join(tmpdir(), "loop-wp5-output-"));
  try {
    mkdirSync(join(outputRoot, "repo"));
    const id = identity(outputRoot, "OUTPUT");
    const artifactStore = new LoopArtifactStore({ controlRoot: id.controlRoot, repositoryPath: id.repositoryPath });
    const runStore = new LoopRunStore(join(outputRoot, "journal.db"), { artifactStore });
    runStore.init();
    artifactStore.init();
    const source = artifactStore.put("requirement_summary", "WP-5 output source");
    const unqualifiedRunner = runner((request) => Object.freeze({
      ...qualifiedResult(request),
      artifacts: Object.freeze([createArtifact({
        id: "wrong-output",
        requirementId: request.requirementId,
        node: request.node,
        type: "tech_design",
        content: { node_output: "wrong artifact type" },
        agent: request.agent,
        source: "execution_gateway",
        createdAt: TS,
      })]),
    }));
    const unqualified = await entry(runStore, artifactStore, INITIAL_BINDING_REGISTRY, unqualifiedRunner).execute({
      requirementId: id.requirementId,
      identity: id,
      capability: "requirement-intake",
      inputArtifactRef: source.artifactRef,
      inputArtifactVersion: "1.0.0",
      inputDigest: source.digest,
      outputArtifactVersion: "1.0.0",
      input: { requirement: "unqualified output must fail" },
    });
    equal(unqualified.recoveryContext.capabilityStates[0]?.errorCode, "OUTPUT_CONTRACT_VIOLATION",
      "unqualified output creates a stable failed attempt");
    ok(unqualified.recoveryContext.capabilityStates[0]?.effectiveOutputArtifactRef === null,
      "unqualified artifact never becomes effective output");
    equal(unqualified.recoveryContext.nextCapability, "requirement-intake", "unqualified attempt is recoverable");
    let freshDispatches = 0;
    const retry = await entry(runStore, artifactStore, INITIAL_BINDING_REGISTRY, runner((request) => {
      freshDispatches += 1;
      return qualifiedResult(request);
    })).execute({
      requirementId: id.requirementId,
      capability: "requirement-intake",
      inputArtifactRef: source.artifactRef,
      inputArtifactVersion: "1.0.0",
      inputDigest: source.digest,
      outputArtifactVersion: "1.0.0",
      input: { requirement: "unqualified output must fail" },
    });
    equal(retry.attempt, 2, "unqualified output retry is a new attempt");
    equal(freshDispatches, 1, "unqualified output retry invokes a fresh execution");
    ok(retry.execution.success === true, "fresh qualified output can complete the retry");
    const recovered = recoverRunContext(runStore, id.requirementId)!;
    equal(recovered.capabilityStates[0]?.status, "succeeded", "recovery exposes only the qualified retry as effective");
    artifactStore.close();
    runStore.close();
  } finally {
    rmSync(outputRoot, { recursive: true, force: true });
  }

  console.log(`loop-validation-guards tests passed: ${passed}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
