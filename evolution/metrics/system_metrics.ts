// System Metrics — Read-Only
// ===========================
// Re-exports from execution_collector for clean module boundary.
// Pure pass-through, no computation here.

export { computeMetrics, collectEvents } from "../collector/execution_collector";
