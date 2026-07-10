// Codex Real Dispatch Smoke Validation Test
// ============================================
// Verifies the smoke test environment validation helper with injected filesystem
// helpers and temporary paths. Does NOT invoke real Codex CLI.

import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  validateSmokeEnvironment,
  type SmokeFsHelpers,
  type SmokeValidationResult,
} from "../scripts/codex-real-dispatch-smoke";

function createValidEnv(
  workingDirectory: string
): Record<string, string | undefined> {
  return {
    SDLC_EXECUTION_MODE: "codex",
    SDLC_CODEX_REAL_DISPATCH: "enabled",
    SDLC_CODEX_SMOKE_CONFIRM: "yes",
    SDLC_CODEX_WORKING_DIRECTORY: workingDirectory,
  };
}

function createFakeFs(
  overrides: Partial<SmokeFsHelpers> = {}
): SmokeFsHelpers {
  return {
    existsSync: () => false,
    statSync: () => ({ isDirectory: () => false, isFile: () => false }),
    realpathSync: (p: string) => p,
    isAbsolute: (p: string) => p.startsWith("/"),
    ...overrides,
  };
}

async function test() {
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      passed++;
      console.log(`  ✓ ${message}`);
    } else {
      failed++;
      console.error(`  ✗ ${message}`);
    }
  }

  console.log("Codex Real Dispatch Smoke Validation Test\n");

  // ── Test 1: Relative path is rejected ──
  console.log("Test 1: Relative path is rejected");
  const relativeResult = validateSmokeEnvironment(
    createValidEnv("./relative/path"),
    createFakeFs()
  );
  if (relativeResult.ok === false) {
    assert(relativeResult.message.includes("must be an absolute path"), "relative path rejected with absolute path message");
  } else {
    assert(false, "relative path should be rejected");
  }
  console.log("");

  // ── Test 2: Blank path is rejected ──
  console.log("Test 2: Blank path is rejected");
  const blankResult = validateSmokeEnvironment(
    createValidEnv("   "),
    createFakeFs()
  );
  if (blankResult.ok === false) {
    assert(blankResult.message.includes("non-empty absolute path"), "blank path rejected with non-empty message");
  } else {
    assert(false, "blank path should be rejected");
  }
  console.log("");

  // ── Test 3: Missing path is rejected ──
  console.log("Test 3: Missing path is rejected");
  const missingResult = validateSmokeEnvironment(
    createValidEnv("/nonexistent/smoke/repo"),
    createFakeFs()
  );
  if (missingResult.ok === false) {
    assert(missingResult.message.includes("does not exist"), "missing path rejected with does-not-exist message");
  } else {
    assert(false, "missing path should be rejected");
  }
  console.log("");

  // ── Test 4: Regular file is rejected ──
  console.log("Test 4: Regular file is rejected");
  const tempFile = join(tmpdir(), `codex-smoke-file-${Date.now()}`);
  writeFileSync(tempFile, "not a directory");
  try {
    const fileResult = validateSmokeEnvironment(
      createValidEnv(tempFile),
      createFakeFs({
        existsSync: (p) => p === tempFile,
        statSync: (p) =>
          p === tempFile
            ? { isDirectory: () => false, isFile: () => true }
            : { isDirectory: () => false, isFile: () => false },
        isAbsolute: () => true,
      })
    );
    if (fileResult.ok === false) {
      assert(fileResult.message.includes("is not a directory"), "regular file rejected with not-a-directory message");
    } else {
      assert(false, "regular file should be rejected");
    }
  } finally {
    rmSync(tempFile, { force: true });
  }
  console.log("");

  // ── Test 5: Directory without .git is rejected ──
  console.log("Test 5: Directory without .git is rejected");
  const noGitDir = mkdtempSync(join(tmpdir(), "codex-smoke-no-git-"));
  try {
    const noGitResult = validateSmokeEnvironment(
      createValidEnv(noGitDir),
      createFakeFs({
        existsSync: (p) => p === noGitDir,
        statSync: (p) =>
          p === noGitDir
            ? { isDirectory: () => true, isFile: () => false }
            : { isDirectory: () => false, isFile: () => false },
        isAbsolute: () => true,
      })
    );
    if (noGitResult.ok === false) {
      assert(noGitResult.message.includes("does not contain a .git directory"), "no-git directory rejected with .git message");
    } else {
      assert(false, "directory without .git should be rejected");
    }
  } finally {
    rmdirSync(noGitDir);
  }
  console.log("");

  // ── Test 6: .git that is a file is rejected ──
  console.log("Test 6: .git that is a file is rejected");
  const gitFileDir = mkdtempSync(join(tmpdir(), "codex-smoke-git-file-"));
  const gitFilePath = join(gitFileDir, ".git");
  writeFileSync(gitFilePath, "not a directory");
  try {
    const gitFileResult = validateSmokeEnvironment(
      createValidEnv(gitFileDir),
      createFakeFs({
        existsSync: (p) => p === gitFileDir || p === gitFilePath,
        statSync: (p) => {
          if (p === gitFileDir) {
            return { isDirectory: () => true, isFile: () => false };
          }
          if (p === gitFilePath) {
            return { isDirectory: () => false, isFile: () => true };
          }
          return { isDirectory: () => false, isFile: () => false };
        },
        isAbsolute: () => true,
      })
    );
    if (gitFileResult.ok === false) {
      assert(gitFileResult.message.includes(".git exists but is not a directory"), ".git file rejected with is-not-directory message");
    } else {
      assert(false, ".git file should be rejected");
    }
  } finally {
    rmSync(gitFilePath, { force: true });
    rmdirSync(gitFileDir);
  }
  console.log("");

  // ── Test 7: Valid absolute Git repository path is accepted ──
  console.log("Test 7: Valid absolute Git repository path is accepted");
  const validRepo = mkdtempSync(join(tmpdir(), "codex-smoke-valid-repo-"));
  const validGitDir = join(validRepo, ".git");
  mkdirSync(validGitDir);
  try {
    const validResult = validateSmokeEnvironment(
      createValidEnv(validRepo),
      createFakeFs({
        existsSync: (p) => p === validRepo || p === validGitDir,
        statSync: (p) => {
          if (p === validRepo || p === validGitDir) {
            return { isDirectory: () => true, isFile: () => false };
          }
          return { isDirectory: () => false, isFile: () => false };
        },
        realpathSync: (p) => (p === validRepo ? validRepo : p),
        isAbsolute: () => true,
      })
    );
    if (validResult.ok) {
      assert(validResult.workingDirectory === validRepo, "valid git repo accepted and working directory matches");
    } else {
      assert(false, "valid git repo should be accepted");
    }
  } finally {
    rmdirSync(validGitDir);
    rmdirSync(validRepo);
  }
  console.log("");

  // ── Test 8: Returned path is canonical via realpathSync ──
  console.log("Test 8: Returned path is canonical");
  const canonicalPath = "/canonical/smoke/repo";
  const inputPath = "/some/symlink/repo";
  const canonicalResult = validateSmokeEnvironment(
    createValidEnv(inputPath),
    createFakeFs({
      existsSync: () => true,
      statSync: () => ({ isDirectory: () => true, isFile: () => false }),
      realpathSync: (p) => (p === inputPath ? canonicalPath : p),
      isAbsolute: () => true,
    })
  );
  if (canonicalResult.ok) {
    assert(canonicalResult.workingDirectory === canonicalPath, "returned path is result of realpathSync");
  } else {
    assert(false, "canonical path should be accepted");
  }
  console.log("");

  // ── Test 9: isAbsolute helper is used for validation ──
  console.log("Test 9: isAbsolute helper is used for validation");
  let isAbsoluteCalled: boolean = false;
  validateSmokeEnvironment(
    createValidEnv("/some/path"),
    createFakeFs({
      existsSync: () => false,
      isAbsolute: (p) => {
        isAbsoluteCalled = true;
        return p.startsWith("/");
      },
    })
  );
  assert(isAbsoluteCalled, "isAbsolute helper was invoked");
  console.log("");

  // ── Test 10: Missing mode is rejected ──
  console.log("Test 10: Missing mode is rejected");
  const missingModeResult = validateSmokeEnvironment(
    {
      SDLC_EXECUTION_MODE: undefined,
      SDLC_CODEX_REAL_DISPATCH: "enabled",
      SDLC_CODEX_SMOKE_CONFIRM: "yes",
      SDLC_CODEX_WORKING_DIRECTORY: "/valid/repo",
    },
    createFakeFs()
  );
  if (missingModeResult.ok === false) {
    assert(missingModeResult.message.includes("SDLC_EXECUTION_MODE"), "missing mode rejected with mode message");
  } else {
    assert(false, "missing mode should be rejected");
  }
  console.log("");

  // ── Test 11: Missing real-dispatch flag is rejected ──
  console.log("Test 11: Missing real-dispatch flag is rejected");
  const missingFlagResult = validateSmokeEnvironment(
    {
      SDLC_EXECUTION_MODE: "codex",
      SDLC_CODEX_REAL_DISPATCH: undefined,
      SDLC_CODEX_SMOKE_CONFIRM: "yes",
      SDLC_CODEX_WORKING_DIRECTORY: "/valid/repo",
    },
    createFakeFs()
  );
  if (missingFlagResult.ok === false) {
    assert(missingFlagResult.message.includes("SDLC_CODEX_REAL_DISPATCH"), "missing real-dispatch flag rejected with flag message");
  } else {
    assert(false, "missing real-dispatch flag should be rejected");
  }
  console.log("");

  // ── Test 12: Missing confirmation is rejected ──
  console.log("Test 12: Missing confirmation is rejected");
  const missingConfirmResult = validateSmokeEnvironment(
    {
      SDLC_EXECUTION_MODE: "codex",
      SDLC_CODEX_REAL_DISPATCH: "enabled",
      SDLC_CODEX_SMOKE_CONFIRM: undefined,
      SDLC_CODEX_WORKING_DIRECTORY: "/valid/repo",
    },
    createFakeFs()
  );
  if (missingConfirmResult.ok === false) {
    assert(missingConfirmResult.message.includes("SDLC_CODEX_SMOKE_CONFIRM"), "missing confirmation rejected with confirm message");
  } else {
    assert(false, "missing confirmation should be rejected");
  }
  console.log("");

  // ── Test 13: Unexpected error text is never printed by this module ──
  console.log("Test 13: Validation helper never prints or throws raw errors");
  const validationOnlyResult = validateSmokeEnvironment(
    createValidEnv("/valid/repo"),
    createFakeFs({
      existsSync: () => {
        throw new Error("raw filesystem exception with secrets token api_key");
      },
      isAbsolute: () => true,
    })
  );
  assert(validationOnlyResult.ok === false, "filesystem exception results in rejection");
  if (validationOnlyResult.ok === false) {
    assert(!validationOnlyResult.message.includes("secrets"), "raw error text not exposed");
    assert(!validationOnlyResult.message.includes("token"), "raw error text not exposed");
    assert(!validationOnlyResult.message.includes("api_key"), "raw error text not exposed");
  }
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
