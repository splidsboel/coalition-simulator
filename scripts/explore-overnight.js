#!/usr/bin/env node
// Autonomous overnight exploration — focused on party-specific parameters.
// These are the values that will shift during negotiations in the coming days:
// bilateral relationship values (inGov, tolerateInGov, asSupport) and harshness.
//
// Waits for the main Sobol sweep to complete, then runs until 9 AM Copenhagen.

const { Worker } = require("worker_threads");
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const NUM_CORES = (() => { const i = args.indexOf("--cores"); return i >= 0 ? Number(args[i+1]) : 6; })();

const RESULTS_DIR = path.join(__dirname, "..", "results");
const INDICES_FILE = path.join(RESULTS_DIR, "sweep-sobol-indices.json");
const EXPLORE_DIR = path.join(RESULTS_DIR, "exploration");
const LOG_FILE = path.join(EXPLORE_DIR, "exploration-log.md");

const COALITIONS = ["S+M+RV+SF", "S+RV+SF", "S+M+SF", "S+M+RV", "S+SF", "V+KF+LA+M"];

function shouldStop() {
  const now = new Date();
  const cph = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Copenhagen" }));
  return cph.getHours() >= 9;
}

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  const line = `[${ts}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + "\n");
}

// ── Worker pool ────────────────────────────────────────────────────
class WorkerPool {
  constructor(n, workerPath) {
    this.workers = []; this.queue = []; this.pending = new Map(); this.resolvers = new Map(); this.nextId = 0;
    for (let i = 0; i < n; i++) {
      const w = new Worker(workerPath);
      w.on("message", (results) => {
        const batchId = this.pending.get(w); this.pending.delete(w);
        const resolve = this.resolvers.get(batchId); this.resolvers.delete(batchId);
        if (resolve) resolve(results); this._processQueue();
      });
      w.on("error", (err) => console.error("Worker error:", err.message));
      this.workers.push(w);
    }
  }
  submit(jobs) { return new Promise((resolve) => { const id = this.nextId++; this.resolvers.set(id, resolve); this.queue.push({ batchId: id, jobs }); this._processQueue(); }); }
  _processQueue() { for (const w of this.workers) { if (this.pending.has(w) || this.queue.length === 0) continue; const { batchId, jobs } = this.queue.shift(); this.pending.set(w, batchId); w.postMessage(jobs); } }
  async terminate() { for (const w of this.workers) await w.terminate(); }
}

async function runBatch(pool, paramSets, simN) {
  const jobs = paramSets.map((p, i) => ({ id: i, cfg: p.cfg || {}, partyOverrides: p.partyOverrides || [], N: simN }));
  const batches = [];
  for (let i = 0; i < jobs.length; i += 40) batches.push(jobs.slice(i, i + 40));
  const results = [];
  for (const batch of batches) { const r = await pool.submit(batch); results.push(...r); }
  return results;
}

// ── Bilateral relationships to explore ─────────────────────────────
// These are the dyadic values most likely to shift during negotiations.
// Organized by which coalition dynamics they affect.

const BILATERAL_SWEEPS = [
  // Central coalition gating: S+M+RV+SF
  { from: "SF", to: "M", key: "inGov", current: 0.72, min: 0.20, max: 0.98, label: "SF accepts M in govt" },
  { from: "M", to: "SF", key: "inGov", current: 0.68, min: 0.20, max: 0.95, label: "M accepts SF in govt" },
  { from: "SF", to: "M", key: "tolerateInGov", current: 0.65, min: 0.10, max: 0.95, label: "SF tolerates M from outside" },
  { from: "M", to: "SF", key: "tolerateInGov", current: 0.80, min: 0.20, max: 0.98, label: "M tolerates SF from outside" },

  // EL support channel
  { from: "M", to: "EL", key: "tolerateInGov", current: 0.35, min: 0.00, max: 0.80, label: "M tolerates EL as support" },
  { from: "EL", to: "M", key: "tolerateInGov", current: 0.62, min: 0.10, max: 0.90, label: "EL tolerates M in govt" },
  { from: "S", to: "EL", key: "tolerateInGov", current: 0.75, min: 0.30, max: 0.95, label: "S tolerates EL as support" },
  { from: "RV", to: "EL", key: "tolerateInGov", current: 0.84, min: 0.30, max: 0.98, label: "RV tolerates EL as support" },
  { from: "SF", to: "EL", key: "tolerateInGov", current: 0.78, min: 0.30, max: 0.98, label: "SF tolerates EL as support" },

  // RV positioning
  { from: "RV", to: "M", key: "inGov", current: 0.84, min: 0.30, max: 0.98, label: "RV accepts M in govt" },
  { from: "M", to: "RV", key: "inGov", current: 0.88, min: 0.40, max: 0.98, label: "M accepts RV in govt" },
  { from: "S", to: "RV", key: "inGov", current: 0.88, min: 0.40, max: 1.00, label: "S accepts RV in govt" },

  // Cross-bloc openness
  { from: "S", to: "V", key: "inGov", current: 0.25, min: 0.00, max: 0.60, label: "S accepts V in govt" },
  { from: "KF", to: "S", key: "inGov", current: 0.38, min: 0.05, max: 0.70, label: "KF accepts S in govt" },
  { from: "KF", to: "S", key: "tolerateInGov", current: 0.72, min: 0.20, max: 0.95, label: "KF tolerates S in govt" },

  // Blue bloc dynamics
  { from: "DF", to: "M", key: "tolerateInGov", current: 0.10, min: 0.00, max: 0.50, label: "DF tolerates M" },
  { from: "DF", to: "V", key: "asSupport", current: 0.85, min: 0.30, max: 0.98, label: "DF supports V-led govt" },
  { from: "V", to: "KF", key: "inGov", current: 0.88, min: 0.40, max: 0.98, label: "V accepts KF in govt" },
  { from: "V", to: "M", key: "inGov", current: 0.95, min: 0.40, max: 1.00, label: "V accepts M in govt" },

  // EL's red lines toward specific parties
  { from: "EL", to: "M", key: "inGov", current: 0.08, min: 0.00, max: 0.40, label: "EL accepts M in govt" },
  { from: "EL", to: "RV", key: "tolerateInGov", current: 0.55, min: 0.10, max: 0.85, label: "EL tolerates RV in govt" },

  // Harshness (negotiation rigidity)
  { harshness: "S", current: 0.45, min: 0.15, max: 0.80, label: "S negotiation harshness" },
  { harshness: "SF", current: 0.59, min: 0.20, max: 0.85, label: "SF negotiation harshness" },
  { harshness: "M", current: 0.24, min: 0.05, max: 0.65, label: "M negotiation harshness" },
  { harshness: "RV", current: 0.42, min: 0.15, max: 0.75, label: "RV negotiation harshness" },
  { harshness: "EL", current: 0.72, min: 0.30, max: 0.95, label: "EL negotiation harshness" },
  { harshness: "V", current: 0.40, min: 0.15, max: 0.75, label: "V negotiation harshness" },
  { harshness: "KF", current: 0.35, min: 0.10, max: 0.70, label: "KF negotiation harshness" },
  { harshness: "DF", current: 0.78, min: 0.40, max: 0.98, label: "DF negotiation harshness" },
];

// Interesting dyad PAIRS for 2D heatmaps
const DYAD_INTERACTIONS = [
  // The central tradeoff: SF-M acceptance × M-EL tolerance
  { a: { from: "SF", to: "M", key: "inGov", min: 0.20, max: 0.98 },
    b: { from: "M", to: "EL", key: "tolerateInGov", min: 0.00, max: 0.80 },
    label: "SF→M inGov × M→EL tolerance" },
  // SF-M bilateral: both directions
  { a: { from: "SF", to: "M", key: "inGov", min: 0.20, max: 0.98 },
    b: { from: "M", to: "SF", key: "inGov", min: 0.20, max: 0.95 },
    label: "SF→M inGov × M→SF inGov" },
  // M-EL tolerance × EL-M tolerance (forståelsespapir from both sides)
  { a: { from: "M", to: "EL", key: "tolerateInGov", min: 0.00, max: 0.80 },
    b: { from: "EL", to: "M", key: "tolerateInGov", min: 0.10, max: 0.90 },
    label: "M→EL tolerance × EL→M tolerance" },
  // SF-M inGov × RV-M inGov (do both centrist partners accept M?)
  { a: { from: "SF", to: "M", key: "inGov", min: 0.20, max: 0.98 },
    b: { from: "RV", to: "M", key: "inGov", min: 0.30, max: 0.98 },
    label: "SF→M inGov × RV→M inGov" },
  // SF→M inGov × SF harshness (acceptance × rigidity interaction)
  { a: { from: "SF", to: "M", key: "inGov", min: 0.20, max: 0.98 },
    b: { harshness: "SF", min: 0.20, max: 0.85 },
    label: "SF→M inGov × SF harshness" },
  // DF→M tolerance × DF→V support (blue bloc coherence)
  { a: { from: "DF", to: "M", key: "tolerateInGov", min: 0.00, max: 0.50 },
    b: { from: "DF", to: "V", key: "asSupport", min: 0.30, max: 0.98 },
    label: "DF→M tolerance × DF→V support" },
  // S→V inGov × KF→S inGov (cross-bloc openness from both sides)
  { a: { from: "S", to: "V", key: "inGov", min: 0.00, max: 0.60 },
    b: { from: "KF", to: "S", key: "inGov", min: 0.05, max: 0.70 },
    label: "S→V inGov × KF→S inGov" },
  // EL→M tolerateInGov × EL harshness
  { a: { from: "EL", to: "M", key: "tolerateInGov", min: 0.10, max: 0.90 },
    b: { harshness: "EL", min: 0.30, max: 0.95 },
    label: "EL→M tolerance × EL harshness" },
  // M→EL tolerance × S→EL tolerance (both govt parties gating the forst)
  { a: { from: "M", to: "EL", key: "tolerateInGov", min: 0.00, max: 0.80 },
    b: { from: "S", to: "EL", key: "tolerateInGov", min: 0.30, max: 0.95 },
    label: "M→EL tolerance × S→EL tolerance" },
  // RV→M inGov × M→EL tolerance (can the broad coalition hold together?)
  { a: { from: "RV", to: "M", key: "inGov", min: 0.30, max: 0.98 },
    b: { from: "M", to: "EL", key: "tolerateInGov", min: 0.00, max: 0.80 },
    label: "RV→M inGov × M→EL tolerance" },
];

// ── Exploration modules ────────────────────────────────────────────

// Module 1: High-res 1D sweeps for all bilateral relationships
async function explore1DBilateral(pool) {
  log("=== Module 1: High-resolution bilateral 1D sweeps ===");
  const SIM_N = 500;
  const GRID = 25;

  const outFile = path.join(EXPLORE_DIR, "bilateral-1d-sweeps.jsonl");
  const stream = fs.createWriteStream(outFile);

  for (const rel of BILATERAL_SWEEPS) {
    if (shouldStop()) break;
    const label = rel.label;
    log(`  ${label} [${rel.min}, ${rel.max}]`);

    const paramSets = [];
    for (let g = 0; g < GRID; g++) {
      const val = +(rel.min + (g + 0.5) / GRID * (rel.max - rel.min)).toFixed(4);
      if (rel.harshness) {
        paramSets.push({ cfg: {}, partyOverrides: [{ party: rel.harshness, harshness: true, value: val }] });
      } else {
        paramSets.push({ cfg: {}, partyOverrides: [{ party: rel.from, target: rel.to, key: rel.key, value: val }] });
      }
    }

    const results = await runBatch(pool, paramSets, SIM_N);
    for (const r of results) {
      const val = rel.harshness
        ? paramSets[r.id].partyOverrides[0].value
        : paramSets[r.id].partyOverrides[0].value;
      stream.write(JSON.stringify({
        param: label,
        value: val,
        ...r.coalitionPcts,
        noGov: r.noGov
      }) + "\n");
    }

    // Quick summary
    const sorted = results.sort((a, b) => {
      const va = paramSets[a.id].partyOverrides[0].value;
      const vb = paramSets[b.id].partyOverrides[0].value;
      return va - vb;
    });
    const first = sorted[0].coalitionPcts["S+M+RV+SF"] || 0;
    const last = sorted[sorted.length - 1].coalitionPcts["S+M+RV+SF"] || 0;
    const delta = Math.abs(last - first);
    log(`    S+M+RV+SF: ${first.toFixed(1)}% → ${last.toFixed(1)}% (Δ${delta.toFixed(1)}pp)${delta > 10 ? " ★" : ""}`);
  }
  stream.end();
  log(`Saved to ${outFile} (${BILATERAL_SWEEPS.length} parameters × ${GRID} points)`);
}

// Module 2: 2D dyadic interaction heatmaps
async function explore2DDyadic(pool) {
  log("\n=== Module 2: Dyadic interaction heatmaps ===");
  const SIM_N = 400;
  const GRID = 15;

  const outFile = path.join(EXPLORE_DIR, "dyadic-interactions.jsonl");
  const stream = fs.createWriteStream(outFile);

  for (const pair of DYAD_INTERACTIONS) {
    if (shouldStop()) break;
    log(`  ${pair.label}`);

    const paramSets = [];
    for (let gi = 0; gi < GRID; gi++) {
      for (let gj = 0; gj < GRID; gj++) {
        const valA = +(pair.a.min + (gi + 0.5) / GRID * (pair.a.max - pair.a.min)).toFixed(4);
        const valB = +(pair.b.min + (gj + 0.5) / GRID * (pair.b.max - pair.b.min)).toFixed(4);
        const overrides = [];
        if (pair.a.harshness) overrides.push({ party: pair.a.harshness, harshness: true, value: valA });
        else overrides.push({ party: pair.a.from, target: pair.a.to, key: pair.a.key, value: valA });
        if (pair.b.harshness) overrides.push({ party: pair.b.harshness, harshness: true, value: valB });
        else overrides.push({ party: pair.b.from, target: pair.b.to, key: pair.b.key, value: valB });
        paramSets.push({ cfg: {}, partyOverrides: overrides, _valA: valA, _valB: valB });
      }
    }

    const results = await runBatch(pool, paramSets, SIM_N);
    for (const r of results) {
      stream.write(JSON.stringify({
        pair: pair.label,
        valA: paramSets[r.id]._valA,
        valB: paramSets[r.id]._valB,
        ...r.coalitionPcts,
        noGov: r.noGov
      }) + "\n");
    }

    // Interaction check: compare corners
    const corners = {
      ll: results.find(r => paramSets[r.id]._valA === paramSets[0]._valA && paramSets[r.id]._valB === paramSets[0]._valB),
      lh: results.find(r => paramSets[r.id]._valA === paramSets[0]._valA && paramSets[r.id]._valB === paramSets[paramSets.length-1]._valB),
      hl: results.find(r => paramSets[r.id]._valA === paramSets[paramSets.length-1]._valA && paramSets[r.id]._valB === paramSets[0]._valB),
      hh: results.find(r => paramSets[r.id]._valA === paramSets[paramSets.length-1]._valA && paramSets[r.id]._valB === paramSets[paramSets.length-1]._valB),
    };
    if (corners.ll && corners.hh) {
      const c = "S+M+RV+SF";
      const ll = corners.ll.coalitionPcts[c] || 0;
      const hh = corners.hh.coalitionPcts[c] || 0;
      log(`    ${c}: (low,low)=${ll.toFixed(0)}% → (high,high)=${hh.toFixed(0)}%`);
    }
  }
  stream.end();
  log(`Saved to ${outFile} (${DYAD_INTERACTIONS.length} pairs × ${GRID}×${GRID} grid)`);
}

// Module 3: High-res 1D sweeps for top Sobol parameters
async function exploreHighRes1D(pool) {
  log("\n=== Module 3: High-resolution 1D sweeps (top Sobol params) ===");
  const SIM_N = 500;
  const GRID = 30;

  const sobol = JSON.parse(fs.readFileSync(INDICES_FILE, "utf8"));
  const rankings = sobol.params.map((name, i) => {
    let totalST = 0;
    for (const c of COALITIONS) {
      if (!sobol.indices[c] || sobol.indices[c].variance < 0.5) continue;
      totalST += sobol.indices[c].totalOrder[i];
    }
    return { name, idx: i, totalST };
  }).sort((a, b) => b.totalST - a.totalST);

  const top6 = rankings.slice(0, 6);
  log(`Top 6 Sobol params: ${top6.map(p => `${p.name}(ST=${p.totalST.toFixed(2)})`).join(", ")}`);

  // Use broad ranges from the sweep design
  const PARAM_RANGES = {
    flexibility: [-0.3, 0.5], redPreference: [0, 1], viabilityThreshold: [0.40, 0.85],
    mElTolerate: [0, 0.75], maxFormationRounds: [1, 4], passageWeight: [0.3, 0.9],
    distPenalty: [0.5, 3.0], oppositionAbstention: [0.1, 0.7], rescueBase: [0.05, 0.30],
    formateurPull: [0.0, 0.6], flexIncrement: [0.0, 0.15], forstMinAcceptance: [0.05, 0.40],
    blueViabilityThreshold: [0.03, 0.25], elInformalRate: [0.2, 0.7], elCentristPenalty: [0.02, 0.16],
    elForstBase: [0.80, 0.98], parsimonySpread: [0.3, 1.5], mdfCooperationProb: [0.0, 0.30],
  };

  const outFile = path.join(EXPLORE_DIR, "highres-1d-sweeps.jsonl");
  const stream = fs.createWriteStream(outFile);

  for (const param of top6) {
    if (shouldStop()) break;
    const range = PARAM_RANGES[param.name];
    if (!range) { log(`  Skipping ${param.name} (party-specific, handled in Module 1)`); continue; }

    log(`  ${param.name} [${range[0]}, ${range[1]}]`);
    const paramSets = [];
    const isInt = param.name === "maxFormationRounds";
    for (let g = 0; g < GRID; g++) {
      const val = range[0] + (g + 0.5) / GRID * (range[1] - range[0]);
      const cfg = {};
      cfg[param.name] = isInt ? Math.round(val) : +val.toFixed(4);
      paramSets.push({ cfg });
    }

    const results = await runBatch(pool, paramSets, SIM_N);
    for (const r of results) {
      stream.write(JSON.stringify({ param: param.name, value: paramSets[r.id].cfg[param.name], ...r.coalitionPcts, noGov: r.noGov }) + "\n");
    }
  }
  stream.end();
  log(`Saved to ${outFile}`);
}

// Module 4: Three-way interaction probes (top Sobol interacting × top bilateral)
async function exploreThreeWay(pool) {
  log("\n=== Module 4: Three-way probes (Sobol × bilateral) ===");
  const SIM_N = 300;
  const GRID = 7;

  const sobol = JSON.parse(fs.readFileSync(INDICES_FILE, "utf8"));
  const byInteraction = sobol.params.map((name, i) => {
    let totalInt = 0;
    for (const c of COALITIONS) {
      if (!sobol.indices[c] || sobol.indices[c].variance < 0.5) continue;
      totalInt += Math.max(0, sobol.indices[c].totalOrder[i] - sobol.indices[c].firstOrder[i]);
    }
    return { name, idx: i, totalInt };
  }).sort((a, b) => b.totalInt - a.totalInt);

  const top3 = byInteraction.slice(0, 3);
  log(`Top 3 interacting: ${top3.map(p => p.name).join(", ")}`);

  // Combine with the 3 most important bilateral relationships
  const topBilateral = [
    { from: "SF", to: "M", key: "inGov", min: 0.20, max: 0.98, label: "SF→M" },
    { from: "M", to: "EL", key: "tolerateInGov", min: 0.00, max: 0.80, label: "M→EL" },
    { from: "EL", to: "M", key: "tolerateInGov", min: 0.10, max: 0.90, label: "EL→M" },
  ];

  const PARAM_RANGES = {
    flexibility: [-0.3, 0.5], redPreference: [0, 1], viabilityThreshold: [0.40, 0.85],
    mElTolerate: [0, 0.75], passageWeight: [0.3, 0.9], distPenalty: [0.5, 3.0],
    oppositionAbstention: [0.1, 0.7], rescueBase: [0.05, 0.30],
  };

  const outFile = path.join(EXPLORE_DIR, "three-way-probes.jsonl");
  const stream = fs.createWriteStream(outFile);

  // For each top Sobol param × each top bilateral, do a 2D sweep
  for (const sobolParam of top3) {
    for (const bil of topBilateral) {
      if (shouldStop()) break;
      const range = PARAM_RANGES[sobolParam.name];
      if (!range) continue;

      log(`  ${sobolParam.name} × ${bil.label}`);
      const paramSets = [];
      for (let gi = 0; gi < GRID; gi++) {
        for (let gj = 0; gj < GRID; gj++) {
          const cfgVal = range[0] + (gi + 0.5) / GRID * (range[1] - range[0]);
          const bilVal = +(bil.min + (gj + 0.5) / GRID * (bil.max - bil.min)).toFixed(4);
          const cfg = {};
          cfg[sobolParam.name] = +cfgVal.toFixed(4);
          paramSets.push({
            cfg,
            partyOverrides: [{ party: bil.from, target: bil.to, key: bil.key, value: bilVal }],
            _cfgVal: +cfgVal.toFixed(4),
            _bilVal: bilVal,
          });
        }
      }

      const results = await runBatch(pool, paramSets, SIM_N);
      for (const r of results) {
        stream.write(JSON.stringify({
          probe: `${sobolParam.name}__${bil.label}`,
          [sobolParam.name]: paramSets[r.id]._cfgVal,
          bilateral: paramSets[r.id]._bilVal,
          ...r.coalitionPcts,
          noGov: r.noGov
        }) + "\n");
      }
    }
  }
  stream.end();
  log(`Saved to ${outFile}`);
}

// Module 5: Extreme scenario hunting (random full-space sampling)
async function exploreExtremes(pool) {
  log("\n=== Module 5: Extreme scenario hunting ===");
  const SIM_N = 300;
  const N_SAMPLES = 3000;

  const paramSets = [];
  for (let i = 0; i < N_SAMPLES; i++) {
    const cfg = {
      passageWeight: 0.3 + Math.random() * 0.6,
      redPreference: Math.random(),
      viabilityThreshold: 0.4 + Math.random() * 0.45,
      mElTolerate: Math.random() * 0.75,
      distPenalty: 0.5 + Math.random() * 2.5,
      oppositionAbstention: 0.1 + Math.random() * 0.6,
      rescueBase: 0.05 + Math.random() * 0.25,
    };
    // Random bilateral perturbations
    const overrides = [];
    // SF→M inGov
    overrides.push({ party: "SF", target: "M", key: "inGov", value: +(0.2 + Math.random() * 0.78).toFixed(3) });
    // M→EL tolerateInGov
    overrides.push({ party: "M", target: "EL", key: "tolerateInGov", value: +(Math.random() * 0.8).toFixed(3) });
    // EL→M tolerateInGov
    overrides.push({ party: "EL", target: "M", key: "tolerateInGov", value: +(0.1 + Math.random() * 0.8).toFixed(3) });
    // SF harshness
    overrides.push({ party: "SF", harshness: true, value: +(0.2 + Math.random() * 0.65).toFixed(3) });
    // M harshness
    overrides.push({ party: "M", harshness: true, value: +(0.05 + Math.random() * 0.6).toFixed(3) });

    paramSets.push({ cfg, partyOverrides: overrides });
  }

  const results = await runBatch(pool, paramSets, SIM_N);
  const outFile = path.join(EXPLORE_DIR, "extreme-scenarios.jsonl");
  const stream = fs.createWriteStream(outFile);
  for (const r of results) {
    stream.write(JSON.stringify({
      cfg: paramSets[r.id].cfg,
      overrides: paramSets[r.id].partyOverrides.map(o => `${o.party}${o.harshness ? '_h' : '→'+o.target+'_'+o.key}=${o.value}`),
      ...r.coalitionPcts,
      noGov: r.noGov
    }) + "\n");
  }
  stream.end();

  // Find unusual outcomes
  const unusual = { high_blue: 0, high_SSF: 0, dominant_SMRVSF: 0, high_entropy: 0, low_entropy: 0 };
  for (const r of results) {
    const vklam = r.coalitionPcts["V+KF+LA+M"] || 0;
    const ssf = r.coalitionPcts["S+SF"] || 0;
    const smrvsf = r.coalitionPcts["S+M+RV+SF"] || 0;
    if (vklam > 10) unusual.high_blue++;
    if (ssf > 25) unusual.high_SSF++;
    if (smrvsf > 55) unusual.dominant_SMRVSF++;
    const entropy = COALITIONS.reduce((s, c) => { const p = (r.coalitionPcts[c] || 0) / 100; return p > 0.001 ? s - p * Math.log2(p) : s; }, 0);
    if (entropy > 2.2) unusual.high_entropy++;
    if (entropy < 0.8) unusual.low_entropy++;
  }
  log(`Unusual outcomes in ${N_SAMPLES} random draws:`);
  for (const [type, count] of Object.entries(unusual)) {
    log(`  ${type}: ${count} (${(count/N_SAMPLES*100).toFixed(1)}%)`);
  }
  log(`Saved to ${outFile}`);
}

// ── Main ───────────────────────────────────────────────────────────
async function main() {
  fs.mkdirSync(EXPLORE_DIR, { recursive: true });
  fs.writeFileSync(LOG_FILE, `# Exploration Log\nStarted: ${new Date().toISOString()}\nFocus: party-specific bilateral relationships and negotiations\n\n`);

  log("Waiting for Sobol sweep to complete...");
  while (!fs.existsSync(INDICES_FILE)) {
    await new Promise(r => setTimeout(r, 30000));
    if (shouldStop()) { log("9 AM reached before sweep completed."); return; }
  }
  log("Sobol indices found. Starting party-focused exploration.\n");

  const pool = new WorkerPool(NUM_CORES, path.join(__dirname, "sweep-worker.js"));

  try {
    // Priority 1: Bilateral 1D sweeps — the most directly useful for negotiations
    if (!shouldStop()) await explore1DBilateral(pool);

    // Priority 2: Dyadic interaction heatmaps — how do bilateral positions interact?
    if (!shouldStop()) await explore2DDyadic(pool);

    // Priority 3: High-res Sobol top params (for dashboard "what matters" tab)
    if (!shouldStop()) await exploreHighRes1D(pool);

    // Priority 4: Three-way probes (Sobol × bilateral)
    if (!shouldStop()) await exploreThreeWay(pool);

    // Priority 5: Extreme scenario hunting
    if (!shouldStop()) await exploreExtremes(pool);

  } catch (err) { log(`ERROR: ${err.message}\n${err.stack}`); }

  await pool.terminate();
  log(`\nExploration complete at ${new Date().toISOString()}`);
}

main().catch(err => { console.error(err); process.exit(1); });
