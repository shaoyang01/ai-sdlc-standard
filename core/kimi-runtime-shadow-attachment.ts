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
