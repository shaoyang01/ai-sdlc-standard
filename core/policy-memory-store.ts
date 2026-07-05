// Policy Memory Store — SQLite Persistence
// =========================================
// Optional local SQLite store for feedback records.
// Disabled by default. Append-only. Summary-only.
// No full artifact content. No full trace output.
// Uses better-sqlite3 for synchronous local storage.
// No global connection cache — each function opens and closes its own DB.

import Database from "better-sqlite3";
import * as fs from "node:fs";
import * as path from "node:path";
import { PolicyMemoryRecord, PolicyMemorySummary, AgentMemorySummary } from "./policy-memory-types";

function ensureDir(dbPath: string): void {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function openDb(dbPath: string): Database.Database {
  ensureDir(dbPath);
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  return db;
}

function ensureSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      run_id TEXT PRIMARY KEY,
      requirement_id TEXT NOT NULL,
      final_status TEXT NOT NULL,
      artifact_types TEXT NOT NULL,
      trace_nodes TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_scores (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      agent TEXT NOT NULL,
      score REAL NOT NULL,
      reason TEXT NOT NULL,
      signals TEXT NOT NULL,
      FOREIGN KEY(run_id) REFERENCES runs(run_id)
    );

    CREATE TABLE IF NOT EXISTS policy_suggestions (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      type TEXT NOT NULL,
      node TEXT NOT NULL,
      agent TEXT,
      reason TEXT NOT NULL,
      confidence REAL NOT NULL,
      FOREIGN KEY(run_id) REFERENCES runs(run_id)
    );

    CREATE INDEX IF NOT EXISTS idx_agent_scores_agent ON agent_scores(agent);
    CREATE INDEX IF NOT EXISTS idx_policy_suggestions_type ON policy_suggestions(type);
    CREATE INDEX IF NOT EXISTS idx_runs_requirement_id ON runs(requirement_id);
  `);
}

export function initPolicyMemory(dbPath: string): void {
  const db = openDb(dbPath);
  try {
    ensureSchema(db);
  } finally {
    db.close();
  }
}

export function appendPolicyMemoryRecord(
  dbPath: string,
  record: PolicyMemoryRecord
): void {
  const db = openDb(dbPath);
  try {
    ensureSchema(db);

    const insertRun = db.prepare(`
      INSERT OR REPLACE INTO runs (
        run_id, requirement_id, final_status, artifact_types, trace_nodes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertAgentScore = db.prepare(`
      INSERT OR REPLACE INTO agent_scores (
        id, run_id, agent, score, reason, signals
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertSuggestion = db.prepare(`
      INSERT OR REPLACE INTO policy_suggestions (
        id, run_id, type, node, agent, reason, confidence
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = db.transaction(() => {
      insertRun.run(
        record.runId,
        record.requirementId,
        record.finalStatus,
        JSON.stringify(record.artifactTypes),
        JSON.stringify(record.traceNodes),
        record.createdAt
      );

      for (const score of record.feedback.agent_scores) {
        insertAgentScore.run(
          `${record.runId}:agent:${score.agent}`,
          record.runId,
          score.agent,
          score.score,
          score.reason,
          JSON.stringify(score.signals)
        );
      }

      for (let i = 0; i < record.feedback.policy_suggestions.length; i++) {
        const s = record.feedback.policy_suggestions[i];
        insertSuggestion.run(
          `${record.runId}:suggestion:${i}`,
          record.runId,
          s.type,
          s.node,
          s.agent ?? null,
          s.reason,
          s.confidence
        );
      }
    });

    transaction();
  } finally {
    db.close();
  }
}

export function readPolicyMemorySummary(dbPath: string): {
  runCount: number;
  agentScoreCount: number;
  policySuggestionCount: number;
} {
  const db = openDb(dbPath);
  try {
    ensureSchema(db);

    const runCount = (db.prepare("SELECT COUNT(*) as count FROM runs").get() as { count: number }).count;
    const agentScoreCount = (db.prepare("SELECT COUNT(*) as count FROM agent_scores").get() as { count: number }).count;
    const policySuggestionCount = (db.prepare("SELECT COUNT(*) as count FROM policy_suggestions").get() as { count: number }).count;

    return { runCount, agentScoreCount, policySuggestionCount };
  } finally {
    db.close();
  }
}

export function readPolicyMemoryAgentSummaries(dbPath: string): PolicyMemorySummary {
  // Handle missing DB file gracefully
  if (!fs.existsSync(dbPath)) {
    return { available: false, runCount: 0, agentSummaries: [] };
  }

  const db = openDb(dbPath);
  try {
    ensureSchema(db);

    const runCountRow = db.prepare("SELECT COUNT(*) as count FROM runs").get() as { count: number };
    const runCount = runCountRow.count;

    if (runCount === 0) {
      return { available: true, runCount: 0, agentSummaries: [] };
    }

    const rows = db.prepare(`
      SELECT agent, score, signals
      FROM agent_scores
      ORDER BY rowid ASC
    `).all() as { agent: string; score: number; signals: string }[];

    const agentMap = new Map<string, { scores: number[]; positiveSignals: number; negativeSignals: number }>();

    for (const row of rows) {
      let entry = agentMap.get(row.agent);
      if (!entry) {
        entry = { scores: [], positiveSignals: 0, negativeSignals: 0 };
      }

      entry.scores.push(row.score);

      // Count signals
      let signals: string[] = [];
      try {
        signals = JSON.parse(row.signals);
      } catch {
        // Ignore parse errors
      }

      for (const sig of signals) {
        if (sig.includes(":success") || sig.includes(":PASS") || sig.includes("bugfix:completed")) {
          entry.positiveSignals++;
        }
        if (sig.includes(":failure") || sig.includes(":FAIL") || sig.includes("validation:failed")) {
          entry.negativeSignals++;
        }
      }

      agentMap.set(row.agent, entry);
    }

    const agentSummaries: AgentMemorySummary[] = [];
    for (const [agent, entry] of agentMap) {
      const totalScore = entry.scores.reduce((a, b) => a + b, 0);
      const avgScore = Math.round((totalScore / entry.scores.length) * 100) / 100;
      agentSummaries.push({
        agent,
        runCount: entry.scores.length,
        averageScore: avgScore,
        lastScore: entry.scores[entry.scores.length - 1],
        positiveSignals: entry.positiveSignals,
        negativeSignals: entry.negativeSignals,
      });
    }

    return { available: true, runCount, agentSummaries };
  } catch {
    return { available: false, runCount: 0, agentSummaries: [] };
  } finally {
    db.close();
  }
}
