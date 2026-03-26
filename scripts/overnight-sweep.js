#!/usr/bin/env node
// Overnight Sobol global sensitivity sweep
// Phase 1: Saltelli sampling for first-order + total-order indices (28 params)
// Phase 2: Pairwise interaction heatmaps for top interacting pairs
//
// Usage: node scripts/overnight-sweep.js [--cores 6] [--base-n 1024] [--sim-n 150]

const { Worker } = require("worker_threads");
const fs = require("fs");
const path = require("path");

// ── Configuration ──────────────────────────────────────────────────
const args = process.argv.slice(2);
function argVal(flag, def) {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : def;
}
const NUM_CORES = argVal("--cores", 6);
const BASE_N = argVal("--base-n", 1024);
const SIM_N = argVal("--sim-n", 200);
const PAIRWISE_GRID = 13;
const PAIRWISE_SIM_N = 400;
const BATCH_SIZE = 40;

const RESULTS_DIR = path.join(__dirname, "..", "results");
const RAW_FILE = path.join(RESULTS_DIR, "sweep-sobol-raw.jsonl");
const INDICES_FILE = path.join(RESULTS_DIR, "sweep-sobol-indices.json");
const PAIRWISE_FILE = path.join(RESULTS_DIR, "sweep-pairwise.jsonl");

// ── Parameter space (28 parameters) ───────────────────────────────
// Three categories: scenario, model assumptions, party-specific
const PARAMS = [
  // Scenario controls (user has political intuition)
  { name: "flexibility",          min: -0.3, max: 0.5,  cat: "scenario" },
  { name: "redPreference",        min: 0,    max: 1,    cat: "scenario" },
  { name: "viabilityThreshold",   min: 0.40, max: 0.85, cat: "scenario" },
  { name: "mElTolerate",          min: 0,    max: 0.75, cat: "scenario" },
  { name: "maxFormationRounds",   min: 1,    max: 4,    cat: "scenario", integer: true },

  // Model assumptions (structural choices)
  { name: "passageWeight",        min: 0.3,  max: 0.9,  cat: "model" },
  { name: "distPenalty",          min: 0.5,  max: 3.0,  cat: "model" },
  { name: "oppositionAbstention", min: 0.1,  max: 0.7,  cat: "model" },
  { name: "rescueBase",           min: 0.05, max: 0.30, cat: "model" },
  { name: "formateurPull",        min: 0.0,  max: 0.6,  cat: "model" },
  { name: "flexIncrement",        min: 0.0,  max: 0.15, cat: "model" },
  { name: "forstMinAcceptance",   min: 0.05, max: 0.40, cat: "model" },
  { name: "blueViabilityThreshold", min: 0.03, max: 0.25, cat: "model" },

  // Behavioral/empirical (EL-related)
  { name: "elInformalRate",       min: 0.2,  max: 0.7,  cat: "behavioral" },
  { name: "elCentristPenalty",    min: 0.02, max: 0.16, cat: "behavioral" },
  { name: "elForstBase",          min: 0.80, max: 0.98, cat: "behavioral" },
  { name: "parsimonySpread",      min: 0.3,  max: 1.5,  cat: "structural" },

  // Scenario probability
  { name: "mdfCooperationProb",  min: 0.0,  max: 0.30, cat: "scenario" },

  // Discrete
  { name: "mDemandGov",           min: 0,    max: 1,    cat: "scenario", boolean: true },

  // Party-specific relationships (gates coalition viability)
  { name: "rel_SF_M_inGov",      min: 0.40, max: 0.95, cat: "party", party: "SF", target: "M", key: "inGov", base: 0.72 },
  { name: "rel_M_SF_inGov",      min: 0.40, max: 0.90, cat: "party", party: "M",  target: "SF", key: "inGov", base: 0.68 },
  { name: "rel_S_RV_inGov",      min: 0.50, max: 1.00, cat: "party", party: "S",  target: "RV", key: "inGov", base: 0.88 },
  { name: "rel_V_M_inGov",       min: 0.50, max: 1.00, cat: "party", party: "V",  target: "M",  key: "inGov", base: 0.95 },
  { name: "rel_V_KF_inGov",      min: 0.30, max: 0.95, cat: "party", party: "V",  target: "KF", key: "inGov", base: 0.88 },
  { name: "rel_KF_V_inGov",      min: 0.30, max: 0.95, cat: "party", party: "KF", target: "V",  key: "inGov", base: 0.85 },
  { name: "rel_DF_V_asSupport",  min: 0.20, max: 0.95, cat: "party", party: "DF", target: "V",  key: "asSupport", base: 0.85 },
  { name: "harshness_SF",        min: 0.20, max: 0.80, cat: "party", party: "SF", harshness: true, base: 0.59 },
  { name: "harshness_M",         min: 0.10, max: 0.60, cat: "party", party: "M",  harshness: true, base: 0.24 },
  { name: "harshness_S",         min: 0.20, max: 0.70, cat: "party", party: "S",  harshness: true, base: 0.45 },
  { name: "harshness_V",         min: 0.20, max: 0.70, cat: "party", party: "V",  harshness: true, base: 0.40 },
  { name: "harshness_EL",        min: 0.30, max: 0.90, cat: "party", party: "EL", harshness: true, base: 0.72 },
];
const K = PARAMS.length;

const COALITIONS = [
  "S+M+RV+SF", "S+RV+SF", "S+M+SF", "S+M+RV", "S+SF", "V+KF+LA+M"
];

// ── Utility functions ──────────────────────────────────────────────
function unitToParam(unitVal, param) {
  if (param.boolean) return unitVal >= 0.5;
  const raw = param.min + unitVal * (param.max - param.min);
  return param.integer ? Math.round(raw) : +raw.toFixed(4);
}

function rowToSimParams(unitRow) {
  const cfg = {};
  const partyOverrides = []; // {party, target, key, value} or {party, harshness, value}

  for (let i = 0; i < K; i++) {
    const p = PARAMS[i];
    const val = unitToParam(unitRow[i], p);

    if (p.cat === "party" && p.key) {
      // Bilateral relationship override
      partyOverrides.push({ party: p.party, target: p.target, key: p.key, value: val });
    } else if (p.cat === "party" && p.harshness) {
      partyOverrides.push({ party: p.party, harshness: true, value: val });
    } else {
      cfg[p.name] = val;
    }
  }

  return { cfg, partyOverrides };
}

// Stratified random matrix generation
function generateMatrix(n, k) {
  const matrix = [];
  for (let i = 0; i < n; i++) {
    const row = [];
    for (let j = 0; j < k; j++) {
      row.push((i + Math.random()) / n);
    }
    matrix.push(row);
  }
  // Shuffle columns independently
  for (let j = 0; j < k; j++) {
    const colVals = matrix.map(row => row[j]);
    for (let i = colVals.length - 1; i > 0; i--) {
      const swap = Math.floor(Math.random() * (i + 1));
      [colVals[i], colVals[swap]] = [colVals[swap], colVals[i]];
    }
    for (let i = 0; i < matrix.length; i++) {
      matrix[i][j] = colVals[i];
    }
  }
  return matrix;
}

// Saltelli sampling (without BA matrices — saves K*N runs)
function generateSaltelliSamples(baseN, k) {
  const A = generateMatrix(baseN, k);
  const B = generateMatrix(baseN, k);
  const samples = [];
  let id = 0;

  // Matrix A
  for (let i = 0; i < baseN; i++) {
    samples.push({ id: id++, row: A[i], matrix: "A", rowIdx: i });
  }
  // Matrix B
  for (let i = 0; i < baseN; i++) {
    samples.push({ id: id++, row: B[i], matrix: "B", rowIdx: i });
  }
  // AB_i matrices: column i from B, rest from A
  for (let j = 0; j < k; j++) {
    for (let i = 0; i < baseN; i++) {
      const row = [...A[i]];
      row[j] = B[i][j];
      samples.push({ id: id++, row, matrix: `AB_${j}`, rowIdx: i, paramIdx: j });
    }
  }

  return { samples, A, B };
}

// ── Worker pool ────────────────────────────────────────────────────
class WorkerPool {
  constructor(numWorkers, workerPath) {
    this.workers = [];
    this.queue = [];
    this.pending = new Map();
    this.resolvers = new Map();
    this.nextId = 0;

    for (let i = 0; i < numWorkers; i++) {
      const w = new Worker(workerPath);
      w.on("message", (results) => {
        const batchId = this.pending.get(w);
        this.pending.delete(w);
        const resolve = this.resolvers.get(batchId);
        this.resolvers.delete(batchId);
        if (resolve) resolve(results);
        this._processQueue();
      });
      w.on("error", (err) => console.error("Worker error:", err.message));
      this.workers.push(w);
    }
  }

  submit(jobs) {
    return new Promise((resolve) => {
      const batchId = this.nextId++;
      this.resolvers.set(batchId, resolve);
      this.queue.push({ batchId, jobs });
      this._processQueue();
    });
  }

  _processQueue() {
    for (const w of this.workers) {
      if (this.pending.has(w) || this.queue.length === 0) continue;
      const { batchId, jobs } = this.queue.shift();
      this.pending.set(w, batchId);
      w.postMessage(jobs);
    }
  }

  async terminate() {
    for (const w of this.workers) await w.terminate();
  }
}

// ── Sobol index computation (Jansen estimator) ─────────────────────
function computeSobolIndices(fA, fB, fABs, baseN, k) {
  const allF = [...fA, ...fB];
  const mean = allF.reduce((s, v) => s + v, 0) / allF.length;
  const variance = allF.reduce((s, v) => s + (v - mean) ** 2, 0) / allF.length;

  if (variance < 0.01) {
    return { firstOrder: new Array(k).fill(0), totalOrder: new Array(k).fill(0), variance: 0, mean };
  }

  const firstOrder = [];
  const totalOrder = [];

  for (let j = 0; j < k; j++) {
    // First-order (Jansen): S_i = 1 - (1/2N) * Σ(f(B) - f(AB_i))² / Var(Y)
    let s1Sum = 0;
    for (let i = 0; i < baseN; i++) s1Sum += (fB[i] - fABs[j][i]) ** 2;
    firstOrder.push(Math.max(0, 1 - s1Sum / (2 * baseN * variance)));

    // Total-order (Jansen): ST_i = (1/2N) * Σ(f(A) - f(AB_i))² / Var(Y)
    let stSum = 0;
    for (let i = 0; i < baseN; i++) stSum += (fA[i] - fABs[j][i]) ** 2;
    totalOrder.push(Math.max(0, stSum / (2 * baseN * variance)));
  }

  return { firstOrder, totalOrder, variance, mean };
}

// ── Main ───────────────────────────────────────────────────────────
async function main() {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });

  // Without BA matrices: N*(K+2) runs
  const totalSamples = BASE_N * (K + 2);
  const estSeconds = totalSamples * 1.2 / NUM_CORES;
  console.log("=== Overnight Sobol Sensitivity Sweep ===");
  console.log(`Parameters: ${K} (${PARAMS.filter(p => p.cat === "scenario").length} scenario, ${PARAMS.filter(p => p.cat === "model" || p.cat === "structural").length} model, ${PARAMS.filter(p => p.cat === "behavioral").length} behavioral, ${PARAMS.filter(p => p.cat === "party").length} party-specific)`);
  console.log(`Base samples: ${BASE_N}`);
  console.log(`Total runs (Phase 1): ${totalSamples}`);
  console.log(`MC iterations per run: ${SIM_N}`);
  console.log(`Cores: ${NUM_CORES}`);
  console.log(`Estimated time: ~${Math.ceil(estSeconds / 60)} minutes`);
  console.log();

  // Phase 1: Generate samples
  console.log("Generating Saltelli samples...");
  const { samples, A, B } = generateSaltelliSamples(BASE_N, K);
  console.log(`  ${samples.length} parameter sets generated`);

  // Prepare jobs: convert each sample to simulation params
  const jobs = samples.map(s => {
    const { cfg, partyOverrides } = rowToSimParams(s.row);
    return { id: s.id, cfg, partyOverrides, N: SIM_N };
  });

  const pool = new WorkerPool(NUM_CORES, path.join(__dirname, "sweep-worker.js"));
  const rawStream = fs.createWriteStream(RAW_FILE);
  const allResults = new Map();
  let completed = 0;
  const startTime = Date.now();

  console.log("Running Phase 1 simulations...");

  // Batch and submit
  const batches = [];
  for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
    batches.push(jobs.slice(i, i + BATCH_SIZE));
  }

  const batchPromises = batches.map(async (batch) => {
    const results = await pool.submit(batch);
    for (const r of results) {
      allResults.set(r.id, r);
      rawStream.write(JSON.stringify({ id: r.id, coalitionPcts: r.coalitionPcts, noGov: r.noGov }) + "\n");
      completed++;
    }
    if (completed % 500 < BATCH_SIZE) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = completed / elapsed;
      const remaining = (samples.length - completed) / rate;
      process.stdout.write(`\r  ${completed}/${samples.length} (${rate.toFixed(1)}/s, ~${Math.ceil(remaining / 60)}m remaining)  `);
    }
  });

  await Promise.all(batchPromises);
  rawStream.end();

  const elapsed = (Date.now() - startTime) / 1000;
  console.log(`\n  Phase 1 complete: ${completed} runs in ${(elapsed / 60).toFixed(1)} minutes`);

  // Compute Sobol indices
  console.log("\nComputing Sobol indices...");
  const indices = {};

  for (const coalition of COALITIONS) {
    const fA = [], fB = [];
    const fABs = Array.from({ length: K }, () => []);

    for (let i = 0; i < BASE_N; i++) {
      const rA = allResults.get(i);
      fA.push(rA && rA.coalitionPcts ? (rA.coalitionPcts[coalition] || 0) : 0);
      const rB = allResults.get(BASE_N + i);
      fB.push(rB && rB.coalitionPcts ? (rB.coalitionPcts[coalition] || 0) : 0);

      for (let j = 0; j < K; j++) {
        const idx = 2 * BASE_N + j * BASE_N + i;
        const rAB = allResults.get(idx);
        fABs[j].push(rAB && rAB.coalitionPcts ? (rAB.coalitionPcts[coalition] || 0) : 0);
      }
    }

    indices[coalition] = computeSobolIndices(fA, fB, fABs, BASE_N, K);
    indices[coalition].paramNames = PARAMS.map(p => p.name);
  }

  // Print summary
  console.log("\n=== SOBOL SENSITIVITY INDICES ===\n");
  for (const coalition of COALITIONS) {
    const idx = indices[coalition];
    if (idx.variance < 0.5) { console.log(`${coalition}: variance too low (${idx.variance.toFixed(2)}), skipping`); continue; }

    const ranked = PARAMS.map((p, i) => ({
      name: p.name, cat: p.cat,
      S1: idx.firstOrder[i], ST: idx.totalOrder[i],
      interaction: Math.max(0, idx.totalOrder[i] - idx.firstOrder[i]),
    })).sort((a, b) => b.ST - a.ST);

    console.log(`${coalition} (mean: ${idx.mean.toFixed(1)}%, var: ${idx.variance.toFixed(1)}):`);
    for (const r of ranked.slice(0, 10)) {
      const bar = "█".repeat(Math.round(r.ST * 40));
      console.log(`  ${r.name.padEnd(28)} S1=${r.S1.toFixed(3)} ST=${r.ST.toFixed(3)} Δ=${r.interaction.toFixed(3)} ${bar}`);
    }
    console.log();
  }

  // Top interaction parameters (across all coalitions)
  console.log("=== TOP INTERACTION CONTRIBUTIONS (ST - S1 summed across coalitions) ===\n");
  const interactionScores = PARAMS.map((p, i) => {
    let total = 0;
    for (const c of COALITIONS) {
      if (indices[c].variance < 0.5) continue;
      total += Math.max(0, indices[c].totalOrder[i] - indices[c].firstOrder[i]);
    }
    return { name: p.name, idx: i, total, cat: p.cat };
  }).sort((a, b) => b.total - a.total);

  for (const p of interactionScores.slice(0, 12)) {
    console.log(`  ${p.name.padEnd(28)} interaction: ${p.total.toFixed(3)}  [${p.cat}]`);
  }

  fs.writeFileSync(INDICES_FILE, JSON.stringify({ params: PARAMS.map(p => p.name), coalitions: COALITIONS, indices }, null, 2));
  console.log(`\nIndices saved to ${INDICES_FILE}`);

  // Phase 2: Pairwise heatmaps for top interacting pairs.
  // Rank ALL pairs by the product of their individual interaction scores
  // (proxy for pairwise interaction strength without second-order indices).
  const topInteracting = interactionScores.filter(p => p.total > 0.01);
  const allPairs = [];
  for (let a = 0; a < topInteracting.length; a++) {
    for (let b = a + 1; b < topInteracting.length; b++) {
      allPairs.push({
        pair: [topInteracting[a].idx, topInteracting[b].idx],
        score: topInteracting[a].total * topInteracting[b].total,
        names: `${topInteracting[a].name} × ${topInteracting[b].name}`,
      });
    }
  }
  allPairs.sort((a, b) => b.score - a.score);
  const selectedPairs = allPairs.slice(0, 8).map(p => p.pair);
  console.log("\nPhase 2 pair selection:");
  for (const p of allPairs.slice(0, 8)) {
    console.log(`  ${p.names.padEnd(55)} score: ${p.score.toFixed(4)}`);
  }

  if (selectedPairs.length > 0) {
    const totalPairRuns = selectedPairs.length * PAIRWISE_GRID * PAIRWISE_GRID;
    console.log(`\nPhase 2: Pairwise heatmaps for ${selectedPairs.length} pairs (${totalPairRuns} runs)...`);
    const pairwiseStream = fs.createWriteStream(PAIRWISE_FILE);
    let pairCompleted = 0;

    for (const [pi, pj] of selectedPairs) {
      const pairJobs = [];
      for (let gi = 0; gi < PAIRWISE_GRID; gi++) {
        for (let gj = 0; gj < PAIRWISE_GRID; gj++) {
          const row = PARAMS.map((p, idx) => {
            if (idx === pi) return (gi + 0.5) / PAIRWISE_GRID;
            if (idx === pj) return (gj + 0.5) / PAIRWISE_GRID;
            if (p.boolean) return 0.75;
            // Default to CI midpoint (unit 0.5)
            return 0.5;
          });
          const { cfg, partyOverrides } = rowToSimParams(row);
          pairJobs.push({
            id: 200000 + pairCompleted + gi * PAIRWISE_GRID + gj,
            cfg, partyOverrides, N: PAIRWISE_SIM_N,
            meta: {
              pair: `${PARAMS[pi].name}__${PARAMS[pj].name}`,
              valI: unitToParam(row[pi], PARAMS[pi]),
              valJ: unitToParam(row[pj], PARAMS[pj]),
            }
          });
        }
      }

      const pairBatches = [];
      for (let i = 0; i < pairJobs.length; i += BATCH_SIZE) {
        pairBatches.push(pairJobs.slice(i, i + BATCH_SIZE));
      }

      for (const batch of pairBatches) {
        const results = await pool.submit(batch);
        for (const r of results) {
          const job = pairJobs.find(j => j.id === r.id);
          pairwiseStream.write(JSON.stringify({
            pair: job.meta.pair,
            [PARAMS[pi].name]: job.meta.valI,
            [PARAMS[pj].name]: job.meta.valJ,
            ...r.coalitionPcts,
          }) + "\n");
        }
        pairCompleted += batch.length;
        process.stdout.write(`\r  Phase 2: ${pairCompleted}/${totalPairRuns}  `);
      }
    }
    pairwiseStream.end();
    console.log(`\n  Pairwise data saved to ${PAIRWISE_FILE}`);
  }

  await pool.terminate();
  const totalElapsed = (Date.now() - startTime) / 1000;
  console.log(`\n=== Sweep complete: ${Math.floor(totalElapsed / 60)}m ${Math.floor(totalElapsed % 60)}s ===`);
}

main().catch(err => { console.error("Sweep failed:", err); process.exit(1); });
