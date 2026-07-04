// Evolution Types — Read-Only Observability
// ===========================================
// Pure data types. No execution logic. No system modification.

// Raw execution event — collected from Fanout/Feedback/DocFlow
export interface ExecutionEvent {
  requirement_id: string;
  repo: string;
  node: string;
  status: "success" | "failed";
  agent: string;
  executed_at: string;
  duration_ms: number;
}

// Aggregated system metrics — deterministic computation
export interface SystemMetrics {
  total_executions: number;
  success_rate: number;
  failure_rate: number;
  by_node: Record<string, NodeMetrics>;
  by_repo: Record<string, RepoMetrics>;
  by_agent: Record<string, AgentMetrics>;
  computed_at: string;
}

export interface NodeMetrics {
  total: number;
  succeeded: number;
  failed: number;
  success_rate: number;
}

export interface RepoMetrics {
  total: number;
  succeeded: number;
  failed: number;
}

export interface AgentMetrics {
  total: number;
  succeeded: number;
  failed: number;
  success_rate: number;
}

// Detected pattern — structural ONLY, no root cause inference
export interface DetectedPattern {
  pattern_type: "bottleneck" | "failure_hotspot" | "volume_anomaly" | "latency_trend";
  description: string;
  affected_nodes: string[];
  severity: "low" | "medium" | "high";
}

// Insight report — read-only, non-actionable
export interface EvolutionReport {
  generated_at: string;
  system_health_summary: string;
  statistical_metrics: SystemMetrics;
  detected_patterns: DetectedPattern[];
  improvement_suggestions: string[];
}
