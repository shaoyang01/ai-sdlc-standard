// [FROZEN: PATH A RETIREMENT (C03-E W4 / Decision-073)]
// Legacy Path-A module (first-generation sdlc-* D0x runtime / Agent direct-drive).
// FROZEN: do not evolve; new Path-B assembly must not import it (enforced by
// scripts/validate-skill-contracts.rb section B-7). Physical deletion is a
// separate decision after the Path-B periphery is complete and the E5 real
// canary passes. See docs/reports/c03-e-w4-spawn-reference-graph.md

// Codex Adapter — Opt-in Only
// ============================
// Real Codex execution behind Execution Gateway.
// Only activated when SDLC_EXECUTION_MODE=codex AND agent=codex.
// Default: shadow mode.
// Does NOT apply patches, commit, or create PRs.

import { ExecutionRequest, ExecutionResult, ExecutionArtifact } from "./types";
import { createArtifact } from "../core/artifact";
import { isSupportedCodexRequestType } from "./codex-real-dispatch-runner";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function executeCodexAgent(
  request: ExecutionRequest
): Promise<ExecutionResult> {
  // Only code_generation and node capability request types are supported.
  if (!isSupportedCodexRequestType(request.type)) {
    return {
      success: false,
      node: request.node,
      agent: request.agent,
      output: { error: "Codex adapter only supports code_generation and node capability request types" },
      artifacts: [],
      error: "Unsupported request type",
    };
  }

  try {
    const prompt = buildCodexPrompt(request);
    const stdout = await runCodexCli(prompt);

    const artifact: ExecutionArtifact = createArtifact({
      requirementId: request.requirementId,
      node: request.node,
      type: "code_patch",
      content: { raw_output: stdout, patch: stdout },
      agent: request.agent,
      source: "execution_gateway",
      id: `${request.requirementId}:${request.node}:code_patch:0`,
    });

    return {
      success: true,
      node: request.node,
      agent: request.agent,
      output: {
        node: request.node,
        agent: request.agent,
        result: "code_patch_generated",
        raw_output: stdout,
      },
      artifacts: [artifact],
    };
  } catch (error) {
    return {
      success: false,
      node: request.node,
      agent: request.agent,
      output: { error: `Codex execution failed: ${error instanceof Error ? error.message : String(error)}` },
      artifacts: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Safe CLI invocation — execFile, not shell interpolation
async function runCodexCli(prompt: string): Promise<string> {
  const { stdout } = await execFileAsync("codex", [prompt], {
    timeout: 120_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout;
}

// Deterministic prompt builder — no hidden state, no credentials
function buildCodexPrompt(request: ExecutionRequest): string {
  return [
    "You are executing an SDLC implementation node.",
    "Generate a code patch or implementation plan based on the request.",
    "",
    `Requirement ID: ${request.requirementId}`,
    `Node: ${request.node}`,
    `Agent: ${request.agent}`,
    "",
    "Input:",
    JSON.stringify(request.input, null, 2),
    "",
    "Return a unified diff patch when possible.",
  ].join("\n");
}
