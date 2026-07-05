// Policy Memory Config
// =====================
// Feature-flagged memory persistence. Default: disabled.
// Read and write flags are separate:
//   SDLC_POLICY_MEMORY=enabled      → writes feedback to SQLite.
//   SDLC_POLICY_MEMORY_READ=enabled → reads SQLite for advisory signals.
// Reading does not imply writing. Writing does not imply reading.

export function isPolicyMemoryEnabled(): boolean {
  return process.env.SDLC_POLICY_MEMORY === "enabled";
}

export function isPolicyMemoryReadEnabled(): boolean {
  return process.env.SDLC_POLICY_MEMORY_READ === "enabled";
}

export function getPolicyMemoryPath(): string {
  return process.env.SDLC_POLICY_MEMORY_PATH || ".sdlc-runtime/policy-memory.sqlite";
}
