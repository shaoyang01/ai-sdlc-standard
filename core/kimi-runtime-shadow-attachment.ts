// [FROZEN: PATH A RETIREMENT (C03-E W4 / Decision-073)]
// Legacy Path-A module (first-generation sdlc-* D0x runtime / Agent direct-drive).
// FROZEN: do not evolve; new Path-B assembly must not import it (enforced by
// scripts/validate-skill-contracts.rb section B-7). Physical deletion is a
// separate decision after the Path-B periphery is complete and the E5 real
// canary passes. See docs/reports/c03-e-w4-spawn-reference-graph.md

// Kimi Runtime Shadow Attachment Helper
// ========================================
// Builds optional Kimi runtime sidecar metadata behind explicit flags.
// Does NOT change final_status, routing, agent selection, or Gateway dispatch.
// Default off. Sidecar only.

import type { ExecutionRequest } from "../execution/types";
import type { CliAdapterConfig } from "../execution/cli-adapter-contract-types";
import type { KimiCliProcessRunner } from "../execution/kimi-cli-command-executor";
import { buildKimiGatewayShadowSidecar } from "../execution/kimi-gateway-shadow-sidecar";
import {
  buildKimiRuntimeShadowAttachment,
  type KimiRuntimeShadowAttachment,
} from "../execution/kimi-runtime-attachment-contract";

export async function buildOptionalKimiRuntimeShadowAttachment(input: {
  request: ExecutionRequest;
  config?: CliAdapterConfig;
  env?: Record<string, string | undefined>;
  runner?: KimiCliProcessRunner;
}): Promise<KimiRuntimeShadowAttachment | undefined> {
  const env = input.env ?? process.env;
  if (env.SDLC_KIMI_RUNTIME_ATTACHMENT !== "enabled") {
    return undefined;
  }

  const sidecar = await buildKimiGatewayShadowSidecar({
    request: input.request,
    config: input.config,
    env,
    runner: input.runner,
  });

  return buildKimiRuntimeShadowAttachment({
    request: input.request,
    sidecar,
    env,
  });
}
