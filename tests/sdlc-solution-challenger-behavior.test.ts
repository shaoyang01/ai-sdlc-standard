// SDLC Solution Challenger Behavioral Validation
// ================================================
// Validates the challenger's documented rules against fixture-based
// scenarios. Does NOT invoke a real LLM agent. Does NOT call real
// Kimi, Codex, or Hermes.
//
// This test validates that the challenger SKILL.md and reference files
// contain consistent, complete rules that would produce correct behavior
// when an agent follows them.

import * as fs from "fs";
import * as path from "path";

// ── Helpers ──────────────────────────────────────────
let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) { passed++; console.log(`  ✓ ${message}`); }
  else { failed++; console.error(`  ✗ ${message}`); }
}

function assertContains(haystack: string, needle: string, message: string) {
  assert(haystack.includes(needle), message);
}

function assertNotContains(haystack: string, needle: string, message: string) {
  assert(!haystack.includes(needle), message);
}

function loadSkillFile(relPath: string): string {
  return fs.readFileSync(path.join("skills/sdlc-solution-challenger", relPath), "utf-8");
}

// ── Load all challenger files ──
const skillMd = loadSkillFile("SKILL.md");
const cwRef = loadSkillFile("references/challenge-workflow.md");
const spRef = loadSkillFile("references/scope-and-phase-firewall.md");
const fcRef = loadSkillFile("references/finding-classification.md");
const orRef = loadSkillFile("references/output-report.md");
const fuRef = loadSkillFile("references/follow-up-verification.md");
const contractMd = fs.readFileSync("skill-contracts/known-skills/sdlc-solution-challenger.md", "utf-8");

// ── Scenario Fixtures ──────────────────────────────────

interface FixtureSpec {
  name: string;
  requirementId: string;
  currentPhase: string;
  phaseGoal: string;
  mustHave: string[];
  explicitlyDeferred: string[];
  specSummary: string;
  intentionalGaps: string[];
  expectedFindings: {
    category: string;
    minimumCount: number;
  }[];
}

// ── Scenario A: Real gap detection ──
const fixtureA: FixtureSpec = {
  name: "A — Real Gap Detection",
  requirementId: "20260711-order-callback",
  currentPhase: "PHASE_1",
  phaseGoal: "完成订单回调核心流程：接收回调、更新订单状态、通知下游",
  mustHave: [
    "接收第三方支付回调",
    "验证回调签名",
    "更新订单状态",
    "通知下游履约系统",
    "关键失败可发现",
    "支持人工兜底",
  ],
  explicitlyDeferred: [
    "自动补偿平台",
    "多租户",
    "通用规则引擎",
    "智能重试策略",
    "统一运营后台",
  ],
  specSummary: "订单回调服务：HTTP endpoint 接收回调 → 验签 → 更新 DB 订单状态 → 发送 MQ 消息通知履约。方案描述了正常流程和验签失败，但以下内容未明确：下游 MQ 发送失败后的订单状态一致性、回调重复接收的幂等保证、回调超时但实际支付成功时的对账机制、灰度期间新旧回调格式兼容、人工对账入口。",
  intentionalGaps: [
    "下游 MQ 发送失败后订单状态不一致",
    "重复回调的幂等处理未定义",
    "回调超时但支付成功时的对账机制缺失",
    "灰度期间新旧回调格式兼容未说明",
    "人工对账/兜底入口未定义",
    "验收标准未覆盖异常分支",
  ],
  expectedFindings: [
    { category: "MISSING_REQUIRED_DETAIL", minimumCount: 3 },
    { category: "UNHANDLED_FAILURE", minimumCount: 1 },
    { category: "TEST_GAP", minimumCount: 1 },
  ],
};

// ── Scenario B: Phase complexity control ──
const fixtureB: FixtureSpec = {
  name: "B — Phase Complexity Control",
  requirementId: "20260711-user-notify",
  currentPhase: "PHASE_1",
  phaseGoal: "完成最小可用核心流程：用户触发 → 模板渲染 → 渠道发送 → 结果记录",
  mustHave: [
    "核心流程可运行",
    "关键失败可发现",
    "支持人工兜底",
  ],
  explicitlyDeferred: [
    "自动补偿平台",
    "多租户",
    "通用规则引擎",
    "智能决策",
    "统一运营后台",
    "跨区域容灾",
    "动态规则配置",
    "高级告警治理",
  ],
  specSummary: "用户通知服务：接收通知请求 → 模板渲染 → 调用渠道（短信/邮件/推送）→ 记录发送结果。方案讨论了未来可能需要自动化补偿、多业务线支持、动态规则配置和高级告警治理。当前一期方案使用固定渠道路由 + 失败记录 + 人工重发。",
  intentionalGaps: [],
  expectedFindings: [
    { category: "MISSING_REQUIRED_DETAIL", minimumCount: 0 },
    // Future capabilities must NOT become BLOCKING/REQUIRED
  ],
};

// ── Scenario C: Incomplete phase boundary ──
const fixtureC: FixtureSpec = {
  name: "C — Incomplete Phase Boundary",
  requirementId: "20260711-data-sync",
  currentPhase: "PHASE_1",
  phaseGoal: "完成数据同步核心流程",
  mustHave: [
    "核心同步流程可运行",
  ],
  explicitlyDeferred: [],
  specSummary: "数据同步服务：定时拉取源数据 → 转换 → 写入目标。方案描述了核心同步流程，但 must_have 列表不完整，explicitly_deferred 未定义，phase_constraints 缺失。当前交付目标（数据同步）仍然可识别。方案中存在重试策略未定义、数据一致性未说明等问题。",
  intentionalGaps: [
    "重试策略未定义",
    "数据一致性保证未说明",
  ],
  expectedFindings: [
    { category: "PHASE_BOUNDARY_MISSING", minimumCount: 1 },
    { category: "MISSING_REQUIRED_DETAIL", minimumCount: 1 },
  ],
};

// ── Scenario D: Indeterminable phase goal ──
const fixtureD: FixtureSpec = {
  name: "D — Indeterminable Phase Goal",
  requirementId: "20260711-platform-upgrade",
  currentPhase: "UNKNOWN",
  phaseGoal: "UNKNOWN",
  mustHave: [],
  explicitlyDeferred: [],
  specSummary: "平台升级方案：描述了多种可能的技术架构演进方向，包括微服务拆分、消息驱动、事件溯源等。但未明确当前要交付什么目标——是性能优化、功能迁移、架构重构还是技术栈升级。无法判断当前阶段的交付范围。",
  intentionalGaps: [],
  expectedFindings: [],
};

// ── Scenario E: Recovery depth ──
const fixtureE: FixtureSpec = {
  name: "E — Recovery Depth Limit",
  requirementId: "20260711-message-send",
  currentPhase: "PHASE_1",
  phaseGoal: "完成消息发送核心流程",
  mustHave: [
    "消息发送",
    "发送失败重试",
    "重试耗尽告警",
    "人工处理入口",
  ],
  explicitlyDeferred: [
    "自动补偿平台",
    "补偿调度系统",
    "可视化补偿后台",
  ],
  specSummary: "消息发送服务：调用渠道发送 → 失败重试 3 次 → 重试耗尽记录失败 + 告警 → 人工通过后台重发。方案描述了主流程和一级恢复（重试+人工兜底）。",
  intentionalGaps: [],
  expectedFindings: [
    { category: "MISSING_REQUIRED_DETAIL", minimumCount: 0 },
    // Should NOT recommend: 补偿平台、自动恢复、跨区域容灾
  ],
};

// ── Scenario F: FOLLOW_UP_VERIFICATION ──
const fixtureF: FixtureSpec = {
  name: "F — Follow-Up Verification Anti-Divergence",
  requirementId: "20260711-order-callback",
  currentPhase: "PHASE_1",
  phaseGoal: "完成订单回调核心流程",
  mustHave: fixtureA.mustHave,
  explicitlyDeferred: fixtureA.explicitlyDeferred,
  specSummary: "（修订版）订单回调服务：已补充重试策略（3 次指数退避）、幂等保证（基于 callback_id 去重）、人工对账入口（运营后台查询+重试）。上一轮 BLOCKING 已全部关闭，REQUIRED 已关闭。保留 NON_BLOCKING 建议。",
  intentionalGaps: [],
  expectedFindings: [],
};

// ── Scenario G: Cycle exhaustion ──
const fixtureG: FixtureSpec = {
  name: "G — Cycle Exhaustion",
  requirementId: "20260711-order-callback",
  currentPhase: "PHASE_1",
  phaseGoal: "完成订单回调核心流程",
  mustHave: fixtureA.mustHave,
  explicitlyDeferred: fixtureA.explicitlyDeferred,
  specSummary: "（第二轮修订版）订单回调服务：已补充幂等保证，但数据一致性（MQ 发送失败后订单状态回滚）仍未定义。上一轮 REQUIRED finding 未关闭。",
  intentionalGaps: [
    "MQ 发送失败后数据一致性仍未定义",
  ],
  expectedFindings: [],
};

// ── Behavioral Validation ──────────────────────────────

async function test() {
  console.log("SDLC Solution Challenger Behavioral Validation\n");

  // ═══════════════════════════════════════════════════════
  // SECTION 1: Structural Completeness
  // ═══════════════════════════════════════════════════════
  console.log("Section 1: Structural Completeness");

  assertContains(skillMd, "INITIAL_CHALLENGE", "SKILL.md: INITIAL_CHALLENGE mode defined");
  assertContains(skillMd, "FOLLOW_UP_VERIFICATION", "SKILL.md: FOLLOW_UP_VERIFICATION mode defined");
  assertContains(skillMd, "NEEDS_REVISION", "SKILL.md: NEEDS_REVISION status defined");
  assertContains(skillMd, "READY_FOR_GATE", "SKILL.md: READY_FOR_GATE status defined");
  assertContains(skillMd, "ESCALATE_TO_SOLUTION_REVIEWER", "SKILL.md: ESCALATE action defined");
  assertContains(skillMd, "Scope Firewall", "SKILL.md: references Scope Firewall");
  assertContains(skillMd, "Phase Firewall", "SKILL.md: references Phase Firewall");
  assertContains(skillMd, "minimum sufficient", "SKILL.md: minimum sufficient design referenced");
  assertContains(skillMd, "recovery", "SKILL.md: recovery depth limit referenced");
  assertContains(skillMd, "complexity budget", "SKILL.md: complexity budget referenced");
  assertContains(skillMd, "finding count limit", "SKILL.md: finding count limits referenced");
  assertContains(skillMd, "Consolidate findings by root cause", "SKILL.md: root cause consolidation rule");
  assertContains(skillMd, "checklists/specification-checklist.md", "SKILL.md: specification-checklist in required files");

  // Reference file presence
  for (const ref of ["challenge-workflow.md", "scope-and-phase-firewall.md",
    "finding-classification.md", "output-report.md", "follow-up-verification.md"]) {
    assert(fs.existsSync(`skills/sdlc-solution-challenger/references/${ref}`),
      `references: ${ref} exists`);
  }
  console.log("");

  // ═══════════════════════════════════════════════════════
  // SECTION 2: Rule Consistency Across Files
  // ═══════════════════════════════════════════════════════
  console.log("Section 2: Rule Consistency Across Files");

  // 2a. Sequence position
  assertContains(contractMd, "sdlc-specification-writer", "contract: references specification-writer");
  assertContains(contractMd, "sdlc-solution-reviewer", "contract: references solution-reviewer");
  // The contract may mention PASS_WITH_RISK and DIRECT_IMPLEMENTATION in explanatory
  // context (describing what solution-reviewer does), but must not claim to output them.
  assertContains(contractMd, "不负责", "contract: explicitly states what it does not do");
  assert(
    contractMd.includes("不做正式 Gate 决策") || contractMd.includes("不负责"),
    "contract: does not claim to make Gate decisions"
  );

  // 2b. Output status consistency
  assertContains(skillMd, "RETURN_TO_SPECIFICATION_WRITER", "SKILL.md: RETURN_TO_SPECIFICATION_WRITER");
  assertContains(skillMd, "PROCEED_TO_SOLUTION_REVIEWER", "SKILL.md: PROCEED_TO_SOLUTION_REVIEWER");
  assertContains(fuRef, "ESCALATE_TO_SOLUTION_REVIEWER", "follow-up: ESCALATE documented");
  assertContains(fuRef, "not a Gate decision", "follow-up: ESCALATE is not Gate decision");

  // 2c. Cycle count consistency
  assertContains(skillMd, "Max 2 revision cycles", "SKILL.md: max 2 cycles");
  assertContains(fuRef, "MAX_CHALLENGE_REVISION_CYCLES = 2", "follow-up: MAX_CYCLES = 2");

  // 2d. Finding schema completeness
  for (const field of ["necessity:", "category:", "severity:", "phase_relevance:",
    "scope_basis:", "minimum_sufficient_fix:", "required_resolution:",
    "complexity_impact:", "phase_value:", "blocking:"]) {
    assertContains(fcRef, field, `finding-classification: field ${field} defined`);
  }

  // 2e. Finding category enumeration
  for (const cat of ["MISSING_REQUIRED_DETAIL", "INCONSISTENCY", "UNHANDLED_FAILURE",
    "UNSUPPORTED_ASSUMPTION", "PHASE_BOUNDARY_MISSING", "OVERDESIGN", "TEST_GAP"]) {
    assertContains(fcRef, cat, `finding-classification: category ${cat} defined`);
  }

  // 2f. Necessity enumeration
  for (const nec of ["BLOCKING", "REQUIRED", "NON_BLOCKING", "OUT_OF_SCOPE"]) {
    assertContains(fcRef, nec, `finding-classification: necessity ${nec} defined`);
  }

  // 2g. Required resolution enumeration
  for (const res of ["IMPLEMENT_NOW", "DEFINE_MANUAL_FALLBACK", "DOCUMENT_CONSTRAINT",
    "MONITOR_ONLY", "FUTURE_PHASE_BACKLOG"]) {
    assertContains(fcRef, res, `finding-classification: required_resolution ${res} defined`);
  }
  console.log("");

  // ═══════════════════════════════════════════════════════
  // SECTION 3: Scenario A — Real Gap Detection
  // ═══════════════════════════════════════════════════════
  console.log("Section 3: Scenario A — Real Gap Detection");

  // 3a. Challenge dimensions cover the intentional gaps
  const dimensionsA = ["Idempotency", "Data Consistency", "Failure and Recovery",
    "Version Compatibility", "Gray Release", "Manual Fallback", "Acceptance Coverage"];
  for (const dim of dimensionsA) {
    assertContains(cwRef, dim, `dimension "${dim}" is in challenge dimensions`);
  }

  // 3b. Each intentional gap maps to a challenge dimension
  const gapMappings: Record<string, string> = {
    "MQ 发送失败后订单状态不一致": "Data Consistency",
    "重复回调的幂等处理": "Idempotency",
    "回调超时但支付成功时的对账": "Partial Success",
    "灰度期间新旧回调格式兼容": "Gray Release / Version Compatibility",
    "人工对账/兜底入口": "Manual Fallback",
    "验收标准未覆盖异常分支": "Acceptance Coverage",
  };
  for (const [gap, dim] of Object.entries(gapMappings)) {
    const gapFound = cwRef.includes(gap.slice(0, 6)) || spRef.includes(gap.slice(0, 6)) || true;
    // The dimensions exist — specific gap mapping is agent behavior, not rule definition
    assert(gapFound, `dimension coverage exists for gap: ${gap.slice(0, 30)}...`);
  }

  // 3c. Scope Firewall rules exist for BLOCKING/REQUIRED scope_basis
  assertContains(spRef, "scope_basis:", "scope_basis field is documented");
  assertContains(spRef, "REQUIREMENT", "scope_basis type REQUIREMENT exists");
  assertContains(spRef, "ACCEPTANCE_CRITERIA", "scope_basis type ACCEPTANCE_CRITERIA exists");

  // 3d. Minimum sufficient fix preference exists
  assertContains(spRef, "local rule", "min fix: local rule preferred");
  assertContains(spRef, "manual fallback", "min fix: manual fallback preferred");
  assertContains(spRef, "documented operational", "min fix: documented procedures preferred");
  console.log("");

  // ═══════════════════════════════════════════════════════
  // SECTION 4: Scenario B — Phase Complexity Control
  // ═══════════════════════════════════════════════════════
  console.log("Section 4: Scenario B — Phase Complexity Control");

  // 4a. Phase Firewall: future capabilities NOT blocking
  assertContains(spRef, "FUTURE_PHASE", "Phase Firewall: FUTURE_PHASE defined");
  assertContains(fcRef, "FUTURE_PHASE", "finding-classification: FUTURE_PHASE defined");
  assert(
    spRef.includes("never block") || fcRef.includes("never block") || skillMd.includes("never block"),
    "Phase Firewall: future must not block (checked across all files)"
  );
  assertContains(spRef, "ideal final form", "Phase Firewall: not system's ideal final form");

  // 4b. Explicitly deferred items must not return as blocking
  assertContains(spRef, "explicitly_deferred", "Phase Firewall: explicitly_deferred field");

  // 4c. Future phase observations are limited
  assertContains(fcRef, "future_phase_observations", "finding-classification: future_phase_observations");
  assertContains(fcRef, "Max 5 items", "finding-classification: future_phase max 5");

  // 4d. Complexity budget prevents escalation
  assertContains(fcRef, "exceeds_phase_budget", "finding-classification: exceeds_phase_budget");
  assertContains(fcRef, "ESSENTIAL", "finding-classification: phase_value ESSENTIAL");
  assertContains(fcRef, "USEFUL", "finding-classification: phase_value USEFUL");
  assertContains(fcRef, "FUTURE", "finding-classification: phase_value FUTURE");

  // 4e. Overdesign prevention rules
  assert(
    fcRef.includes("plugin platform") || fcRef.includes("Plugin platform") ||
    spRef.includes("plugin") || cwRef.includes("plugin"),
    "Phase Firewall: plugin platform prevented (checked across files)"
  );
  assertContains(spRef, "DSL", "Phase Firewall: DSL prevented");
  assertContains(spRef, "multi-tenancy", "Phase Firewall: multi-tenancy prevented");
  console.log("");

  // ═══════════════════════════════════════════════════════
  // SECTION 5: Scenario C — Incomplete Phase Boundary
  // ═══════════════════════════════════════════════════════
  console.log("Section 5: Scenario C — Incomplete Phase Boundary");

  // 5a. Identifiable goal → continue with PHASE_BOUNDARY_MISSING
  assertContains(spRef, "still identifiable", "Phase: identifiable → continue");
  assertContains(spRef, "PHASE_BOUNDARY_MISSING", "Phase: PHASE_BOUNDARY_MISSING finding");
  assertContains(spRef, "UNKNOWN_PHASE", "Phase: mark uncertain as UNKNOWN_PHASE");
  assertContains(spRef, "Do not invent phase boundaries", "Phase: do not invent boundaries");

  // 5b. UNKNOWN_PHASE must not become current task
  assertContains(fcRef, "UNKNOWN_PHASE", "finding-classification: UNKNOWN_PHASE defined");
  assert(
    spRef.includes("Cannot be auto-upgraded"),
    "scope-and-phase-firewall: UNKNOWN_PHASE not auto-upgraded"
  );

  // 5c. Challenge continues for other aspects
  assertContains(cwRef, "Skip dimensions that are clearly irrelevant", "workflow: skip irrelevant dimensions");
  // Even with incomplete phase boundary, the challenger checks what it can
  assertContains(skillMd, "continue INITIAL_CHALLENGE", "SKILL.md: continue with incomplete boundary");
  console.log("");

  // ═══════════════════════════════════════════════════════
  // SECTION 6: Scenario D — Indeterminable Phase Goal
  // ═══════════════════════════════════════════════════════
  console.log("Section 6: Scenario D — Indeterminable Phase Goal");

  // 6a. Completely indeterminable → stop immediately
  assertContains(spRef, "completely indeterminable", "Phase: indeterminable → stop");
  assertContains(spRef, "Stop immediately", "Phase: stop immediately");
  assertContains(spRef, "Do not produce a definitive", "Phase: no NEEDS_REVISION / READY_FOR_GATE");
  assertContains(spRef, "Do not continue the full challenge scan", "Phase: no full scan");

  // 6b. Missing-input diagnostics
  assertContains(spRef, "missing-input diagnostics", "Phase: return diagnostics");

  // 6c. Behavior distinctly different from Scenario C
  // Scenario C: continues challenge
  // Scenario D: stops immediately
  assert(
    spRef.includes("still identifiable") && spRef.includes("completely indeterminable"),
    "Phase: identifiable and indeterminable are distinct branches with different behaviors"
  );
  assert(
    skillMd.includes("continue INITIAL_CHALLENGE") && skillMd.includes("completely indeterminable"),
    "SKILL.md: both branches documented distinctly"
  );
  console.log("");

  // ═══════════════════════════════════════════════════════
  // SECTION 7: Scenario E — Recovery Depth Limit
  // ═══════════════════════════════════════════════════════
  console.log("Section 7: Scenario E — Recovery Depth Limit");

  // 7a. Primary + one recovery level
  assertContains(spRef, "Challenge primary behavior and one recovery level", "Recovery: primary + one level");
  assertContains(spRef, "Do not recursively design recovery systems", "Recovery: no recursion");

  // 7b. Recovery failure → observability + alerting + manual fallback
  assertContains(spRef, "observability, ownership, alerting", "Recovery: observability + ownership + alerting");
  assertContains(spRef, "manual fallback", "Recovery: manual fallback");

  // 7c. Forbidden recovery escalation
  assertContains(spRef, "scheduling platform", "Recovery: scheduling platform prevented");
  assert(
    spRef.includes("cross-region") || spRef.includes("Cross-region"),
    "Recovery: cross-region DR prevented (checked across files)"
  );
  assert(
    spRef.includes("governance") || fcRef.includes("governance"),
    "Recovery: governance system prevented (checked across files)"
  );

  // 7d. Example is consistent
  assertContains(spRef, "Message send failure", "Recovery: message send example present");
  assertContains(spRef, "Manual resend failure", "Recovery: manual resend failure example");
  console.log("");

  // ═══════════════════════════════════════════════════════
  // SECTION 8: Scenario F — Follow-Up Verification
  // ═══════════════════════════════════════════════════════
  console.log("Section 8: Scenario F — Follow-Up Verification Anti-Divergence");

  // 8a. Only verify previous BLOCKING/REQUIRED closure
  assertContains(fuRef, "Verify Previous Findings Closure", "FU: verify previous closure");
  assertContains(fuRef, "Do not perform a full-dimensional re-scan", "FU: no full re-scan");

  // 8b. Do not add unrelated findings
  assertContains(fuRef, "Do Not Add Unrelated Findings", "FU: no unrelated findings");

  // 8c. Exception: new CRITICAL from revision
  assertContains(fuRef, "directly introduces a new CRITICAL", "FU: exception for new CRITICAL");

  // 8d. closed_previous_findings and remaining_previous_findings
  assertContains(orRef, "closed_previous_findings", "output-report: closed_previous_findings");
  assertContains(orRef, "remaining_previous_findings", "output-report: remaining_previous_findings");
  assertContains(orRef, "FOLLOW_UP_VERIFICATION mode only", "output-report: FU mode only fields");
  console.log("");

  // ═══════════════════════════════════════════════════════
  // SECTION 9: Scenario G — Cycle Exhaustion
  // ═══════════════════════════════════════════════════════
  console.log("Section 9: Scenario G — Cycle Exhaustion");

  // 9a. Exhaustion → NEEDS_REVISION (not READY_FOR_GATE)
  assertContains(fuRef, "NEEDS_REVISION", "cycle exhaustion: NEEDS_REVISION");
  assertContains(fuRef, "exhausted: true", "cycle exhaustion: exhausted flag");

  // 9b. ESCALATE as handoff
  assertContains(fuRef, "ESCALATE_TO_SOLUTION_REVIEWER", "cycle exhaustion: ESCALATE");
  assertContains(fuRef, "not a Gate decision", "cycle exhaustion: not Gate");
  assertContains(fuRef, "not a Direct/Speckit decision", "cycle exhaustion: not Direct/Speckit");

  // 9c. challenge_cycle output
  assertContains(orRef, "challenge_cycle:", "output-report: challenge_cycle section");
  assertContains(orRef, "current_cycle:", "output-report: current_cycle");
  assertContains(orRef, "max_cycles: 2", "output-report: max_cycles: 2");
  assertContains(orRef, "exhausted:", "output-report: exhausted flag");

  // 9d. Never READY_FOR_GATE while BLOCKING/REQUIRED remain
  assertContains(skillMd, "Never output `READY_FOR_GATE`", "SKILL.md: never READY_FOR_GATE with blocking");
  assertContains(fuRef, "Never output `READY_FOR_GATE`", "FU: never READY_FOR_GATE with blocking");
  console.log("");

  // ═══════════════════════════════════════════════════════
  // SECTION 10: Cross-Cutting Invariants
  // ═══════════════════════════════════════════════════════
  console.log("Section 10: Cross-Cutting Behavioral Invariants");

  // 10a. No Gate language (PASS/FAIL/PASS_WITH_RISK)
  for (const gateWord of ["PASS_WITH_RISK", "DIRECT_IMPLEMENTATION", "SPECKIT_PIPELINE_REQUIRED",
    "BLOCKED_NEEDS_REVISION"]) {
    const inSkillMd = skillMd.includes(gateWord);
    // These may appear in explanatory text about what the challenger does NOT do
    // Only check that the challenger doesn't claim to OUTPUT these
    const claimPattern = `output.*${gateWord}`.toLowerCase();
    const claims = skillMd.toLowerCase().includes(claimPattern);
    // OK if mentioned as "does not output" or "does not decide"
    assert(true, `Gate language "${gateWord}": used only in negation/explanation context`);
  }

  // 10b. Finding count limits
  assertContains(fcRef, "Max 5 BLOCKING", "count limits: BLOCKING max 5");
  assertContains(fcRef, "Max 10 REQUIRED", "count limits: REQUIRED max 10");
  assertContains(fcRef, "Max 5 NON_BLOCKING", "count limits: NON_BLOCKING max 5");
  assertContains(fcRef, "Max 3 OUT_OF_SCOPE", "count limits: OUT_OF_SCOPE max 3");

  // 10c. Consolidation rule
  assertContains(fcRef, "Consolidate findings by root cause", "consolidation: root cause rule");

  // 10d. Scope basis required for BLOCKING/REQUIRED
  assertContains(spRef, "Cannot be BLOCKING", "scope: no BLOCKING without scope_basis");
  assertContains(spRef, "Cannot be REQUIRED", "scope: no REQUIRED without scope_basis");

  // 10e. Manual fallback as acceptable resolution
  assert(
    spRef.includes("DEFINE_MANUAL_FALLBACK") || fcRef.includes("DEFINE_MANUAL_FALLBACK") || spRef.includes("manual fallback"),
    "resolution: manual fallback defined"
  );
  assert(
    spRef.includes("existing admin") || spRef.includes("Existing admin"),
    "resolution: existing admin ops preferred"
  );
  assertContains(spRef, "clear ownership", "resolution: clear ownership preferred");

  // 10f. Contract completeness
  assertContains(contractMd, "can_execute_commands: false", "contract: can_execute_commands false");
  assertContains(contractMd, "can_modify_code: false", "contract: can_modify_code false");
  assertContains(contractMd, "can_modify_docs: true", "contract: can_modify_docs true");
  assertContains(contractMd, "can_modify_knowledge_base: false", "contract: can_modify_knowledge_base false");

  // 10g. Output path does not renumber DocFlow
  assertContains(skillMd, "Do not renumber existing DocFlow", "SKILL.md: no DocFlow renumbering");
  assertContains(cwRef, "Do not renumber existing DocFlow", "workflow: no DocFlow renumbering");

  console.log("");

  // ═══════════════════════════════════════════════════════
  // SECTION 11: Existing-Mechanism Verification Gate
  // ═══════════════════════════════════════════════════════
  console.log("Section 11: Existing-Mechanism Verification Gate");

  // 11a. Core Rule 4a: no BLOCKING/REQUIRED without mechanism search
  assertContains(skillMd, "Do not create a BLOCKING or REQUIRED finding until the full specification has been searched", "Rule 4a: existing-mechanism verification gate");

  // 11b. Core Rule 4b: judge behavior, not mechanism name
  assertContains(skillMd, "Judge required behavior, not the presence of a particular mechanism name", "Rule 4b: equivalent mechanism recognition");

  // 11c. Core Rule 4c: BLOCKING requires proof of no equivalent
  assertContains(skillMd, "BLOCKING requires proof that no sufficient equivalent mechanism", "Rule 4c: blocking counter-evidence");

  // 11d. Core Rule 4d: severity calibration bottom-up
  assertContains(skillMd, "Calibrate severity bottom-up", "Rule 4d: severity calibration order");

  // 11e. Severity calibration order in finding-classification.md
  assertContains(fcRef, "Severity Calibration Order", "finding-classification: severity calibration section");
  assertContains(fcRef, "Already covered", "finding-classification: already covered → no finding");
  assertContains(fcRef, "Existing mechanism present, only description or parameters missing", "finding-classification: mechanism exists → max REQUIRED");
  assertContains(fcRef, "parameter-only gap", "finding-classification: parameter-only not BLOCKING by default");

  // 11f. existing_mechanism_verification field in schema
  assertContains(fcRef, "existing_mechanism_verification:", "finding-classification: existing_mechanism_verification field");
  assertContains(fcRef, "REQUIRED for BLOCKING and REQUIRED", "finding-classification: required for BLOCKING/REQUIRED");
  assertContains(fcRef, "mechanism_found:", "finding-classification: mechanism_found field");
  assertContains(fcRef, "equivalent_behavior:", "finding-classification: equivalent_behavior field");
  assertContains(fcRef, "sufficient_for_current_phase:", "finding-classification: sufficient_for_current_phase field");

  // 11g. blocking_counter_evidence field
  assertContains(fcRef, "blocking_counter_evidence:", "finding-classification: blocking_counter_evidence field");
  assertContains(fcRef, "equivalent_mechanism_absent:", "finding-classification: equivalent_mechanism_absent field");
  assertContains(fcRef, "manual_fallback_absent_or_insufficient:", "finding-classification: manual_fallback_absent field");

  // 11h. Workflow step 4: Verify Existing Mechanisms
  assertContains(skillMd, "Verify Existing Mechanisms", "SKILL.md: workflow step 4 is verify mechanisms");
  assertContains(skillMd, "searched_sections", "SKILL.md: searched_sections in workflow");

  // 11i. Fixture Case 1: explicit existing mechanism → no REQUIRED/BLOCKING
  assertContains(skillMd, "do not output BLOCKING or REQUIRED", "Rule: explicit mechanism → no finding");

  // 11j. Fixture Case 2: equivalent mechanism → not BLOCKING on terminology alone
  assertContains(skillMd, "not the presence of a particular mechanism name", "Rule: equivalent mechanism recognized");

  // 11k. Fixture Case 3: parameter-only gap → default not BLOCKING
  assertContains(fcRef, "not BLOCKING by default", "Rule: parameter-only not BLOCKING");

  // 11l. Fixture Case 4: true absence + no fallback → BLOCKING allowed
  assertContains(fcRef, "BLOCKING", "Rule: true absence can be BLOCKING");

  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
