// Policy Memory Config
// =====================
// Feature-flagged memory persistence. Default: disabled.
// Only exact value "enabled" enables writes.

export function isPolicyMemoryEnabled(): boolean {
  return process.env.SDLC_POLICY_MEMORY === "enabled";
}

export function getPolicyMemoryPath(): string {
  return process.env.SDLC_POLICY_MEMORY_PATH || ".sdlc-runtime/policy-memory.sqlite";
}
