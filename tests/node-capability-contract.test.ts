// Node Capability Contract — Tests (C01 WP-2)
// ============================================
// Verifies the machine projection of ai-sdlc/node-capability-contract.md:
// the seven capabilities, field completeness, ID format, uniqueness, and
// the agent-neutrality rule (no agent name in any contract field).

import { NODE_CAPABILITY_IDS } from "../loop/types";
import { NODE_CAPABILITY_CONTRACTS } from "../core/node-capability-contracts";

let passed = 0;
let failed = 0;
function assert(condition: boolean, message: string): void {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${message}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${message}`);
  }
}

const AGENT_NAMES = ["kimi", "codex", "hermes", "claude", "gpt"];

console.log("node capability: canonical list");
assert(NODE_CAPABILITY_IDS.length === 7, "exactly seven capability ids");
assert(new Set(NODE_CAPABILITY_IDS).size === 7, "capability ids are unique");
for (const id of NODE_CAPABILITY_IDS) {
  assert(/^[a-z]+(-[a-z]+)*$/.test(id), `id ${id} matches lowercase-dash format`);
}

console.log("node capability: contract projection completeness");
assert(NODE_CAPABILITY_CONTRACTS.length === 7, "seven contract instances");
const contractIds = new Set(NODE_CAPABILITY_CONTRACTS.map((c) => c.capability));
assert(
  NODE_CAPABILITY_IDS.every((id) => contractIds.has(id)) &&
    contractIds.size === NODE_CAPABILITY_IDS.length,
  "contract instances cover the canonical list exactly",
);

for (const contract of NODE_CAPABILITY_CONTRACTS) {
  const label = `contract ${contract.capability}`;
  assert(contract.title.trim().length > 0, `${label}: title non-empty`);
  assert(contract.inputArtifacts.length > 0, `${label}: inputArtifacts non-empty`);
  assert(contract.outputArtifact.trim().length > 0, `${label}: outputArtifact non-empty`);
  assert(contract.gate.trim().length > 0, `${label}: gate non-empty`);
  assert(contract.sideEffectBoundary.trim().length > 0, `${label}: sideEffectBoundary non-empty`);
  assert(contract.prohibited.length > 0, `${label}: prohibited non-empty`);
}

console.log("node capability: agent neutrality");
for (const contract of NODE_CAPABILITY_CONTRACTS) {
  const fields = [
    contract.title,
    contract.outputArtifact,
    contract.gate,
    contract.sideEffectBoundary,
    ...contract.inputArtifacts,
    ...contract.prohibited,
  ];
  const haystack = fields.join(" ").toLowerCase();
  for (const agentName of AGENT_NAMES) {
    assert(
      !haystack.includes(agentName),
      `contract ${contract.capability}: no agent name '${agentName}' in any field`,
    );
  }
}

console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exitCode = 1;
}
