// C03-E W6b2 (E4-T4): the `human_action_required` artifact contract.
//
// The human boundary is the one place a run stops and asks a person. Before
// this wave it was an opaque string; now it is a stored artifact whose reason
// is one of SIX allowlisted codes. The point of the allowlist is that a
// consumer can decide what to do without parsing prose — so the tests below
// spend most of their energy on the boundary of that allowlist: six in,
// everything else out, including look-alikes.
//
// Reverse probes (independent reviewer, not asserted here):
//  - widen HUMAN_ACTION_REASON_CODES with SWITCH_AGENT_REQUIRED → T2 goes red;
//  - make the reasonCode check case-insensitive → T3 goes red;
//  - drop the kind pin in putHumanActionRequiredArtifact (store under another
//    kind) → T7 goes red;
//  - drop the exact-field check in parse → T5 goes red;
//  - drop the ref-kind guard in readHumanActionRequiredArtifact → T7 goes red
//    (only true since F1: the foreign fixture now holds valid content).

import { strict as assert } from "node:assert";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { LoopArtifactStore, LOOP_ARTIFACT_KINDS } from "../core/loop-artifact-store";
import { LoopArtifactStoreError } from "../core/loop-artifact-store";
import {
  HUMAN_ACTION_ARTIFACT_KIND,
  HUMAN_ACTION_REASON_CODES,
  LOOP_HUMAN_ACTION_ARTIFACT_SCHEMA,
  buildHumanActionRequiredArtifact,
  isHumanActionArtifactFailure,
  isHumanActionRequiredRef,
  parseHumanActionRequiredArtifact,
  putHumanActionRequiredArtifact,
  readHumanActionRequiredArtifact,
  serializeHumanActionRequiredArtifact,
  type HumanActionArtifactInput,
  type HumanActionRequiredArtifact,
} from "../core/loop-human-action-artifact";

let passed = 0;
function ok(condition: unknown, message: string): asserts condition {
  assert.ok(condition, message);
  passed += 1;
}

function fixtureInput(overrides: Partial<HumanActionArtifactInput> = {}): HumanActionArtifactInput {
  return Object.freeze({
    reasonCode: "MISSING_BUSINESS_FACT",
    runId: "run-w6b2-001",
    requirementId: "REQ-W6B2-001",
    capability: "solution-gate",
    executionRole: "formal_verdict",
    message: "the requirement does not state whether returns are restockable",
    ...overrides,
  });
}

function store(prefix: string): Readonly<{ root: string; store: LoopArtifactStore }> {
  const root = mkdtempSync(join(tmpdir(), prefix));
  const repo = join(root, "repo");
  mkdirSync(repo);
  const artifacts = new LoopArtifactStore({
    controlRoot: join(root, "control"),
    repositoryPath: repo,
  });
  artifacts.init();
  return Object.freeze({ root, store: artifacts });
}

async function main(): Promise<void> {
  // ─── T1: the six legal codes round-trip through a real store ────
  {
    const f = store("loop-w6b2-t1-");
    try {
      ok(
        HUMAN_ACTION_REASON_CODES.length === 6,
        "T1: exactly six legal human-action reason codes",
      );
      for (const reasonCode of HUMAN_ACTION_REASON_CODES) {
        const built = buildHumanActionRequiredArtifact(fixtureInput({ reasonCode }));
        ok(built.ok, `T1: ${reasonCode} is accepted by the builder`);
        if (!built.ok) {
          continue;
        }
        const put = putHumanActionRequiredArtifact(f.store, fixtureInput({ reasonCode }));
        ok(put.ok, `T1: ${reasonCode} is stored`);
        if (!put.ok) {
          continue;
        }
        ok(
          put.stored.kind === HUMAN_ACTION_ARTIFACT_KIND,
          `T1: ${reasonCode} is stored under the human_action_required kind`,
        );
        ok(
          isHumanActionRequiredRef(put.stored.artifactRef),
          `T1: ${reasonCode} produces a self-describing human_action_required ref`,
        );
        const read = readHumanActionRequiredArtifact(f.store, put.stored.artifactRef, put.stored.digest);
        ok(read.ok, `T1: ${reasonCode} reads back as a valid artifact`);
        if (read.ok) {
          ok(read.artifact.reasonCode === reasonCode, `T1: ${reasonCode} survives the round trip`);
          ok(
            read.artifact.schema === LOOP_HUMAN_ACTION_ARTIFACT_SCHEMA,
            `T1: ${reasonCode} keeps the pinned schema`,
          );
        }
      }
    } finally {
      f.store.close();
      rmSync(f.root, { recursive: true, force: true });
    }
  }

  // ─── T2: routing decisions are NOT human requests ───────────────
  {
    for (const illegal of ["SWITCH_AGENT_REQUIRED", "SHADOW_FALLBACK_REQUIRED"]) {
      const built = buildHumanActionRequiredArtifact(
        fixtureInput({ reasonCode: illegal as HumanActionArtifactInput["reasonCode"] }),
      );
      ok(!built.ok, `T2: ${illegal} is rejected as a human-action reason`);
      if (isHumanActionArtifactFailure(built)) {
        ok(built.reason === "invalid_input", `T2: ${illegal} fails closed as invalid_input`);
      }
      const parsed = parseHumanActionRequiredArtifact(
        serializeHumanActionRequiredArtifact({
          schema: LOOP_HUMAN_ACTION_ARTIFACT_SCHEMA,
          reasonCode: illegal,
          runId: "run-w6b2-002",
          requirementId: "REQ-W6B2-002",
          capability: null,
          executionRole: null,
          message: null,
        } as unknown as HumanActionRequiredArtifact),
      );
      ok(!parsed.ok, `T2: a stored artifact carrying ${illegal} is rejected on read`);
    }
  }

  // ─── T3: the allowlist is case-sensitive, not a pattern ─────────
  {
    const variants = [
      "missing_business_fact",
      "Missing_Business_Fact",
      "MISSING_BUSINESS_FACT ",
      " MISSING_BUSINESS_FACT",
      "MISSING-BUSINESS-FACT",
      "SOURCE_CONFLICT_EXTRA",
      "UNKNOWN_REASON",
      "",
    ];
    for (const variant of variants) {
      const built = buildHumanActionRequiredArtifact(
        fixtureInput({ reasonCode: variant as HumanActionArtifactInput["reasonCode"] }),
      );
      ok(!built.ok, `T3: reasonCode ${JSON.stringify(variant)} is rejected`);
    }
  }

  // ─── T4: identifier and message bounds ──────────────────────────
  {
    const badIds = ["", "   ", "run 1", "run\n1", "a".repeat(257)];
    for (const bad of badIds) {
      const built = buildHumanActionRequiredArtifact(
        fixtureInput({ runId: bad as unknown as string }),
      );
      ok(!built.ok, `T4: runId ${JSON.stringify(bad.slice(0, 12))} is rejected`);
    }
    const longMessage = "x".repeat(513);
    ok(
      !buildHumanActionRequiredArtifact(fixtureInput({ message: longMessage })).ok,
      "T4: an over-long message is rejected",
    );
    ok(
      buildHumanActionRequiredArtifact(fixtureInput({ message: "x".repeat(512) })).ok,
      "T4: a message at the bound is accepted",
    );
    const withNulls = fixtureInput({ capability: null, executionRole: null, message: null });
    ok(
      buildHumanActionRequiredArtifact(withNulls).ok,
      "T4: run-scoped artifacts (null capability/role/message) are accepted",
    );
  }

  // ─── T5: the stored field set is exact ──────────────────────────
  {
    const base = buildHumanActionRequiredArtifact(fixtureInput());
    assert.ok(base.ok, "T5: base artifact builds");
    const canonical = JSON.parse(base.content) as Record<string, unknown>;
    const withExtra = { ...canonical, extra: "smuggled" };
    ok(
      !parseHumanActionRequiredArtifact(JSON.stringify(withExtra)).ok,
      "T5: an extra field is rejected",
    );
    for (const field of Object.keys(canonical)) {
      const without = { ...canonical };
      delete without[field];
      ok(
        !parseHumanActionRequiredArtifact(JSON.stringify(without)).ok,
        `T5: missing field ${field} is rejected`,
      );
    }
    ok(
      !parseHumanActionRequiredArtifact(
        JSON.stringify({ ...canonical, schema: "loop-human-action-required-v2" }),
      ).ok,
      "T5: a different schema is rejected",
    );
    ok(!parseHumanActionRequiredArtifact("{not json").ok, "T5: non-JSON content is rejected");
    ok(!parseHumanActionRequiredArtifact("[]").ok, "T5: a JSON array is rejected");
  }

  // ─── T6: serialization is deterministic ─────────────────────────
  {
    const f = store("loop-w6b2-t6-");
    try {
      const first = putHumanActionRequiredArtifact(f.store, fixtureInput());
      const second = putHumanActionRequiredArtifact(f.store, fixtureInput());
      assert.ok(first.ok && second.ok, "T6: both puts succeed");
      ok(
        first.stored.digest === second.stored.digest,
        "T6: identical inputs hash identically (content-addressed, no clock/no randomness)",
      );
      ok(
        first.stored.artifactRef === second.stored.artifactRef,
        "T6: identical inputs produce the same ref",
      );
    } finally {
      f.store.close();
      rmSync(f.root, { recursive: true, force: true });
    }
  }

  // ─── T7: the kind is pinned, and a ref of another kind is refused ──
  {
    const f = store("loop-w6b2-t7-");
    try {
      ok(
        (LOOP_ARTIFACT_KINDS as readonly string[]).includes(HUMAN_ACTION_ARTIFACT_KIND),
        "T7: human_action_required is a registered canonical kind",
      );
      // F1 (review finding, fixed in W6b3): the foreign fixture holds VALID
      // human-action content. With a non-JSON body the parse layer rejected the
      // read first, so the ref-kind guard was never the thing that refused it
      // and probe P4 could not turn red.
      const built = buildHumanActionRequiredArtifact(fixtureInput());
      ok(
        !isHumanActionArtifactFailure(built),
        "T7: the foreign fixture builds a real artifact",
      );
      const foreign = f.store.put(
        "review_summary",
        isHumanActionArtifactFailure(built) ? "" : built.content,
      );
      ok(
        !isHumanActionRequiredRef(foreign.artifactRef),
        "T7: a review_summary ref is not a human_action_required ref",
      );
      let refused = false;
      try {
        readHumanActionRequiredArtifact(f.store, foreign.artifactRef);
      } catch (error) {
        refused = error instanceof Error;
      }
      ok(
        refused || !readHumanActionRequiredArtifact(f.store, foreign.artifactRef).ok,
        "T7: reading a foreign-kind ref as a human-action artifact is refused",
      );
    } finally {
      f.store.close();
      rmSync(f.root, { recursive: true, force: true });
    }
  }

  // ─── T8: a ref/digest pair that disagrees is rejected ───────────
  {
    const f = store("loop-w6b2-t8-");
    try {
      const put = putHumanActionRequiredArtifact(f.store, fixtureInput());
      assert.ok(put.ok, "T8: put succeeds");
      let threw = false;
      try {
        readHumanActionRequiredArtifact(f.store, put.stored.artifactRef, "f".repeat(64));
      } catch (error) {
        threw = error instanceof LoopArtifactStoreError;
      }
      ok(threw, "T8: a mismatched expected digest is refused instead of silently read");
    } finally {
      f.store.close();
      rmSync(f.root, { recursive: true, force: true });
    }
  }

  console.log(`W6b2 human action artifact: ${passed} passed`);
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
