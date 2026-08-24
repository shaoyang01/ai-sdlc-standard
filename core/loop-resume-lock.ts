// C02-WP5 B1-1: Cross-Process Resume Lease (live-claim fencing)
// ==============================================================
// A durable journal cannot distinguish a live executor from a crashed one,
// so interrupting an active started claim needs a liveness source outside
// the journal. The resume lease is an EXCLUSIVE transaction on a tiny
// companion SQLite database next to the journal:
//
// - the WINNER of the lease runs its entire recovery→claim→external
//   execution→terminal cycle while holding it, so no other resumer can
//   observe — let alone interrupt — the live claim;
// - a LOSER either queues (same-process re-entrancy / cross-process
//   busy_timeout) or fails honestly with STORE_BUSY; it never interrupts a
//   claim another executor holds and never doubles external dispatches;
// - a CRASHED holder releases the lease automatically when the OS closes its
//   file descriptor — recovery stays possible without any stale-lock
//   cleanup protocol.
//
// Re-entrancy: a nested runtime invocation inside the SAME async execution
// context (e.g., the F2 window barrier driving entry B from within entry A's
// dispatch flow) reuses the held lease via AsyncLocalStorage instead of
// deadlocking; genuinely parallel invocations get their own context and
// contend for real.

import Database from "better-sqlite3";
import { mkdirSync, realpathSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import { LoopRunJournalError } from "./loop-executor-types";

const HELD_LEASES = new AsyncLocalStorage<{ readonly lockPath: string }>();

function leaseWaitBudgetMs(): number {
  // Test hook: SDLC_RESUME_LEASE_WAIT_BUDGET_MS shortens queueing so
  // contention probes fail fast; production default stays generous.
  const raw = process.env["SDLC_RESUME_LEASE_WAIT_BUDGET_MS"];
  if (raw !== undefined) {
    const parsed = Number(raw);
    if (Number.isSafeInteger(parsed) && parsed >= 0) return parsed;
  }
  return 120_000;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface HeldLease {
  readonly lockPath: string;
  readonly db: Database.Database;
}

/**
 * R4-H1: the lease must bind to the journal's PHYSICAL identity, not a path
 * spelling. Symlinked aliases of the same file resolve to the same canonical
 * target; a not-yet-created journal falls back to its canonical parent
 * directory plus basename so first-run acquisition still works.
 */
function canonicalJournalPath(journalPath: string): string {
  try {
    return realpathSync(journalPath);
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (code === "ENOENT") {
      return join(realpathSync(dirname(journalPath)), basename(journalPath));
    }
    throw error;
  }
}

function leasePathFor(journalPath: string): string {
  return join(
    dirname(canonicalJournalPath(journalPath)),
    `${basename(canonicalJournalPath(journalPath))}.resume-lease.db`,
  );
}

function isSqliteBusy(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "SQLITE_BUSY";
}

/**
 * Runs `fn` while holding this journal's resume lease. Nested calls within
 * the same async execution context reuse the held lease (re-entrant);
 * independent invocations contend on the companion database's EXCLUSIVE
 * transaction and fail with STORE_BUSY if the lease cannot be acquired
 * within RESUME_LEASE_BUSY_TIMEOUT_MS.
 */
export async function withResumeLease<T>(
  journalPath: string,
  fn: () => Promise<T>,
): Promise<T> {
  const held = HELD_LEASES.getStore();
  const lockPath = leasePathFor(journalPath);
  if (held !== undefined && held.lockPath === lockPath) {
    return fn();
  }
  mkdirSync(dirname(lockPath), { recursive: true });
  // busy_timeout MUST stay 0: a blocking BEGIN would freeze the event loop
  // and prevent the current holder's JavaScript from ever releasing the
  // lease. Polling in timed slices lets the holder finish while preserving
  // the wait budget for genuinely parallel resumers.
  const db = new Database(lockPath);
  db.pragma("busy_timeout = 0");
  const deadline = Date.now() + leaseWaitBudgetMs();
  let leased = false;
  let lastBusy = false;
  while (!leased) {
    try {
      db.exec("BEGIN IMMEDIATE");
      leased = true;
    } catch (error) {
      if (!isSqliteBusy(error)) {
        db.close();
        throw error;
      }
      lastBusy = true;
      if (Date.now() >= deadline) break;
      await sleep(5);
    }
  }
  if (!leased) {
    db.close();
    if (lastBusy) {
      throw new LoopRunJournalError(
        "STORE_BUSY",
        "another executor holds the resume lease for this journal",
      );
    }
    throw new LoopRunJournalError("STORE_FAILURE", "resume lease could not be acquired");
  }
  const lease: HeldLease = { lockPath, db };
  try {
    return await HELD_LEASES.run(lease, fn);
  } finally {
    try {
      db.exec("COMMIT");
    } catch {
      try {
        db.exec("ROLLBACK");
      } catch {
        /* connection already unwound */
      }
    }
    db.close();
  }
}
