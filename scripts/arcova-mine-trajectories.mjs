#!/usr/bin/env node
// Trajectory mining → self-tuning model profiles (build order item #9).
//
// arcova-trajectory writes sanitized JSONL session records that are otherwise
// write-only. This mines them for THIS model's habits and turns the conclusions
// into profile recommendations — the cheap self-tuning loop the doc argues pays
// off before any fine-tune:
//
//   "qwen3.5-9b fails Edit on whitespace 31% of the time" → enable fuzzy edit.
//   "gemma never calls Verify unprompted"                 → enable ambient verify.
//   "model X trips tripwires constantly"                  → enable phase gating.
//
// Usage:
//   node scripts/arcova-mine-trajectories.mjs <laravel-repo> [--write]
//
// Default is a dry-run report. With --write, recommendations are merged into the
// repo's (or this package's) .pi/settings.json under
// little_coder.model_profiles[<model>].tuning_recommendations — a non-load-
// bearing advisory block (the harness reads env flags, not this field), so it's
// safe to write and easy to act on by hand.

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ── Pure core (exported for tests) ──────────────────────────────────────────

export function parseTrajectoryLines(text) {
  const records = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      records.push(JSON.parse(trimmed));
    } catch {
      // skip malformed line
    }
  }
  return records;
}

/** Aggregate per-model signatures from a flat list of trajectory records. */
export function mineTrajectories(records) {
  const byModel = new Map();
  for (const r of records) {
    const model = typeof r.model === "string" && r.model ? r.model : "(unknown)";
    let s = byModel.get(model);
    if (!s) {
      s = {
        model,
        sessions: 0,
        verifyRan: 0,
        verified: 0,
        tripwireSessions: 0,
        editAttempts: 0,
        editFailures: 0,
        filesTouched: 0,
      };
      byModel.set(model, s);
    }
    s.sessions++;
    if (r.verify?.ran) s.verifyRan++;
    if (r.verified) s.verified++;
    if (Array.isArray(r.tripwires) && r.tripwires.length > 0) s.tripwireSessions++;
    s.editAttempts += Number(r.edit_attempts) || 0;
    s.editFailures += Number(r.edit_failures) || 0;
    s.filesTouched += Array.isArray(r.files_touched) ? r.files_touched.length : 0;
  }
  // Derive rates.
  for (const s of byModel.values()) {
    s.verifyRate = s.sessions ? s.verifyRan / s.sessions : 0;
    s.verifiedRate = s.sessions ? s.verified / s.sessions : 0;
    s.tripwireRate = s.sessions ? s.tripwireSessions / s.sessions : 0;
    s.editFailureRate = s.editAttempts ? s.editFailures / s.editAttempts : 0;
    s.avgFilesTouched = s.sessions ? s.filesTouched / s.sessions : 0;
  }
  return byModel;
}

const pct = (x) => `${Math.round(x * 100)}%`;

/**
 * Turn one model's stats into actionable recommendations. Thresholds are
 * deliberately conservative; each carries the env toggle that acts on it.
 * Requires a minimum sample so a single noisy session can't flip a profile.
 */
export function recommend(stats, minSessions = 5) {
  const recs = [];
  if (stats.sessions < minSessions) {
    recs.push({
      signal: "insufficient-data",
      detail: `${stats.sessions} session(s) — need ≥${minSessions} for confident tuning.`,
      suggested_env: null,
    });
    return recs;
  }
  if (stats.editAttempts >= 10 && stats.editFailureRate > 0.25) {
    recs.push({
      signal: "high-edit-failure",
      detail: `fails Edit ${pct(stats.editFailureRate)} of the time (${stats.editFailures}/${stats.editAttempts})`,
      suggested_env: "LITTLE_CODER_FUZZY_EDIT=1",
    });
  }
  if (stats.verifyRate < 0.5) {
    recs.push({
      signal: "rarely-verifies",
      detail: `runs Verify in only ${pct(stats.verifyRate)} of sessions`,
      suggested_env: "LITTLE_CODER_AMBIENT_PHP_LINT=1",
    });
  }
  if (stats.tripwireRate > 0.3) {
    recs.push({
      signal: "high-tripwire-rate",
      detail: `trips a tripwire in ${pct(stats.tripwireRate)} of sessions`,
      suggested_env: "LITTLE_CODER_PHASE_GATING=1",
    });
  }
  if (stats.avgFilesTouched > 5) {
    recs.push({
      signal: "broad-changes",
      detail: `touches ${stats.avgFilesTouched.toFixed(1)} files/session on average — encourage narrower edits`,
      suggested_env: "LITTLE_CODER_PHASE_GATING=1",
    });
  }
  if (recs.length === 0) {
    recs.push({ signal: "healthy", detail: "no tuning needed on current signals.", suggested_env: null });
  }
  return recs;
}

export function generateReport(byModel) {
  const lines = ["# Arcova Trajectory Mining Report", ""];
  if (byModel.size === 0) {
    lines.push("No trajectories found.");
    return lines.join("\n");
  }
  for (const stats of byModel.values()) {
    lines.push(`## ${stats.model}`);
    lines.push(
      `sessions=${stats.sessions} verified=${pct(stats.verifiedRate)} verify-rate=${pct(stats.verifyRate)} ` +
        `tripwire-rate=${pct(stats.tripwireRate)} edit-failure-rate=${pct(stats.editFailureRate)} ` +
        `avg-files=${stats.avgFilesTouched.toFixed(1)}`,
    );
    for (const r of recommend(stats)) {
      const env = r.suggested_env ? `  → ${r.suggested_env}` : "";
      lines.push(`- [${r.signal}] ${r.detail}${env}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

/** Pure merge: write each model's recommendations into a settings object copy. */
export function applyRecommendations(settings, byModel) {
  const next = settings && typeof settings === "object" ? { ...settings } : {};
  const lc = { ...(next.little_coder ?? {}) };
  const profiles = { ...(lc.model_profiles ?? {}) };
  for (const stats of byModel.values()) {
    const recs = recommend(stats).filter((r) => r.suggested_env);
    if (recs.length === 0) continue;
    const existing = profiles[stats.model] ?? {};
    profiles[stats.model] = {
      ...existing,
      tuning_recommendations: recs.map((r) => ({ signal: r.signal, detail: r.detail, suggested_env: r.suggested_env })),
    };
  }
  lc.model_profiles = profiles;
  next.little_coder = lc;
  return next;
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function readAllTrajectories(repo) {
  const dir = join(repo, ".arcova", "trajectories");
  if (!existsSync(dir)) return [];
  const records = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".jsonl")) continue;
    records.push(...parseTrajectoryLines(readFileSync(join(dir, file), "utf-8")));
  }
  return records;
}

function main(argv) {
  const args = argv.filter((a) => a !== "--write");
  const write = argv.includes("--write");
  const repo = args[0] || process.cwd();

  const records = readAllTrajectories(repo);
  const byModel = mineTrajectories(records);
  process.stdout.write(generateReport(byModel) + "\n");

  if (write) {
    const settingsPath = join(repo, ".pi", "settings.json");
    let settings = {};
    if (existsSync(settingsPath)) {
      try {
        settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
      } catch {
        console.error(`Refusing to write: ${settingsPath} is not valid JSON.`);
        process.exit(1);
      }
    }
    const updated = applyRecommendations(settings, byModel);
    writeFileSync(settingsPath, JSON.stringify(updated, null, 2) + "\n");
    process.stdout.write(`\nWrote tuning_recommendations to ${settingsPath}\n`);
  }
}

// Only run as a CLI when invoked directly (not when imported by tests).
import { fileURLToPath } from "node:url";
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2));
}
