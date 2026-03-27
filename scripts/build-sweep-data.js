#!/usr/bin/env node
/**
 * build-sweep-data.js
 *
 * Converts overnight exploration JSONL data into the JSON format
 * the dashboard's "Hvad paavirker resultatet?" tab expects.
 *
 * Reads:
 *   results/exploration/bilateral-1d-sweeps.jsonl
 *   results/exploration/highres-1d-sweeps.jsonl
 *   results/exploration/policy-position-sweeps.jsonl
 *   results/exploration/dyadic-interactions.jsonl
 *
 * Writes:
 *   sweep-results/1d-sweeps.json    -> { sweeps: { paramName: { points: [...] } } }
 *   sweep-results/2d-heatmaps.json  -> { heatmaps: { pairName: { xValues, yValues, data } } }
 *   sweep-results/scenarios.json    -> { scenarios: {} }
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const EXPLORATION_DIR = path.join(ROOT, "results", "exploration");
const OUTPUT_DIR = path.join(ROOT, "sweep-results");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readJSONL(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

const RESERVED_KEYS = new Set(["param", "value", "pair", "valA", "valB", "noGov"]);

/** Extract coalition name -> pct entries from a raw JSONL row. */
function extractCoalitions(row) {
  const coalitions = [];
  for (const key of Object.keys(row)) {
    if (RESERVED_KEYS.has(key)) continue;
    coalitions.push({ govt: key, pct: Number(row[key]) || 0 });
  }
  // Sort descending by pct so topFive is ordered
  coalitions.sort((a, b) => b.pct - a.pct);
  return coalitions;
}

/** Convert a raw JSONL point into the dashboard's sweep-point format. */
function toSweepPoint(row) {
  const topFive = extractCoalitions(row);
  const top = topFive[0] || { govt: "", pct: 0 };

  // Derive M-in-government percentage: sum of coalitions containing "+M" or starting with "M+"
  let mInGov = 0;
  for (const c of topFive) {
    if (
      c.govt.includes("+M+") ||
      c.govt.includes("+M") ||
      c.govt.startsWith("M+") ||
      c.govt === "M"
    ) {
      // More precise: split on "+" and check for "M"
      const parties = c.govt.split("+");
      if (parties.includes("M")) {
        mInGov += c.pct;
      }
    }
  }

  // Derive pmS: percentage where S is PM (coalitions starting with "S+")
  let pmS = 0;
  let pmV = 0;
  let pmM = 0;
  for (const c of topFive) {
    const parties = c.govt.split("+");
    const lead = parties[0];
    if (lead === "S") pmS += c.pct;
    else if (lead === "V") pmV += c.pct;
    else if (lead === "M") pmM += c.pct;
  }

  return {
    value: Number(row.value),
    pmS: round2(pmS),
    pmV: round2(pmV),
    pmM: round2(pmM),
    topCoalition: top.govt,
    topPct: round2(top.pct),
    mInGov: round2(mInGov),
    noGov: Number(row.noGov) || 0,
    topFive: topFive.map((c) => ({ govt: c.govt, pct: round2(c.pct) })),
  };
}

function round2(x) {
  return Math.round(x * 100) / 100;
}

/** Average replicated observations at the same (param, value). */
function averageReplicates(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.param}|${row.value}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const averaged = [];
  for (const [, group] of groups) {
    if (group.length === 1) {
      averaged.push(group[0]);
      continue;
    }
    // Average all numeric fields
    const base = { param: group[0].param, value: group[0].value };
    const numericKeys = Object.keys(group[0]).filter(
      (k) => k !== "param" && typeof group[0][k] === "number"
    );
    for (const k of numericKeys) {
      const sum = group.reduce((s, r) => s + (Number(r[k]) || 0), 0);
      base[k] = round2(sum / group.length);
    }
    averaged.push(base);
  }
  return averaged;
}

// ---------------------------------------------------------------------------
// Build 1D sweeps
// ---------------------------------------------------------------------------

function build1DSweeps() {
  const bilateral = readJSONL(
    path.join(EXPLORATION_DIR, "bilateral-1d-sweeps.jsonl")
  );
  const highres = readJSONL(
    path.join(EXPLORATION_DIR, "highres-1d-sweeps.jsonl")
  );
  const policy = readJSONL(
    path.join(EXPLORATION_DIR, "policy-position-sweeps.jsonl")
  );

  const allRows = averageReplicates([...bilateral, ...highres, ...policy]);

  // Group by param
  const byParam = new Map();
  for (const row of allRows) {
    if (!byParam.has(row.param)) byParam.set(row.param, []);
    byParam.get(row.param).push(row);
  }

  const sweeps = {};
  for (const [paramName, rows] of byParam) {
    // Sort by value
    rows.sort((a, b) => a.value - b.value);
    sweeps[paramName] = {
      points: rows.map(toSweepPoint),
    };
  }

  return sweeps;
}

// ---------------------------------------------------------------------------
// Build 2D heatmaps
// ---------------------------------------------------------------------------

function build2DHeatmaps() {
  const rows = readJSONL(
    path.join(EXPLORATION_DIR, "dyadic-interactions.jsonl")
  );

  // Group by pair
  const byPair = new Map();
  for (const row of rows) {
    if (!byPair.has(row.pair)) byPair.set(row.pair, []);
    byPair.get(row.pair).push(row);
  }

  const heatmaps = {};
  for (const [pairName, pairRows] of byPair) {
    const xVals = [...new Set(pairRows.map((r) => r.valA))].sort(
      (a, b) => a - b
    );
    const yVals = [...new Set(pairRows.map((r) => r.valB))].sort(
      (a, b) => a - b
    );

    // Build lookup: (valA, valB) -> row
    const lookup = new Map();
    for (const row of pairRows) {
      lookup.set(`${row.valA}|${row.valB}`, row);
    }

    // data[xIdx][yIdx] = cell
    // The dashboard iterates data as data[col][row] where col = x index
    const data = xVals.map((xVal) =>
      yVals.map((yVal) => {
        const row = lookup.get(`${xVal}|${yVal}`);
        if (!row) {
          return {
            topCoalition: "",
            topPct: 0,
            noGov: 0,
            topFive: [],
          };
        }
        const topFive = extractCoalitions(row);
        const top = topFive[0] || { govt: "", pct: 0 };
        return {
          topCoalition: top.govt,
          topPct: round2(top.pct),
          noGov: Number(row.noGov) || 0,
          topFive: topFive.map((c) => ({ govt: c.govt, pct: round2(c.pct) })),
        };
      })
    );

    heatmaps[pairName] = {
      xValues: xVals,
      yValues: yVals,
      data,
    };
  }

  return heatmaps;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log("Created", OUTPUT_DIR);
  }

  console.log("Building 1D sweeps...");
  const sweeps = build1DSweeps();
  const paramNames = Object.keys(sweeps);
  const totalPoints = paramNames.reduce(
    (s, k) => s + sweeps[k].points.length,
    0
  );
  console.log(
    `  ${paramNames.length} parameters, ${totalPoints} total points`
  );

  console.log("Building 2D heatmaps...");
  const heatmaps = build2DHeatmaps();
  const pairNames = Object.keys(heatmaps);
  console.log(`  ${pairNames.length} interaction pairs`);

  // Write files in the format the dashboard fetch expects:
  //   oneD  -> { sweeps: {...} }     accessed as oneD.sweeps
  //   twoD  -> { heatmaps: {...} }   accessed as twoD.heatmaps
  //   scen  -> { scenarios: {...} }   accessed as scenarios.scenarios
  const oneDPath = path.join(OUTPUT_DIR, "1d-sweeps.json");
  fs.writeFileSync(oneDPath, JSON.stringify({ sweeps }, null, 2));
  console.log(`Wrote ${oneDPath}`);

  const twoDPath = path.join(OUTPUT_DIR, "2d-heatmaps.json");
  fs.writeFileSync(twoDPath, JSON.stringify({ heatmaps }, null, 2));
  console.log(`Wrote ${twoDPath}`);

  const scenPath = path.join(OUTPUT_DIR, "scenarios.json");
  fs.writeFileSync(scenPath, JSON.stringify({ scenarios: {} }, null, 2));
  console.log(`Wrote ${scenPath}`);

  // Validate: read back and check JSON parses
  JSON.parse(fs.readFileSync(oneDPath, "utf8"));
  JSON.parse(fs.readFileSync(twoDPath, "utf8"));
  JSON.parse(fs.readFileSync(scenPath, "utf8"));
  console.log("All output files are valid JSON.");
}

main();
