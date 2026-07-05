// Demo — Shadow SDLC Pipeline
// ============================
// Runs the full SDLC pipeline with a sample requirement.
// Safe to execute: all agent calls are shadow-mode simulations.

import { run } from "./runtime";

run("build payment system with order sync across inventory service and repo-A calls repo-B")
  .then((result) => {
    const { execution_trace, fanout_results, final_status, requirement_id } = result;
    const traceSummary = execution_trace.map((t) => ({ node: t.node, agent: t.agent, status: t.status }));
    console.log(JSON.stringify({ requirement_id, final_status, trace_summary: traceSummary, fanout_results }, null, 2));
  })
  .catch((error) => {
    console.error("SDLC pipeline failed:", error);
    process.exit(1);
  });
