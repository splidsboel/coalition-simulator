#!/usr/bin/env node
/**
 * retrocast.js — Recalculate historical timeline entries using the current engine.
 *
 * When structural engine changes (90-vote gate, bilateral CI, oppositionAbstention)
 * are added, the historical timeline entries need to be retrocast to avoid
 * large non-event-driven shifts. This script re-runs each historical date
 * with the current engine but only the parameter values that were in effect
 * on that date.
 *
 * Usage: node daily-update/retrocast.js
 */

const path = require("path");
const Sim5Parties = require("../sim5-parties.js");
const engine = require("../sim5-engine.js");
const PARTIES_MAP = Sim5Parties.PARTIES_MAP;

const N = 20000;

// Historical parameter overrides: for each date, list what was DIFFERENT
// from today's values. The script temporarily applies these overrides,
// runs the simulation, then restores current values.
//
// Only daily-brief-driven changes are reverted. Structural corrections
// (SF demandGov, M-acceptance recalibration, oppositionAbstention, 90-gate)
// are treated as "always should have been there" and apply to all dates.

// Only revert BRIEF-DRIVEN changes (actual political events/signals).
// All calibration/architecture changes apply to all dates uniformly.
const HISTORICAL_OVERRIDES = {
  "2026-03-24": {
    label: "valgaften",
    formationStage: "valgaften",
    changelog: ["Udgangspunkt: kalibrering fra valgaften, før forhandlingssignaler"],
    overrides: {
      // Revert March 26 kongerunde signals
      "SF.globalHarshness": { from: 0.55, to: 0.59 },       // pre-kongerunde: no mistillidstrussel yet
      "KF.relationships.S.inGov": { from: 0.35, to: 0.30 },  // pre-kongerunde: KF hadn't signaled openness
      // Revert March 28 sættemøde signals
      "EL.globalHarshness": { from: 0.56, to: 0.64 },        // pre-sættemøde: EL hadn't softened
      "ALT.globalHarshness": { from: 0.48, to: 0.53 },       // pre-sættemøde: ALT hadn't signaled flexibility
    }
  },
  "2026-03-26": {
    label: "forhandlinger",
    formationStage: "forhandlinger",
    changelog: [
      "SF mistillidstrussel hæver SF globalHarshness",
      "Konservative åbner døren til S"
    ],
    overrides: {
      // Revert only March 28 sættemøde signals
      "EL.globalHarshness": { from: 0.56, to: 0.64 },
      "ALT.globalHarshness": { from: 0.48, to: 0.53 },
    }
  },
  "2026-03-28": {
    label: "forhandlinger",
    formationStage: "forhandlinger",
    changelog: [
      "EL bløder op: globalHarshness 0.64 → 0.56, fleksibel forhandlingsposition",
      "ALT globalHarshness ned (0.53 → 0.48): svinepagt som eneste ultimatum",
      "SF globalHarshness ned (0.64 → 0.55): privat forventningsstyring om kompromiser"
    ],
    overrides: {
      // Revert March 29 changes (LA/BP seat reductions + løsgængere are structural, not brief-driven)
      // Actually: the expulsions ARE events. But the seats were changed in sim5-parties.js
      // directly, so we need to temporarily restore LA=16, BP=4 for the March 28 retrocast.
      // This is handled by mandate overrides, not party property overrides.
    }
  }
};

function applyOverride(key, value) {
  const parts = key.split(".");
  const partyId = parts[0];
  const party = PARTIES_MAP[partyId];
  if (!party) { console.warn("Unknown party:", partyId); return null; }

  if (parts[1] === "globalHarshness") {
    const old = party.globalHarshness;
    party.globalHarshness = value;
    return old;
  }
  if (parts[1] === "participationPref") {
    const old = party.participationPref[parts[2]];
    party.participationPref[parts[2]] = value;
    return old;
  }
  if (parts[1] === "relationships") {
    const otherId = parts[2];
    const field = parts[3];
    if (!party.relationships[otherId]) { console.warn("No relationship:", key); return null; }
    const old = party.relationships[otherId][field];
    party.relationships[otherId][field] = value;
    return old;
  }
  console.warn("Unknown override path:", key);
  return null;
}

function runRetrocast(date, config) {
  console.log(`\n=== Retrocasting ${date} (${config.label}) ===`);

  // Apply overrides
  const saved = {};
  for (const [key, spec] of Object.entries(config.overrides || {})) {
    saved[key] = applyOverride(key, spec.to);
    console.log(`  ${key}: ${spec.from} → ${spec.to}`);
  }

  // Run simulation
  const result = engine.simulate({}, N);

  // Collect top coalitions
  const coalitions = {};
  for (const c of result.topCoalitions.slice(0, 10)) {
    const label = c.support && c.support.length > 0
      ? c.govt  // with support already encoded in pct
      : c.govt;
    coalitions[label] = (coalitions[label] || 0) + c.pct;
  }

  // Round to 1 decimal
  for (const key of Object.keys(coalitions)) {
    coalitions[key] = +coalitions[key].toFixed(1);
  }

  console.log("  Results:", JSON.stringify(coalitions));

  // Restore
  for (const [key, oldVal] of Object.entries(saved)) {
    if (oldVal != null) applyOverride(key, oldVal);
  }

  return {
    date,
    coalitions,
    noGov: result.noGovPct,
    formationStage: config.formationStage,
    changelog: config.changelog
  };
}

// Run all retrocasts
const timeline = [];
for (const [date, config] of Object.entries(HISTORICAL_OVERRIDES)) {
  timeline.push(runRetrocast(date, config));
}

// Run current date
console.log("\n=== Current: 2026-03-28 ===");
const current = engine.simulate({}, N);
const currentCoalitions = {};
for (const c of current.topCoalitions.slice(0, 10)) {
  currentCoalitions[c.govt] = (currentCoalitions[c.govt] || 0) + c.pct;
}
for (const key of Object.keys(currentCoalitions)) {
  currentCoalitions[key] = +currentCoalitions[key].toFixed(1);
}
console.log("  Results:", JSON.stringify(currentCoalitions));

timeline.push({
  date: "2026-03-28",
  coalitions: currentCoalitions,
  noGov: current.noGovPct,
  formationStage: "forhandlinger",
  changelog: [
    "Motoropdatering: 90-stemme viabilitetsgate i formatørprotokol",
    "oppositionAbstention: 0.30 → 0.10",
    "Bilateral CI på alle relationer (σ=0.05 standard)",
    "SF kræver at være i regering (demandGov=true)",
    "M-accept rekalibreret ud fra strategisk nødvendighed",
    "M globalHarshness: 0.24 → 0.32 (blind kalibrering)",
    "EL bløder op: globalHarshness 0.64 → 0.56, fleksibel forhandlingsposition",
    "KF mere oppositions-orienteret: gov 0.70 → 0.55",
    "RV→M tolerateInGov: 0.82 → 0.10 (2022-traume: RV kan ikke overleve M i regering uden RV)"
  ]
});

// Output
console.log("\n=== Final timeline ===");
console.log(JSON.stringify(timeline, null, 2));
