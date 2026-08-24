// C02-WP5: Non-Virtual Construction-Time Wiring Bindings
// =======================================================
// Supported production wiring (plan §C02-WP5; WP2 Round 8 clauses
// 0.1.4–0.1.6) rests on three same-instance identities that must never be
// forgeable by subclassing, monkey patching or post-construction mutation:
//
// 1. a supported entry's run journal must be BOUND to the exact artifact
//    store instance the entry reads through — otherwise the WP2 blob
//    binding is silently skipped on every revision write/read path;
// 2. an execution gateway's durable capability tracing must write into the
//    exact same run store and artifact store pair — otherwise journal
//    output refs and revision blobs split across disjoint stores;
// 3. both configurations are snapshot and frozen at construction so later
//    mutation of the caller's options objects cannot redirect them.
//
// The registries below are module-level WeakMaps keyed by object identity.
// Checks read construction-time binding state, never overridable instance
// members, so the determination is non-virtual by construction. Registration
// happens ONLY inside the owning constructors (LoopRunStore,
// ExecutionGateway, createDeterministicCapabilityGateway).

import type { LoopArtifactStore } from "./loop-artifact-store";
import type { LoopRunStore } from "./loop-run-store";

/** Tracing identity registered by a gateway constructor. */
export interface GatewayTracingBinding {
  readonly runStore: LoopRunStore;
  readonly artifactStore: Pick<LoopArtifactStore, "read" | "put">;
}

const LOOP_RUN_STORE_ARTIFACT_BINDINGS = new WeakMap<object, LoopArtifactStore>();

const GATEWAY_TRACING_BINDINGS = new WeakMap<object, GatewayTracingBinding>();

/**
 * Construction-time registration of the C02-WP2 blob binding: records that
 * `runStore` was constructed with `LoopRunOptions.artifactStore` set to
 * exactly `artifactStore`. Called only by the LoopRunStore constructor.
 */
export function bindRunStoreToArtifactStore(
  runStore: LoopRunStore,
  artifactStore: LoopArtifactStore,
): void {
  LOOP_RUN_STORE_ARTIFACT_BINDINGS.set(runStore, artifactStore);
}

/**
 * Non-virtual identity check for the C02-WP2 blob binding: true only when
 * `runStore` was constructed bound to exactly `artifactStore`. Supported
 * entries use this instead of any instance method, so neither subclass
 * overrides nor monkey-patched members can forge it.
 */
export function isLoopRunStoreBoundToArtifactStore(
  runStore: LoopRunStore,
  artifactStore: LoopArtifactStore,
): boolean {
  return LOOP_RUN_STORE_ARTIFACT_BINDINGS.get(runStore) === artifactStore &&
    LOOP_RUN_STORE_ARTIFACT_BINDINGS.has(runStore);
}

/**
 * Construction-time registration of durable capability tracing: records that
 * `gateway` journals capability executions into exactly the given run store
 * and writes output blobs into exactly the given artifact store. Called only
 * by the ExecutionGateway constructor and the deterministic capability
 * gateway factory.
 */
export function bindGatewayTracing(
  gateway: object,
  runStore: LoopRunStore,
  artifactStore: Pick<LoopArtifactStore, "read" | "put">,
): void {
  GATEWAY_TRACING_BINDINGS.set(gateway, Object.freeze({ runStore, artifactStore }));
}

/**
 * Non-virtual identity check for the durable capability tracing wiring:
 * true only when `gateway` was constructed tracing into exactly the given
 * run store and artifact store instances.
 */
export function isExecutionGatewayTracingBoundTo(
  gateway: object,
  runStore: LoopRunStore,
  artifactStore: LoopArtifactStore,
): boolean {
  const binding = GATEWAY_TRACING_BINDINGS.get(gateway);
  return binding !== undefined &&
    binding.runStore === runStore &&
    binding.artifactStore === artifactStore;
}
