// Agent Skill Registry — Flow-Stage Based (Metadata-only)
// ==========================================================
// Skills are modeled as flow nodes with positions, artifacts, and handoffs.
// NOT as runtime node handlers. NOT as (agent, node, requestType) mappings.
// All bindings: metadata_only, runtimeInvoked: false.
// Does not affect runtime execution, routing, or agent selection.

import {
  SkillFlowBinding,
  SkillFlowRole,
  SkillFlowType,
  AgentName,
  SkillInvocation,
  SkillInvocationValidation,
} from "./skill-types";

export const SKILL_FLOW_REGISTRY: ReadonlyArray<SkillFlowBinding> = [
  // ── Global Entry ────────────────────────────────────
  {
    skill: "sdlc-requirement-normalizer",
    role: "global_entry",
    flowIds: ["main_docflow"],
    flowTypes: ["main_docflow"],
    stage: "Requirement Normalization",
    category: "Intake / Producer",
    primaryInputArtifacts: ["Raw requirements (Lark, MD, HTML, chat, PDF)"],
    primaryOutputArtifacts: ["library/{id}/00-需求资料/"],
    downstreamConsumers: ["sdlc-specification-writer"],
    eligibleAgents: ["kimi"],
    runtimeInvoked: false,
    executionMode: "metadata_only",
    runtimeStatus: "metadata_only",
    evidence: ["SKILL.md: 'stable intake input for sdlc-specification-writer'", "registry: Intake Skill", "artifact number: 00"],
    confidence: "high",
  },
  {
    skill: "sdlc-specification-writer",
    role: "flow_internal",
    flowIds: ["main_docflow"],
    flowTypes: ["main_docflow"],
    stage: "Specification Writing",
    category: "Producer",
    primaryInputArtifacts: ["00-需求资料"],
    primaryOutputArtifacts: ["library/{id}/01-技术方案/"],
    downstreamConsumers: ["sdlc-solution-challenger"],
    eligibleAgents: ["kimi"],
    runtimeInvoked: false,
    executionMode: "metadata_only",
    runtimeStatus: "metadata_only",
    evidence: ["SKILL.md: 'ready for sdlc-solution-challenger'", "references/writing-workflow.md: flow diagram"],
    confidence: "high",
  },
  {
    skill: "sdlc-solution-challenger",
    role: "flow_internal",
    flowIds: ["main_docflow"],
    flowTypes: ["main_docflow"],
    stage: "Specification Challenge / Pre-Gate Review",
    category: "Auditor",
    primaryInputArtifacts: ["01-技术方案"],
    primaryOutputArtifacts: ["library/{id}/01-技术方案/{id}_方案挑战报告.md"],
    downstreamConsumers: ["sdlc-solution-reviewer"],
    eligibleAgents: ["kimi"],
    runtimeInvoked: false,
    executionMode: "metadata_only",
    runtimeStatus: "metadata_only",
    evidence: ["SKILL.md: 'READY_FOR_GATE → PROCEED_TO_SOLUTION_REVIEWER'", "contract: Auditor Skill, pre-Gate challenger"],
    confidence: "high",
  },
  {
    skill: "sdlc-solution-reviewer",
    role: "flow_internal",
    flowIds: ["main_docflow"],
    flowTypes: ["main_docflow"],
    stage: "Specification Audit",
    category: "Auditor",
    primaryInputArtifacts: ["01-技术方案"],
    primaryOutputArtifacts: ["library/{id}/02-方案审核/", "Development Path Decision"],
    downstreamConsumers: ["DIRECT_IMPLEMENTATION", "sdlc-speckit-pipeline", "sdlc-specification-writer (revision)"],
    eligibleAgents: ["codex"],
    runtimeInvoked: false,
    executionMode: "metadata_only",
    runtimeStatus: "metadata_only",
    evidence: ["SKILL.md: 'Global DocFlow Gate'", "development-path-decision.md: three fork outcomes"],
    confidence: "high",
  },

  // ── Speckit Pipeline (Flow Controller) ──────────────
  {
    skill: "sdlc-speckit-pipeline",
    role: "flow_controller",
    flowIds: ["speckit_pipeline"],
    flowTypes: ["speckit_pipeline"],
    stage: "Full Lifecycle",
    category: "Workflow",
    primaryInputArtifacts: ["01-技术方案", "02-方案审核", "SPECKIT_PIPELINE_REQUIRED decision"],
    primaryOutputArtifacts: ["Pipeline report", "speckit child skill outputs"],
    downstreamConsumers: [
      "sdlc-speckit-specify",
      "sdlc-speckit-clarify",
      "sdlc-speckit-plan",
      "sdlc-speckit-tasks",
      "sdlc-speckit-analyze",
      "sdlc-speckit-implement",
      "sdlc-speckit-sync",
      "sdlc-speckit-code-doc-reconcile",
    ],
    eligibleAgents: ["codex"],
    runtimeInvoked: false,
    executionMode: "metadata_only",
    runtimeStatus: "metadata_only",
    evidence: ["SKILL.md: 'orchestrate the optional full Speckit SDD path'", "contract: 10-stage sequence"],
    confidence: "high",
  },
  {
    skill: "sdlc-speckit-specify",
    role: "flow_internal",
    flowIds: ["speckit_pipeline"],
    flowTypes: ["speckit_pipeline"],
    stage: "Spec Sync",
    category: "Producer",
    primaryInputArtifacts: ["01-技术方案", "02-方案审核"],
    primaryOutputArtifacts: ["specs/{feature}/spec.md"],
    downstreamConsumers: ["sdlc-speckit-clarify"],
    eligibleAgents: ["codex"],
    runtimeInvoked: false,
    executionMode: "metadata_only",
    runtimeStatus: "metadata_only",
    evidence: ["SKILL.md: 'Next step: run sdlc-speckit-clarify'"],
    confidence: "high",
  },
  {
    skill: "sdlc-speckit-clarify",
    role: "flow_internal",
    flowIds: ["speckit_pipeline"],
    flowTypes: ["speckit_pipeline"],
    stage: "Clarification Validation",
    category: "Auditor / Producer",
    primaryInputArtifacts: ["specs/{feature}/spec.md"],
    primaryOutputArtifacts: ["Clarifications added to spec.md", "Coverage Summary"],
    downstreamConsumers: ["sdlc-speckit-plan"],
    eligibleAgents: ["codex"],
    runtimeInvoked: false,
    executionMode: "metadata_only",
    runtimeStatus: "metadata_only",
    evidence: ["SKILL.md: 'Proceed to sdlc-speckit-plan only when no core ambiguity remains'"],
    confidence: "high",
  },
  {
    skill: "sdlc-speckit-plan",
    role: "flow_internal",
    flowIds: ["speckit_pipeline"],
    flowTypes: ["speckit_pipeline"],
    stage: "Plan Gate",
    category: "Producer / Auditor",
    primaryInputArtifacts: ["specs/{feature}/spec.md", "clarify result"],
    primaryOutputArtifacts: ["specs/{feature}/plan.md"],
    downstreamConsumers: ["sdlc-speckit-tasks"],
    eligibleAgents: ["codex"],
    runtimeInvoked: false,
    executionMode: "metadata_only",
    runtimeStatus: "metadata_only",
    evidence: ["SKILL.md: 'Next step: sdlc-speckit-tasks'"],
    confidence: "high",
  },
  {
    skill: "sdlc-speckit-tasks",
    role: "flow_internal",
    flowIds: ["speckit_pipeline"],
    flowTypes: ["speckit_pipeline"],
    stage: "Task Gate",
    category: "Producer / Auditor",
    primaryInputArtifacts: ["specs/{feature}/spec.md", "specs/{feature}/plan.md"],
    primaryOutputArtifacts: ["specs/{feature}/tasks.md"],
    downstreamConsumers: ["sdlc-speckit-analyze"],
    eligibleAgents: ["codex"],
    runtimeInvoked: false,
    executionMode: "metadata_only",
    runtimeStatus: "metadata_only",
    evidence: ["SKILL.md: 'Next step: sdlc-speckit-analyze'"],
    confidence: "high",
  },
  {
    skill: "sdlc-speckit-analyze",
    role: "flow_internal",
    flowIds: ["speckit_pipeline"],
    flowTypes: ["speckit_pipeline"],
    stage: "Implementation Readiness",
    category: "Auditor",
    primaryInputArtifacts: ["spec.md", "plan.md", "tasks.md", "route.md"],
    primaryOutputArtifacts: ["Analyze Gate result"],
    downstreamConsumers: ["sdlc-speckit-implement"],
    eligibleAgents: ["codex"],
    runtimeInvoked: false,
    executionMode: "metadata_only",
    runtimeStatus: "metadata_only",
    evidence: ["SKILL.md: 'Require Analyze Gate readiness before sdlc-speckit-implement'"],
    confidence: "high",
  },
  {
    skill: "sdlc-speckit-implement",
    role: "flow_internal",
    flowIds: ["speckit_pipeline"],
    flowTypes: ["speckit_pipeline"],
    stage: "Implementation Execution",
    category: "Executor / Producer",
    primaryInputArtifacts: ["tasks.md", "analyze result"],
    primaryOutputArtifacts: ["Code changes", "specs/{feature}/implementation.md"],
    downstreamConsumers: ["sdlc-speckit-sync", "sdlc-implementation-recorder", "sdlc-code-review-normalizer"],
    eligibleAgents: ["codex"],
    runtimeInvoked: false,
    executionMode: "metadata_only",
    runtimeStatus: "metadata_only",
    evidence: ["SKILL.md: 'internal Speckit stage 8/10'", "output-and-manifest.md: next step rules"],
    confidence: "high",
  },
  {
    skill: "sdlc-speckit-sync",
    role: "flow_internal",
    flowIds: ["speckit_pipeline"],
    flowTypes: ["speckit_pipeline"],
    stage: "Knowledge Sync",
    category: "Sync / Producer",
    primaryInputArtifacts: ["Implementation evidence"],
    primaryOutputArtifacts: [".specify/business_domain/**"],
    downstreamConsumers: ["sdlc-speckit-code-doc-reconcile"],
    eligibleAgents: ["codex"],
    runtimeInvoked: false,
    executionMode: "metadata_only",
    runtimeStatus: "metadata_only",
    evidence: ["SKILL.md: 'Next step: sdlc-speckit-code-doc-reconcile'"],
    confidence: "high",
  },
  {
    skill: "sdlc-speckit-code-doc-reconcile",
    role: "flow_internal",
    flowIds: ["speckit_pipeline"],
    flowTypes: ["speckit_pipeline"],
    stage: "Code-Doc Consistency",
    category: "Auditor / Sync",
    primaryInputArtifacts: ["Code state", "specs/**", "DocFlow artifacts", "business_domain/**"],
    primaryOutputArtifacts: ["Drift Matrix"],
    downstreamConsumers: ["sdlc-speckit-implement (code fix)", "sdlc-speckit-sync (knowledge fix)"],
    eligibleAgents: ["codex"],
    runtimeInvoked: false,
    executionMode: "metadata_only",
    runtimeStatus: "metadata_only",
    evidence: ["SKILL.md: 'after sdlc-speckit-implement or sdlc-speckit-sync'"],
    confidence: "high",
  },
  {
    skill: "sdlc-speckit-checklist",
    role: "flow_internal",
    flowIds: ["speckit_pipeline"],
    flowTypes: ["speckit_pipeline"],
    stage: "Stage Inspection",
    category: "Producer / Auditor",
    primaryInputArtifacts: ["spec.md, plan.md, tasks.md (stage-dependent)"],
    primaryOutputArtifacts: ["specs/{feature}/checklists/{stage}-checklist.md"],
    downstreamConsumers: ["sdlc-test-feedback-sync"],
    eligibleAgents: ["codex"],
    runtimeInvoked: false,
    executionMode: "metadata_only",
    runtimeStatus: "metadata_only",
    evidence: ["SKILL.md: 'on-demand checklist generation'"],
    confidence: "high",
  },

  // ── Code Review Subflow ─────────────────────────────
  {
    skill: "sdlc-code-review-excellence",
    role: "flow_internal",
    flowIds: ["code_review_subflow", "direct_implementation_path"],
    flowTypes: ["code_review_subflow", "direct_implementation_path"],
    stage: "Code Review Execution",
    category: "Reviewer / Auditor",
    primaryInputArtifacts: ["Diff, spec, solution review, implementation record"],
    primaryOutputArtifacts: ["Review findings"],
    downstreamConsumers: ["sdlc-code-review-normalizer"],
    eligibleAgents: ["codex"],
    runtimeInvoked: false,
    executionMode: "metadata_only",
    runtimeStatus: "metadata_only",
    evidence: ["SKILL.md: 'hands formal report writing to sdlc-code-review-normalizer'", "output-and-handoff.md"],
    confidence: "high",
  },
  {
    skill: "sdlc-code-review-normalizer",
    role: "subflow_normalizer",
    flowIds: ["code_review_subflow", "direct_implementation_path"],
    flowTypes: ["code_review_subflow", "direct_implementation_path"],
    stage: "Code Review Normalization",
    category: "Reviewer / Producer",
    primaryInputArtifacts: ["Raw review report, diff, spec"],
    primaryOutputArtifacts: ["library/{id}/04-代码审核/"],
    downstreamConsumers: ["sdlc-test-feedback-classifier"],
    eligibleAgents: ["codex"],
    runtimeInvoked: false,
    executionMode: "metadata_only",
    runtimeStatus: "metadata_only",
    evidence: ["SKILL.md: 'code-review subflow normalizer'", "Normalizes code review outputs into 04-代码审核"],
    confidence: "high",
  },

  // ── Post-Execution Recorder ─────────────────────────
  {
    skill: "sdlc-implementation-recorder",
    role: "post_execution_recorder",
    flowIds: ["direct_implementation_path", "speckit_pipeline"],
    flowTypes: ["direct_implementation_path", "speckit_pipeline"],
    stage: "Implementation Recording",
    category: "Producer",
    primaryInputArtifacts: ["Diff, changed files, task status"],
    primaryOutputArtifacts: ["library/{id}/03-实现记录/"],
    downstreamConsumers: ["sdlc-code-review-normalizer"],
    eligibleAgents: ["codex"],
    runtimeInvoked: false,
    executionMode: "metadata_only",
    runtimeStatus: "metadata_only",
    evidence: ["SKILL.md: 'factual handoff from implementation to code review'"],
    confidence: "high",
  },

  // ── Test Feedback Subflow ───────────────────────────
  {
    skill: "sdlc-test-feedback-classifier",
    role: "flow_internal",
    flowIds: ["test_feedback_subflow", "direct_implementation_path"],
    flowTypes: ["test_feedback_subflow", "direct_implementation_path"],
    stage: "Test Feedback Classification",
    category: "Reviewer / Producer",
    primaryInputArtifacts: ["Raw feedback, test results"],
    primaryOutputArtifacts: ["library/{id}/05-测试验收/"],
    downstreamConsumers: ["sdlc-test-feedback-sync"],
    eligibleAgents: ["hermes"],
    runtimeInvoked: false,
    executionMode: "metadata_only",
    runtimeStatus: "metadata_only",
    evidence: ["SKILL.md: 'handoff to sdlc-test-feedback-sync'"],
    confidence: "high",
  },
  {
    skill: "sdlc-test-feedback-sync",
    role: "flow_internal",
    flowIds: ["test_feedback_subflow", "direct_implementation_path"],
    flowTypes: ["test_feedback_subflow", "direct_implementation_path"],
    stage: "Test Feedback Sync",
    category: "Sync / Producer",
    primaryInputArtifacts: ["05-测试验收"],
    primaryOutputArtifacts: ["Sync recommendations"],
    downstreamConsumers: ["sdlc-speckit-sync"],
    eligibleAgents: ["hermes"],
    runtimeInvoked: false,
    executionMode: "metadata_only",
    runtimeStatus: "metadata_only",
    evidence: ["SKILL.md: 'consumes sdlc-test-feedback-classifier output'"],
    confidence: "high",
  },

  // ── Cross-Cutting Utility ───────────────────────────
  {
    skill: "sdlc-gate-runner",
    role: "utility",
    flowIds: ["main_docflow", "direct_implementation_path", "speckit_pipeline"],
    flowTypes: ["cross_cutting"],
    stage: "All Gates",
    category: "Auditor",
    primaryInputArtifacts: ["manifest.md, artifact for current gate"],
    primaryOutputArtifacts: ["Gate Report"],
    downstreamConsumers: ["Route to specialized skill owner"],
    eligibleAgents: ["codex"],
    runtimeInvoked: false,
    executionMode: "metadata_only",
    runtimeStatus: "metadata_only",
    evidence: ["SKILL.md: 'phase-entry auditor'"],
    confidence: "high",
  },
  {
    skill: "sdlc-docflow-writer",
    role: "utility",
    flowIds: ["main_docflow", "direct_implementation_path", "code_review_subflow", "test_feedback_subflow"],
    flowTypes: ["cross_cutting"],
    stage: "DocFlow Artifact Generation",
    category: "Producer / Renderer / Publisher",
    primaryInputArtifacts: ["Source content from calling skill"],
    primaryOutputArtifacts: ["MD/HTML/Lark documents"],
    downstreamConsumers: ["Called by 8 other skills"],
    eligibleAgents: ["kimi"],
    runtimeInvoked: false,
    executionMode: "metadata_only",
    runtimeStatus: "metadata_only",
    evidence: ["SKILL.md: 'cross-cutting utility'", "referenced by 8 other skills"],
    confidence: "high",
  },
];

// ─── Flow-Stage Helpers ───────────────────────────────

export function getAllSkillFlowBindings(): ReadonlyArray<SkillFlowBinding> {
  return SKILL_FLOW_REGISTRY;
}

export function getSkillFlowBinding(skill: string): SkillFlowBinding | undefined {
  return SKILL_FLOW_REGISTRY.find((b) => b.skill === skill);
}

export function getSkillsByFlowId(flowId: string): ReadonlyArray<SkillFlowBinding> {
  return SKILL_FLOW_REGISTRY.filter((b) => b.flowIds.includes(flowId));
}

export function getSkillsByFlowType(flowType: SkillFlowType): ReadonlyArray<SkillFlowBinding> {
  return SKILL_FLOW_REGISTRY.filter((b) => b.flowTypes.includes(flowType));
}

export function getGlobalEntrySkill(): SkillFlowBinding {
  return SKILL_FLOW_REGISTRY.find((b) => b.role === "global_entry")!;
}

export function getSubflowEntrySkills(): ReadonlyArray<SkillFlowBinding> {
  return SKILL_FLOW_REGISTRY.filter(
    (b) => b.role === "subflow_entry" || b.role === "subflow_normalizer" || b.role === "flow_controller"
  );
}

export function getSkillsByRole(role: SkillFlowRole): ReadonlyArray<SkillFlowBinding> {
  return SKILL_FLOW_REGISTRY.filter((b) => b.role === role);
}

export function getDownstreamSkills(skill: string): ReadonlyArray<SkillFlowBinding> {
  const binding = getSkillFlowBinding(skill);
  if (!binding) return [];
  return binding.downstreamConsumers
    .filter((c) => c.startsWith("sdlc-"))
    .map((c) => getSkillFlowBinding(c))
    .filter((b): b is SkillFlowBinding => b !== undefined);
}

export function getEligibleSkillsForAgent(agent: AgentName): ReadonlyArray<SkillFlowBinding> {
  return SKILL_FLOW_REGISTRY.filter((b) => b.eligibleAgents.includes(agent));
}

// ─── Validation (flow-stage based, not runtime-node based) ──

export function validateSkillInvocation(
  invocation: SkillInvocation
): SkillInvocationValidation {
  if (!invocation.skill) {
    return {
      attempted: false,
      valid: true,
      reason: "No skill metadata provided",
    };
  }

  const binding = getSkillFlowBinding(invocation.skill);
  if (!binding) {
    return {
      attempted: true,
      valid: false,
      reason: `Unknown skill "${invocation.skill}"`,
    };
  }

  if (invocation.flowId && !binding.flowIds.includes(invocation.flowId)) {
    return {
      attempted: true,
      valid: false,
      reason: `Skill "${invocation.skill}" does not belong to flow "${invocation.flowId}"`,
    };
  }

  return {
    attempted: true,
    valid: true,
    reason: invocation.flowId
      ? `Skill "${invocation.skill}" belongs to flow "${invocation.flowId}"`
      : `Known skill "${invocation.skill}"`,
    binding,
  };
}
