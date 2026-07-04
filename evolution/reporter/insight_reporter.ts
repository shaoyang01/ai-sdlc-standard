// Insight Reporter — Read-Only, Non-Actionable
// =============================================
// Generates structured insights from patterns and metrics.
// Suggestions are OBSERVATIONS, NOT executable instructions.

import { SystemMetrics, DetectedPattern, EvolutionReport } from "../types/index";

export function generateReport(
  metrics: SystemMetrics,
  patterns: DetectedPattern[]
): EvolutionReport {
  const health = determineHealth(metrics);
  const suggestions = generateSuggestions(patterns, metrics);

  return {
    generated_at: new Date().toISOString(),
    system_health_summary: health,
    statistical_metrics: metrics,
    detected_patterns: patterns,
    improvement_suggestions: suggestions,
  };
}

function determineHealth(metrics: SystemMetrics): string {
  const rate = metrics.success_rate;
  if (rate >= 0.95) return "HEALTHY — System performing within expected parameters.";
  if (rate >= 0.80) return "STABLE — Minor failure rate observed. Monitor for trends.";
  if (rate >= 0.60) return "DEGRADED — Significant failure rate. Review recommended.";
  return "CRITICAL — High failure rate. Immediate human review required.";
}

// NON-ACTIONABLE suggestions — observations only, no execution instructions
function generateSuggestions(patterns: DetectedPattern[], metrics: SystemMetrics): string[] {
  const suggestions: string[] = [];

  if (patterns.length === 0) {
    suggestions.push("No structural patterns detected. System is operating within normal parameters.");
    return suggestions;
  }

  for (const p of patterns) {
    switch (p.pattern_type) {
      case "bottleneck":
        suggestions.push(`OBSERVATION: ${p.description} Consider human review of this node's execution conditions.`);
        break;
      case "failure_hotspot":
        suggestions.push(`OBSERVATION: ${p.description} Pattern may indicate recurring issues at this stage.`);
        break;
      case "volume_anomaly":
        suggestions.push(`OBSERVATION: ${p.description} Load distribution may need manual rebalancing.`);
        break;
      case "latency_trend":
        suggestions.push(`OBSERVATION: ${p.description} Latency patterns may indicate scaling or performance considerations.`);
        break;
    }
  }

  if (metrics.failure_rate > 0.2) {
    suggestions.push(`OBSERVATION: Overall failure rate is ${(metrics.failure_rate * 100).toFixed(0)}%. Human review recommended.`);
  }

  return suggestions;
}
