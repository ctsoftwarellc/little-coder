#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

function trajectoryFiles(repo) {
  const dir = join(repo, ".arcova", "trajectories");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => file.endsWith(".jsonl"))
    .sort()
    .map((file) => join(dir, file));
}

function safeList(values) {
  return Array.isArray(values) && values.length > 0 ? values.join(", ") : "(none)";
}

function toSftRow(record) {
  return {
    messages: [
      {
        role: "user",
        content: String(record.task || "").trim(),
      },
      {
        role: "assistant",
        content: [
          `Changed files: ${safeList(record.files_touched)}`,
          `Verify ran: ${Boolean(record.verify?.ran)}`,
          `Verify passed: ${Boolean(record.verify?.passed)}`,
          `Tripwires: ${safeList(record.tripwires)}`,
          "Outcome: completed with focused verification.",
        ].join("\n"),
      },
    ],
    metadata: {
      session_id: record.session_id,
      source: "arcova-trajectory",
    },
  };
}

export function exportVerifiedTrajectories(repoPath, outPath = join(repoPath, ".arcova", "sft.jsonl")) {
  const repo = resolve(repoPath);
  const rows = [];
  for (const file of trajectoryFiles(repo)) {
    for (const line of readFileSync(file, "utf-8").split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const record = JSON.parse(line);
        if (record?.verified === true && record?.verify?.passed === true) rows.push(toSftRow(record));
      } catch {
        // skip malformed trajectory rows
      }
    }
  }
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""));
  return rows.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repo = process.argv[2] || process.cwd();
  const out = process.argv[3] || join(resolve(repo), ".arcova", "sft.jsonl");
  const count = exportVerifiedTrajectories(repo, out);
  console.log(`Exported ${count} verified trajectories to ${out}`);
}
