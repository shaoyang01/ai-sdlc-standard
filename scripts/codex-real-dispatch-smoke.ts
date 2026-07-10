// Codex Real Dispatch Smoke Test
// ================================
// Manually invoked smoke test for the real Codex Gateway dispatch path.
// Requires explicit environment confirmation. Does NOT modify files.
// Does NOT apply patches. Prints only sanitized summary data.
//
// Required environment variables:
//   SDLC_EXECUTION_MODE=codex
//   SDLC_CODEX_REAL_DISPATCH=enabled
//   SDLC_CODEX_SMOKE_CONFIRM=yes
//   SDLC_CODEX_WORKING_DIRECTORY=<absolute path to a git repository>

import { existsSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { ExecutionGateway } from "../execution/gateway";
import type { ExecutionRequest } from "../execution/types";

export interface SmokeFsHelpers {
  existsSync(path: string): boolean;
  statSync(path: string): { isDirectory(): boolean; isFile(): boolean };
  realpathSync(path: string): string;
  isAbsolute(path: string): boolean;
}

const defaultFsHelpers: SmokeFsHelpers = {
  existsSync,
  statSync,
  realpathSync,
  isAbsolute,
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export type SmokeValidationSuccess = { ok: true; workingDirectory: string };
export type SmokeValidationFailure = { ok: false; message: string };
export type SmokeValidationResult = SmokeValidationSuccess | SmokeValidationFailure;

export function validateSmokeEnvironment(
  env: Record<string, string | undefined>,
  fs: SmokeFsHelpers = defaultFsHelpers
): SmokeValidationResult {
  const mode = env.SDLC_EXECUTION_MODE;
  const realDispatch = env.SDLC_CODEX_REAL_DISPATCH;
  const confirm = env.SDLC_CODEX_SMOKE_CONFIRM;
  const workingDirectory = env.SDLC_CODEX_WORKING_DIRECTORY;

  if (mode !== "codex") {
    return {
      ok: false,
      message: "Refused: SDLC_EXECUTION_MODE must be 'codex'.",
    };
  }
  if (realDispatch !== "enabled") {
    return {
      ok: false,
      message: "Refused: SDLC_CODEX_REAL_DISPATCH must be 'enabled'.",
    };
  }
  if (confirm !== "yes") {
    return {
      ok: false,
      message: "Refused: SDLC_CODEX_SMOKE_CONFIRM must be 'yes'.",
    };
  }
  if (!isNonEmptyString(workingDirectory)) {
    return {
      ok: false,
      message:
        "Refused: SDLC_CODEX_WORKING_DIRECTORY must be a non-empty absolute path.",
    };
  }

  const trimmedWorkingDirectory = workingDirectory.trim();
  if (!fs.isAbsolute(trimmedWorkingDirectory)) {
    return {
      ok: false,
      message:
        "Refused: SDLC_CODEX_WORKING_DIRECTORY must be an absolute path.",
    };
  }

  try {
    if (!fs.existsSync(trimmedWorkingDirectory)) {
      return {
        ok: false,
        message: "Refused: working directory does not exist.",
      };
    }

    const stats = fs.statSync(trimmedWorkingDirectory);
    if (!stats.isDirectory()) {
      return {
        ok: false,
        message: "Refused: working directory path is not a directory.",
      };
    }

    const gitPath = resolve(trimmedWorkingDirectory, ".git");
    if (!fs.existsSync(gitPath)) {
      return {
        ok: false,
        message: "Refused: working directory does not contain a .git directory.",
      };
    }
    const gitStats = fs.statSync(gitPath);
    if (!gitStats.isDirectory()) {
      return {
        ok: false,
        message: "Refused: .git exists but is not a directory.",
      };
    }

    const canonicalWorkingDirectory = fs.realpathSync(trimmedWorkingDirectory);
    return { ok: true, workingDirectory: canonicalWorkingDirectory };
  } catch {
    return {
      ok: false,
      message: "Refused: working directory validation failed.",
    };
  }
}

async function main() {
  const validation = validateSmokeEnvironment(process.env);
  if (validation.ok === false) {
    console.error(validation.message);
    process.exit(1);
  }

  const request: ExecutionRequest = {
    type: "code_generation",
    node: "implementation",
    agent: "codex",
    requirementId: "CODEX-REAL-SMOKE",
    input: {
      implementationExecutorInput: {
        requirement:
          "Inspect the repository in read-only mode and return one minimal illustrative code patch. Do not apply changes.",
        requirementId: "CODEX-REAL-SMOKE",
        summary: {
          requirement_id: "CODEX-REAL-SMOKE",
          multi_repo: false,
          main_repo: "local-smoke-repository",
          sub_requirements: [],
          parsed_at: new Date().toISOString(),
        },
        designOutput: {
          node: "tech-design",
          result: "design_completed",
          design: {
            approach: "minimal_read_only_smoke",
            components: ["existing_repository"],
            interfaces: [],
            dependencies: [],
            test_strategy: "do_not_execute_generated_patch",
            risks: ["smoke_test_only"],
          },
        },
        reviewOutput: {
          node: "review",
          result: "PASS",
        },
        complexity: "low",
        executionMode: "direct",
      },
    },
  };

  const gateway = new ExecutionGateway({
    env: {
      SDLC_EXECUTION_MODE: "codex",
      SDLC_CODEX_REAL_DISPATCH: "enabled",
    },
    codexRealDispatchConfig: {
      workingDirectory: validation.workingDirectory,
      timeoutMs: 120_000,
      maxStdoutChars: 64_000,
      maxStderrChars: 16_000,
    },
  });

  const result = await gateway.execute(request);

  if (
    result.success === true &&
    result.artifacts.length === 1 &&
    result.artifacts[0].type === "code_patch"
  ) {
    const artifact = result.artifacts[0];
    const file = artifact.content["file"];
    const patch = artifact.content["patch"];
    if (isNonEmptyString(file) && isNonEmptyString(patch)) {
      console.log("Smoke test passed");
      console.log(`success: true`);
      console.log(`artifact type: ${artifact.type}`);
      console.log(`file: ${file}`);
      console.log(`patch char count: ${patch.length}`);
      if (result.output["duration_ms"] !== undefined) {
        console.log(`duration_ms: ${result.output["duration_ms"]}`);
      }
      process.exit(0);
    }
  }

  // Safe failure summary for fallback or unexpected artifact shape.
  const reason = result.output["codex_fallback_reason"];
  const action = result.output["codex_fallback_action"];
  const safeMessage = result.output["safe_message"];

  console.log("Smoke test did not produce a code_patch");
  console.log(`success: ${result.success}`);
  console.log(`artifact type: ${result.artifacts[0]?.type ?? "none"}`);
  if (reason) {
    console.log(`fallback reason: ${reason}`);
  }
  if (action) {
    console.log(`fallback action: ${action}`);
  }
  if (safeMessage) {
    console.log(`safe message: ${safeMessage}`);
  }
  process.exit(1);
}

const isMain = process.argv[1] === __filename;
if (isMain) {
  main().catch(() => {
    console.error("Smoke test failed with an unexpected error.");
    process.exit(1);
  });
}
