// Preflight: LOOP run-store v2 cutover journal scan (C02-WP3.5-B, D3)
// =====================================================================
// Read-only scanner for the v7 store cutover. It answers one question per
// supported persistence root: are there any SQLite journals that the v2
// runtime must refuse or that require a governance stop?
//
// Contract (impact analysis §6 D3 rules 4-6):
// - Requires explicitly passed root directories; there is deliberately NO
//   HOME / repository-root default scan.
// - Never writes or modifies any file; the JSON + Markdown inventory and its
//   digest go to stdout only.
// - Candidates are files under the given roots that look like SQLite
//   databases (.db/.sqlite/.sqlite3 extension or SQLite magic header).
// - Any candidate that is unreadable/not SQLite, carries no LOOP business
//   table (owner cannot be confirmed), declares user_version 1..5, an
//   unversioned database that already carries LOOP tables, or a version above
//   6 makes the scan FAIL with a non-zero exit.
// - A real v5 journal additionally reports STOP_AND_RE_RULE as the only next
//   step (§2 boundary 6): v5 journals are never semantically migrated.

import { createHash } from "node:crypto";
import { openSync, readSync, closeSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";

// Round 1 (H2): owner detection shares the store's COMPLETE physical table
// catalogue — main tables and every self-owned child table — so a v0
// database carrying e.g. only loop_artifact_current classifies as history.
import { LOOP_PHYSICAL_TABLES } from "../core/loop-run-store";

const SUPPORTED_FORMAT_VERSION = 7;
const SQLITE_MAGIC = "SQLite format 3\x00";
const CANDIDATE_EXTENSIONS = new Set([".db", ".sqlite", ".sqlite3"]);

const LOOP_BUSINESS_TABLES = LOOP_PHYSICAL_TABLES;

export type PreflightVerdict =
  | "OK_V6"
  | "FRESH_EMPTY"
  | "FAIL_HISTORICAL_FORMAT"
  | "FAIL_UNVERSIONED_WITH_TABLES"
  | "FAIL_FUTURE_FORMAT"
  | "FAIL_NOT_SQLITE"
  | "FAIL_OWNER_UNKNOWN"
  | "STOP_AND_RE_RULE";

export interface PreflightCandidate {
  path: string;
  sizeBytes: number;
  verdict: PreflightVerdict;
  declaredFormatVersion: number | null;
  loopTablesFound: readonly string[];
  detail: string;
}

export interface PreflightReport {
  schema: "loop-run-store-v2-cutover-preflight:v1";
  scannedRoots: readonly string[];
  candidateCount: number;
  failureCount: number;
  requiresGovernanceStop: boolean;
  candidates: readonly PreflightCandidate[];
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function hasSqliteMagic(path: string): boolean {
  let fd: number | null = null;
  try {
    fd = openSync(path, "r");
    const buffer = Buffer.alloc(SQLITE_MAGIC.length);
    const read = readSync(fd, buffer, 0, buffer.length, 0);
    return read === SQLITE_MAGIC.length && buffer.toString("latin1") === SQLITE_MAGIC;
  } catch {
    return false;
  } finally {
    if (fd !== null) {
      try { closeSync(fd); } catch { /* best effort */ }
    }
  }
}

function listCandidateFiles(root: string): string[] {
  const candidates: string[] = [];
  const walk = (dir: string): void => {
    let entries: import("node:fs").Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      // Unreadable directories are not candidates; the root itself is
      // validated up front.
      return;
    }
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      // Round 1 (H2): extension-less SQLite journals must not be missed. A
      // file is a candidate when its read-only header carries the SQLite
      // magic string — regardless of its name — or when it is a zero-byte
      // placeholder using a conventional sqlite extension.
      let size = 0;
      try {
        size = statSync(fullPath).size;
      } catch {
        continue;
      }
      if (size === 0) {
        const dot = entry.name.lastIndexOf(".");
        const extension = dot === -1 ? "" : entry.name.slice(dot).toLowerCase();
        if (CANDIDATE_EXTENSIONS.has(extension)) candidates.push(fullPath);
        continue;
      }
      if (hasSqliteMagic(fullPath)) candidates.push(fullPath);
    }
  };
  walk(root);
  return candidates.sort();
}

/** Classify one candidate file without modifying it (read-only open). */
export function classifyCandidate(path: string): PreflightCandidate {
  let sizeBytes = 0;
  try {
    sizeBytes = statSync(path).size;
  } catch {
    return {
      path, sizeBytes: 0, verdict: "FAIL_NOT_SQLITE", declaredFormatVersion: null,
      loopTablesFound: [], detail: "candidate is not readable",
    };
  }
  let db: Database.Database | null = null;
  try {
    db = new Database(path, { readonly: true, fileMustExist: true });
    const magicOk = hasSqliteMagic(path);
    const versionRow = db.pragma("user_version", { simple: true });
    const declaredFormatVersion =
      typeof versionRow === "number" && Number.isSafeInteger(versionRow) && versionRow >= 0 ? versionRow : null;
    const loopTablesFound = LOOP_BUSINESS_TABLES.filter((table) =>
      db!.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) !== undefined,
    );
    const base = { path, sizeBytes, declaredFormatVersion, loopTablesFound };
    // A zero-length file is a legitimate fresh journal placeholder; anything
    // else without the SQLite magic header is not a database at all.
    if ((sizeBytes > 0 && !magicOk) || declaredFormatVersion === null) {
      return { ...base, verdict: "FAIL_NOT_SQLITE", detail: "candidate is not a readable SQLite database" };
    }
    // Declared-format gates come first: they carry the most specific
    // diagnosis even when the owner cannot be confirmed.
    if (declaredFormatVersion >= 1 && declaredFormatVersion <= 5) {
      return {
        ...base,
        verdict: declaredFormatVersion === 5 ? "STOP_AND_RE_RULE" : "FAIL_HISTORICAL_FORMAT",
        detail: declaredFormatVersion === 5
          ? "real v5 journal found: STOP_AND_RE_RULE — re-request governance before any cutover"
          : `historical format ${declaredFormatVersion} is unsupported and never migrated`,
      };
    }
    if (declaredFormatVersion > SUPPORTED_FORMAT_VERSION) {
      return { ...base, verdict: "FAIL_FUTURE_FORMAT", detail: `format ${declaredFormatVersion} is newer than this build supports` };
    }
    if (declaredFormatVersion === 0 && loopTablesFound.length === 0) {
      // A fresh journal placeholder carries no tables at all; an unversioned
      // database that owns OTHER tables cannot be claimed as a fresh store.
      const anyTable = db.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' LIMIT 1",
      ).get();
      if (anyTable === undefined && sizeBytes <= 0x1000) {
        return { ...base, verdict: "FRESH_EMPTY", detail: "unversioned database without LOOP tables; fresh v7 initialization is allowed" };
      }
      return { ...base, verdict: "FAIL_OWNER_UNKNOWN", detail: "no LOOP business table found; owner cannot be confirmed" };
    }
    if (declaredFormatVersion === 0) {
      return {
        ...base,
        verdict: "FAIL_UNVERSIONED_WITH_TABLES",
        detail: "unversioned database already carries LOOP business tables",
      };
    }
    if (loopTablesFound.length === 0) {
      return { ...base, verdict: "FAIL_OWNER_UNKNOWN", detail: "no LOOP business table found; owner cannot be confirmed" };
    }
    return { ...base, verdict: "OK_V6", detail: "supported v7 journal format" };
  } catch {
    return {
      path, sizeBytes, verdict: "FAIL_NOT_SQLITE", declaredFormatVersion: null,
      loopTablesFound: [], detail: "candidate could not be opened read-only as SQLite",
    };
  } finally {
    if (db !== null) {
      try { db.close(); } catch { /* best effort */ }
    }
  }
}

/**
 * Run the read-only cutover scan over explicit roots. Returns the report;
 * `report.failureCount === 0 && !report.requiresGovernanceStop` means every
 * candidate is either a supported v6 journal or a genuinely fresh database.
 */
export function preflightLoopRunStoreV2Cutover(roots: readonly string[]): PreflightReport {
  const resolvedRoots = roots.map((root) => root);
  const candidateFiles = resolvedRoots.flatMap((root) => listCandidateFiles(root));
  const seen = new Set<string>();
  const candidates: PreflightCandidate[] = [];
  for (const file of candidateFiles) {
    if (seen.has(file)) continue;
    seen.add(file);
    candidates.push(classifyCandidate(file));
  }
  // Every non-passing verdict counts as a failure; a v5 journal is both a
  // failure and the distinct STOP_AND_RE_RULE governance stop (D3 rule 5).
  const blocking = candidates.filter(
    (candidate) => candidate.verdict !== "OK_V6" && candidate.verdict !== "FRESH_EMPTY",
  );
  const requiresGovernanceStop = candidates.some((candidate) => candidate.verdict === "STOP_AND_RE_RULE");
  return Object.freeze({
    schema: "loop-run-store-v2-cutover-preflight:v1" as const,
    scannedRoots: Object.freeze(resolvedRoots),
    candidateCount: candidates.length,
    failureCount: blocking.length,
    requiresGovernanceStop,
    candidates: Object.freeze(candidates.map((candidate) => Object.freeze(candidate))),
  });
}

/** Fixed-order canonical JSON used for the report digest. */
export function canonicalPreflightReportJson(report: PreflightReport): string {
  return JSON.stringify({
    schema: report.schema,
    scannedRoots: report.scannedRoots,
    candidateCount: report.candidateCount,
    failureCount: report.failureCount,
    requiresGovernanceStop: report.requiresGovernanceStop,
    candidates: report.candidates.map((candidate) => ({
      path: candidate.path,
      sizeBytes: candidate.sizeBytes,
      verdict: candidate.verdict,
      declaredFormatVersion: candidate.declaredFormatVersion,
      loopTablesFound: candidate.loopTablesFound,
      detail: candidate.detail,
    })),
  });
}

function renderMarkdown(report: PreflightReport): string {
  const lines: string[] = [];
  lines.push("# LOOP Run Store v2 Cutover Preflight");
  lines.push("");
  lines.push(`- scanned roots: ${report.scannedRoots.join(", ")}`);
  lines.push(`- candidates: ${report.candidateCount}`);
  lines.push(`- failures: ${report.failureCount}`);
  lines.push(`- governance stop (v5 journal): ${report.requiresGovernanceStop ? "YES — STOP_AND_RE_RULE" : "no"}`);
  lines.push("");
  if (report.candidates.length === 0) {
    lines.push("No SQLite candidate files found under the given roots.");
  } else {
    lines.push("| path | verdict | user_version | detail |");
    lines.push("| --- | --- | --- | --- |");
    for (const candidate of report.candidates) {
      lines.push(
        `| ${candidate.path} | ${candidate.verdict} | ${candidate.declaredFormatVersion ?? "-"} | ${candidate.detail} |`,
      );
    }
  }
  lines.push("");
  return lines.join("\n");
}

function main(argv: readonly string[]): number {
  const roots = [...argv];
  if (roots.length === 0) {
    process.stderr.write(
      "usage: tsx scripts/preflight-loop-run-store-v2-cutover.ts <root-dir> [more-root-dirs...]\n" +
      "at least one supported persistence root directory is required; there is no default scan\n",
    );
    return 2;
  }
  for (const root of roots) {
    try {
      if (!statSync(root).isDirectory()) {
        process.stderr.write(`root is not a directory: ${root}\n`);
        return 2;
      }
    } catch {
      process.stderr.write(`root is not accessible: ${root}\n`);
      return 2;
    }
  }
  const report = preflightLoopRunStoreV2Cutover(roots);
  const digest = sha256(canonicalPreflightReportJson(report));
  process.stdout.write(`${JSON.stringify({ ...report, digest }, null, 2)}\n`);
  process.stdout.write(renderMarkdown(report));
  process.stdout.write(`digest: ${digest}\n`);
  // Non-zero on ANY failure class; a real v5 journal additionally demands the
  // governance stop (distinct exit code 3).
  if (report.requiresGovernanceStop) return 3;
  return report.failureCount === 0 && report.candidateCount >= 0 ? 0 : 1;
}

const invokedDirectly = require.main === module;
if (invokedDirectly) {
  process.exitCode = main(process.argv.slice(2));
}
