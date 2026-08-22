// Demo — v2 Single-Rail Runtime
// ==============================
// Runs the v2 seven-node chain for a sample requirement with the default
// deterministic shadow capability gateway: every execution point is journaled
// in an append-only LoopRunStore (v6) with the dual-agent solution-gate.
// Real dispatch (codex real runner) and production entry wiring are separate,
// explicitly authorized work packages.

import { run } from "./runtime";

run("build payment system with order sync across inventory service and repo-A calls repo-B", {
  requirementId: `REQ-DEMO-${Date.now()}`,
})
  .then((result) => {
    console.log(JSON.stringify({
      requirement_id: result.requirement_id,
      run_id: result.run_id,
      final_status: result.final_status,
      chain_status: result.chain_status,
      trace_summary: result.execution_trace.map((entry) => ({
        capability: entry.capability,
        role: entry.executionRole,
        agent: entry.agent,
        status: entry.status,
        gate: entry.gateResult,
      })),
      journal_path: result.journal_path,
      completed_at: result.completed_at,
    }, null, 2));
  })
  .catch((error) => {
    console.error("SDLC v2 runtime failed:", error);
    process.exit(1);
  });
