// sim4-parties.js — Party definitions for post-election coalition simulator
// Mandates are PROVISIONAL projections (24 March 2026 evening).
// UPDATE the MANDATES object with final d'Hondt allocation before production sweep.

// ============================================================================
// MANDATE TABLE — EDIT HERE WHEN FINAL RESULTS ARE IN
// ============================================================================
// Must sum to 175 (Danish seats). Projection rounded to integers; RV adjusted
// downward by 1 to hit 175 sum. Replace all values with final d'Hondt output.
const MANDATES = {
  S: 38, SF: 20, EL: 11, ALT: 5, RV: 10,
  M: 14, KF: 13, V: 18, LA: 16, DD: 10, DF: 16, BP: 4,
  // North Atlantic (constitutional, always 4 total)
  GL1: 1, GL2: 1, FO1: 1, FO2: 1,
};

// Bloc totals (final, 25 March 2026):
//   Red  (S+SF+EL+ALT+RV): 84
//   Blue (V+LA+KF+DD+DF+BP): 77
//   Swing (M): 14
//   Neither bloc has majority (>87). M is kingmaker.
//   Red + M = 98. Blue + M = 91.

// ============================================================================
// PARTY DEFINITIONS
// ============================================================================
const PARTIES = [
  { id: "S",   m: MANDATES.S,   lr: 3, bloc: "red",   govEligible: true,  pmEligible: true  },
  { id: "SF",  m: MANDATES.SF,  lr: 2, bloc: "red",   govEligible: true,  pmEligible: false },
  { id: "EL",  m: MANDATES.EL,  lr: 1, bloc: "red",   govEligible: false, pmEligible: false },
  { id: "ALT", m: MANDATES.ALT, lr: 2, bloc: "red",   govEligible: false, pmEligible: false },
  { id: "RV",  m: MANDATES.RV,  lr: 4, bloc: "red",   govEligible: true,  pmEligible: false },
  { id: "M",   m: MANDATES.M,   lr: 5, bloc: "swing", govEligible: true,  pmEligible: true  },
  { id: "KF",  m: MANDATES.KF,  lr: 6, bloc: "blue",  govEligible: true,  pmEligible: false },
  { id: "V",   m: MANDATES.V,   lr: 7, bloc: "blue",  govEligible: true,  pmEligible: true  },
  { id: "LA",  m: MANDATES.LA,  lr: 9, bloc: "blue",  govEligible: true,  pmEligible: true  },
  { id: "DD",  m: MANDATES.DD,  lr: 7, bloc: "blue",  govEligible: true,  pmEligible: false },
  { id: "DF",  m: MANDATES.DF,  lr: 7, bloc: "blue",  govEligible: false, pmEligible: false },
  { id: "BP",  m: MANDATES.BP,  lr: 8, bloc: "blue",  govEligible: false, pmEligible: false },
];

// North Atlantic seats
const NA_SEATS = [
  { id: "GL1", m: 1, bloc: "na", pRed: 0.60, pFlexible: 0.30, pBlue: 0.10 },
  { id: "GL2", m: 1, bloc: "na", pRed: 0.25, pFlexible: 0.45, pBlue: 0.30 },
  { id: "FO1", m: 1, bloc: "na", pRed: 0.55, pFlexible: 0.20, pBlue: 0.25 },
  { id: "FO2", m: 1, bloc: "na", pRed: 0.10, pFlexible: 0.15, pBlue: 0.75 },
];

const ALL_PARTY_IDS = PARTIES.map(p => p.id).concat(NA_SEATS.map(s => s.id));
const NA_IDS = new Set(NA_SEATS.map(s => s.id));

// ============================================================================
// PER-PARTY FLEXIBILITY SCORES (leader personality)
// ============================================================================
// Baseline flex per party leader, normalized to [-0.5, +0.5].
// Positive = pragmatic (compromises more), negative = rigid (holds rhetoric).
const PARTY_FLEX = {
  "M":   0.47,   // Løkke: extremely pragmatic
  "RV":  0.18,   // Lidegaard: moderately pragmatic
  "S":   0.10,   // Frederiksen: somewhat pragmatic
  "KF":  0.15,   // Mona Juul: moderate pragmatist
  "V":   0.08,   // Troels Lund Poulsen: somewhat pragmatic
  "SF": -0.20,   // Olsen Dyhr: quite rigid
  "ALT": -0.15,  // Rosenkilde: rigid
  "LA": -0.22,   // Vanopslagh: quite rigid
  "DD": -0.32,   // Støjberg: very rigid
  "DF": -0.35,   // Messerschmidt: very rigid
  "EL": -0.38,   // Dragsted: extremely rigid
  "BP": -0.40,   // Lars Boje: extremely rigid
  "GL1": 0, "GL2": 0, "FO1": 0, "FO2": 0,
};

// ============================================================================
// PARTY IDEAL POINTS (per policy dimension)
// ============================================================================
// Used for concession computation: how far each party moves from its ideal
// to accommodate a coalition platform.
const PARTY_IDEALS = {
  S:   { taxation: "substitute", forstaelsespapir: "no",  green: "medium", immigration: "moderate",    fiscal: "moderate"  },
  SF:  { taxation: "formueskat", forstaelsespapir: "yes", green: "high",   immigration: "status_quo",  fiscal: "expansive" },
  EL:  { taxation: "formueskat", forstaelsespapir: "yes", green: "high",   immigration: "status_quo",  fiscal: "expansive" },
  ALT: { taxation: "formueskat", forstaelsespapir: "yes", green: "high",   immigration: "status_quo",  fiscal: "expansive" },
  RV:  { taxation: "substitute", forstaelsespapir: "no",  green: "high",   immigration: "moderate",    fiscal: "moderate"  },
  M:   { taxation: "substitute", forstaelsespapir: "no",  green: "medium", immigration: "moderate",    fiscal: "moderate"  },
  KF:  { taxation: "none",       forstaelsespapir: "no",  green: "medium", immigration: "moderate",    fiscal: "moderate"  },
  V:   { taxation: "none",       forstaelsespapir: "no",  green: "medium", immigration: "restrictive", fiscal: "tight"     },
  LA:  { taxation: "none",       forstaelsespapir: "no",  green: "low",    immigration: "moderate",    fiscal: "tight"     },
  DD:  { taxation: "substitute", forstaelsespapir: "no",  green: "low",    immigration: "restrictive", fiscal: "moderate"  },
  DF:  { taxation: "substitute", forstaelsespapir: "no",  green: "low",    immigration: "restrictive", fiscal: "expansive" },
  BP:  { taxation: "none",       forstaelsespapir: "no",  green: "low",    immigration: "restrictive", fiscal: "tight"     },
};

// Ordinal scales for computing concession distance
const DIMENSION_ORDINALS = {
  taxation:         { formueskat: 0, substitute: 1, none: 2 },
  forstaelsespapir: { yes: 0, no: 1 },
  green:            { high: 0, medium: 1, low: 2 },
  immigration:      { status_quo: 0, moderate: 1, restrictive: 2 },
  fiscal:           { expansive: 0, moderate: 1, tight: 2 },
};

// Max ordinal distance per dimension (for normalization)
const DIMENSION_MAX_DIST = {
  taxation: 2, forstaelsespapir: 1, green: 2, immigration: 2, fiscal: 2,
};

// ============================================================================
// DYAD ACCEPTANCE RANGES
// ============================================================================
// Probability that party A accepts party B in the SAME government coalition.
// [lo, hi] range; draw is shifted by pressure/flexibility parameter.
// Only pairs with non-trivial constraints are listed.
// Unlisted pairs default to [1.0, 1.0] (unconditional acceptance).
const DYAD_ACCEPTANCE = {
  "SF-M":  [0.30, 0.70],  // SF reluctant with M ("aldrig igen" but pragmatic pressure)
  "SF-V":  [0.05, 0.20],  // SF very reluctant with V
  "SF-LA": [0.02, 0.10],  // SF near-impossible with LA
  "SF-KF": [0.15, 0.40],  // SF reluctant with KF
  "V-S":   [0.10, 0.40],  // V reluctant under S-led (TLP "dual strategy")
  "LA-S":  [0.02, 0.10],  // LA very reluctant under S-led
  "DD-M":  [0.10, 0.30],  // DD hostile to M (Støjberg-Løkke feud)
  "DD-S":  [0.02, 0.08],  // DD near-impossible with S
  "DF-M":  [0.30, 0.60],  // DF hostile to M but 10yr loyalty + escape hatch
  "KF-S":  [0.08, 0.35],  // KF reluctant under S (Mona Juul: "door ajar" but blue first)
  "M-DD":  [0.15, 0.35],  // M-DD tension (Løkke-Støjberg history)
};

// ============================================================================
// CONFIDENCE BEHAVIOR
// ============================================================================
// Returns true if a party would vote FOR a mistillidsvotum (no-confidence)
// against the given government.
function wouldVoteNoConfidence(partyId, govSet, govLeader) {
  if (govSet.has(partyId)) return false;

  // M-led governments: red parties abstain/tolerate, blue parties oppose
  if (govLeader === "M") {
    if (["SF", "EL", "ALT", "RV", "S"].includes(partyId)) return false;
    const p = PARTIES.find(x => x.id === partyId);
    if (p && p.bloc === "blue") return true;
    return false;
  }

  const isRedLed = govSet.has("S");
  if (isRedLed) {
    if (["SF", "EL", "ALT", "RV"].includes(partyId)) return false;
    if (partyId === "M") return false; // abstains
    const p = PARTIES.find(x => x.id === partyId);
    if (p && p.bloc === "blue") return true;
    return false;
  }

  // Blue-led
  const p = PARTIES.find(x => x.id === partyId);
  if (p && p.bloc === "red") return true;
  if (["M", "RV", "KF"].includes(partyId)) return false; // swing abstains
  return false;
}

// ============================================================================
// HELPERS
// ============================================================================
function clamp01(v) { return Math.max(0, Math.min(1, v)); }

// Determine government "side" for budget-vote logic.
// Extended for M-led coalitions: infer side from coalition partners.
function govSide(govSet) {
  if (govSet.has("S")) return "red";
  if (govSet.has("V") || govSet.has("LA")) return "blue";
  if (govSet.has("M")) {
    const hasRedPartner = govSet.has("SF") || govSet.has("RV");
    const hasBluePartner = govSet.has("KF") || govSet.has("DD");
    if (hasRedPartner && !hasBluePartner) return "red";
    if (hasBluePartner && !hasRedPartner) return "blue";
    return "center"; // M-led with mixed or no partners
  }
  return "other";
}

// Look up dyad acceptance range. Returns [lo, hi] or [1, 1] if no constraint.
function dyadAcceptanceRange(partyA, partyB) {
  const key1 = `${partyA}-${partyB}`;
  const key2 = `${partyB}-${partyA}`;
  return DYAD_ACCEPTANCE[key1] || DYAD_ACCEPTANCE[key2] || [1.0, 1.0];
}

module.exports = {
  MANDATES, PARTIES, NA_SEATS, ALL_PARTY_IDS, NA_IDS,
  PARTY_FLEX, PARTY_IDEALS, DIMENSION_ORDINALS, DIMENSION_MAX_DIST,
  DYAD_ACCEPTANCE, dyadAcceptanceRange,
  wouldVoteNoConfidence, clamp01, govSide,
};
