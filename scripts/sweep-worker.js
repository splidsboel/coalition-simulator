// Worker thread: runs simulate() for batches of parameter sets
// Handles both cfg overrides and party-specific relationship/harshness overrides
const { parentPort } = require("worker_threads");
const engine = require("../sim5-engine.js");
const parties = require("../sim5-parties.js");

const COALITIONS_OF_INTEREST = [
  "S+M+RV+SF", "S+RV+SF", "S+M+SF", "S+M+RV", "S+SF", "V+KF+LA+M"
];

parentPort.on("message", (batch) => {
  const results = [];
  for (const job of batch) {
    const { id, cfg, partyOverrides, N } = job;

    // Apply party-specific overrides (save originals for restore)
    const saved = [];
    if (partyOverrides) {
      for (const ov of partyOverrides) {
        const partyObj = parties.PARTIES_MAP[ov.party];
        if (!partyObj) continue;

        if (ov.harshness) {
          saved.push({ party: ov.party, harshness: true, orig: partyObj.globalHarshness });
          partyObj.globalHarshness = ov.value;
        } else if (ov.key && ov.target && partyObj.relationships && partyObj.relationships[ov.target]) {
          saved.push({ party: ov.party, target: ov.target, key: ov.key, orig: partyObj.relationships[ov.target][ov.key] });
          partyObj.relationships[ov.target][ov.key] = ov.value;
        }
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

    // Restore party-specific values
    for (const s of saved) {
      const partyObj = parties.PARTIES_MAP[s.party];
      if (!partyObj) continue;
      if (s.harshness) {
        partyObj.globalHarshness = s.orig;
      } else {
        partyObj.relationships[s.target][s.key] = s.orig;
      }
    }
  }
  parentPort.postMessage(results);
});
