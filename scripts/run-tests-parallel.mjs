#!/usr/bin/env node
/**
 * Parallel `npm test` runner.
 *
 * Standard library only. No shell, no network, no external dependencies.
 *
 * Model (mirrors the PKB run_repo_tests.py design):
 *
 * 1. The repository root is resolved from this script's own location, never
 *    from the current working directory; every child runs with cwd = root.
 * 2. Test files are discovered by scanning `tests/*.test.ts` (top level
 *    only), so adding a test file automatically adds it to `npm test`.
 * 3. Each discovered file runs as its own `node_modules/.bin/tsx <file>`
 *    subprocess with at most `--workers` running concurrently (default
 *    min(8, cpu_count)).
 * 4. Files in SERIAL_TAIL share mutable state (`tests/policy-memory*.test.ts`
 *    both create and `rm -rf` the same `.sdlc-runtime-test/` directory) and
 *    run strictly one at a time after the parallel phase has fully drained.
 * 5. Captured per-file output is replayed in sorted file order (stdout
 *    flushed before stderr per file); a summary reports failed files, file
 *    counts, and elapsed time.
 * 6. `--serial` selects the historical one-at-a-time fail-fast run (captured
 *    per-file output is replayed as each file completes).
 *
 * Exit code: 0 only when at least one file ran and every file passed.
 */

import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { cpus } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TESTS_DIR = path.join(ROOT, 'tests');
const TSX = path.join(ROOT, 'node_modules', '.bin', 'tsx');

// Files that observe/mutate shared state and therefore cannot run
// concurrently with any other test subprocess. They run one at a time,
// after the parallel phase has fully drained.
// - tests/policy-memory.test.ts / tests/policy-memory-read.test.ts share the
//   cwd-relative `.sdlc-runtime-test/` directory and each `rm -rf`s it in
//   setup and teardown.
const SERIAL_TAIL = new Set([
  'tests/policy-memory.test.ts',
  'tests/policy-memory-read.test.ts',
]);

function discoverTestFiles() {
  const ts = readdirSync(TESTS_DIR)
    .filter((name) => name.endsWith('.test.ts'))
    .sort()
    .map((name) => `tests/${name}`);
  // D-090-02/G3: shell-based fixture suites run serially before the TS matrix
  // (bash 3.2 + ruby stdlib only; not loadable by the TS runner).
  const shell = readdirSync(TESTS_DIR)
    .filter((name) => name.endsWith('.test.sh'))
    .sort()
    .map((name) => `tests/${name}`);
  return [...shell, ...ts];
}

function defaultWorkers() {
  return Math.max(1, Math.min(8, cpus().length || 1));
}

function parseArgs(argv) {
  let serial = false;
  let workers = null;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--serial') {
      serial = true;
    } else if (argv[i] === '--workers') {
      const value = Number.parseInt(argv[i + 1] ?? '', 10);
      if (!Number.isInteger(value) || value < 1) {
        throw new Error(`--workers requires a positive integer, got: ${argv[i + 1]}`);
      }
      workers = value;
      i += 1;
    } else {
      throw new Error(`unknown argument: ${argv[i]}`);
    }
  }
  return { serial, workers: workers ?? defaultWorkers() };
}

const children = new Set();
let terminating = false;

function terminateChildren(signal) {
  terminating = true;
  for (const child of children) {
    try {
      child.kill(signal);
    } catch {
      // already exited
    }
  }
}

process.on('SIGINT', () => terminateChildren('SIGINT'));
process.on('SIGTERM', () => terminateChildren('SIGTERM'));

function runOne(file) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let child;
    try {
      const cmd = file.endsWith('.test.sh') ? '/usr/bin/env' : TSX;
      const args = file.endsWith('.test.sh') ? ['bash', file] : [file];
      child = spawn(cmd, args, {
        cwd: ROOT,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      resolve({ file, code: 1, stdout: '', stderr: '', ms: 0, spawnError: String(error) });
      return;
    }
    children.add(child);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => {
      children.delete(child);
      resolve({ file, code: 1, stdout, stderr, ms: Date.now() - startedAt, spawnError: String(error) });
    });
    child.on('close', (code, signal) => {
      children.delete(child);
      const exitCode = code ?? (terminating || signal ? 1 : 0);
      resolve({ file, code: exitCode, stdout, stderr, ms: Date.now() - startedAt, spawnError: null });
    });
  });
}

async function runPool(files, workers) {
  const results = new Map();
  let next = 0;
  async function worker() {
    while (next < files.length && !terminating) {
      const file = files[next];
      next += 1;
      results.set(file, await runOne(file));
    }
  }
  await Promise.all(Array.from({ length: Math.min(workers, files.length) }, worker));
  return results;
}

function replayOutput(results, files) {
  for (const file of files) {
    const result = results.get(file);
    if (!result) continue;
    if (result.spawnError) {
      process.stderr.write(`failed to run ${file}: ${result.spawnError}\n`);
      continue;
    }
    if (result.stdout) {
      process.stdout.write(result.stdout);
      if (!result.stdout.endsWith('\n')) process.stdout.write('\n');
    }
    if (result.stderr) {
      process.stderr.write(result.stderr);
      if (!result.stderr.endsWith('\n')) process.stderr.write('\n');
    }
  }
}

function printSummary(results, files, elapsedMs) {
  const failed = files.filter((file) => (results.get(file)?.code ?? 1) !== 0);
  const skipped = files.filter((file) => !results.has(file));
  for (const file of failed) {
    process.stdout.write(`FAILED: ${file}\n`);
  }
  for (const file of skipped) {
    process.stdout.write(`SKIPPED (terminated): ${file}\n`);
  }
  process.stdout.write(
    `test_file_count: ${files.length}\n` +
    `failed_file_count: ${failed.length}\n` +
    `elapsed_seconds: ${(elapsedMs / 1000).toFixed(1)}\n`,
  );
}

async function main() {
  const { serial, workers } = parseArgs(process.argv.slice(2));
  const files = discoverTestFiles();
  if (files.length === 0) {
    process.stderr.write('no test files discovered under tests/\n');
    return 1;
  }
  const startedAt = Date.now();

  if (serial) {
    // Historical semantics: one at a time, output streamed, stop on failure.
    for (const file of files) {
      const result = await runOne(file);
      replayOutput(new Map([[file, result]]), [file]);
      if (result.code !== 0) {
        process.stdout.write(`FAILED: ${file}\n`);
        return 1;
      }
    }
    process.stdout.write(`test_file_count: ${files.length}\nfailed_file_count: 0\n`);
    return 0;
  }

  const parallelFiles = files.filter((file) => !SERIAL_TAIL.has(file));
  const tailFiles = files.filter((file) => SERIAL_TAIL.has(file));
  const results = await runPool(parallelFiles, workers);
  if (!terminating) {
    for (const file of tailFiles) {
      results.set(file, await runOne(file));
      if (terminating) break;
    }
  }
  replayOutput(results, files);
  printSummary(results, files, Date.now() - startedAt);
  const allRan = files.every((file) => results.has(file));
  const allPassed = files.every((file) => results.get(file)?.code === 0);
  return allRan && allPassed ? 0 : 1;
}

main().then(
  (code) => { process.exitCode = code; },
  (error) => {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exitCode = 1;
  },
);
