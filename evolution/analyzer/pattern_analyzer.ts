// Pattern Analyzer — Structural ONLY
// ====================================
// Detects structural patterns from metrics. NO root cause inference.
// Purely deterministic: same metrics → same patterns.

import { SystemMetrics, DetectedPattern } from "../types/index";

export function analyzePatterns(metrics: SystemMetrics): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  // Pattern 1: Bottleneck — node with highest failure rate
  const nodeEntries = Object.entries(metrics.by_node);
  if (nodeEntries.length > 0) {
    const worstNode = nodeEntries.reduce((a, b) => (a[1].success_rate < b[1].success_rate ? a : b));
    if (worstNode[1].success_rate < 0.8 && worstNode[1].total >= 2) {
      patterns.push({
        pattern_type: "bottleneck",
        description: `Node "${worstNode[0]}" has the lowest success rate at ${(worstNode[1].success_rate * 100).toFixed(0)}% across ${worstNode[1].total} executions.`,
        affected_nodes: [worstNode[0]],
        severity: worstNode[1].success_rate < 0.5 ? "high" : "medium",
      });
    }
  }

  // Pattern 2: Failure hotspot — any node with >1 failure
  for (const [node, metrics] of nodeEntries) {
    if (metrics.failed >= 2) {
      patterns.push({
        pattern_type: "failure_hotspot",
        description: `Node "${node}" has ${metrics.failed} failures out of ${metrics.total} executions.`,
        affected_nodes: [node],
        severity: metrics.failed >= 3 ? "high" : "low",
      });
    }
  }

  // Pattern 3: Agent imbalance — if one agent has significantly more volume
  const agentEntries = Object.entries(metrics.by_agent);
  if (agentEntries.length >= 2) {
    const maxAgent = agentEntries.reduce((a, b) => (a[1].total > b[1].total ? a : b));
    const minAgent = agentEntries.reduce((a, b) => (a[1].total < b[1].total ? a : b));
    if (maxAgent[1].total >= minAgent[1].total * 3 && maxAgent[1].total >= 3) {
      patterns.push({
        pattern_type: "volume_anomaly",
        description: `Agent "${maxAgent[0]}" handles ${maxAgent[1].total} executions while "${minAgent[0]}" handles only ${minAgent[1].total}.`,
        affected_nodes: [],
        severity: "low",
      });
    }
  }

  return patterns;
}
