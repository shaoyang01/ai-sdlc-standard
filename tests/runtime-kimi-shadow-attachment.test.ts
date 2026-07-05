// Regression Test — Runtime Kimi Shadow Attachment
// ===================================================
// Verifies runtime integration is sidecar-only, default off.

import { run } from "../runtime";

async function test() {
  let passed = 0, failed = 0;
  function assert(c: boolean, m: string) {
    if (c) { passed++; console.log(`  ✓ ${m}`); }
    else { failed++; console.error(`  ✗ ${m}`); }
  }

  const orig = process.env.SDLC_KIMI_RUNTIME_ATTACHMENT;
  const origShadow = process.env.SDLC_KIMI_GATEWAY_SHADOW;

  try {
    console.log("Runtime Kimi Shadow Attachment Test\n");

    // Test 1: Default — no Kimi field
    console.log("Test 1: Default — no Kimi field");
    delete process.env.SDLC_KIMI_RUNTIME_ATTACHMENT;
    delete process.env.SDLC_KIMI_GATEWAY_SHADOW;
    const r1 = await run("build simple user login");
    assert(r1.final_status === "success", "success");
    assert(!("kimi_runtime_shadow_attachment" in r1), "no Kimi field");
    assert(r1.execution_trace.length > 0, "trace exists");
    console.log("");

    // Test 2: Attachment enabled, shadow disabled
    console.log("Test 2: Attachment enabled, shadow disabled");
    process.env.SDLC_KIMI_RUNTIME_ATTACHMENT = "enabled";
    const r2 = await run("build simple user login");
    assert(r2.final_status === "success", "success");
    const attachment = r2.kimi_runtime_shadow_attachment;
    assert(attachment !== undefined && attachment.enabled === true, "attachment exists");
    assert(attachment.affectsFinalStatus === false, "no final status change");
    assert(attachment.affectsRouting === false, "no routing change");
    assert(attachment.primaryRuntimeUnchanged === true, "runtime unchanged");
    console.log("");

    // Test 3: Final status unchanged
    console.log("Test 3: Final status unchanged");
    assert(r2.final_status === "success", "final status is success");
    console.log("");

    // Test 4: Trace unchanged
    console.log("Test 4: Trace unchanged");
    const nodes = r2.execution_trace.map((t: { node: string }) => t.node) as string[];
    assert(nodes.includes("requirement-summary"), "has requirement-summary");
    assert(nodes.includes("validation"), "has validation");
    console.log("");

  } finally {
    if (orig === undefined) delete process.env.SDLC_KIMI_RUNTIME_ATTACHMENT;
    else process.env.SDLC_KIMI_RUNTIME_ATTACHMENT = orig;
    if (origShadow === undefined) delete process.env.SDLC_KIMI_GATEWAY_SHADOW;
    else process.env.SDLC_KIMI_GATEWAY_SHADOW = origShadow;
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
test();
