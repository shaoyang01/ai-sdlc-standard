// Capability Prompt Builder — C03-E E1 integration tests
// ========================================================
// Pure: proves the prompt (a) carries the exact E3 sentinels from a single
// source, (b) tailors verdict/findings instructions by node kind, (c) is
// deterministic and bounded, (d) fails closed on bad input.
import {
  buildNodeCapabilityPrompt,
  CapabilityPromptError,
  MAX_PROMPT_INPUT_CHARS,
} from "../execution/capability-prompt-builder";
import {
  NODE_OUTPUT_ENVELOPE_BEGIN,
  NODE_OUTPUT_ENVELOPE_END,
} from "../core/node-output-envelope";
import { NODE_CAPABILITY_IDS } from "../loop/types";
import type { NodeCapabilityId } from "../loop/types";

let p = 0,
  f = 0;
function ok(c: boolean, m: string): void {
  if (c) {
    p++;
    console.log(`  ✓ ${m}`);
  } else {
    f++;
    console.error(`  ✗ ${m}`);
  }
}
function build(capability: NodeCapabilityId, role: "primary" | "adversarial_scan" | "formal_verdict" = "primary", extra?: Partial<{ inputText: string }>): string {
  return buildNodeCapabilityPrompt({
    requirementId: "REQ-1",
    node: capability,
    capability,
    executionRole: role,
    inputText: extra?.inputText ?? "upstream product text",
  });
}
async function expectReject(fn: () => string, m: string): Promise<void> {
  try {
    fn();
    ok(false, `${m} (no error)`);
  } catch (e) {
    ok(e instanceof CapabilityPromptError, `${m} (got ${(e as Error)?.name})`);
  }
}

function main(): void {
  console.log("prompt: single-source E3 sentinels");
  for (const cap of NODE_CAPABILITY_IDS as readonly NodeCapabilityId[]) {
    const role = cap === "solution-gate" ? "formal_verdict" : "primary";
    const s = build(cap, role);
    ok(s.includes(NODE_OUTPUT_ENVELOPE_BEGIN) && s.includes(NODE_OUTPUT_ENVELOPE_END), `${cap}: carries exact E3 sentinels`);
  }

  console.log("prompt: gate node instructions");
  {
    const s = build("solution-gate", "formal_verdict");
    ok(s.includes('"PASS"') && s.includes('"FAIL"') && s.includes('"PASS_WITH_RISK"'), "gate: verdict values listed");
    ok(s.includes("NOT_APPLICABLE") && /may NOT use NOT_APPLICABLE/.test(s), "gate: forbids self-asserting NOT_APPLICABLE");
    ok(s.includes("riskAcceptanceRefs") && s.includes("REQUIRED non-empty"), "gate: PASS_WITH_RISK requires risk refs");
    ok(s.includes("findings"), "gate: findings instructions present");
    ok(/CRITICAL.*HIGH.*MEDIUM.*LOW/.test(s.replace(/\n/g, " ")), "gate: severity enum listed");
    ok(s.includes("REGRESSION") && s.includes("IMPROVEMENT"), "gate: cause enum listed");
  }

  console.log("prompt: non-gate nodes must not claim verdict");
  for (const cap of ["requirement-intake", "solution-design", "task-planning", "implementation", "knowledge-sync"] as NodeCapabilityId[]) {
    const s = build(cap);
    ok(/Do NOT include "gateResult"/.test(s), `${cap}: told not to emit gateResult`);
    ok(!s.includes("riskAcceptanceRefs"), `${cap}: no risk-ref instruction`);
  }

  console.log("prompt: code-review gets findings but no verdict");
  {
    const s = build("code-review");
    ok(s.includes("findings") && /CRITICAL.*HIGH.*MEDIUM.*LOW/.test(s.replace(/\n/g, " ")), "review: findings + severity");
    ok(/Do NOT include "gateResult"/.test(s), "review: no gateResult instruction");
  }

  console.log("prompt: determinism + content");
  {
    const a = build("implementation");
    const b = build("implementation");
    ok(a === b, "identical input -> identical prompt");
    ok(a.includes("upstream product text"), "input text embedded");
    ok(a.includes("Requirement ID: REQ-1") && a.includes("Node: implementation"), "identity fields present");
    ok(a.includes("credentials"), "warns against secret leakage");
  }

  console.log("prompt: fail-closed + bounded");
  expectReject(() => build("not-a-node" as NodeCapabilityId), "unknown capability rejected");
  expectReject(() => buildNodeCapabilityPrompt({ requirementId: "REQ-1", node: "n", capability: "implementation", executionRole: "primary", inputText: "  " }), "blank input rejected");
  expectReject(
    () => build("implementation", "primary", { inputText: "x".repeat(MAX_PROMPT_INPUT_CHARS + 1) }),
    "oversized input rejected",
  );
  {
    const okMax = build("implementation", "primary", { inputText: "x".repeat(MAX_PROMPT_INPUT_CHARS) });
    ok(okMax.length > MAX_PROMPT_INPUT_CHARS, "at-limit input accepted (prompt adds instructions)");
  }

  console.log(`\nResults: ${p} passed, ${f} failed`);
  if (f > 0) process.exit(1);
}

main();
