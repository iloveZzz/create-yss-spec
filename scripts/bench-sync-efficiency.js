"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");

const targetDir = path.resolve(process.argv[2] || ".");
const iterations = Number(process.argv[3] || 5);
if (!Number.isInteger(iterations) || iterations < 5) throw new Error("至少运行 5 次");

const packageRoot = path.resolve(__dirname, "..");
const templateRoot = path.join(packageRoot, "template") + path.sep;
const snapshot = JSON.parse(fs.readFileSync(path.join(packageRoot, "template.snapshot.json"), "utf8"));
const originalRead = fs.readFileSync;
let templateReads = 0;
fs.readFileSync = function countedRead(file, ...options) {
  if (typeof file === "string" && file.startsWith(templateRoot)) templateReads += 1;
  return originalRead.call(this, file, ...options);
};
const worktree = require("../src/git/worktree");
const originalCollect = worktree.collectGitRoots;
let rootLookups = 0;
worktree.collectGitRoots = (...args) => {
  rootLookups += 1;
  return originalCollect(...args);
};
const { buildSyncContext, applySyncContext } = require("../src/api/_sync-service");

const samples = [];
const originalWrite = process.stdout.write;
process.stdout.write = () => true;
for (let index = -1; index < iterations; index += 1) {
  templateReads = 0;
  rootLookups = 0;
  const start = performance.now();
  const context = buildSyncContext({ targetDir });
  const result = applySyncContext(context);
  const durationMs = performance.now() - start;
  if (result.backupPath || result.stats.updated || result.stats.added || result.stats.forceApplied) {
    throw new Error("基准项目必须是已校验的无变化实例");
  }
  if (index >= 0) samples.push({ durationMs: Math.round(durationMs * 10) / 10, templateReads, rootLookups });
}
process.stdout.write = originalWrite;
const median = (values) => [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)];
process.stdout.write(`${JSON.stringify({ targetDir, snapshotHash: snapshot.snapshotHash, sourceState: snapshot.sourceState,
  samples, medianDurationMs: median(samples.map((item) => item.durationMs)),
  medianTemplateReads: median(samples.map((item) => item.templateReads)),
  medianGitRootLookups: median(samples.map((item) => item.rootLookups)) }, null, 2)}\n`);
