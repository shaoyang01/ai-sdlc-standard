// Evolution Engine — Read-Only Observability
// ===========================================
// Pipeline: collect events → compute metrics → analyze patterns → generate report.
// OUTPUT ONLY. NO system modification. NO executable suggestions.
//
// Evolution Layer MUST NOT:
// - modify DocFlow, LOOP, Speckit, Fanout
// - trigger execution
// - influence routing
// - generate PRs automatically

import { ExecutionEvent, EvolutionReport } from "../types/index";
import { computeMetrics } from "../collector/execution_collector";
import { analyzePatterns } from "../analyzer/pattern_analyzer";
import { generateReport } from "../reporter/insight_reporter";

export class EvolutionEngine {
  // Full observation pipeline — deterministic
  observe(events: ExecutionEvent[]): EvolutionReport {
    // 1. Compute metrics
    const metrics = computeMetrics(events);

    // 2. Analyze structural patterns
    const patterns = analyzePatterns(metrics);

    // 3. Generate read-only report
    return generateReport(metrics, patterns);
  }
}

export function runEvolution(events: ExecutionEvent[]): EvolutionReport {
  const engine = new EvolutionEngine();
  return engine.observe(events);
}
