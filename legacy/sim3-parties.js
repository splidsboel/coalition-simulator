// sim3-parties.js — Party definitions and budget-vote functions
// See sim3-spec.md §7 for full specification.

// ============================================================================
// PARTY DEFINITIONS (2026 projection baseline, 24 March 2026 — avg of 3 prognoses)
// ============================================================================
const PARTIES = [
  { id: "S",   m: 38, s: 2.5, lr: 3, bloc: "red",   subGroup: "S",   govEligible: true,  pmEligible: true  },
  { id: "SF",  m: 20, s: 2.1, lr: 2, bloc: "red",   subGroup: "SF",  govEligible: true,  pmEligible: false },
  { id: "EL",  m: 11, s: 1.5, lr: 1, bloc: "red",   subGroup: null,  govEligible: false, pmEligible: false },
  { id: "ALT", m: 4,  s: 0.9, lr: 2, bloc: "red",   subGroup: null,  govEligible: false, pmEligible: false,
    threshold: true, baseVoteShare: 2.3, thresholdPct: 2.0, pClear: 0.65 },
  { id: "RV",  m: 10, s: 1.5, lr: 4, bloc: "red",   subGroup: null,  govEligible: true,  pmEligible: false },
  { id: "M",   m: 14, s: 1.5, lr: 5, bloc: "swing", subGroup: null,  govEligible: true,  pmEligible: true  },
  { id: "KF",  m: 13, s: 1.5, lr: 6, bloc: "blue",  subGroup: null,  govEligible: true,  pmEligible: false },
  { id: "V",   m: 18, s: 1.7, lr: 7, bloc: "blue",  subGroup: "V",   govEligible: true,  pmEligible: true  },
  { id: "LA",  m: 17, s: 1.9, lr: 9, bloc: "blue",  subGroup: "LA",  govEligible: true,  pmEligible: true  },
  { id: "DD",  m: 10, s: 1.6, lr: 7, bloc: "blue",  subGroup: "DD",  govEligible: true,  pmEligible: false },
  { id: "DF",  m: 16, s: 1.5, lr: 7, bloc: "blue",  subGroup: "DF",  govEligible: false, pmEligible: false },
  { id: "BP",  m: 4,  s: 1.1, lr: 8, bloc: "blue",  subGroup: null,  govEligible: false, pmEligible: false,
    threshold: true, baseVoteShare: 2.3, thresholdPct: 2.0, pClear: 0.65 },
];

// North Atlantic seats: constitutional, sigma = 0
const NA_SEATS = [
  { id: "GL1", m: 1, s: 0, bloc: "na", pRed: 0.60, pFlexible: 0.30, pBlue: 0.10 },
  { id: "GL2", m: 1, s: 0, bloc: "na", pRed: 0.25, pFlexible: 0.45, pBlue: 0.30 },
  { id: "FO1", m: 1, s: 0, bloc: "na", pRed: 0.55, pFlexible: 0.20, pBlue: 0.25 },
  { id: "FO2", m: 1, s: 0, bloc: "na", pRed: 0.10, pFlexible: 0.15, pBlue: 0.75 },
];

const ALL_PARTY_IDS = PARTIES.map(p => p.id).concat(NA_SEATS.map(s => s.id));
const NA_IDS = new Set(NA_SEATS.map(s => s.id));

// ============================================================================
// SWING PARTY BLOC-SHOCK WEIGHTS (spec §2b)
// ============================================================================
const SWING_WEIGHTS = {
  M:  { red: 0.40, blue: 0.40 },
  RV: { red: 0.70, blue: 0.15 },
  KF: { red: 0.15, blue: 0.70 },
};

// Within-bloc substitution pairs (spec §2b)
const SUBSTITUTION_PAIRS = {
  red:  [["S", "SF"]],           // S-SF substitution
  blue: [["V", "LA"], ["DF", "DD"]], // V-LA and DF-DD substitution
};

// ============================================================================
// CONFIDENCE BEHAVIOR (spec §4)
// ============================================================================
// Returns true if a party would vote FOR a mistillidsvotum (no-confidence)
// against the given government.
function wouldVoteNoConfidence(partyId, govSet, govLeader) {
  // Government members never vote no-confidence on themselves
  if (govSet.has(partyId)) return false;

  // M-led governments (M+S+SF, M+S+RV): treated as center-led.
  // Red parties abstain (S is in govt, they won't topple it).
  // Blue parties vote FOR (they oppose this center-left govt).
  if (govLeader === "M") {
    if (partyId === "SF" || partyId === "EL" || partyId === "ALT" || partyId === "RV") return false;
    if (partyId === "S") return false; // S tolerates M-led when sRelaxPM is on
    const p = PARTIES.find(x => x.id === partyId);
    if (p && p.bloc === "blue") return true;
    return false;
  }

  const isRedLed = govLeader === "S";

  // Party-specific confidence behavior toward S-led govts (spec §4)
  if (isRedLed) {
    if (partyId === "SF" || partyId === "EL" || partyId === "ALT" || partyId === "RV") return false; // abstain
    if (partyId === "M") return false; // abstains unless deeply left-dependent (simplified)
    // Blue parties vote FOR mistillidsvotum against S-led
    const p = PARTIES.find(x => x.id === partyId);
    if (p && p.bloc === "blue") return true;
    // NA seats: never vote no-confidence (abstain)
    return false;
  }

  // Blue-led: red parties vote FOR mistillidsvotum, swing abstain
  const p = PARTIES.find(x => x.id === partyId);
  if (p && p.bloc === "red") return true;
  if (partyId === "M" || partyId === "RV" || partyId === "KF") return false; // swing abstains
  return false;
}

// ============================================================================
// HELPERS (used by sim3.js via imports)
// ============================================================================

// Clamp to [0, 1]
function clamp01(v) { return Math.max(0, Math.min(1, v)); }

// Determine government side: "red" if S-led, "blue" if V/LA-led
function govSide(govSet) {
  if (govSet.has("S")) return "red";
  if (govSet.has("V") || govSet.has("LA")) return "blue";
  return "other";
}

// ============================================================================
// PER-PARTY FLEXIBILITY SCORES (leader personality)
// ============================================================================
// Baseline flex per party leader, normalized to [-0.5, +0.5].
// Positive = pragmatic (compromises more), negative = rigid (holds rhetoric).
// Adapted from old model's leader flexibility data.
const PARTY_FLEX = {
  "M":   0.47,   // Løkke: extremely pragmatic
  "RV":  0.18,   // Lidegaard: moderately pragmatic
  "S":   0.10,   // Frederiksen: somewhat pragmatic
  "KF":  0.15,   // Mona Juul: moderate pragmatist ("door ajar" but soleklart blue first)
  "V":   0.08,   // Troels Lund Poulsen: somewhat pragmatic (dual strategy, klog af skade)
  "SF": -0.20,   // Olsen Dyhr: quite rigid (hardest line in campaign, "aldrig igen" trauma)
  "ALT": -0.15,  // Rosenkilde: rigid
  "LA": -0.22,   // Vanopslagh: quite rigid
  "DD": -0.32,   // Støjberg: very rigid
  "DF": -0.35,   // Messerschmidt: very rigid
  "EL": -0.38,   // Dragsted: extremely rigid
  "BP": -0.40,   // Lars Boje: extremely rigid
  // NA seats: neutral
  "GL1": 0, "GL2": 0, "FO1": 0, "FO2": 0,
};

// NOTE: Budget vote logic lives in sim3.js (evalBudgetVote). This module is
// data-only: party definitions, swing weights, NA alignment distributions,
// confidence behavior, per-party flex, and shared helpers.

module.exports = {
  PARTIES,
  NA_SEATS,
  ALL_PARTY_IDS,
  NA_IDS,
  SWING_WEIGHTS,
  SUBSTITUTION_PAIRS,
  PARTY_FLEX,
  wouldVoteNoConfidence,
  clamp01,
  govSide,
};
