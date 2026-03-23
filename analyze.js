#!/usr/bin/env node
// analyze.js — Automated analysis of sweep results
// Reads JSONL output, produces summary table, flags interesting configs,
// detects interaction effects and coalition composition shifts.
//
// Usage: node analyze.js results/sweep-TIMESTAMP.jsonl

const fs = require("fs");
const path = require("path");

const inputFile = process.argv[2];
if (!inputFile) {
  console.error("Usage: node analyze.js <sweep-output.jsonl>");
  process.exit(1);
}

// Parse JSONL
const lines = fs.readFileSync(inputFile, "utf8").trim().split("\n");
const runs = lines.map((line, i) => {
  try { return JSON.parse(line); }
  catch (e) { console.error(`Parse error on line ${i + 1}: ${e.message}`); return null; }
}).filter(Boolean);

console.log(`Loaded ${runs.length} runs from ${inputFile}\n`);

// Extract key metrics from each run
function extractMetrics(run) {
  const r = run.output?.results?.[0];
  if (!r) return null;
  return {
    label: run.label,
    config: run.config,
    N: r.N || 0,
    pmS: r.pm?.S || 0,
    pmV: r.pm?.V || 0,
    pmLA: r.pm?.LA || 0,
    blue: r.govType?.blue || 0,
    red: r.govType?.red || 0,
    none: r.govType?.none || 0,
    cross: r.govType?.cross || 0,
    midter: r.govType?.midter || 0,
    sAlone: r.govType?.["S-alone"] || 0,
    topCoalition: r.topCoalitions?.[0]?.govt || "?",
    topPct: r.topCoalitions?.[0]?.pct || 0,
    topPPassage: r.topCoalitions?.[0]?.avgPPassage || 0,
    nCoalitions: r.topCoalitions?.length || 0,
  };
}

const metrics = runs.map(extractMetrics).filter(Boolean);

// Find baseline
const baseline = metrics.find(m => m.label === "baseline");
if (!baseline) {
  console.error("WARNING: No baseline run found!");
}

// =====================================================================
// 1. Summary table
// =====================================================================
console.log("=" .repeat(120));
console.log("SUMMARY TABLE");
console.log("=".repeat(120));
console.log(
  "Label".padEnd(45) +
  "PM(S)".padStart(7) +
  "Blue".padStart(7) +
  "None".padStart(7) +
  "Cross".padStart(7) +
  "Midter".padStart(7) +
  "Top coalition".padStart(20) +
  "Top%".padStart(7) +
  "pPass".padStart(7)
);
console.log("-".repeat(120));

for (const m of metrics) {
  console.log(
    m.label.padEnd(45) +
    m.pmS.toFixed(1).padStart(7) +
    m.blue.toFixed(1).padStart(7) +
    m.none.toFixed(1).padStart(7) +
    m.cross.toFixed(1).padStart(7) +
    m.midter.toFixed(1).padStart(7) +
    m.topCoalition.padStart(20) +
    m.topPct.toFixed(1).padStart(7) +
    m.topPPassage.toFixed(3).padStart(7)
  );
}

// =====================================================================
// 2. Flag interesting configurations
// =====================================================================
console.log("\n" + "=".repeat(80));
console.log("FLAGGED CONFIGURATIONS");
console.log("=".repeat(80));

const PM_THRESHOLD = 92;      // Flag if PM(S) < 92%
const BLUE_THRESHOLD = 8;     // Flag if blue > 8%
const NONE_THRESHOLD = 5;     // Flag if gridlock > 5%
const CROSS_THRESHOLD = 5;    // Flag if cross-bloc > 5%

const flagged = [];

for (const m of metrics) {
  const reasons = [];
  if (m.pmS < PM_THRESHOLD) reasons.push(`PM(S)=${m.pmS.toFixed(1)}% (<${PM_THRESHOLD})`);
  if (m.blue > BLUE_THRESHOLD) reasons.push(`blue=${m.blue.toFixed(1)}% (>${BLUE_THRESHOLD})`);
  if (m.none > NONE_THRESHOLD) reasons.push(`none=${m.none.toFixed(1)}% (>${NONE_THRESHOLD})`);
  if (m.cross > CROSS_THRESHOLD) reasons.push(`cross=${m.cross.toFixed(1)}% (>${CROSS_THRESHOLD})`);

  if (reasons.length > 0) {
    flagged.push({ ...m, reasons });
    console.log(`\n  * ${m.label}`);
    for (const r of reasons) console.log(`    -> ${r}`);
  }
}

if (flagged.length === 0) {
  console.log("  No configurations met the flagging thresholds.");
  console.log("  Consider lowering thresholds or checking if the model is too stable.");
}

console.log(`\nTotal flagged: ${flagged.length} / ${metrics.length}`);

// =====================================================================
// 3. Detect interaction effects
// =====================================================================
console.log("\n" + "=".repeat(80));
console.log("INTERACTION EFFECTS (where A's effect depends on B)");
console.log("=".repeat(80));

// Group metrics by interaction pattern
function findInteractionEffect(labelPattern1, labelPattern2, metric = "pmS") {
  const group1 = metrics.filter(m => m.label.includes(labelPattern1));
  const group2 = metrics.filter(m => m.label.includes(labelPattern2));
  if (group1.length === 0 || group2.length === 0) return null;

  const avg1 = group1.reduce((s, m) => s + m[metric], 0) / group1.length;
  const avg2 = group2.reduce((s, m) => s + m[metric], 0) / group2.length;
  return { pattern1: labelPattern1, pattern2: labelPattern2, avg1, avg2, diff: avg2 - avg1, n1: group1.length, n2: group2.length };
}

// Key interaction checks
const interactions = [
  { a: "M->S", b: "M->V", context: "without mDemandPM", filter: m => !m.label.includes("demandPM") && (m.label === "M->S" || m.label === "baseline") },
  { a: "M->S+demandPM", b: "M->V+demandPM", context: "with mDemandPM" },
  { a: "pBF=0+baseline", b: "pBF=0.2+baseline", context: "baseline mandates" },
  { a: "pBF=0+knife-edge", b: "pBF=0.2+knife-edge", context: "knife-edge mandates" },
];

// Look for large deviations from baseline
console.log(`\nRuns where PM(S) deviates most from baseline (${baseline?.pmS.toFixed(1)}%):`);

const deviations = metrics
  .filter(m => m.label !== "baseline")
  .map(m => ({ label: m.label, pmS: m.pmS, delta: m.pmS - (baseline?.pmS || 97), blue: m.blue, none: m.none }))
  .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

for (const d of deviations.slice(0, 25)) {
  const sign = d.delta >= 0 ? "+" : "";
  console.log(`  ${sign}${d.delta.toFixed(1)}pp  PM(S)=${d.pmS.toFixed(1)}%  blue=${d.blue.toFixed(1)}%  none=${d.none.toFixed(1)}%  ${d.label}`);
}

// =====================================================================
// 4. Coalition composition shifts
// =====================================================================
console.log("\n" + "=".repeat(80));
console.log("COALITION COMPOSITION: where the modal coalition changes");
console.log("=".repeat(80));

const baselineTop = baseline?.topCoalition || "S+SF+RV+M";
const shifted = metrics.filter(m => m.topCoalition !== baselineTop && m.label !== "baseline");
if (shifted.length > 0) {
  for (const m of shifted) {
    console.log(`  ${m.label}: ${m.topCoalition} (${m.topPct.toFixed(1)}%) -- baseline was ${baselineTop}`);
  }
} else {
  console.log(`  All runs have ${baselineTop} as modal coalition.`);
}

// =====================================================================
// 5. Summary statistics
// =====================================================================
console.log("\n" + "=".repeat(80));
console.log("SUMMARY STATISTICS");
console.log("=".repeat(80));
console.log(`  Total runs: ${metrics.length}`);
console.log(`  Flagged: ${flagged.length}`);
console.log(`  Modal coalition shifts: ${shifted.length}`);
if (metrics.length > 0) {
  const nValues = [...new Set(metrics.map(m => m.N))];
  console.log(`  N values: ${nValues.join(", ")}`);
  const pmValues = metrics.map(m => m.pmS);
  console.log(`  PM(S) range: ${Math.min(...pmValues).toFixed(1)}% - ${Math.max(...pmValues).toFixed(1)}%`);
}
