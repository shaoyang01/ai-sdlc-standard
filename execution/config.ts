// Execution Mode Config
// ======================
// Feature-flagged execution mode. Default: "shadow".

export type ExecutionMode = "shadow" | "codex";

export function getExecutionMode(): ExecutionMode {
  const mode = process.env.SDLC_EXECUTION_MODE;
  if (mode === "codex") return "codex";
  return "shadow";
}
