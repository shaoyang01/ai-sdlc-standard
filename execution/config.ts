// Execution Mode Config
// ======================
// Feature-flagged execution mode. Default: "shadow".

export type ExecutionMode = "shadow" | "codex";

export function getExecutionMode(
  env: Record<string, string | undefined> = process.env
): ExecutionMode {
  const mode = env.SDLC_EXECUTION_MODE;
  if (mode === "codex") return "codex";
  return "shadow";
}

export function isCodexRealDispatchEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.SDLC_CODEX_REAL_DISPATCH === "enabled";
}
