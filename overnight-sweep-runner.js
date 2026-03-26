#!/usr/bin/env node
/**
 * overnight-sweep-runner.js — Extended sensitivity analysis of sim5 coalition simulator
 *
 * Phases:
 *   1. Deep 1D sweeps (N=250, 30 points each)
 *   2. 2D heatmaps (N=150, ~15x15 grids)
 *   3. Named scenarios (N=500)
 *   4. Discovery — programmatic detection of phase transitions, tipping points,
 *      unusual coalitions; targeted follow-up sweeps (N=400)
 *
 * Uses worker_threads with 4 workers for parallelism.
 * Writes results to sweep-results/ as JSON files, plus a summary.md analysis.
 */

const { Worker } = require("worker_threads");
const fs = require("fs");
const path = require("path");

// ============================================================
// Configuration
// ============================================================

const NUM_WORKERS = 4;
const OUT_DIR = path.join(__dirname, "sweep-results");
const WORKER_PATH = path.join(__dirname, "overnight-sweep-worker.js");

// Default parameters (baseline)
const DEFAULTS = {
  flexibility: 0,
  redPreference: 0.5,
  mPmPref: "neutral",
  mDemandGov: true,
  mDemandPM: false,
  sDemandGov: true,
  viabilityThreshold: 0.70,
  maxFormationRounds: 3,
  passageExponent: 2.0,
  voteSensitivity: 4.0,
  distPenalty: 1.5,
  formateurPull: 0.3,
  floorThreshold: 0.7,
  formateurOverride: "endogenous",
  elMPenalty: 0.7,
  elMBoost: 1.1,
  precedentWeight: 0,
  flexIncrement: 0.05
};

// ============================================================
// Utility functions
// ============================================================

function linspace(lo, hi, steps) {
  const arr = [];
  for (let i = 0; i < steps; i++) {
    arr.push(+(lo + (hi - lo) * i / (steps - 1)).toFixed(6));
  }
  return arr;
}

function timestamp() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function log(msg) {
  console.log(`[${timestamp()}] ${msg}`);
}

function writeJSON(filename, data) {
  fs.writeFileSync(path.join(OUT_DIR, filename), JSON.stringify(data, null, 2));
  log(`  Wrote ${filename}`);
}

function appendSummary(text) {
  fs.appendFileSync(path.join(OUT_DIR, "summary.md"), text + "\n");
}

// ============================================================
// Worker pool
// ============================================================

class WorkerPool {
  constructor(numWorkers, workerPath) {
    this.workers = [];
    this.queue = [];
    this.available = [];
    this.taskId = 0;
    this.callbacks = new Map();
    this.totalDispatched = 0;
    this.totalCompleted = 0;

    for (let i = 0; i < numWorkers; i++) {
      const w = new Worker(workerPath);
      w.on("message", (msg) => this._onMessage(i, msg));
      w.on("error", (err) => {
        log(`  Worker ${i} error: ${err.message}`);
      });
      this.workers.push(w);
      this.available.push(i);
    }
  }

  _onMessage(workerIdx, msg) {
    const cb = this.callbacks.get(msg.taskId);
    if (cb) {
      this.callbacks.delete(msg.taskId);
      this.totalCompleted++;
      cb(msg);
    }
    // Worker is free — check queue
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      this.workers[workerIdx].postMessage(next.task);
    } else {
      this.available.push(workerIdx);
    }
  }

  run(params, N) {
    return new Promise((resolve) => {
      const id = this.taskId++;
      const task = { taskId: id, params, N };
      this.callbacks.set(id, resolve);
      this.totalDispatched++;

      if (this.available.length > 0) {
        const wIdx = this.available.pop();
        this.workers[wIdx].postMessage(task);
      } else {
        this.queue.push({ task });
      }
    });
  }

  async runBatch(tasks) {
    return Promise.all(tasks.map(t => this.run(t.params, t.N)));
  }

  shutdown() {
    for (const w of this.workers) {
      w.postMessage({ type: "shutdown" });
    }
  }

  progress() {
    return `${this.totalCompleted}/${this.totalDispatched}`;
  }
}

// ============================================================
// Result extraction helpers
// ============================================================

function extractPoint(msg, value) {
  if (!msg.ok) return { value, error: msg.error };
  const r = msg.result;
  return {
    value,
    pmS: r.pmS,
    pmV: r.pmV,
    pmM: r.pmM,
    topCoalition: r.topCoalition,
    topPct: r.topPct,
    mInGov: r.mInGov,
    noGov: r.noGov,
    avgRounds: r.avgRounds,
    topFive: r.topFive
  };
}

function extractScenario(msg) {
  if (!msg.ok) return { error: msg.error };
  const r = msg.result;
  return {
    pm: r.pm,
    govType: r.govType,
    topCoalition: r.topCoalition,
    topPct: r.topPct,
    mInGov: r.mInGov,
    noGov: r.noGov,
    avgRounds: r.avgRounds,
    roundsDist: r.roundsDist,
    formateurOrder: r.formateurOrder,
    topFive: r.topFive
  };
}

// ============================================================
// Phase 1: Deep 1D sweeps
// ============================================================

async function phase1(pool) {
  log("=== PHASE 1: Deep 1D sweeps (N=250, 30 points) ===");

  const N = 250;
  const STEPS = 30;

  const sweepDefs = [
    { param: "flexibility",         lo: -0.3, hi: 0.5,  desc: "Global negotiation flexibility" },
    { param: "redPreference",       lo: 0,    hi: 1,    desc: "Preference for red-bloc coalitions" },
    { param: "viabilityThreshold",  lo: 0.3,  hi: 0.95, desc: "Minimum viability to attempt formation" },
    { param: "passageExponent",     lo: 0.5,  hi: 4,    desc: "Exponent weighting passage probability" },
    { param: "voteSensitivity",     lo: 0.5,  hi: 10,   desc: "Sigmoid steepness for vote decisions" },
    { param: "distPenalty",         lo: 0.3,  hi: 4,    desc: "Penalty for policy distance in coalition scoring" },
    { param: "formateurPull",       lo: 0,    hi: 1.5,  desc: "Formateur advantage in coalition platform" },
    { param: "floorThreshold",      lo: 0.2,  hi: 1.0,  desc: "Floor threshold for vote support" }
  ];

  const sweeps = {};

  for (const def of sweepDefs) {
    const values = linspace(def.lo, def.hi, STEPS);
    log(`  Sweeping ${def.param}: ${values.length} points...`);

    const tasks = values.map(v => ({ params: { [def.param]: v }, N }));
    const results = await pool.runBatch(tasks);

    sweeps[def.param] = {
      description: def.desc,
      range: [def.lo, def.hi],
      points: results.map((msg, i) => extractPoint(msg, values[i]))
    };

    log(`  ${def.param} done (pool: ${pool.progress()})`);
  }

  const totalPoints = Object.values(sweeps).reduce((s, sw) => s + sw.points.length, 0);

  const output = {
    meta: {
      generatedAt: new Date().toISOString(),
      N,
      totalPoints,
      phase: "1d-sweeps",
      stepsPerParam: STEPS
    },
    sweeps
  };

  writeJSON("1d-sweeps.json", output);

  // Write initial summary
  appendSummary("# Overnight Sweep Analysis\n");
  appendSummary(`Generated: ${new Date().toISOString()}\n`);
  appendSummary("## Phase 1: 1D Sweeps\n");
  for (const [param, sweep] of Object.entries(sweeps)) {
    const pts = sweep.points;
    const pmSRange = pts.map(p => p.pmS || 0);
    const noGovRange = pts.map(p => p.noGov || 0);
    const topCoals = [...new Set(pts.map(p => p.topCoalition))];
    appendSummary(`### ${param} (${sweep.range[0]} to ${sweep.range[1]})`);
    appendSummary(`- PM(S) range: ${Math.min(...pmSRange).toFixed(1)}% to ${Math.max(...pmSRange).toFixed(1)}%`);
    appendSummary(`- No-government range: ${Math.min(...noGovRange).toFixed(1)}% to ${Math.max(...noGovRange).toFixed(1)}%`);
    appendSummary(`- Distinct top coalitions: ${topCoals.join(", ")}`);
    appendSummary("");
  }

  return output;
}

// ============================================================
// Phase 2: 2D heatmaps
// ============================================================

async function phase2(pool) {
  log("=== PHASE 2: 2D heatmaps (N=150, ~15x15 grids) ===");

  const N = 150;
  const STEPS = 15;
  const heatmaps = {};

  // Helper: run a 2D grid
  async function runGrid(name, xParam, xValues, yParam, yValues, extraParams = {}) {
    log(`  Grid ${name}: ${xValues.length}x${yValues.length} = ${xValues.length * yValues.length} points...`);

    const tasks = [];
    for (const xv of xValues) {
      for (const yv of yValues) {
        const params = { ...extraParams, [xParam]: xv, [yParam]: yv };
        tasks.push({ params, N });
      }
    }

    const results = await pool.runBatch(tasks);

    // Reshape into grid
    const data = [];
    let idx = 0;
    for (let xi = 0; xi < xValues.length; xi++) {
      const row = [];
      for (let yi = 0; yi < yValues.length; yi++) {
        row.push(extractPoint(results[idx], { [xParam]: xValues[xi], [yParam]: yValues[yi] }));
        idx++;
      }
      data.push(row);
    }

    heatmaps[name] = {
      xParam, xValues,
      yParam, yValues,
      data
    };

    log(`  ${name} done (pool: ${pool.progress()})`);
  }

  // Define grids
  const flexVals = linspace(-0.3, 0.5, STEPS);
  const redVals = linspace(0, 1, STEPS);
  const viabVals = linspace(0.3, 0.95, STEPS);
  const passVals = linspace(0.5, 4, STEPS);
  const voteVals = linspace(0.5, 10, STEPS);
  const distVals = linspace(0.3, 4, STEPS);
  const fmtPullVals = linspace(0, 1.5, STEPS);

  // 1. flexibility x redPreference
  await runGrid("flexibility_x_redPreference", "flexibility", flexVals, "redPreference", redVals);

  // 2. flexibility x viabilityThreshold
  await runGrid("flexibility_x_viabilityThreshold", "flexibility", flexVals, "viabilityThreshold", viabVals);

  // 3. flexibility x passageExponent
  await runGrid("flexibility_x_passageExponent", "flexibility", flexVals, "passageExponent", passVals);

  // 4. redPreference x mPmPref (continuous x 4 discrete)
  await runGrid("redPreference_x_mPmPref", "redPreference", redVals, "mPmPref", ["S", "neutral", "V", "M"]);

  // 5. distPenalty x passageExponent
  await runGrid("distPenalty_x_passageExponent", "distPenalty", distVals, "passageExponent", passVals);

  // 6. voteSensitivity x flexibility
  await runGrid("voteSensitivity_x_flexibility", "voteSensitivity", voteVals, "flexibility", flexVals);

  // 7. formateurPull x redPreference
  await runGrid("formateurPull_x_redPreference", "formateurPull", fmtPullVals, "redPreference", redVals);

  // 8. viabilityThreshold x maxFormationRounds (continuous x 1-5)
  await runGrid("viabilityThreshold_x_maxFormationRounds", "viabilityThreshold", viabVals, "maxFormationRounds", [1, 2, 3, 4, 5]);

  // 9. flexibility x formateurOverride (continuous x 3 discrete)
  await runGrid("flexibility_x_formateurOverride", "flexibility", flexVals, "formateurOverride", ["endogenous", "red", "blue"]);

  const totalPoints = Object.values(heatmaps).reduce((s, hm) => s + hm.xValues.length * hm.yValues.length, 0);

  const output = {
    meta: {
      generatedAt: new Date().toISOString(),
      N,
      totalPoints,
      phase: "2d-heatmaps"
    },
    heatmaps
  };

  writeJSON("2d-heatmaps.json", output);

  // Append summary
  appendSummary("\n## Phase 2: 2D Heatmaps\n");
  for (const [name, hm] of Object.entries(heatmaps)) {
    const allPts = hm.data.flat();
    const topCoals = [...new Set(allPts.map(p => p.topCoalition))];
    const noGovMax = Math.max(...allPts.map(p => p.noGov || 0));
    appendSummary(`### ${name}`);
    appendSummary(`- Grid: ${hm.xValues.length} x ${hm.yValues.length} = ${allPts.length} points`);
    appendSummary(`- Distinct top coalitions: ${topCoals.length} (${topCoals.slice(0, 8).join(", ")}${topCoals.length > 8 ? "..." : ""})`);
    appendSummary(`- Max no-government: ${noGovMax.toFixed(1)}%`);
    appendSummary("");
  }

  return output;
}

// ============================================================
// Phase 3: Named scenarios
// ============================================================

async function phase3(pool) {
  log("=== PHASE 3: Named scenarios (N=500) ===");

  const N = 500;

  const scenarios = {
    "Løkke kingmaker hard": { mDemandGov: true, mDemandPM: true, mPmPref: "M" },
    "Løkke yields": { mDemandGov: false, mPmPref: "S", flexibility: 0.2 },
    "Maximum gridlock": { viabilityThreshold: 0.90, flexibility: -0.2, maxFormationRounds: 1 },
    "SF blocks": { flexibility: -0.3, redPreference: 0.9 },
    "Blue surprise": { mPmPref: "V", formateurOverride: "blue", flexibility: 0.2 },
    "Grand compromise": { flexibility: 0.4, redPreference: 0.3, viabilityThreshold: 0.60 },
    "Historical precedent": { precedentWeight: 0.04 },
    "Pure position-driven": { voteSensitivity: 8, distPenalty: 3, passageExponent: 1 },
    "Pure power-driven": { voteSensitivity: 1, distPenalty: 0.5, passageExponent: 3 },
    "Frederiksen full red": { redPreference: 1.0 },
    "M doesn't demand gov": { mDemandGov: false }
  };

  // Add 12 combos of mPmPref x formateurOverride
  const mPmOptions = ["S", "neutral", "V", "M"];
  const fmtOptions = ["endogenous", "red", "blue"];
  for (const mPm of mPmOptions) {
    for (const fmt of fmtOptions) {
      const name = `mPmPref=${mPm}_formateurOverride=${fmt}`;
      scenarios[name] = { mPmPref: mPm, formateurOverride: fmt };
    }
  }

  const names = Object.keys(scenarios);
  log(`  Running ${names.length} scenarios...`);

  const tasks = names.map(name => ({ params: scenarios[name], N }));
  const results = await pool.runBatch(tasks);

  const scenarioResults = {};
  for (let i = 0; i < names.length; i++) {
    scenarioResults[names[i]] = {
      params: scenarios[names[i]],
      ...extractScenario(results[i])
    };
  }

  log(`  Scenarios done (pool: ${pool.progress()})`);

  const output = {
    meta: {
      generatedAt: new Date().toISOString(),
      N,
      totalScenarios: names.length,
      phase: "scenarios"
    },
    scenarios: scenarioResults
  };

  writeJSON("scenarios.json", output);

  // Append summary
  appendSummary("\n## Phase 3: Named Scenarios\n");
  appendSummary("| Scenario | PM(S) | PM(V) | PM(M) | Top Coalition | Top% | NoGov% |");
  appendSummary("|---|---|---|---|---|---|---|");
  for (const [name, r] of Object.entries(scenarioResults)) {
    const pmS = r.pm?.S || 0;
    const pmV = r.pm?.V || 0;
    const pmM = r.pm?.M || 0;
    appendSummary(`| ${name} | ${pmS}% | ${pmV}% | ${pmM}% | ${r.topCoalition} | ${r.topPct}% | ${r.noGov}% |`);
  }
  appendSummary("");

  return output;
}

// ============================================================
// Phase 4: Discovery
// ============================================================

async function phase4(pool, phase1Data, phase2Data, phase3Data) {
  log("=== PHASE 4: Discovery ===");

  const N_DISCOVERY = 400;
  const discoveries = {
    phaseTransitions: [],
    tippingPoints: [],
    unusualCoalitions: [],
    followUpSweeps: {}
  };

  // --- Detect phase transitions from 1D sweeps ---
  log("  Scanning for phase transitions in 1D sweeps...");
  for (const [param, sweep] of Object.entries(phase1Data.sweeps)) {
    const pts = sweep.points;
    for (let i = 1; i < pts.length; i++) {
      if (pts[i].topCoalition !== pts[i-1].topCoalition) {
        discoveries.phaseTransitions.push({
          param,
          from: { value: pts[i-1].value, coalition: pts[i-1].topCoalition, pct: pts[i-1].topPct },
          to: { value: pts[i].value, coalition: pts[i].topCoalition, pct: pts[i].topPct }
        });
      }
    }
  }
  log(`  Found ${discoveries.phaseTransitions.length} phase transitions`);

  // --- Detect tipping points (large ΔpmS or ΔnoGov from small Δparam) ---
  log("  Scanning for tipping points...");
  for (const [param, sweep] of Object.entries(phase1Data.sweeps)) {
    const pts = sweep.points;
    for (let i = 1; i < pts.length; i++) {
      const dParam = Math.abs(pts[i].value - pts[i-1].value);
      const dPmS = Math.abs((pts[i].pmS || 0) - (pts[i-1].pmS || 0));
      const dNoGov = Math.abs((pts[i].noGov || 0) - (pts[i-1].noGov || 0));
      const dTopPct = Math.abs((pts[i].topPct || 0) - (pts[i-1].topPct || 0));

      // Large outcome change relative to parameter step
      if (dPmS > 10 || dNoGov > 8 || dTopPct > 12) {
        discoveries.tippingPoints.push({
          param,
          between: [pts[i-1].value, pts[i].value],
          deltaPmS: +dPmS.toFixed(2),
          deltaNoGov: +dNoGov.toFixed(2),
          deltaTopPct: +dTopPct.toFixed(2)
        });
      }
    }
  }
  log(`  Found ${discoveries.tippingPoints.length} tipping points`);

  // --- Detect unusual coalitions (>10% in any sweep point) ---
  log("  Scanning for unusual coalitions...");
  const commonCoalitions = new Set(["S", "RV+S+SF", "S+SF", "V", "KF+V", "M+S+V", "EL+RV+S+SF", "S+V"]);

  function scanForUnusual(points, context) {
    for (const pt of points) {
      if (!pt.topFive) continue;
      for (const coal of pt.topFive) {
        if (!commonCoalitions.has(coal.govt) && coal.pct > 10) {
          discoveries.unusualCoalitions.push({
            coalition: coal.govt,
            pct: coal.pct,
            context,
            paramValue: pt.value
          });
        }
      }
    }
  }

  for (const [param, sweep] of Object.entries(phase1Data.sweeps)) {
    scanForUnusual(sweep.points, `1D sweep: ${param}`);
  }

  // Also scan 2D heatmaps
  for (const [name, hm] of Object.entries(phase2Data.heatmaps)) {
    for (const row of hm.data) {
      for (const pt of row) {
        if (!pt.topFive) continue;
        for (const coal of pt.topFive) {
          if (!commonCoalitions.has(coal.govt) && coal.pct > 10) {
            discoveries.unusualCoalitions.push({
              coalition: coal.govt,
              pct: coal.pct,
              context: `2D heatmap: ${name}`,
              paramValue: pt.value
            });
          }
        }
      }
    }
  }

  // Deduplicate unusual coalitions
  const seenUnusual = new Set();
  discoveries.unusualCoalitions = discoveries.unusualCoalitions.filter(u => {
    const key = `${u.coalition}|${u.context}`;
    if (seenUnusual.has(key)) return false;
    seenUnusual.add(key);
    return true;
  });
  log(`  Found ${discoveries.unusualCoalitions.length} unusual coalition occurrences`);

  // --- Follow-up sweeps around interesting regions ---
  log("  Running targeted follow-up sweeps (N=400)...");

  // For each phase transition, run a fine sweep around the transition zone
  const followUpTasks = [];
  const followUpMeta = [];

  // Group transitions by parameter and pick the most interesting ones
  const transitionsByParam = {};
  for (const pt of discoveries.phaseTransitions) {
    if (!transitionsByParam[pt.param]) transitionsByParam[pt.param] = [];
    transitionsByParam[pt.param].push(pt);
  }

  for (const [param, transitions] of Object.entries(transitionsByParam)) {
    // For each transition, run a fine 20-point sweep in the zone
    for (let ti = 0; ti < Math.min(transitions.length, 3); ti++) {
      const t = transitions[ti];
      const lo = t.from.value;
      const hi = t.to.value;
      const margin = (hi - lo) * 1.5;
      const fineValues = linspace(
        Math.max(lo - margin, phase1Data.sweeps[param]?.range?.[0] ?? lo - margin),
        Math.min(hi + margin, phase1Data.sweeps[param]?.range?.[1] ?? hi + margin),
        20
      );

      const sweepName = `${param}_transition_${ti + 1}`;
      followUpMeta.push({ sweepName, param, values: fineValues, transition: t });

      for (const v of fineValues) {
        followUpTasks.push({
          params: { [param]: v },
          N: N_DISCOVERY,
          _meta: { sweepName, value: v }
        });
      }
    }
  }

  // Also run fine sweeps around tipping points
  const tippingByParam = {};
  for (const tp of discoveries.tippingPoints) {
    if (!tippingByParam[tp.param]) tippingByParam[tp.param] = [];
    tippingByParam[tp.param].push(tp);
  }

  for (const [param, tps] of Object.entries(tippingByParam)) {
    // Skip if already covered by transition sweeps
    if (transitionsByParam[param]) continue;

    for (let ti = 0; ti < Math.min(tps.length, 2); ti++) {
      const tp = tps[ti];
      const lo = tp.between[0];
      const hi = tp.between[1];
      const margin = (hi - lo) * 2;
      const fineValues = linspace(
        Math.max(lo - margin, phase1Data.sweeps[param]?.range?.[0] ?? lo - margin),
        Math.min(hi + margin, phase1Data.sweeps[param]?.range?.[1] ?? hi + margin),
        20
      );

      const sweepName = `${param}_tipping_${ti + 1}`;
      followUpMeta.push({ sweepName, param, values: fineValues, tippingPoint: tp });

      for (const v of fineValues) {
        followUpTasks.push({
          params: { [param]: v },
          N: N_DISCOVERY,
          _meta: { sweepName, value: v }
        });
      }
    }
  }

  if (followUpTasks.length > 0) {
    log(`  Dispatching ${followUpTasks.length} follow-up simulation points...`);

    const metaList = followUpTasks.map(t => t._meta);
    const results = await pool.runBatch(followUpTasks.map(t => ({ params: t.params, N: t.N })));

    // Group results by sweep name
    for (let i = 0; i < results.length; i++) {
      const meta = metaList[i];
      if (!discoveries.followUpSweeps[meta.sweepName]) {
        const fm = followUpMeta.find(m => m.sweepName === meta.sweepName);
        discoveries.followUpSweeps[meta.sweepName] = {
          param: fm.param,
          reason: fm.transition ? "phase_transition" : "tipping_point",
          detail: fm.transition || fm.tippingPoint,
          points: []
        };
      }
      discoveries.followUpSweeps[meta.sweepName].points.push(
        extractPoint(results[i], meta.value)
      );
    }

    log(`  Follow-up sweeps done (pool: ${pool.progress()})`);
  } else {
    log("  No follow-up targets identified");
  }

  const output = {
    meta: {
      generatedAt: new Date().toISOString(),
      N: N_DISCOVERY,
      phase: "discovery",
      phaseTransitionsFound: discoveries.phaseTransitions.length,
      tippingPointsFound: discoveries.tippingPoints.length,
      unusualCoalitionsFound: discoveries.unusualCoalitions.length,
      followUpSweepsRun: Object.keys(discoveries.followUpSweeps).length
    },
    discoveries
  };

  writeJSON("discoveries.json", output);

  // Append summary
  appendSummary("\n## Phase 4: Discovery\n");

  appendSummary("### Phase Transitions");
  if (discoveries.phaseTransitions.length === 0) {
    appendSummary("No phase transitions detected.\n");
  } else {
    appendSummary("| Parameter | From Value | From Coalition | To Value | To Coalition |");
    appendSummary("|---|---|---|---|---|");
    for (const pt of discoveries.phaseTransitions) {
      appendSummary(`| ${pt.param} | ${pt.from.value} | ${pt.from.coalition} (${pt.from.pct}%) | ${pt.to.value} | ${pt.to.coalition} (${pt.to.pct}%) |`);
    }
    appendSummary("");
  }

  appendSummary("### Tipping Points");
  if (discoveries.tippingPoints.length === 0) {
    appendSummary("No tipping points detected.\n");
  } else {
    appendSummary("| Parameter | Between | Delta PM(S) | Delta NoGov | Delta TopPct |");
    appendSummary("|---|---|---|---|---|");
    for (const tp of discoveries.tippingPoints) {
      appendSummary(`| ${tp.param} | ${tp.between[0]} - ${tp.between[1]} | ${tp.deltaPmS}pp | ${tp.deltaNoGov}pp | ${tp.deltaTopPct}pp |`);
    }
    appendSummary("");
  }

  appendSummary("### Unusual Coalitions (>10%)");
  if (discoveries.unusualCoalitions.length === 0) {
    appendSummary("No unusual coalitions found above 10% threshold.\n");
  } else {
    appendSummary("| Coalition | Pct | Context |");
    appendSummary("|---|---|---|");
    for (const uc of discoveries.unusualCoalitions) {
      appendSummary(`| ${uc.coalition} | ${uc.pct}% | ${uc.context} |`);
    }
    appendSummary("");
  }

  appendSummary("### Follow-up Sweeps");
  for (const [name, sweep] of Object.entries(discoveries.followUpSweeps)) {
    const pts = sweep.points;
    const topCoals = [...new Set(pts.map(p => p.topCoalition))];
    appendSummary(`**${name}** (${sweep.reason}): ${pts.length} points, coalitions: ${topCoals.join(", ")}`);
  }
  appendSummary("");

  return output;
}

// ============================================================
// Main
// ============================================================

async function main() {
  const t0 = Date.now();
  log("Starting overnight sweep runner");
  log(`Workers: ${NUM_WORKERS}, Output: ${OUT_DIR}`);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Clear summary
  fs.writeFileSync(path.join(OUT_DIR, "summary.md"), "");

  // Create worker pool
  const pool = new WorkerPool(NUM_WORKERS, WORKER_PATH);

  try {
    const p1 = await phase1(pool);
    const elapsed1 = ((Date.now() - t0) / 1000).toFixed(1);
    log(`Phase 1 complete in ${elapsed1}s`);

    const p2 = await phase2(pool);
    const elapsed2 = ((Date.now() - t0) / 1000).toFixed(1);
    log(`Phase 2 complete in ${elapsed2}s`);

    const p3 = await phase3(pool);
    const elapsed3 = ((Date.now() - t0) / 1000).toFixed(1);
    log(`Phase 3 complete in ${elapsed3}s`);

    const p4 = await phase4(pool, p1, p2, p3);
    const elapsed4 = ((Date.now() - t0) / 1000).toFixed(1);
    log(`Phase 4 complete in ${elapsed4}s`);

    const totalElapsed = ((Date.now() - t0) / 1000).toFixed(1);
    log(`All phases complete. Total: ${totalElapsed}s, Simulations: ${pool.totalCompleted}`);

    appendSummary(`\n---\nTotal runtime: ${totalElapsed}s | Total simulations: ${pool.totalCompleted}\n`);
  } catch (err) {
    log(`FATAL ERROR: ${err.message}`);
    console.error(err);
  } finally {
    pool.shutdown();
  }
}

main();
