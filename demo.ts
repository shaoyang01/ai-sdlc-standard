// Demo — Shadow SDLC Pipeline
// ============================
// Runs the full SDLC pipeline with a sample requirement.
// Safe to execute: all agent calls are shadow-mode simulations.
// By default this runs in shadow mode.
// To opt into Codex adapter, set SDLC_EXECUTION_MODE=codex.
// Optional:
//   SDLC_POLICY_MEMORY=enabled      persists read-only feedback memory to local SQLite.
//   SDLC_POLICY_MEMORY_READ=enabled reads local SQLite memory as advisory policy signals.

import { run } from "./runtime";

run("build payment system with order sync across inventory service and repo-A calls repo-B")
  .then((result) => {
    const { execution_trace, artifacts, feedback, fanout_results, final_status, requirement_id } = result;
    const traceSummary = execution_trace.map((t) => ({ node: t.node, agent: t.agent, status: t.status }));
    console.log(JSON.stringify({
      requirement_id,
      final_status,
      trace_summary: traceSummary,
      artifact_count: artifacts.length,
      feedback_summary: {
        agent_scores: feedback.agent_scores,
        policy_suggestions: feedback.policy_suggestions,
      },
      fanout_results,
    }, null, 2));
  })
  .catch((error) => {
    console.error("SDLC pipeline failed:", error);
    process.exit(1);
  });
