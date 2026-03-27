// Worker thread: runs simulate() for batches of parameter sets
// Handles cfg overrides, relationship/harshness overrides, position overrides,
// and participation preference overrides.
const { parentPort } = require("worker_threads");
const engine = require("../sim5-engine.js");
const parties = require("../sim5-parties.js");

const COALITIONS_OF_INTEREST = [
  "S+M+RV+SF", "S+RV+SF", "S+M+SF", "S+M+RV", "S+SF", "V+KF+LA+M"
];

parentPort.on("message", (batch) => {
  const results = [];
  for (const job of batch) {
    const { id, cfg, partyOverrides, positionOverrides, N } = job;

    // Apply party-specific overrides (save originals for restore)
    const saved = [];

    if (partyOverrides) {
      for (const ov of partyOverrides) {
        const partyObj = parties.PARTIES_MAP[ov.party];
        if (!partyObj) continue;

        if (ov.harshness) {
          saved.push({ type: "harshness", party: ov.party, orig: partyObj.globalHarshness });
          partyObj.globalHarshness = ov.value;
        } else if (ov.participationPref && ov.field && partyObj.participationPref) {
          saved.push({ type: "participationPref", party: ov.party, field: ov.field, orig: partyObj.participationPref[ov.field] });
          partyObj.participationPref[ov.field] = ov.value;
        } else if (ov.key && ov.target && partyObj.relationships && partyObj.relationships[ov.target]) {
          saved.push({ type: "relationship", party: ov.party, target: ov.target, key: ov.key, orig: partyObj.relationships[ov.target][ov.key] });
          partyObj.relationships[ov.target][ov.key] = ov.value;
        }
      }
    }

    // Apply position overrides (ideal, floor, ceiling on policy dimensions)
    if (positionOverrides) {
      for (const po of positionOverrides) {
        const partyObj = parties.PARTIES_MAP[po.party];
        if (!partyObj || !partyObj.positions || !partyObj.positions[po.dimension]) continue;
        const pos = partyObj.positions[po.dimension];
        saved.push({ type: "position", party: po.party, dimension: po.dimension, field: po.field, orig: pos[po.field] });
        pos[po.field] = po.value;
      }
    }

    try {
      const r = engine.simulate(cfg || {}, N || 150);
      const coalitionPcts = {};
      for (const c of COALITIONS_OF_INTEREST) {
        const found = r.topCoalitions.find(tc => tc.govt === c);
        coalitionPcts[c] = found ? found.pct : 0;
      }
      results.push({ id, coalitionPcts, noGov: r.noGovPct });
    } catch (err) {
      results.push({ id, error: err.message });
    }

    // Restore all overrides
    for (const s of saved) {
      const partyObj = parties.PARTIES_MAP[s.party];
      if (!partyObj) continue;
      if (s.type === "harshness") {
        partyObj.globalHarshness = s.orig;
      } else if (s.type === "participationPref") {
        partyObj.participationPref[s.field] = s.orig;
      } else if (s.type === "relationship") {
        partyObj.relationships[s.target][s.key] = s.orig;
      } else if (s.type === "position") {
        partyObj.positions[s.dimension][s.field] = s.orig;
      }
    }
  }
  parentPort.postMessage(results);
});
