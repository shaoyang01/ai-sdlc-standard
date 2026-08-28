// Multi-Agent Fake Gateway — C03-E W1 test fixture (Decision-073, Q1 binding)
// ===================================================================
// TEST-ONLY. A Q1-aware ExecutionGateway that routes each node-capability
// dispatch to the specialized fake runner owned by the request's bound agent
// (Kimi / Codex / Hermes), instead of dropping non-Codex agents onto the
// shadow adapter (whose shadow_output does not satisfy the node output
// contract). It extends the real ExecutionGateway and overrides ONLY the
// product source (executePrimary); the base class's unique durable tracing
// state machine is reused unchanged — this is the fake twin of the production
// RealCapabilityGateway and never spawns a real CLI.

import { ExecutionGateway, type ExecutionGatewayOptions } from "../../execution/gateway";
import { createCodexFakeRunner } from "../../execution/codex-real-dispatch-runner";
import {
  createHermesFakeRunner,
  createKimiFakeRunner,
  type NodeCapabilityFakeRunner,
} from "../../execution/multi-agent-fake-runners";
import type { CodexRunner } from "../../execution/codex-real-dispatch-runner";
import type { ExecutionRequest, ExecutionResult } from "../../execution/types";

type CodexScenario = NonNullable<Parameters<typeof createCodexFakeRunner>[0]>["scenario"];

export interface MultiAgentFakeGatewayOptions extends ExecutionGatewayOptions {
  /** Override the Codex scenario (default success_code_patch). */
  codexScenario?: CodexScenario;
  /**
   * Agents whose executor is deliberately unavailable: requests for these
   * agents fall through to the base shadow result (which carries no canonical
   * node output), so the entry records EXECUTOR_UNAVAILABLE exactly as it does
   * when a bound agent has no real executor configured.
   */
  unavailableAgents?: ReadonlySet<string>;
  /** Override the Kimi fake runner (e.g. a slow/qualifying runner). */
  kimiRunnerOverride?: NodeCapabilityFakeRunner;
  /** Override the Hermes fake runner. */
  hermesRunnerOverride?: NodeCapabilityFakeRunner;
}

export class MultiAgentFakeGateway extends ExecutionGateway {
  private readonly codexRunner: CodexRunner;
  private readonly kimiRunner: NodeCapabilityFakeRunner;
  private readonly hermesRunner: NodeCapabilityFakeRunner;
  private readonly unavailableAgents: ReadonlySet<string>;

  constructor(options: MultiAgentFakeGatewayOptions = {}) {
    super({
      ...options,
      env: {
        SDLC_EXECUTION_MODE: "codex",
        SDLC_CODEX_REAL_DISPATCH: "enabled",
        ...(options.env ?? {}),
      },
    });
    this.codexRunner = options.codexRunner
      ?? createCodexFakeRunner({ scenario: options.codexScenario ?? "success_code_patch" });
    this.kimiRunner = options.kimiRunnerOverride ?? createKimiFakeRunner();
    this.hermesRunner = options.hermesRunnerOverride ?? createHermesFakeRunner();
    this.unavailableAgents = options.unavailableAgents ?? new Set<string>();
  }

  protected async executePrimary(enriched: ExecutionRequest): Promise<ExecutionResult> {
    if (this.unavailableAgents.has(enriched.agent)) {
      return super.executePrimary(enriched);
    }
    if (enriched.agent === "codex") return this.codexRunner.run(enriched);
    if (enriched.agent === "kimi") return this.kimiRunner.run(enriched);
    if (enriched.agent === "hermes") return this.hermesRunner.run(enriched);
    return super.executePrimary(enriched);
  }
}
