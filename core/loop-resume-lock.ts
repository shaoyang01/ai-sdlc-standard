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
import { lstatSync, mkdirSync, readlinkSync, realpathSync } from "node:fs";
import type { Stats } from "node:fs";
import { basename, dirname, isAbsolute, join } from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import { LoopRunJournalError } from "./loop-executor-types";

const HELD_LEASES = new AsyncLocalStorage<{ readonly lockPath: string }>();

/** Bound for resolving chains of dangling symlinks (fail closed, never loop). */
const MAX_DANGLING_SYMLINK_HOPS = 16;

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
 * R4-H1 + R5-H1 + R6-H1: the lease must bind to the journal's PHYSICAL
 * identity, not a path spelling. Resolution is a strictly PER-COMPONENT walk:
 * lstat inspects exactly one entry without following anything, readlink is
 * only ever called on an entry lstat just proved to be a symlink, and the hop
 * counter is therefore ours alone — the OS resolver never walks a chain for
 * us, so a native ELOOP can never preempt the bounded STORE_FAILURE surface.
 *
 * Error contract (identical for every spelling of the same journal):
 * - missing PARENT directory: realpathSync(dirname) at the top propagates the
 *   NATIVE ENOENT before any lease state can be touched (pre-existing,
 *   unchanged surface — no directories, no companion);
 * - absent plain leaf: canonical as spelled under the real parent;
 * - dangling leaf symlinks converge every spelling (link alias, chained
 *   links, future target path) onto ONE identity; intermediate directory
 *   aliases fold in per hop;
 * - a MISSING parent anywhere inside a hop's target propagates that NATIVE
 *   ENOENT too — never masked, never "fixed" by creating directories here
 *   (mkdirSync belongs to withResumeLease, after successful resolution);
 * - more than MAX_DANGLING_SYMLINK_HOPS links, and symlink loops, uniformly
 *   fail with LoopRunJournalError("STORE_FAILURE");
 * - EACCES / EIO / ... propagate natively — nothing is blanket-caught.
 */
function canonicalJournalPath(journalPath: string): string {
  const parent = realpathSync(dirname(journalPath));
  let cursor = join(parent, basename(journalPath));
  for (let hops = 0; ; hops += 1) {
    let stat: Stats;
    try {
      stat = lstatSync(cursor);
    } catch (error) {
      if ((error as { code?: unknown }).code === "ENOENT") {
        return cursor;
      }
      throw error;
    }
    if (!stat.isSymbolicLink()) {
      // Concrete entry under an already-realized parent: fully canonical.
      return cursor;
    }
    if (hops >= MAX_DANGLING_SYMLINK_HOPS) {
      throw new LoopRunJournalError(
        "STORE_FAILURE",
        `journal path resolves through more than ${MAX_DANGLING_SYMLINK_HOPS} symlink hops`,
      );
    }
    const target = readlinkSync(cursor);
    const absoluteTarget = isAbsolute(target) ? target : join(dirname(cursor), target);
    // Fold intermediate-directory aliases (e.g. macOS /var -> /private/var)
    // into the identity; a missing directory inside the TARGET is part of the
    // caller-visible error surface and propagates its native ENOENT.
    const targetParent = realpathSync(dirname(absoluteTarget));
    cursor = join(targetParent, basename(absoluteTarget));
  }
}

function leasePathFor(journalPath: string): string {
  // R5-H1: both components derive from ONE canonical computation, so no
  // spelling can observe a partially-resolved identity.
  const canonical = canonicalJournalPath(journalPath);
  return join(dirname(canonical), `${basename(canonical)}.resume-lease.db`);
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

/**
 * E4-T3: reports whether the calling async context currently holds this
 * journal's resume lease.
 *
 * This is the observation half of the dispatch-window firewall: `withResumeLease`
 * only ever *grants* the lease, so an entry point that reaches the
 * recovery→claim→spawn→terminal/promotion window without going through it is
 * silently legal unless something asks. Callers use this to fail closed instead
 * of opening the window unguarded.
 *
 * The lease identity is recomputed from `journalPath` exactly as the grant path
 * computes it, so a caller cannot satisfy the check with a different spelling of
 * the same journal. Path resolution failures mean "no lease can be held here",
 * not "unknown": a missing parent directory is reported as not-held.
 */
export function isResumeLeaseHeld(journalPath: string): boolean {
  const held = HELD_LEASES.getStore();
  if (held === undefined) {
    return false;
  }
  let lockPath: string;
  try {
    lockPath = leasePathFor(journalPath);
  } catch (error) {
    if ((error as { code?: unknown }).code === "ENOENT") {
      return false;
    }
    throw error;
  }
  return held.lockPath === lockPath;
}
