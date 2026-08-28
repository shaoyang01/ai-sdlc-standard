// Multi-Agent Fake Runners — boundary tests (C03-E W1, Decision-073)
// ===================================================================
// Locks the per-agent ownership fail-closed behavior of the specialized
// Kimi/Hermes fake runners and the Q1 routing of MultiAgentFakeGateway.

import { createKimiFakeRunner, createHermesFakeRunner } from "../execution/multi-agent-fake-runners";
import type { ExecutionRequest } from "../execution/types";

let passed = 0;
function ok(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  passed += 1;
}

function fakeRequest(overrides: Partial<ExecutionRequest>): ExecutionRequest {
  return {
    requirementId: "REQ-FAKE",
    node: overrides.type ?? "node",
    type: overrides.type ?? "requirement-intake",
    agent: overrides.agent ?? "kimi",
    input: {},
    ...overrides,
  } as ExecutionRequest;
}

async function main(): Promise<void> {
  const kimi = createKimiFakeRunner();
  const hermes = createHermesFakeRunner();

  // Kimi owns its four Q1 capabilities (all primary role) and produces canonical artifacts.
  for (const capability of ["requirement-intake", "solution-design", "task-planning", "knowledge-sync"] as const) {
    const result = await kimi.run(
      fakeRequest({
        type: capability,
        agent: "kimi",
        node: capability,
        loopExecution: { executionRole: "primary" } as ExecutionRequest["loopExecution"],
      }),
    );
    ok(result.success === true && result.artifacts[0] !== undefined, `kimi ${capability} succeeds with an artifact`);
  }

  // Kimi refuses a request bound to another agent (fail-closed).
  let kimiRejected = false;
  try {
    await kimi.run(fakeRequest({ type: "requirement-intake", agent: "codex" }));
  } catch {
    kimiRejected = true;
  }
  ok(kimiRejected, "kimi runner rejects a non-kimi request");

  // Kimi refuses a capability Q1 assigns elsewhere (implementation=codex).
  let kimiOwnershipRejected = false;
  try {
    await kimi.run(fakeRequest({ type: "implementation", agent: "kimi", node: "implementation" }));
  } catch {
    kimiOwnershipRejected = true;
  }
  ok(kimiOwnershipRejected, "kimi runner rejects a capability it does not own");

  // Hermes owns formal_verdict and carries the conclusive PASS.
  const verdict = await hermes.run(
    fakeRequest({
      type: "solution-gate",
      agent: "hermes",
      node: "solution-gate",
      loopExecution: { executionRole: "formal_verdict" } as ExecutionRequest["loopExecution"],
    }),
  );
  ok(verdict.success === true, "hermes formal_verdict succeeds");
  ok(verdict.output["gateResult"] === "PASS", "hermes formal_verdict carries the conclusive PASS");

  // Hermes refuses the adversarial_scan role (owned by Codex).
  let hermesRoleRejected = false;
  try {
    await hermes.run(
      fakeRequest({
        type: "solution-gate",
        agent: "hermes",
        node: "solution-gate",
        loopExecution: { executionRole: "adversarial_scan" } as ExecutionRequest["loopExecution"],
      }),
    );
  } catch {
    hermesRoleRejected = true;
  }
  ok(hermesRoleRejected, "hermes runner rejects adversarial_scan (codex-owned)");

  // Hermes serves code-review at its PRIMARY role (F2 regression: a single
  // runner-wide formal_verdict requirement previously made code-review unservable).
  const review = await hermes.run(
    fakeRequest({
      type: "code-review",
      agent: "hermes",
      node: "code-review",
      loopExecution: { executionRole: "primary" } as ExecutionRequest["loopExecution"],
    }),
  );
  ok(review.success === true && review.artifacts[0] !== undefined, "hermes code-review/primary succeeds with an artifact");

  // code-review has no formal_verdict role — the wrong role is rejected.
  for (const role of [undefined, "formal_verdict"] as const) {
    let reviewRoleRejected = false;
    try {
      await hermes.run(
        fakeRequest({
          type: "code-review",
          agent: "hermes",
          node: "code-review",
          loopExecution: role === undefined ? undefined : ({ executionRole: role } as ExecutionRequest["loopExecution"]),
        }),
      );
    } catch {
      reviewRoleRejected = true;
    }
    ok(reviewRoleRejected, `hermes code-review rejects role ${String(role)} (only primary is legal)`);
  }

  // Agent routing of MultiAgentFakeGateway itself is covered end-to-end by the
  // loop state-machine tests (wp5/validation-guards/fake-runner-integration),
  // which drive it through the real durable tracing context.

  console.log(`multi-agent fake runners: ${passed} passed`);
}

void main();
