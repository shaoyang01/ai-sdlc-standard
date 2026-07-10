// Codex CLI Process Runner
// =========================
// Isolated process runner for the real Codex CLI. This is the ONLY module in the
// Codex real-dispatch path that imports child_process. It remains unwired from
// ExecutionGateway and Runtime until a later explicit wiring PR.
// No prompt, stdout, or stderr is logged or persisted.

import { spawn, type SpawnOptions } from "node:child_process";
import type { CodexCliProcessRunner } from "./codex-real-dispatch-real-runner";

export interface CodexCliProcessRunnerOptions {
  workingDirectory: string;
  command?: string;
  timeoutMs?: number;
  maxStdoutChars?: number;
  maxStderrChars?: number;
  spawnFn?: typeof spawn;
}

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_STDOUT_CHARS = 64_000;
const DEFAULT_MAX_STDERR_CHARS = 16_000;

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return value.slice(0, maxChars);
}

/**
 * Creates a Codex CLI process runner that spawns the real `codex` binary.
 * The prompt is written through stdin. stdout/stderr are captured in memory only.
 */
export function createCodexCliProcessRunner(
  options: CodexCliProcessRunnerOptions
): CodexCliProcessRunner {
  const command = options.command ?? "codex";
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxStdoutChars = options.maxStdoutChars ?? DEFAULT_MAX_STDOUT_CHARS;
  const maxStderrChars = options.maxStderrChars ?? DEFAULT_MAX_STDERR_CHARS;
  const spawnFn = options.spawnFn ?? spawn;

  return {
    async run(prompt: string): Promise<{
      exitCode: number;
      stdout: string;
      stderr?: string;
      durationMs?: number;
      stdoutTruncated?: boolean;
      stderrTruncated?: boolean;
    }> {
      const args = [
        "exec",
        "--ephemeral",
        "--color",
        "never",
        "--sandbox",
        "read-only",
        "--cd",
        options.workingDirectory,
        "-",
      ];

      const spawnOptions: SpawnOptions = {
        shell: false,
      };

      const start = Date.now();

      return new Promise((resolve, reject) => {
        const child = spawnFn(command, args, spawnOptions);

        let stdout = "";
        let stderr = "";
        let stdoutTruncated = false;
        let stderrTruncated = false;
        let settled = false;
        let timer: ReturnType<typeof setTimeout>;

        const cleanup = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          try {
            child.kill();
          } catch {
            // ignore kill failures
          }
        };

        const resolveWithResult = (exitCode: number) => {
          cleanup();
          resolve({
            exitCode,
            stdout: truncate(stdout, maxStdoutChars),
            stderr: truncate(stderr, maxStderrChars),
            durationMs: Date.now() - start,
            stdoutTruncated,
            stderrTruncated,
          });
        };

        const rejectWithError = (error: Error) => {
          cleanup();
          reject(error);
        };

        timer = setTimeout(() => {
          rejectWithError(new Error("Codex CLI timed out"));
        }, timeoutMs);

        child.stdout?.on("data", (data: Buffer) => {
          stdout += data.toString();
          if (stdout.length > maxStdoutChars) {
            stdoutTruncated = true;
          }
          stdout = truncate(stdout, maxStdoutChars);
        });

        child.stderr?.on("data", (data: Buffer) => {
          stderr += data.toString();
          if (stderr.length > maxStderrChars) {
            stderrTruncated = true;
          }
          stderr = truncate(stderr, maxStderrChars);
        });

        child.on("error", (err) => {
          rejectWithError(err);
        });

        child.on("close", (code) => {
          resolveWithResult(code ?? -1);
        });

        if (child.stdin) {
          child.stdin.write(prompt);
          child.stdin.end();
        } else {
          rejectWithError(new Error("Codex CLI process has no stdin"));
        }
      });
    },
  };
}
