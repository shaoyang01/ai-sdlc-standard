// Regression Test — Agent Skill Registry (Flow-Stage Based)
// ===========================================================
// Verifies the registry models skills as flow nodes, not runtime nodes.
// Metadata-only. No runtime, no DB, no agents.

import {
  getAllSkillFlowBindings,
  getSkillFlowBinding,
  getSkillsByFlowId,
  getSkillsByRole,
  getGlobalEntrySkill,
  getSubflowEntrySkills,
  getDownstreamSkills,
  getEligibleSkillsForAgent,
  validateSkillInvocation,
} from "../core/agent-skill-registry";

async function test() {
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      passed++;
      console.log(`  ✓ ${message}`);
    } else {
      failed++;
      console.error(`  ✗ ${message}`);
    }
  }

  console.log("Agent Skill Registry Test (Flow-Stage Based)\n");

  // ── Test 1: Basic registry ──
  console.log("Test 1: Basic registry");
  const all = getAllSkillFlowBindings();
  assert(all.length === 21, `21 skills (got ${all.length})`);
  for (const b of all) {
    assert(b.skill.startsWith("sdlc-"), `${b.skill} starts with sdlc-`);
    assert(b.runtimeInvoked === false, `${b.skill}: runtimeInvoked is false`);
    assert(b.executionMode === "metadata_only", `${b.skill}: executionMode is metadata_only`);
  }
  console.log("");

  // ── Test 2: Global entry ──
  console.log("Test 2: Global entry");
  const entry = getGlobalEntrySkill();
  assert(entry.skill === "sdlc-requirement-normalizer", "global entry is requirement-normalizer");
  assert(entry.role === "global_entry", "role is global_entry");
  assert(entry.flowIds.includes("main_docflow"), "belongs to main_docflow");
  console.log("");

  // ── Test 3: Code review normalizer ──
  console.log("Test 3: Code review normalizer is NOT global entry");
  const crn = getSkillFlowBinding("sdlc-code-review-normalizer");
  assert(crn !== undefined, "code-review-normalizer exists");
  assert(crn!.role === "subflow_normalizer", "role is subflow_normalizer");
  assert(crn!.role !== "global_entry", "is NOT global_entry");
  assert(crn!.flowIds.includes("code_review_subflow"), "belongs to code_review_subflow");
  assert(crn!.flowIds.includes("direct_implementation_path"), "belongs to direct_implementation_path");
  console.log("");

  // ── Test 4: Speckit implement ──
  console.log("Test 4: Speckit implement is flow_internal");
  const si = getSkillFlowBinding("sdlc-speckit-implement");
  assert(si !== undefined, "speckit-implement exists");
  assert(si!.flowIds.includes("speckit_pipeline"), "belongs to speckit_pipeline");
  assert(si!.stage === "Implementation Execution", "stage is Implementation Execution");
  assert(si!.role === "flow_internal", "role is flow_internal");
  console.log("");

  // ── Test 5: Direct implementation is NOT a skill ──
  console.log("Test 5: Direct implementation is not modeled as a skill");
  const direct = getSkillFlowBinding("DIRECT_IMPLEMENTATION_AGENT_EXECUTION");
  assert(direct === undefined, "no direct implementation skill exists");
  // No binding should have "DIRECT_IMPLEMENTATION" in its skill name
  assert(!all.some((b) => b.skill.includes("DIRECT_IMPLEMENTATION")), "no DIRECT_IMPLEMENTATION skill");
  console.log("");

  // ── Test 6: Flow lookups ──
  console.log("Test 6: Flow lookups");
  const mainFlow = getSkillsByFlowId("main_docflow");
  assert(mainFlow.some((b) => b.skill === "sdlc-requirement-normalizer"), "main includes requirement-normalizer");
  assert(mainFlow.some((b) => b.skill === "sdlc-specification-writer"), "main includes specification-writer");
  assert(mainFlow.some((b) => b.skill === "sdlc-solution-challenger"), "main includes solution-challenger");
  assert(mainFlow.some((b) => b.skill === "sdlc-solution-reviewer"), "main includes solution-reviewer");

  const speckitFlow = getSkillsByFlowId("speckit_pipeline");
  const speckitSkills = ["sdlc-speckit-pipeline", "sdlc-speckit-specify", "sdlc-speckit-clarify",
    "sdlc-speckit-plan", "sdlc-speckit-tasks", "sdlc-speckit-analyze",
    "sdlc-speckit-implement", "sdlc-speckit-sync", "sdlc-speckit-code-doc-reconcile"];
  for (const sk of speckitSkills) {
    assert(speckitFlow.some((b) => b.skill === sk), `speckit flow includes ${sk}`);
  }
  console.log("");

  // ── Test 7: Downstream lookups ──
  console.log("Test 7: Downstream lookups");
  const rnDownstream = getDownstreamSkills("sdlc-requirement-normalizer");
  assert(rnDownstream.some((b) => b.skill === "sdlc-specification-writer"), "requirement-normalizer → specification-writer");

  const swDownstream = getDownstreamSkills("sdlc-specification-writer");
  assert(swDownstream.some((b) => b.skill === "sdlc-solution-challenger"), "specification-writer → solution-challenger");

  const scDownstream = getDownstreamSkills("sdlc-solution-challenger");
  assert(scDownstream.some((b) => b.skill === "sdlc-solution-reviewer"), "solution-challenger → solution-reviewer");

  const analyzeDownstream = getDownstreamSkills("sdlc-speckit-analyze");
  assert(analyzeDownstream.some((b) => b.skill === "sdlc-speckit-implement"), "analyze → implement");

  const implDownstream = getDownstreamSkills("sdlc-speckit-implement");
  assert(implDownstream.some((b) => b.skill === "sdlc-speckit-sync"), "implement → sync");
  console.log("");

  // ── Test 8: Agent eligibility ──
  console.log("Test 8: Agent eligibility (metadata only)");
  const kimiSkills = getEligibleSkillsForAgent("kimi");
  assert(kimiSkills.some((b) => b.skill === "sdlc-requirement-normalizer"), "kimi eligible for requirement-normalizer");

  const codexSkills = getEligibleSkillsForAgent("codex");
  assert(codexSkills.some((b) => b.skill === "sdlc-speckit-implement"), "codex eligible for speckit-implement");

  const hermesSkills = getEligibleSkillsForAgent("hermes");
  assert(hermesSkills.some((b) => b.skill === "sdlc-test-feedback-classifier"), "hermes eligible for test-feedback-classifier");
  console.log("");

  // ── Test 9: Validation (flow-based, not runtime-node based) ──
  console.log("Test 9: Validation (flow-stage based)");
  assert(validateSkillInvocation({ skill: "sdlc-requirement-normalizer" }).valid === true, "known skill is valid");
  assert(validateSkillInvocation({ skill: "sdlc-requirement-normalizer", flowId: "main_docflow" }).valid === true, "known skill + matching flow is valid");
  assert(validateSkillInvocation({ skill: "sdlc-requirement-normalizer", flowId: "speckit_pipeline" }).valid === false, "known skill + non-matching flow is invalid");
  assert(validateSkillInvocation({ skill: "unknown-skill" }).valid === false, "unknown skill is invalid");
  const empty = validateSkillInvocation({ skill: "" });
  assert(empty.attempted === false, "empty skill not attempted");
  assert(empty.valid === true, "empty skill is valid (not required)");
  console.log("");

  // ── Test 10: Subflow entry skills ──
  console.log("Test 10: Subflow entry skills");
  const subEntries = getSubflowEntrySkills();
  assert(Array.isArray(subEntries), "subflow entries is array");
  assert(subEntries.some((b) => b.skill === "sdlc-code-review-normalizer"),
    "includes code-review-normalizer (subflow_normalizer)");
  assert(subEntries.some((b) => b.skill === "sdlc-speckit-pipeline"),
    "includes speckit-pipeline (flow_controller)");
  assert(!subEntries.some((b) => b.skill === "sdlc-requirement-normalizer"),
    "does NOT include requirement-normalizer (global entry)");
  console.log("");

  // ── Test 11: sdlc-solution-challenger semantic invariants ──
  console.log("Test 11: sdlc-solution-challenger semantic invariants");
  const fs = require("fs");
  const path = require("path");

  const skillMd = fs.readFileSync("skills/sdlc-solution-challenger/SKILL.md", "utf-8");
  const contractMd = fs.readFileSync("skill-contracts/known-skills/sdlc-solution-challenger.md", "utf-8");
  const fuRef = fs.readFileSync("skills/sdlc-solution-challenger/references/follow-up-verification.md", "utf-8");
  const spRef = fs.readFileSync("skills/sdlc-solution-challenger/references/scope-and-phase-firewall.md", "utf-8");

  // 1. READY_FOR_GATE is impossible when BLOCKING or REQUIRED remain
  assert(
    skillMd.includes("Never output `READY_FOR_GATE` while BLOCKING or REQUIRED"),
    "SKILL.md: never READY_FOR_GATE while BLOCKING/REQUIRED remain"
  );
  assert(
    fuRef.includes("Never output `READY_FOR_GATE` while BLOCKING or REQUIRED"),
    "follow-up-verification.md: never READY_FOR_GATE while BLOCKING/REQUIRED remain"
  );

  // 2. Cycle exhaustion preserves NEEDS_REVISION (not READY_FOR_GATE)
  assert(
    skillMd.includes("NEEDS_REVISION") && skillMd.includes("challenge_cycle.exhausted: true"),
    "SKILL.md: cycle exhaustion uses NEEDS_REVISION with exhausted flag"
  );
  assert(
    fuRef.includes("NEEDS_REVISION") && fuRef.includes("challenge_cycle.exhausted: true"),
    "follow-up-verification.md: cycle exhaustion uses NEEDS_REVISION"
  );

  // 3. Cycle exhaustion may recommend ESCALATE_TO_SOLUTION_REVIEWER
  assert(
    skillMd.includes("ESCALATE_TO_SOLUTION_REVIEWER"),
    "SKILL.md: ESCALATE_TO_SOLUTION_REVIEWER is documented"
  );
  assert(
    fuRef.includes("ESCALATE_TO_SOLUTION_REVIEWER"),
    "follow-up-verification.md: ESCALATE_TO_SOLUTION_REVIEWER is documented"
  );
  // ESCALATE is a handoff, not a Gate decision
  assert(
    skillMd.includes("handoff action") && skillMd.includes("not a Gate decision"),
    "SKILL.md: ESCALATE is described as handoff, not Gate decision"
  );

  // 4. Incomplete phase boundary vs indeterminable goal are treated differently
  assert(
    spRef.includes("completely indeterminable") && spRef.includes("Stop immediately"),
    "scope-and-phase-firewall.md: completely indeterminable goal → stop immediately"
  );
  assert(
    spRef.includes("still identifiable") && spRef.includes("Continue INITIAL_CHALLENGE"),
    "scope-and-phase-firewall.md: identifiable goal → continue with PHASE_BOUNDARY_MISSING"
  );
  assert(
    skillMd.includes("completely indeterminable") && skillMd.includes("do not produce a definitive"),
    "SKILL.md: indeterminable goal → no NEEDS_REVISION / READY_FOR_GATE"
  );

  // 5. Contract has can_execute_commands: false
  assert(
    contractMd.includes("can_execute_commands: false"),
    "contract: can_execute_commands is false"
  );

  // 6. challenge_cycle fields are in the output structure (output-report.md)
  const orRef = fs.readFileSync("skills/sdlc-solution-challenger/references/output-report.md", "utf-8");
  assert(
    orRef.includes("challenge_cycle:") && orRef.includes("max_cycles: 2") && orRef.includes("exhausted:"),
    "output-report.md: challenge_cycle with current_cycle, max_cycles, exhausted"
  );

  console.log("");

  // ── sdlc-solution-reviewer semantic invariants ──
  console.log("sdlc-solution-reviewer semantic invariants");
  {
    const fs2 = require("fs");
    const skill2 = fs2.readFileSync("skills/sdlc-solution-reviewer/SKILL.md", "utf-8");
    const contract2 = fs2.readFileSync("skill-contracts/known-skills/sdlc-solution-reviewer.md", "utf-8");
    const workflow2 = fs2.readFileSync("skills/sdlc-solution-reviewer/references/review-workflow.md", "utf-8");
    const decision2 = fs2.readFileSync("skills/sdlc-solution-reviewer/references/development-path-decision.md", "utf-8");
    const output2 = fs2.readFileSync("skills/sdlc-solution-reviewer/references/output-report.md", "utf-8");

    // 1. SKILL.md references the canonical standard
    assert(skill2.includes("ai-sdlc/development-path-governance.md"), "SKILL.md references ai-sdlc/development-path-governance.md");

    // 2. All five docs use the canonical Development Path Decision
    for (const [name, text] of [["SKILL.md", skill2], ["contract", contract2], ["review-workflow.md", workflow2], ["development-path-decision.md", decision2], ["output-report.md", output2]] as const) {
      assert(text.includes("Development Path Decision"), `${name} uses canonical Development Path Decision`);
    }

    // 3/4. Active output template uses Decision and never Recommendation
    const templateMatch = output2.match(/```markdown([\s\S]*?)```/);
    assert(templateMatch !== null, "output-report.md has an active markdown template block");
    const activeTemplate = templateMatch ? templateMatch[1]! : "";
    assert(activeTemplate.includes("Development Path Decision:"), "active template contains Development Path Decision field");
    assert(!activeTemplate.includes("Development Path Recommendation"), "active template does NOT contain Development Path Recommendation");

    // 5/6. compatibility-read and no dual-write rules exist
    assert(skill2.includes("compatibility-read"), "SKILL.md declares compatibility-read rule");
    assert(output2.includes("compatibility-read"), "output-report.md declares compatibility-read rule");
    assert(skill2.includes("不得双写 Recommendation 和 Decision"), "SKILL.md declares no dual-write rule");
    assert(output2.includes("不得双写 Recommendation 和 Decision"), "output-report.md declares no dual-write rule");

    // 7. exact Decision Source
    assert(activeTemplate.includes("Development Path Decision Source: sdlc-solution-reviewer"), "active template pins Decision Source = sdlc-solution-reviewer");
    assert(contract2.includes("Development Path Decision Source: `sdlc-solution-reviewer`"), "contract pins Decision Source = sdlc-solution-reviewer");

    // 8/9. Decision Artifact + status enum
    assert(activeTemplate.includes("Development Path Decision Artifact:"), "active template has Decision Artifact field");
    assert(activeTemplate.includes("Development Path Decision Artifact Status: current / stale / not_persisted"), "Artifact Status supports current / stale / not_persisted");

    // 10. response-only uses not_persisted
    assert(skill2.includes("Development Path Decision Artifact: not_persisted"), "SKILL.md response-only uses not_persisted");
    assert(skill2.includes("Development Path Decision Artifact Status: not_persisted"), "SKILL.md response-only status is not_persisted");
    assert(output2.includes("Development Path Decision Artifact Status: not_persisted"), "output-report.md response-only status is not_persisted");

    // 11. initial Tail fields exist
    assert(activeTemplate.includes("Tail Required:") && activeTemplate.includes("Tail Scope:") && activeTemplate.includes("Tail Status:"), "active template has Tail Required / Scope / Status");
    assert(skill2.includes("Tail Required") && skill2.includes("Tail Scope") && skill2.includes("Tail Status"), "SKILL.md has initial Tail fields");

    // 12. business_domain_sync need does not auto-trigger Speckit
    assert(skill2.includes("business_domain_sync need 本身不自动触发 `SPECKIT_PIPELINE_REQUIRED`"), "SKILL.md: business_domain_sync need does not auto-trigger Speckit");
    assert(decision2.includes("business_domain_sync need 本身不自动触发 `SPECKIT_PIPELINE_REQUIRED`"), "decision reference: business_domain_sync need does not auto-trigger Speckit");

    // 13. retired sync-driven triggers are gone from active rules
    assert(!skill2.includes("knowledge sync needs"), "SKILL.md no longer lists knowledge sync needs as trigger");
    assert(!decision2.includes("Significant code/doc sync requirement"), "decision reference drops Significant code/doc sync requirement trigger");
    assert(!decision2.includes("Need to update `.specify/business_domain/**`"), "decision reference drops business_domain update trigger");

    // 14. Direct path no longer bans domain knowledge sync
    assert(!decision2.includes("does not require new domain knowledge sync"), "Direct path no longer requires absence of domain knowledge sync");

    // 15. Speckit still triggered by COMPLEX / user_requested / later_gate_required
    assert(decision2.includes("`COMPLEX`") && decision2.includes("user_requested") && decision2.includes("later_gate_required"), "Speckit triggers remain COMPLEX / user_requested / later_gate_required");

    // 16. Delta semantics preserved
    assert(decision2.includes("Delta Complexity") && decision2.includes("Aggregate Complexity: reference only") && decision2.includes("Ignored Aggregate Triggers"), "Delta Complexity / reference-only / Ignored Aggregate Triggers preserved");

    // 17. Reviewer never auto-invokes the pipeline
    assert(skill2.includes("不得自动调用 `sdlc-speckit-pipeline`"), "SKILL.md forbids auto-invoking sdlc-speckit-pipeline");

    // 18. Skill stays metadata-only (no runtime wiring)
    const reviewerBinding = getSkillFlowBinding("sdlc-solution-reviewer");
    assert(reviewerBinding !== undefined && reviewerBinding!.runtimeInvoked === false && reviewerBinding!.executionMode === "metadata_only", "sdlc-solution-reviewer remains metadata_only / runtimeInvoked=false");

    // 19. Reviewer does not perform Tail Completion
    assert(skill2.includes("不负责最终 Tail Completion"), "SKILL.md: reviewer does not own Tail Completion");

    // 20. Reviewer executes no Sync/Reconcile and generates no 03/04/05
    assert(skill2.includes("不执行 Sync 或 Reconcile"), "SKILL.md: reviewer executes no Sync or Reconcile");
    assert(skill2.includes("不生成 `03-实现记录`、`04-代码审核`、`05-测试验收`"), "SKILL.md: reviewer generates no 03/04/05");
  }

  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
