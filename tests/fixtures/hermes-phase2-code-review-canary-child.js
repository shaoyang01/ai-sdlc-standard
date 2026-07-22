#!/usr/bin/env node
// Hermes Phase 2 Code Review Canary — Child Fixture
// ==================================================
// Controlled test fixture for the POSIX process runner.
// Supports fixed modes via first argument. Reads stdin, writes to stdout.
// No network, no filesystem access beyond working directory.

const mode = process.argv[2] || "success";
const stdinChunks = [];

process.stdin.on("data", (chunk) => {
  stdinChunks.push(chunk);
});

process.stdin.on("end", () => {
  const stdinLength = Buffer.concat(stdinChunks).byteLength;

  switch (mode) {
    case "success":
      process.stdout.write(JSON.stringify({ status: "ok", stdinBytes: stdinLength }));
      process.exit(0);
      break;

    case "nonzero":
      process.stderr.write("intentional non-zero exit for testing");
      process.exit(1);
      break;

    case "verify-stdin-sha256": {
      // Exact stdin byte verification: exit 0 only if the SHA-256 of the
      // complete stdin bytes matches the expected lowercase hex digest.
      // Never echoes raw stdin. No network, credential, or repo access.
      const expected = (process.argv[3] || "").toLowerCase();
      const digest = require("crypto")
        .createHash("sha256")
        .update(Buffer.concat(stdinChunks))
        .digest("hex");
      if (expected.length === 64 && digest === expected) {
        process.stdout.write(JSON.stringify({ status: "ok", stdinSha256: "match" }));
        process.exit(0);
      }
      process.stderr.write("stdin sha256 mismatch");
      process.exit(3);
      break;
    }

    case "stdout-overflow":
      // Write well over 16384 bytes (default max)
      const bigChunk = Buffer.alloc(20000, "X");
      process.stdout.write(bigChunk);
      process.exit(0);
      break;

    case "stderr-overflow":
      const bigErrChunk = Buffer.alloc(20000, "E");
      process.stderr.write(bigErrChunk);
      process.exit(0);
      break;

    case "hang-ignore-term":
      // Ignore SIGTERM and hang
      process.on("SIGTERM", () => {
        // intentionally ignoring
      });
      // Wait forever
      setTimeout(() => {}, 600000);
      break;

    case "spawn-descendant":
      // Spawn a child that stays in the same process group
      const { spawn } = require("child_process");
      const descendant = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], {
        stdio: "ignore",
        env: { HOME: process.env.HOME },
      });
      descendant.unref();
      process.stdout.write(JSON.stringify({ status: "ok", descendantPid: descendant.pid }));
      process.exit(0);
      break;

    default:
      process.stderr.write(`unknown mode: ${mode}`);
      process.exit(2);
  }
});
