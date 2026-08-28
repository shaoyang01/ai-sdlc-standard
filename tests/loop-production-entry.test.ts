// LOOP Production Entry — C03-E E1 request v1 parser tests
// ========================================================
// Pure parser: no FS/git/child process. Proves the production door rejects
// every malformed/hostile payload BEFORE an Agent could be spawned, and only
// mints a journal-valid identity for an exact v1 real-mode request.
import {
  parseProductionEntryRequest,
  ProductionEntryError,
  PRODUCTION_ENTRY_SCHEMA,
} from "../core/loop-production-entry";

let p = 0,
  f = 0;
function ok(c: boolean, m: string): void {
  if (c) {
    p++;
    console.log(`  ✓ ${m}`);
  } else {
    f++;
    console.error(`  ✗ ${m}`);
  }
}

const SHA = "a".repeat(40);
const NOW = "2026-08-28T10:00:00Z";
const OPTS = { now: () => NOW, runId: "run-20260828-001" };

function validRequest(): Record<string, unknown> {
  return {
    schema: PRODUCTION_ENTRY_SCHEMA,
    requirementId: "REQ-20260828-001",
    repository: "wms-monitor",
    repositoryPath: "/workspace/wms-monitor",
    baseBranch: "feature/dev",
    expectedBaseSha: SHA,
    taskBranch: "loop/REQ-20260828-001",
    controlRoot: "/workspace/.loop/REQ-20260828-001",
    sourceFiles: ["/workspace/input/requirement.md"],
    bindingRegistryVersion: "3",
    executionProfileVersion: "1.0.0",
    mode: "real",
  };
}

async function expectCode(code: string, raw: unknown, opts = OPTS, m: string): Promise<void> {
  try {
    parseProductionEntryRequest(raw, opts);
    ok(false, `${m} (no error)`);
  } catch (e) {
    const got = e instanceof ProductionEntryError ? e.code : "OTHER";
    ok(got === code, `${m} (got ${got})`);
  }
}

function main(): void {
  console.log("production-entry: valid v1 real request");
  {
    const parsed = parseProductionEntryRequest(validRequest(), OPTS);
    ok(parsed.identity.runId === "run-20260828-001", "runId stamped onto identity");
    ok(parsed.identity.expectedBaseSha === SHA, "base sha carried to identity");
    ok(parsed.identity.createdAt === NOW, "createdAt from injected now");
    ok(parsed.request.mode === "real", "mode real");
    ok(Object.isFrozen(parsed.identity) && Object.isFrozen(parsed.request), "results frozen");
    ok(parsed.request.sourceFiles.length === 1, "source files preserved");
  }

  console.log("production-entry: non-records rejected");
  expectCode("PRODUCTION_ENTRY_INVALID_INPUT", null, OPTS, "null rejected");
  expectCode("PRODUCTION_ENTRY_INVALID_INPUT", [], OPTS, "array rejected");
  expectCode("PRODUCTION_ENTRY_INVALID_INPUT", "x", OPTS, "string rejected");

  console.log("production-entry: closed field set (no injection surface)");
  const evilKeys = ["token", "apiKey", "secret", "command", "argv", "env", "password"];
  for (const evil of evilKeys) {
    const r = validRequest();
    r[evil] = "x";
    expectCode("PRODUCTION_ENTRY_INVALID_INPUT", r, OPTS, `extra field "${evil}" rejected`);
  }
  // __proto__ arrives as an OWN key from JSON.parse (not via the literal setter),
  // so the closed-set check must reject it exactly like any unknown field.
  {
    const protoPolluted = JSON.parse(JSON.stringify(validRequest()).replace(/}$/, ',"__proto__":"x"}'));
    expectCode(
      "PRODUCTION_ENTRY_INVALID_INPUT",
      protoPolluted,
      OPTS,
      'own "__proto__" from JSON rejected',
    );
  }
  for (const missing of ["requirementId", "expectedBaseSha", "controlRoot", "mode", "sourceFiles"]) {
    const r = validRequest();
    delete r[missing];
    expectCode("PRODUCTION_ENTRY_INVALID_INPUT", r, OPTS, `missing "${missing}" rejected`);
  }

  console.log("production-entry: schema / mode");
  let r = validRequest();
  r.schema = "loop-production-entry:v0";
  expectCode("PRODUCTION_ENTRY_BAD_SCHEMA", r, OPTS, "wrong schema rejected");
  r = validRequest();
  r.mode = "dry-run";
  expectCode("PRODUCTION_ENTRY_UNSUPPORTED_MODE", r, OPTS, "dry-run rejected (separate command)");

  console.log("production-entry: sha");
  expectCode("PRODUCTION_ENTRY_INVALID_INPUT", { ...validRequest(), expectedBaseSha: "" }, OPTS, "empty sha rejected");
  for (const bad of ["a".repeat(39), "A".repeat(40), "z".repeat(40), SHA + "x"]) {
    const r = validRequest();
    r.expectedBaseSha = bad;
    expectCode("PRODUCTION_ENTRY_BAD_SHA", r, OPTS, `bad sha "${bad.slice(0, 6)}" rejected`);
  }

  console.log("production-entry: paths");
  r = validRequest();
  r.repositoryPath = "relative/path";
  expectCode("PRODUCTION_ENTRY_BAD_PATH", r, OPTS, "relative repositoryPath rejected");
  r = validRequest();
  r.controlRoot = r.repositoryPath;
  expectCode("PRODUCTION_ENTRY_BAD_PATH", r, OPTS, "controlRoot === repositoryPath rejected");
  r = validRequest();
  r.sourceFiles = ["relative/req.md"];
  expectCode("PRODUCTION_ENTRY_BAD_PATH", r, OPTS, "relative source file rejected");
  r = validRequest();
  r.sourceFiles = "not-an-array";
  expectCode("PRODUCTION_ENTRY_INVALID_INPUT", r, OPTS, "non-array sourceFiles rejected");

  console.log("production-entry: versions / text");
  r = validRequest();
  r.executionProfileVersion = "1.0";
  expectCode("PRODUCTION_ENTRY_BAD_VERSION", r, OPTS, "non-semver profile version rejected");
  for (const field of ["requirementId", "repository", "baseBranch", "taskBranch"]) {
    r = validRequest();
    r[field] = " has-space";
    expectCode("PRODUCTION_ENTRY_INVALID_INPUT", r, OPTS, `untrimmed ${field} rejected`);
  }
  expectCode(
    "PRODUCTION_ENTRY_INVALID_INPUT",
    validRequest(),
    { now: () => NOW, runId: "has space" },
    "runId with whitespace rejected",
  );
  expectCode(
    "PRODUCTION_ENTRY_INVALID_INPUT",
    validRequest(),
    { now: () => "not-iso", runId: "r1" },
    "non-ISO now rejected",
  );

  console.log(`\nResults: ${p} passed, ${f} failed`);
  if (f > 0) process.exit(1);
}

main();
