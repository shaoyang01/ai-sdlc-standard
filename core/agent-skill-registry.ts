// Agent Skill Registry — Flow-Stage Based (Metadata-only)
// ==========================================================
// Skills are modeled as flow nodes with positions, artifacts, and handoffs.
// NOT as runtime node handlers. NOT as (agent, node, requestType) mappings.
// All bindings: metadata_only, runtimeInvoked: false.
// Does not affect runtime execution, routing, or agent selection.
//
// C03-C update: registry rewritten from legacy 21-package topology to 7+1
// canonical topology per Decision-045 absorption mapping and C03-B atomic
// cutover. Seven canonical node skills + one non-node utility skill
// (sdlc-docflow-writer). Speckit independent pipeline retired per Decision-044
// single-rail ruling; gate-runner functions migrated to runtime / solution-gate
// / Delivery Tail per C03-C c1~c3.

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
    skill: "sdlc-requirement-intake",
    role: "global_entry",
    flowIds: ["main_docflow"],
    flowTypes: ["main_docflow"],
    stage: "Requirement Intake",
    category: "Intake / Producer",
    primaryInputArtifacts: ["Raw requirements (Lark, MD, HTML, chat, PDF)"],
    primaryOutputArtifacts: ["library/{id}/00-需求资料/"],
    downstreamConsumers: ["sdlc-solution-design"],
    eligibleAgents: ["kimi"],
    runtimeInvoked: false,
    executionMode: "metadata_only",
    runtimeStatus: "metadata_only",
    evidence: ["SKILL.md: canonical intake node per Decision-045", "registry: Intake Skill", "artifact number: 00"],
    confidence: "high",
  },
  {
    skill: "sdlc-solution-design",
    role: "flow_internal",
    flowIds: ["main_docflow"],
    flowTypes: ["main_docflow"],
    stage: "Solution Design",
    category: "Producer",
    primaryInputArtifacts: ["00-需求资料"],
    primaryOutputArtifacts: ["library/{id}/01-技术方案/"],
    downstreamConsumers: ["sdlc-solution-gate"],
    eligibleAgents: ["kimi"],
    runtimeInvoked: false,
    executionMode: "metadata_only",
    runtimeStatus: "metadata_only",
    evidence: ["SKILL.md: canonical solution design node per Decision-045", "absorbs specification-writer + speckit-specify/clarify/plan"],
    confidence: "high",
  },
  {
    skill: "sdlc-solution-gate",
    role: "flow_internal",
    flowIds: ["main_docflow"],
    flowTypes: ["main_docflow"],
    stage: "Solution Gate (Audit + Review + Development Path Decision)",
    category: "Auditor / Reviewer",
    primaryInputArtifacts: ["01-技术方案"],
    primaryOutputArtifacts: ["library/{id}/02-方案审核/", "Development Path Decision", "Gate Report"],
    downstreamConsumers: ["DIRECT_IMPLEMENTATION", "sdlc-task-planning", "sdlc-solution-design (revision)"],
    eligibleAgents: ["codex"],
    runtimeInvoked: false,
    executionMode: "metadata_only",
    runtimeStatus: "metadata_only",
    evidence: ["SKILL.md: canonical gate node per Decision-045", "absorbs solution-challenger + solution-reviewer + gate-runner phase-entry audit", "contract: both gate roles (Auditor + Reviewer) with distinct Agent binding"],
    confidence: "high",
  },
  {
    skill: "sdlc-task-planning",
    role: "flow_internal",
    flowIds: ["main_docflow"],
    flowTypes: ["main_docflow"],
    stage: "Task Planning",
    category: "Producer / Auditor",
    primaryInputArtifacts: ["01-技术方案", "02-方案审核", "TASK_PLANNING_REQUIRED decision"],
    primaryOutputArtifacts: ["Task breakdown", "Implementation plan"],
    downstreamConsumers: ["sdlc-implementation"],
    eligibleAgents: ["codex"],
    runtimeInvoked: false,
    executionMode: "metadata_only",
    runtimeStatus: "metadata_only",
    evidence: ["SKILL.md: canonical task planning node per Decision-045", "absorbs speckit-tasks + speckit-analyze readiness gate"],
    confidence: "high",
  },

  // ── Direct Implementation Path ──────────────────────
  {
    skill: "sdlc-implementation",
    role: "flow_internal",
    flowIds: ["direct_implementation_path"],
    flowTypes: ["direct_implementation_path"],
    stage: "Implementation Execution + Recording",
    category: "Executor / Producer",
    primaryInputArtifacts: ["Task breakdown / implementation plan", "Approved solution"],
    primaryOutputArtifacts: ["Code changes", "library/{id}/04-实现记录/"],
    downstreamConsumers: ["sdlc-code-review"],
    eligibleAgents: ["codex"],
    runtimeInvoked: false,
    executionMode: "metadata_only",
    runtimeStatus: "metadata_only",
    evidence: ["SKILL.md: canonical implementation node per Decision-045", "absorbs implementation-recorder + speckit-implement", "factual handoff from implementation to code review"],
    confidence: "high",
  },
  {
    skill: "sdlc-code-review",
    role: "flow_internal",
    flowIds: ["direct_implementation_path"],
    flowTypes: ["direct_implementation_path"],
    stage: "Code Review (Execution + Normalization)",
    category: "Reviewer",
    primaryInputArtifacts: ["Diff, spec, solution review, implementation record"],
    primaryOutputArtifacts: ["Review findings", "library/{id}/05-代码审核/"],
    downstreamConsumers: ["sdlc-knowledge-sync"],
    eligibleAgents: ["codex"],
    runtimeInvoked: false,
    executionMode: "metadata_only",
    runtimeStatus: "metadata_only",
    evidence: ["SKILL.md: canonical code review node per Decision-045", "absorbs code-review-excellence + code-review-normalizer", "contract: Reviewer only (not Auditor) per category-guide alignment"],
    confidence: "high",
  },
  {
    skill: "sdlc-knowledge-sync",
    role: "flow_internal",
    flowIds: ["direct_implementation_path"],
    flowTypes: ["direct_implementation_path"],
    stage: "Knowledge Sync + Code-Doc Reconcile + Test Feedback Sync",
    category: "Sync",
    primaryInputArtifacts: ["Code state", "specs/**", "DocFlow artifacts", "business_domain/**", "Test feedback"],
    primaryOutputArtifacts: [".specify/business_domain/**", "Drift Matrix", "Sync recommendations", "library/{id}/06-知识同步/"],
    downstreamConsumers: ["sdlc-implementation (code fix)", "sdlc-knowledge-sync (knowledge fix)"],
    eligibleAgents: ["codex", "hermes"],
    runtimeInvoked: false,
    executionMode: "metadata_only",
    runtimeStatus: "metadata_only",
    evidence: ["SKILL.md: canonical knowledge sync node per Decision-045", "absorbs speckit-sync + speckit-code-doc-reconcile + test-feedback-classifier + test-feedback-sync", "contract: Sync only (not Producer) per category-guide alignment"],
    confidence: "high",
  },

  // ── Cross-Cutting Utility ───────────────────────────
  {
    skill: "sdlc-docflow-writer",
    role: "utility",
    flowIds: ["main_docflow", "direct_implementation_path"],
    flowTypes: ["cross_cutting"],
    stage: "DocFlow Artifact Generation",
    category: "Producer / Renderer / Publisher",
    primaryInputArtifacts: ["Source content from calling skill"],
    primaryOutputArtifacts: ["MD/HTML/Lark documents"],
    downstreamConsumers: ["Called by 7 node skills"],
    eligibleAgents: ["kimi"],
    runtimeInvoked: false,
    executionMode: "metadata_only",
    runtimeStatus: "metadata_only",
    evidence: ["SKILL.md: non-node utility per Decision-045", "cross-cutting utility, not registered as LOOP node", "referenced by 7 node skills"],
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
