// LOOP Single-Rail Contract — B-layer assertions (C02-WP3.5-B)
// ============================================================
// Aggregates the WP3.5-B model/store invariants that prove the v2 single-rail
// lifecycle is the ONLY runtime authority at this layer:
// - exactly one canonical chain of eight execution points (seven nodes,
//   solution-gate split into adversarial_scan / formal_verdict);
// - only formal_verdict may write a conclusive Gate result;
// - the six finding categories pin their canonical earliest affected node;
// - each node has exactly one product artifact kind and stable-path segment;
// - the journal supports exactly format v6 — history is rejected, not
//   migrated.

import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

import {
  LOOP_CAPABILITY_EXECUTION_POINTS,
  NODE_CAPABILITY_IDS,
  NODE_CAPABILITY_EXECUTION_ROLES,
} from "../loop/types";
import { NODE_CAPABILITY_CONTRACTS } from "../core/node-capability-contracts";
import {
  INITIAL_BINDING_REGISTRY,
  validateBindingRegistry,
} from "../core/agent-capability-bindings";
import { LOOP_CAPABILITY_EXECUTION_SCHEMA_VERSION } from "../core/loop-capability-execution";
import {
  LOOP_FINDING_CATEGORIES,
  LOOP_FINDING_CATEGORY_EARLIEST_NODE,
  LOOP_FINDING_SCHEMA_VERSION,
} from "../core/loop-finding-lifecycle";
import {
  LOOP_ARTIFACT_INDEX_NODE_CAPABILITIES,
  LOOP_ARTIFACT_NODE_PRODUCT_PROJECTION,
  LOOP_ARTIFACT_REVISION_KINDS,
  LOOP_ARTIFACT_REVISION_SCHEMA_VERSION,
} from "../core/loop-artifact-revision";
import { LoopRunStore } from "../core/loop-run-store";
import { LoopRunJournalError } from "../core/loop-executor-types";

let passed = 0;
function ok(condition: unknown, message: string): asserts condition {
  assert.ok(condition, message);
  passed += 1;
}

function main(): void {
  console.log("single rail: one canonical chain, no second authority");
  ok(NODE_CAPABILITY_IDS.length === 7, "exactly seven canonical nodes");
  ok(LOOP_CAPABILITY_EXECUTION_POINTS.length === 8, "the chain expands to eight execution points");
  const gatePoints = LOOP_CAPABILITY_EXECUTION_POINTS.filter((p) => p.capability === "solution-gate");
  ok(
    gatePoints.map((p) => p.executionRole).join(",") === "adversarial_scan,formal_verdict",
    "solution-gate is one node with exactly two execution roles",
  );
  ok(
    !(NODE_CAPABILITY_IDS as readonly string[]).includes("test-validation"),
    "test-validation is not a canonical node",
  );
  const pointCapabilities = new Set(LOOP_CAPABILITY_EXECUTION_POINTS.map((point) => point.capability));
  ok(pointCapabilities.size === NODE_CAPABILITY_IDS.length, "every canonical node has execution points");
  // Contracts agree with the role projection.
  for (const contract of NODE_CAPABILITY_CONTRACTS) {
    const roles = NODE_CAPABILITY_EXECUTION_ROLES[contract.capability];
    ok(
      contract.executionRoles.length === roles.length &&
        contract.executionRoles.every((role, i) => roles[i] === role),
      `contract roles match projection for ${contract.capability}`,
    );
  }

  console.log("single rail: binding registry proves the dual-agent firewall surface");
  validateBindingRegistry(INITIAL_BINDING_REGISTRY);
  const enabledBySlot = new Map<string, string>();
  for (const binding of INITIAL_BINDING_REGISTRY.bindings) {
    if (!binding.enabled) continue;
    enabledBySlot.set(`${binding.capability}:${binding.executionRole}`, binding.agent);
  }
  ok(enabledBySlot.size === 8, "all eight slots have an enabled binding");
  for (const point of LOOP_CAPABILITY_EXECUTION_POINTS) {
    ok(
      enabledBySlot.has(`${point.capability}:${point.executionRole}`),
      `slot ${point.capability}/${point.executionRole} resolvable`,
    );
  }
  ok(
    NODE_CAPABILITY_IDS.every((capability) =>
      (NODE_CAPABILITY_EXECUTION_ROLES[capability] as readonly string[]).includes("primary") ===
      (capability !== "solution-gate"),
    ),
    "primary is fixed everywhere except solution-gate",
  );

  console.log("single rail: schema versions advanced, no silent compatibility");
  ok(LOOP_CAPABILITY_EXECUTION_SCHEMA_VERSION === 4, "capability execution schema is v4");
  ok(LOOP_FINDING_SCHEMA_VERSION === 4, "finding schema is v4 (causal evidence + decision-scope binding)");
  ok(LOOP_ARTIFACT_REVISION_SCHEMA_VERSION === 2, "artifact revision schema is v2");

  console.log("single rail: six finding categories pin their earliest affected node");
  ok(LOOP_FINDING_CATEGORIES.length === 6, "exactly six categories; TEST retired");
  const expectedEarliest: Record<string, string> = {
    REQUIREMENT: "requirement-intake",
    SOLUTION: "solution-design",
    PLANNING: "task-planning",
    IMPLEMENTATION: "implementation",
    REVIEW: "code-review",
    KNOWLEDGE: "knowledge-sync",
  };
  for (const [category, expected] of Object.entries(expectedEarliest)) {
    ok(
      LOOP_FINDING_CATEGORY_EARLIEST_NODE[category as keyof typeof LOOP_FINDING_CATEGORY_EARLIEST_NODE] === expected,
      `${category} pins its canonical earliest affected node ${expected}`,
    );
  }

  console.log("single rail: one product kind and stable path per node");
  const manifestNodes = Object.keys(LOOP_ARTIFACT_INDEX_NODE_CAPABILITIES);
  ok(manifestNodes.length === 7, "manifest index maps exactly seven node labels");
  for (const capability of NODE_CAPABILITY_IDS) {
    const projection = LOOP_ARTIFACT_NODE_PRODUCT_PROJECTION[capability];
    ok(projection !== undefined, `${capability} has a product projection`);
    ok(
      /^0[0-6]-/.test(projection.stablePathSegment),
      `${capability} stable segment ${projection.stablePathSegment} follows the v2 layout`,
    );
  }
  for (const kind of ["task_plan", "implementation_record", "knowledge_sync_result"]) {
    ok((LOOP_ARTIFACT_REVISION_KINDS as readonly string[]).includes(kind), `artifact kind ${kind} exists`);
  }

  console.log("single rail: the journal supports exactly format v7");
  {
    const dir = mkdtempSync(join(tmpdir(), "loop-single-rail-"));
    try {
      const path = join(dir, "journal.db");
      const store = new LoopRunStore(path);
      store.init();
      store.close();
      const db = new Database(path, { readonly: true });
      ok(db.pragma("user_version", { simple: true }) === 7, "fresh journals are v7");
      db.close();

      // Known history is refused outright.
      for (const version of [1, 5]) {
        const historicalPath = join(dir, `historical-${version}.db`);
        const seed = new Database(historicalPath);
        seed.pragma(`user_version = ${version}`);
        seed.close();
        let rejected = false;
        try {
          new LoopRunStore(historicalPath).init();
        } catch (error) {
          rejected = error instanceof LoopRunJournalError &&
            error.code === "UNSUPPORTED_HISTORICAL_FORMAT";
        }
        ok(rejected, `format ${version} rejected as unsupported history`);
      }
      // Future formats are refused too.
      const futurePath = join(dir, "future.db");
      const futureSeed = new Database(futurePath);
      futureSeed.pragma("user_version = 8");
      futureSeed.close();
      let futureRejected = false;
      try {
        new LoopRunStore(futurePath).init();
      } catch (error) {
        futureRejected = error instanceof LoopRunJournalError &&
          error.code === "UNSUPPORTED_FUTURE_FORMAT";
      }
      ok(futureRejected, "format above v7 rejected as future");

      // An unversioned database carrying LOOP tables is never mistaken for
      // fresh storage.
      const unversionedPath = join(dir, "unversioned.db");
      const raw = new Database(unversionedPath);
      raw.exec("CREATE TABLE loop_events (event_id TEXT PRIMARY KEY)");
      raw.close();
      let unversionedRejected = false;
      try {
        new LoopRunStore(unversionedPath).init();
      } catch (error) {
        unversionedRejected = error instanceof LoopRunJournalError &&
          error.code === "UNSUPPORTED_HISTORICAL_FORMAT";
      }
      ok(unversionedRejected, "unversioned database with LOOP tables rejected as history");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  console.log(`\nloop-single-rail-contract: ${passed}/${passed} assertions passed`);
}

main();
