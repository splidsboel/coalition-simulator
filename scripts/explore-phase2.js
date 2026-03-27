#!/usr/bin/env node
// Phase 2 exploration: policy positions, un-swept bilaterals, cross-interactions
// ~2 hours on 6 cores

const { Worker } = require("worker_threads");
const fs = require("fs");
const path = require("path");

const NUM_CORES = 6;
const EXPLORE_DIR = path.join(__dirname, "..", "results", "exploration");
const LOG_FILE = path.join(EXPLORE_DIR, "exploration-log-phase2.md");
const COALITIONS = ["S+M+RV+SF", "S+RV+SF", "S+M+SF", "S+M+RV", "S+SF", "V+KF+LA+M"];

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
      w.on("message", (r) => { const b = this.pending.get(w); this.pending.delete(w); const res = this.resolvers.get(b); this.resolvers.delete(b); if (res) res(r); this._pq(); });
      w.on("error", (e) => console.error("Worker error:", e.message));
      this.workers.push(w);
    }
  }
  submit(jobs) { return new Promise((res) => { const id = this.nextId++; this.resolvers.set(id, res); this.queue.push({ batchId: id, jobs }); this._pq(); }); }
  _pq() { for (const w of this.workers) { if (this.pending.has(w) || !this.queue.length) continue; const { batchId, jobs } = this.queue.shift(); this.pending.set(w, batchId); w.postMessage(jobs); } }
  async terminate() { for (const w of this.workers) await w.terminate(); }
}

async function runBatch(pool, paramSets, simN) {
  const jobs = paramSets.map((p, i) => ({ id: i, cfg: p.cfg || {}, partyOverrides: p.partyOverrides || [], positionOverrides: p.positionOverrides || [], N: simN }));
  const batches = [];
  for (let i = 0; i < jobs.length; i += 40) batches.push(jobs.slice(i, i + 40));
  const results = [];
  for (const batch of batches) { const r = await pool.submit(batch); results.push(...r); }
  return results;
}

// ── Module A: Policy position sweeps ───────────────────────────────
const POLICY_SWEEPS = [
  // Wealth tax — both briefs say negotiating chip
  { party: "S", dim: "wealthTax", field: "ideal", current: 1, min: 0, max: 3, label: "S wealth tax position" },
  { party: "SF", dim: "wealthTax", field: "ideal", current: 0, min: 0, max: 3, label: "SF wealth tax position" },
  { party: "S", dim: "wealthTax", field: "floor", current: 4, min: 1, max: 4, label: "S wealth tax floor (red line)" },

  // EL immigration — biggest red line but pragmatic leadership
  { party: "EL", dim: "immigration", field: "ideal", current: 0, min: 0, max: 3, label: "EL immigration position" },
  { party: "EL", dim: "immigration", field: "floor", current: 0, min: 0, max: 2, label: "EL immigration floor (red line)" },

  // M climate — the S-M bridging gap
  { party: "M", dim: "climateTgt", field: "ideal", current: 2, min: 0, max: 4, label: "M climate target position" },
  { party: "S", dim: "climateTgt", field: "ideal", current: 1, min: 0, max: 3, label: "S climate target position" },

  // M pension — "flatly disagreed" with S
  { party: "M", dim: "pension", field: "ideal", current: 2, min: 0, max: 4, label: "M pension position" },
  { party: "S", dim: "pension", field: "ideal", current: 0, min: 0, max: 3, label: "S pension position" },

  // EL EU conventions — genuine clash with S immigration agenda
  { party: "EL", dim: "euConventions", field: "ideal", current: 0, min: 0, max: 3, label: "EL EU conventions position" },

  // M nuclear — M-SF tension point
  { party: "M", dim: "nuclear", field: "ideal", current: 0, min: 0, max: 3, label: "M nuclear power position" },
  { party: "SF", dim: "nuclear", field: "ideal", current: 2, min: 0, max: 3, label: "SF nuclear power position" },

  // S pesticideBan — ultimativt krav
  { party: "S", dim: "pesticideBan", field: "ideal", current: 0, min: 0, max: 3, label: "S pesticide ban position" },
];

// ── Module B: Un-swept bilateral relationships ─────────────────────
const UNSEPT_BILATERALS = [
  { from: "ALT", to: "M", key: "tolerateInGov", current: 0.64, min: 0.10, max: 0.95, label: "ALT tolerates M in govt" },
  { from: "M", to: "ALT", key: "asSupport", current: 0.32, min: 0.05, max: 0.70, label: "M tolerates ALT as support" },
  { from: "DD", to: "M", key: "tolerateInGov", current: 0.50, min: 0.10, max: 0.80, label: "DD tolerates M in govt" },
  { from: "DD", to: "M", key: "inGov", current: 0.30, min: 0.05, max: 0.65, label: "DD accepts M in govt" },
  { from: "LA", to: "M", key: "inGov", current: 0.85, min: 0.40, max: 0.98, label: "LA accepts M in govt" },
  { from: "V", to: "RV", key: "inGov", current: 0.12, min: 0.00, max: 0.50, label: "V accepts RV in govt (soft veto)" },
  { from: "RV", to: "S", key: "asPM", current: 0.76, min: 0.30, max: 0.95, label: "RV accepts S as PM" },
  { from: "EL", to: "SF", key: "tolerateInGov", current: 0.90, min: 0.50, max: 0.98, label: "EL tolerates SF in govt" },
  { from: "SF", to: "RV", key: "inGov", current: 0.78, min: 0.30, max: 0.95, label: "SF accepts RV in govt" },
  { from: "S", to: "M", key: "inGov", current: 0.80, min: 0.40, max: 0.98, label: "S accepts M in govt" },
];

// ── Module C: Policy × bilateral interaction heatmaps ──────────────
const CROSS_INTERACTIONS = [
  // Does SF→M acceptance matter more when climate is compromised?
  { policy: { party: "M", dim: "climateTgt", field: "ideal", min: 0, max: 4, label: "M climate" },
    bilateral: { from: "SF", to: "M", key: "inGov", min: 0.20, max: 0.98, label: "SF→M inGov" },
    label: "M climate position × SF→M acceptance" },

  // Does M→EL tolerance matter more when immigration is softened?
  { policy: { party: "EL", dim: "immigration", field: "floor", min: 0, max: 2, label: "EL immigration floor" },
    bilateral: { from: "M", to: "EL", key: "tolerateInGov", min: 0.00, max: 0.80, label: "M→EL tolerance" },
    label: "EL immigration floor × M→EL tolerance" },

  // Does wealth tax concession by SF affect SF→M willingness?
  { policy: { party: "SF", dim: "wealthTax", field: "ideal", min: 0, max: 3, label: "SF wealth tax" },
    bilateral: { from: "SF", to: "M", key: "inGov", min: 0.20, max: 0.98, label: "SF→M inGov" },
    label: "SF wealth tax position × SF→M acceptance" },

  // Does M pension flexibility affect M→SF tolerance?
  { policy: { party: "M", dim: "pension", field: "ideal", min: 0, max: 4, label: "M pension" },
    bilateral: { from: "M", to: "SF", key: "inGov", min: 0.20, max: 0.95, label: "M→SF inGov" },
    label: "M pension position × M→SF acceptance" },

  // Nuclear × SF-M: the specific policy tension
  { policy: { party: "M", dim: "nuclear", field: "ideal", min: 0, max: 3, label: "M nuclear" },
    bilateral: { from: "SF", to: "M", key: "inGov", min: 0.20, max: 0.98, label: "SF→M inGov" },
    label: "M nuclear position × SF→M acceptance" },
];

// ── Module D: Participation preference sweeps ──────────────────────
const PARTICIPATION_SWEEPS = [
  { party: "SF", field: "government", current: 0.92, min: 0.40, max: 0.98, label: "SF government preference" },
  { party: "V", field: "government", current: 0.55, min: 0.20, max: 0.85, label: "V government preference" },
  { party: "EL", field: "stoettepartiForst", current: 0.78, min: 0.30, max: 0.95, label: "EL støtteparti (forst) preference" },
  { party: "M", field: "government", current: 0.82, min: 0.40, max: 0.98, label: "M government preference" },
  { party: "RV", field: "government", current: 0.65, min: 0.20, max: 0.90, label: "RV government preference" },
];

// ── Main ───────────────────────────────────────────────────────────
async function main() {
  fs.mkdirSync(EXPLORE_DIR, { recursive: true });
  fs.writeFileSync(LOG_FILE, `# Exploration Phase 2 Log\nStarted: ${new Date().toISOString()}\nFocus: policy positions, un-swept bilaterals, cross-interactions, participation prefs\n\n`);

  const pool = new WorkerPool(NUM_CORES, path.join(__dirname, "sweep-worker.js"));

  // ── Module A: Policy position sweeps ──────────────────────────
  log("=== Module A: Policy position sweeps (never swept before) ===");
  const SIM_N_A = 500;
  const GRID_A = 20;
  const outA = fs.createWriteStream(path.join(EXPLORE_DIR, "policy-position-sweeps.jsonl"));

  for (const pol of POLICY_SWEEPS) {
    const paramSets = [];
    for (let g = 0; g < GRID_A; g++) {
      const val = pol.min + (g + 0.5) / GRID_A * (pol.max - pol.min);
      const rounded = pol.field === "ideal" ? Math.round(val) : +val.toFixed(2);
      paramSets.push({
        cfg: {},
        partyOverrides: [],
        positionOverrides: [{ party: pol.party, dimension: pol.dim, field: pol.field, value: rounded }],
      });
    }

    const results = await runBatch(pool, paramSets, SIM_N_A);
    for (const r of results) {
      const val = paramSets[r.id].positionOverrides[0].value;
      outA.write(JSON.stringify({ param: pol.label, value: val, ...r.coalitionPcts, noGov: r.noGov }) + "\n");
    }

    const sorted = results.sort((a, b) => paramSets[a.id].positionOverrides[0].value - paramSets[b.id].positionOverrides[0].value);
    const first = sorted[0].coalitionPcts["S+M+RV+SF"] || 0;
    const last = sorted[sorted.length - 1].coalitionPcts["S+M+RV+SF"] || 0;
    const delta = Math.abs(last - first);
    log(`  ${pol.label.padEnd(35)} Δ=${delta.toFixed(1)}pp ${delta > 5 ? "★" : ""} (${first.toFixed(0)}%→${last.toFixed(0)}%)`);
  }
  outA.end();
  log(`Saved to policy-position-sweeps.jsonl\n`);

  // ── Module B: Un-swept bilateral relationships ────────────────
  log("=== Module B: Un-swept bilateral 1D sweeps ===");
  const SIM_N_B = 500;
  const GRID_B = 25;
  const outB = fs.createWriteStream(path.join(EXPLORE_DIR, "unsweept-bilaterals.jsonl"));

  for (const rel of UNSEPT_BILATERALS) {
    const paramSets = [];
    for (let g = 0; g < GRID_B; g++) {
      const val = +(rel.min + (g + 0.5) / GRID_B * (rel.max - rel.min)).toFixed(4);
      paramSets.push({
        cfg: {},
        partyOverrides: [{ party: rel.from, target: rel.to, key: rel.key, value: val }],
      });
    }

    const results = await runBatch(pool, paramSets, SIM_N_B);
    for (const r of results) {
      outB.write(JSON.stringify({ param: rel.label, value: paramSets[r.id].partyOverrides[0].value, ...r.coalitionPcts, noGov: r.noGov }) + "\n");
    }

    const sorted = results.sort((a, b) => paramSets[a.id].partyOverrides[0].value - paramSets[b.id].partyOverrides[0].value);
    const first = sorted[0].coalitionPcts["S+M+RV+SF"] || 0;
    const last = sorted[sorted.length - 1].coalitionPcts["S+M+RV+SF"] || 0;
    const delta = Math.abs(last - first);
    log(`  ${rel.label.padEnd(38)} Δ=${delta.toFixed(1)}pp ${delta > 5 ? "★" : ""}`);
  }
  outB.end();
  log(`Saved to unsweept-bilaterals.jsonl\n`);

  // ── Module C: Policy × bilateral interaction heatmaps ─────────
  log("=== Module C: Policy × bilateral cross-interaction heatmaps ===");
  const SIM_N_C = 400;
  const GRID_C = 13;
  const outC = fs.createWriteStream(path.join(EXPLORE_DIR, "policy-bilateral-interactions.jsonl"));

  for (const cross of CROSS_INTERACTIONS) {
    log(`  ${cross.label}`);
    const paramSets = [];
    for (let gi = 0; gi < GRID_C; gi++) {
      for (let gj = 0; gj < GRID_C; gj++) {
        const polVal = cross.policy.min + (gi + 0.5) / GRID_C * (cross.policy.max - cross.policy.min);
        const polRounded = cross.policy.field === "ideal" ? Math.round(polVal) : +polVal.toFixed(2);
        const bilVal = +(cross.bilateral.min + (gj + 0.5) / GRID_C * (cross.bilateral.max - cross.bilateral.min)).toFixed(4);
        paramSets.push({
          cfg: {},
          partyOverrides: [{ party: cross.bilateral.from, target: cross.bilateral.to, key: cross.bilateral.key, value: bilVal }],
          positionOverrides: [{ party: cross.policy.party, dimension: cross.policy.dim, field: cross.policy.field, value: polRounded }],
          _polVal: polRounded, _bilVal: bilVal,
        });
      }
    }

    const results = await runBatch(pool, paramSets, SIM_N_C);
    for (const r of results) {
      outC.write(JSON.stringify({
        pair: cross.label,
        policyVal: paramSets[r.id]._polVal,
        bilateralVal: paramSets[r.id]._bilVal,
        ...r.coalitionPcts, noGov: r.noGov
      }) + "\n");
    }

    // Corner comparison
    const ll = results.find(r => r.id === 0);
    const hh = results.find(r => r.id === paramSets.length - 1);
    if (ll && hh) {
      const c = "S+M+RV+SF";
      log(`    ${c}: (${paramSets[0]._polVal},${paramSets[0]._bilVal.toFixed(2)})=${(ll.coalitionPcts[c]||0).toFixed(0)}% → (${paramSets[paramSets.length-1]._polVal},${paramSets[paramSets.length-1]._bilVal.toFixed(2)})=${(hh.coalitionPcts[c]||0).toFixed(0)}%`);
    }
  }
  outC.end();
  log(`Saved to policy-bilateral-interactions.jsonl\n`);

  // ── Module D: Participation preference sweeps ─────────────────
  log("=== Module D: Participation preference sweeps ===");
  const SIM_N_D = 500;
  const GRID_D = 20;
  const outD = fs.createWriteStream(path.join(EXPLORE_DIR, "participation-prefs.jsonl"));

  for (const pref of PARTICIPATION_SWEEPS) {
    const paramSets = [];
    for (let g = 0; g < GRID_D; g++) {
      const val = +(pref.min + (g + 0.5) / GRID_D * (pref.max - pref.min)).toFixed(4);
      paramSets.push({
        cfg: {},
        partyOverrides: [{ party: pref.party, participationPref: true, field: pref.field, value: val }],
      });
    }

    const results = await runBatch(pool, paramSets, SIM_N_D);
    for (const r of results) {
      outD.write(JSON.stringify({ param: pref.label, value: paramSets[r.id].partyOverrides[0].value, ...r.coalitionPcts, noGov: r.noGov }) + "\n");
    }

    const sorted = results.sort((a, b) => paramSets[a.id].partyOverrides[0].value - paramSets[b.id].partyOverrides[0].value);
    const first = sorted[0].coalitionPcts["S+M+RV+SF"] || 0;
    const last = sorted[sorted.length - 1].coalitionPcts["S+M+RV+SF"] || 0;
    log(`  ${pref.label.padEnd(38)} Δ=${Math.abs(last-first).toFixed(1)}pp (${first.toFixed(0)}%→${last.toFixed(0)}%)`);
  }
  outD.end();
  log(`Saved to participation-prefs.jsonl\n`);

  await pool.terminate();
  log(`\nPhase 2 exploration complete at ${new Date().toISOString()}`);
}

main().catch(err => { console.error(err); process.exit(1); });
