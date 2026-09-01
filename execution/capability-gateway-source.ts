// Capability source switch — C03-E W2 (wiring-design §3, Decision-072)
// =====================================================================
// The SINGLE place that chooses where node capabilities come from:
//   - "deterministic" (default): the existing traced shadow gateway. Behaviour
//     is byte-for-byte unchanged — it delegates straight to
//     createDeterministicCapabilityGateway and performs NO extra validation
//     (tests intentionally inject non-Q1 registries on this face).
//   - "real": RealCapabilityGateway over injected CLI adapter + attempt
//     workspace. Reachable in code but only selected by an explicit flag.
//
// Anti-silent-cutover (wiring-design §3): selecting "real" requires ALL of
// (a) the explicit source value, (b) a Q1-shaped binding registry and
// (c) resolvable real deps (adapter + attemptWorkspace). Any miss throws and
// NEVER falls back to the deterministic shadow.

import type { LoopRunStore } from "../core/loop-run-store";
import type { LoopArtifactStore } from "../core/loop-artifact-store";
import { isQ1BindingRegistry, type BindingRegistry } from "../core/agent-capability-bindings";
import {
  CAPABILITY_EXECUTOR_VERSIONS,
  createDeterministicCapabilityGateway,
  type ExecutionGateway,
} from "./gateway";
import { RealCapabilityGateway, type RealCapabilityGatewayDeps } from "./real-capability-gateway";

export type CapabilitySource = "deterministic" | "real";

export const DEFAULT_CAPABILITY_SOURCE: CapabilitySource = "deterministic";

export function isCapabilitySource(value: unknown): value is CapabilitySource {
  return value === "deterministic" || value === "real";
}

export class CapabilitySourceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CapabilitySourceError";
  }
}

export interface CapabilityGatewayFactoryOptions {
  source: CapabilitySource;
  runStore: LoopRunStore;
  artifactStore: LoopArtifactStore;
  bindingRegistry: BindingRegistry;
  now: () => string;
  /** Required ONLY for source === "real"; injected by the production entry. */
  realDeps?: RealCapabilityGatewayDeps;
}

export function createCapabilityGateway(options: CapabilityGatewayFactoryOptions): ExecutionGateway {
  const { source, runStore, artifactStore, bindingRegistry, now, realDeps } = options;

  if (source === "deterministic") {
    // Exact current behaviour: no added checks, no forked construction.
    return createDeterministicCapabilityGateway({ runStore, artifactStore, bindingRegistry, now });
  }

  if (source === "real") {
    // (b) the enabled slot map must match Q1 — a drifted registry must not be
    // driven by real CLI dispatch.
    if (!isQ1BindingRegistry(bindingRegistry)) {
      throw new CapabilitySourceError(
        "REAL_SOURCE_REQUIRES_Q1_REGISTRY",
        "real capability source requires a Q1-shaped binding registry; refusing to fall back to deterministic",
      );
    }
    // (c) real dispatch needs both an adapter and an attempt-workspace resolver.
    if (
      realDeps === undefined ||
      realDeps.adapter === undefined ||
      typeof realDeps.attemptWorkspace !== "function"
    ) {
      throw new CapabilitySourceError(
        "REAL_SOURCE_MISCONFIGURED",
        "real capability source requires realDeps.adapter and realDeps.attemptWorkspace " +
          "(injected by the production entry); refusing to fall back to deterministic",
      );
    }
    return new RealCapabilityGateway(
      {
        capabilityTracing: {
          runStore,
          artifactStore,
          bindingRegistry,
          executorVersions: CAPABILITY_EXECUTOR_VERSIONS,
          now,
        },
      },
      {
        ...realDeps,
        // W-GW-FIX (Decision-078): the loop's input artifacts live in THIS
        // factory's artifact store, and run() dispatches only
        // { inputArtifactRef } — so the text resolver is bound here, the one
        // place both sides meet. Callers (smoke script, future production
        // door) get the wiring without per-caller assembly.
        artifactText: (artifactRef: string) => artifactStore.read(artifactRef).toString("utf8"),
      },
    );
  }

  // Closed enum — TypeScript narrows here only for valid callers; runtime
  // callers passing a stray string fail closed instead of defaulting.
  throw new CapabilitySourceError(
    "UNKNOWN_CAPABILITY_SOURCE",
    `capabilitySource must be "deterministic" | "real", got ${String(source)}`,
  );
}
