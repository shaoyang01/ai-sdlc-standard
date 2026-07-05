// Agent Skill Registry — Metadata-only
// ======================================
// Static registry of existing sdlc-* skills with expected agent bindings.
// Uses existing sdlc-* skill names as canonical names.
// Does not affect runtime execution, routing, or agent selection.
// All bindings are metadata_only / documented_skill_contract in this PR.

import {
  AgentSkillBinding,
  AgentName,
  SkillInvocation,
  SkillInvocationValidation,
} from "./skill-types";

export const AGENT_SKILL_REGISTRY: ReadonlyArray<AgentSkillBinding> = [
  // ── Requirement / Specification ─────────────────────
  {
    skill: "sdlc-requirement-normalizer",
    agent: "kimi",
    expectedNodes: ["requirement-summary"],
    expectedRequestTypes: ["llm_task"],
    executionMode: "metadata_only",
    runtimeStatus: "documented_skill_contract",
    wiredToRuntime: false,
    notes: "Intake/Producer skill. Not wired to runtime.",
  },
  {
    skill: "sdlc-specification-writer",
    agent: "kimi",
    expectedNodes: ["tech-design"],
    expectedRequestTypes: ["llm_task"],
    executionMode: "metadata_only",
    runtimeStatus: "documented_skill_contract",
    wiredToRuntime: false,
    notes: "Producer skill for specification writing. Not wired to runtime.",
  },
  {
    skill: "sdlc-solution-reviewer",
    agent: "codex",
    expectedNodes: ["review"],
    expectedRequestTypes: ["review"],
    executionMode: "metadata_only",
    runtimeStatus: "documented_skill_contract",
    wiredToRuntime: false,
    notes: "Auditor skill for specification audit and development path routing. Not wired to runtime.",
  },

  // ── Speckit Pipeline ────────────────────────────────
  {
    skill: "sdlc-speckit-pipeline",
    agent: "kimi",
    expectedNodes: ["implementation"],
    expectedRequestTypes: ["code_generation"],
    executionMode: "metadata_only",
    runtimeStatus: "documented_skill_contract",
    wiredToRuntime: false,
    notes: "Workflow skill for full lifecycle. Runtime has executeSpeckitPipeline() but uses hardcoded stages.",
  },
  {
    skill: "sdlc-speckit-specify",
    agent: "kimi",
    expectedNodes: ["tech-design"],
    expectedRequestTypes: ["llm_task"],
    executionMode: "metadata_only",
    runtimeStatus: "documented_skill_contract",
    wiredToRuntime: false,
    notes: "Producer skill for spec sync. Not wired to runtime.",
  },
  {
    skill: "sdlc-speckit-plan",
    agent: "kimi",
    expectedNodes: ["tech-design"],
    expectedRequestTypes: ["llm_task"],
    executionMode: "metadata_only",
    runtimeStatus: "documented_skill_contract",
    wiredToRuntime: false,
    notes: "Producer/Auditor skill for plan gate. Not wired to runtime.",
  },
  {
    skill: "sdlc-speckit-tasks",
    agent: "kimi",
    expectedNodes: ["implementation"],
    expectedRequestTypes: ["code_generation"],
    executionMode: "metadata_only",
    runtimeStatus: "documented_skill_contract",
    wiredToRuntime: false,
    notes: "Producer/Auditor skill for task gate. Not wired to runtime.",
  },
  {
    skill: "sdlc-speckit-implement",
    agent: "codex",
    expectedNodes: ["implementation"],
    expectedRequestTypes: ["code_generation"],
    executionMode: "metadata_only",
    runtimeStatus: "documented_skill_contract",
    wiredToRuntime: false,
    notes: "Executor/Producer skill for implementation execution. Not wired to runtime.",
  },
  {
    skill: "sdlc-speckit-analyze",
    agent: "hermes",
    expectedNodes: ["review", "validation"],
    expectedRequestTypes: ["review", "validation"],
    executionMode: "metadata_only",
    runtimeStatus: "documented_skill_contract",
    wiredToRuntime: false,
    notes: "Auditor skill for implementation readiness gate. Not wired to runtime.",
  },
  {
    skill: "sdlc-speckit-checklist",
    agent: "hermes",
    expectedNodes: ["review", "validation"],
    expectedRequestTypes: ["review", "validation"],
    executionMode: "metadata_only",
    runtimeStatus: "documented_skill_contract",
    wiredToRuntime: false,
    notes: "Producer/Auditor skill for stage-specific inspection. Not wired to runtime.",
  },
  {
    skill: "sdlc-speckit-clarify",
    agent: "kimi",
    expectedNodes: ["review"],
    expectedRequestTypes: ["review"],
    executionMode: "metadata_only",
    runtimeStatus: "documented_skill_contract",
    wiredToRuntime: false,
    notes: "Auditor/Producer skill for clarification validation. Not wired to runtime.",
  },
  {
    skill: "sdlc-speckit-sync",
    agent: "hermes",
    expectedNodes: ["validation"],
    expectedRequestTypes: ["validation"],
    executionMode: "metadata_only",
    runtimeStatus: "documented_skill_contract",
    wiredToRuntime: false,
    notes: "Sync/Producer skill for knowledge sync. Not wired to runtime.",
  },
  {
    skill: "sdlc-speckit-code-doc-reconcile",
    agent: "hermes",
    expectedNodes: ["validation", "code-review"],
    expectedRequestTypes: ["validation", "code_review"],
    executionMode: "metadata_only",
    runtimeStatus: "documented_skill_contract",
    wiredToRuntime: false,
    notes: "Auditor/Sync skill for code-documentation consistency. Not wired to runtime. code-review node is runtime-managed, not in Graph Kernel.",
  },

  // ── Code Review / Implementation Recording ──────────
  {
    skill: "sdlc-code-review-excellence",
    agent: "codex",
    expectedNodes: ["code-review"],
    expectedRequestTypes: ["code_review"],
    executionMode: "metadata_only",
    runtimeStatus: "documented_skill_contract",
    wiredToRuntime: false,
    notes: "Reviewer/Auditor skill for code review execution. code-review node is runtime-managed, not in Graph Kernel.",
  },
  {
    skill: "sdlc-code-review-normalizer",
    agent: "codex",
    expectedNodes: ["code-review"],
    expectedRequestTypes: ["code_review"],
    executionMode: "metadata_only",
    runtimeStatus: "documented_skill_contract",
    wiredToRuntime: false,
    notes: "Reviewer/Producer skill for code review normalization. code-review node is runtime-managed.",
  },
  {
    skill: "sdlc-implementation-recorder",
    agent: "codex",
    expectedNodes: ["implementation"],
    expectedRequestTypes: ["code_generation"],
    executionMode: "metadata_only",
    runtimeStatus: "documented_skill_contract",
    wiredToRuntime: false,
    notes: "Producer skill for implementation recording. Not wired to runtime.",
  },
  {
    skill: "sdlc-gate-runner",
    agent: "hermes",
    expectedNodes: ["review", "validation"],
    expectedRequestTypes: ["review", "validation"],
    executionMode: "metadata_only",
    runtimeStatus: "documented_skill_contract",
    wiredToRuntime: false,
    notes: "Auditor skill for all gates. Not wired to runtime.",
  },

  // ── DocFlow / Test Feedback ─────────────────────────
  {
    skill: "sdlc-docflow-writer",
    agent: "kimi",
    expectedNodes: ["tech-design", "implementation"],
    expectedRequestTypes: ["llm_task", "code_generation"],
    executionMode: "metadata_only",
    runtimeStatus: "documented_skill_contract",
    wiredToRuntime: false,
    notes: "Producer/Renderer/Publisher skill for DocFlow artifact generation. Not wired to runtime.",
  },
  {
    skill: "sdlc-test-feedback-classifier",
    agent: "hermes",
    expectedNodes: ["validation"],
    expectedRequestTypes: ["validation"],
    executionMode: "metadata_only",
    runtimeStatus: "documented_skill_contract",
    wiredToRuntime: false,
    notes: "Reviewer/Producer skill for test feedback classification. Not wired to runtime.",
  },
  {
    skill: "sdlc-test-feedback-sync",
    agent: "hermes",
    expectedNodes: ["validation"],
    expectedRequestTypes: ["validation"],
    executionMode: "metadata_only",
    runtimeStatus: "documented_skill_contract",
    wiredToRuntime: false,
    notes: "Sync/Producer skill for test feedback sync. Not wired to runtime.",
  },
];

// ─── Registry Helpers ─────────────────────────────────

export function getAllSkillBindings(): ReadonlyArray<AgentSkillBinding> {
  return AGENT_SKILL_REGISTRY;
}

export function getBindingsForAgent(
  agent: AgentName
): ReadonlyArray<AgentSkillBinding> {
  return AGENT_SKILL_REGISTRY.filter((b) => b.agent === agent);
}

export function getBindingsForSkill(
  skill: string
): ReadonlyArray<AgentSkillBinding> {
  return AGENT_SKILL_REGISTRY.filter((b) => b.skill === skill);
}

export function getBindingsForNode(
  node: string
): ReadonlyArray<AgentSkillBinding> {
  return AGENT_SKILL_REGISTRY.filter((b) => b.expectedNodes.includes(node));
}

export function findSkillBinding(input: {
  skill: string;
  agent: AgentName;
  node: string;
  requestType: string;
}): AgentSkillBinding | undefined {
  return AGENT_SKILL_REGISTRY.find(
    (b) =>
      b.skill === input.skill &&
      b.agent === input.agent &&
      b.expectedNodes.includes(input.node) &&
      b.expectedRequestTypes.includes(input.requestType)
  );
}

export function validateSkillInvocation(
  invocation: SkillInvocation
): SkillInvocationValidation {
  // Check skill exists at all
  const skillBindings = getBindingsForSkill(invocation.skill);
  if (skillBindings.length === 0) {
    return {
      valid: false,
      reason: `Skill "${invocation.skill}" is not registered`,
    };
  }

  // Check agent match
  const agentBindings = skillBindings.filter((b) => b.agent === invocation.agent);
  if (agentBindings.length === 0) {
    return {
      valid: false,
      reason: `Skill "${invocation.skill}" is not bound to agent "${invocation.agent}"`,
    };
  }

  // Check node match
  const nodeBinding = agentBindings.find((b) =>
    b.expectedNodes.includes(invocation.node)
  );
  if (!nodeBinding) {
    return {
      valid: false,
      reason: `Skill "${invocation.skill}" with agent "${invocation.agent}" does not support node "${invocation.node}"`,
    };
  }

  // Check request type match
  if (!nodeBinding.expectedRequestTypes.includes(invocation.requestType)) {
    return {
      valid: false,
      reason: `Skill "${invocation.skill}" with agent "${invocation.agent}" does not support request type "${invocation.requestType}"`,
    };
  }

  return {
    valid: true,
    reason: "Skill invocation is valid",
    binding: nodeBinding,
  };
}

// ─── Inventory Cross-check ────────────────────────────

export function getRegistrySkillsNotInInventory(
  inventorySkills: ReadonlyArray<string>
): ReadonlyArray<string> {
  const inventorySet = new Set(inventorySkills);
  return AGENT_SKILL_REGISTRY
    .map((b) => b.skill)
    .filter((s) => !inventorySet.has(s));
}

export function getInventorySkillsMissingFromRegistry(
  inventorySkills: ReadonlyArray<string>
): ReadonlyArray<string> {
  const registrySet = new Set(AGENT_SKILL_REGISTRY.map((b) => b.skill));
  return inventorySkills.filter((s) => !registrySet.has(s));
}

export function inferSkillForExecution(input: {
  agent: AgentName;
  node: string;
  requestType: string;
}): AgentSkillBinding | undefined {
  const matches = AGENT_SKILL_REGISTRY.filter(
    (b) =>
      b.agent === input.agent &&
      b.expectedNodes.includes(input.node) &&
      b.expectedRequestTypes.includes(input.requestType)
  );
  // Only return if exactly one unambiguous match
  return matches.length === 1 ? matches[0] : undefined;
}
