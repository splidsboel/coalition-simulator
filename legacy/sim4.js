#!/usr/bin/env node
// sim4.js — Danish Post-Election Coalition Formation Simulator v4
// Architecture: Fixed mandates -> algorithmic coalition enumeration -> multi-round
//               formateur protocol with dyad acceptance -> DP passage -> aggregation
// Usage: node sim4.js [JSON_CONFIG] [N_ITERATIONS]
//
// Fork of sim3.js. Key changes:
//   1. Fixed mandates (no stochastic mandate draws)
//   2. Algorithmic coalition enumeration (no hardcoded PACKAGES)
//   3. Multi-round formateur protocol with dyad acceptance checking
//   4. Concession tracking per coalition
//   5. Optional mandate perturbation for sensitivity analysis

const {
  MANDATES, PARTIES, NA_SEATS, ALL_PARTY_IDS, NA_IDS,
  PARTY_FLEX, dyadAcceptanceRange,
  wouldVoteNoConfidence, clamp01, govSide,
} = require("./sim4-parties.js");

const {
  getCoherentPlatforms, enumerateCoalitions,
  coalitionConcessions,
  getPreferenceWeight, platformToString, classifyGovType,
} = require("./sim4-packages.js");

// ============================================================================
// HELPERS
// ============================================================================
function normDraw(mean, sigma) {
  if (!sigma) return mean;
  let u1 = 0, u2 = 0;
  while (!u1) u1 = Math.random();
  while (!u2) u2 = Math.random();
  return mean + sigma * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function uniformDraw(lo, hi) {
  return lo + Math.random() * (hi - lo);
}

// Flexibility-shifted draw: flexibility ∈ [-0.5, +0.5] shifts where in
// the [lo, hi] range the draw lands.
// flexibility = 0: uniform across full range (baseline)
// flexibility > 0: shift toward hi (pragmatic — parties compromise more)
// flexibility < 0: shift toward lo (rigid — campaign rhetoric holds)
// Uses a beta-like distribution: center = 0.5 + flexibility, then draw
// around that center within [lo, hi].
function flexDraw(lo, hi, flexibility) {
  if (!flexibility) return uniformDraw(lo, hi);
  // Shift the midpoint of the draw range
  const center = 0.5 + flexibility; // 0.0 to 1.0 within range
  // Use a triangular-ish draw centered at the shifted point
  // Two uniform draws averaged = triangular distribution
  const u1 = Math.random(), u2 = Math.random();
  const raw = (u1 + u2) / 2; // triangular on [0,1], centered at 0.5
  // Shift: remap so the peak is at 'center' instead of 0.5
  const shifted = Math.max(0, Math.min(1, raw + (center - 0.5)));
  return lo + shifted * (hi - lo);
}

// ============================================================================
// HISTORICAL PRECEDENT TABLE (post-war Danish governments)
// ============================================================================
// Higher = more historical precedent. Coalition key is sorted member IDs.
const HISTORICAL_PRECEDENTS = {
  "S": 7,          // S-alone: ~7 by PM tenure (Hedtoft–Frederiksen I); 11 cabinets
  "S+RV": 5,       // S+RV: Nyrup II-IV (1994-2001), Kampmann, Krag I
  "S+SF": 0,       // S+SF without RV: never formed (SF only governed in Thorning I w/ RV)
  "RV+S+SF": 1,    // S+RV+SF: Thorning I (2011-2014) — only instance
  "V": 4,          // V-alone: Løkke II (2015-2016), Hartling, etc.
  "KF+V": 5,       // VK: Fogh I-III, Løkke I (2001-2011)
  "KF+LA+V": 1,    // VLAK: Løkke III (2016-2019) — only instance
  "M+S+V": 2,      // SVM: Frederiksen II (2022-2026) — recent but only once
  "EL+RV+S+SF": 1, // Never as government, but 2019 forståelsespapir arrangement
  "M+S": 1,        // Never formed (SV 1978 is a distant analogue)
  "M+S+SF": 0,     // Never formed
  "M+RV+S+SF": 0,  // Never formed
  "S+V": 1,        // SV 1978 (14 months, widely considered a failure)
  // New entries for sim4 coalition types (never formed)
  "KF+M": 0,
  "DD+KF+LA+V": 0,
  "KF+S": 0,
  "LA+M": 0,
  "DD+V": 0,
  "DD+LA": 0,
  "KF+LA+M+V": 0,
  "M": 0,
  "LA": 0,
};

// Historical precedent bonus multiplier for coalition scoring.
// 0 precedent = 1.0 (no bonus), higher precedent = multiplicative boost.
function historicalPrecedentBonus(govMembers, cfg) {
  const key = [...govMembers].sort().join("+");
  const score = HISTORICAL_PRECEDENTS[key] || 0;
  const weight = cfg.precedentWeight != null ? cfg.precedentWeight : 0.02; // 2% per precedent point
  return 1.0 + score * weight;
}

// ============================================================================
// PER-PARTY FLEXIBILITY DRAW
// ============================================================================
// Combines global flexibility (cfg.flexibility) with per-party flex (PARTY_FLEX).
// The sum is clamped to [-0.5, +0.5] and passed to flexDraw.
function partyFlexDraw(lo, hi, partyId, globalFlex) {
  const partyFlex = PARTY_FLEX[partyId] || 0;
  const effectiveFlex = Math.max(-0.5, Math.min(0.5, partyFlex + globalFlex));
  return flexDraw(lo, hi, effectiveFlex);
}

// ============================================================================
// SF ACCEPT M DRAW (local — no longer imported)
// ============================================================================
function sfAcceptMDraw(lo, hi) {
  if (lo >= 1.0 && hi >= 1.0) return 1.0;
  return uniformDraw(lo, hi);
}

// ============================================================================
// LAYER 1: FIXED MANDATES
// ============================================================================

function getMandates(mandateOverrides) {
  const mdt = {};
  for (const p of PARTIES) mdt[p.id] = mandateOverrides[p.id] != null ? mandateOverrides[p.id] : p.m;
  for (const s of NA_SEATS) mdt[s.id] = mandateOverrides[s.id] != null ? mandateOverrides[s.id] : s.m;
  return mdt;
}

function perturbMandates(baseMandates, perturbation) {
  if (!perturbation) return { ...baseMandates };
  const mdt = { ...baseMandates };
  const danishIds = PARTIES.map(p => p.id);
  for (let i = 0; i < perturbation; i++) {
    const from = danishIds[Math.floor(Math.random() * danishIds.length)];
    const to = danishIds[Math.floor(Math.random() * danishIds.length)];
    if (from !== to && mdt[from] > 1) { mdt[from]--; mdt[to]++; }
  }
  return mdt;
}

// ============================================================================
// NA ALIGNMENT DRAWS
// ============================================================================

function drawNAAlignments(cfg) {
  const shift = cfg.naRedShift || 0;
  const alignments = {};
  for (const seat of NA_SEATS) {
    // Apply naRedShift: shift pRed up (and pBlue down), keeping pFlexible constant
    let pRed = seat.pRed + shift;
    let pBlue = (1 - seat.pRed - seat.pFlexible) - shift;
    // Clamp and renormalize if needed
    pRed = Math.max(0, Math.min(1, pRed));
    pBlue = Math.max(0, Math.min(1, pBlue));
    const total = pRed + seat.pFlexible + pBlue;
    const pRedN = pRed / total;
    const pFlexN = seat.pFlexible / total;
    const r = Math.random();
    if (r < pRedN) alignments[seat.id] = "red";
    else if (r < pRedN + pFlexN) alignments[seat.id] = "flexible";
    else alignments[seat.id] = "blue";
  }
  return alignments;
}

function naPmPref(alignment, mandates) {
  if (alignment === "red") return "S";
  if (alignment === "blue") {
    return (mandates["LA"] || 0) > (mandates["V"] || 0) ? "LA" : "V";
  }
  if (Math.random() < 0.6) return "S";
  return (mandates["LA"] || 0) > (mandates["V"] || 0) ? "LA" : "V";
}

// ============================================================================
// PRE-DRAWN BUDGET VOTE BASES (drawn once per outer iteration)
// ============================================================================
// Each party's "base willingness" is drawn stochastically once per iteration.
// Platform evaluation then applies deterministic modifiers to these bases.

function drawBudgetBases(params, cfg) {
  const gf = cfg && cfg.flexibility || 0; // global flexibility parameter
  const pfd = (lo, hi, pid) => partyFlexDraw(lo, hi, pid, gf); // per-party flex draw
  return {
    // SF scenarios — use SF's flex
    sf_in_govt_formueskat: pfd(0.92, 0.99, "SF"),
    sf_in_govt_substitute: pfd(0.70, 0.95, "SF"),
    sf_excl_sled_good:     pfd(0.08, 0.40, "SF"),  // lowered: "govt or nothing" 2026 rhetoric
    sf_excl_sled_bad:      pfd(0.05, 0.30, "SF"),
    sf_excl_midter:        pfd(0.03, 0.20, "SF"),
    sf_blueled:            uniformDraw(0.00, 0.03), // near-zero, flexibility irrelevant

    // EL scenarios — use EL's flex
    el_forst_prog:       pfd(0.55, 0.85, "EL"),
    el_forst_none:       pfd(0.25, 0.55, "EL"),
    el_noforst_red:      pfd(0.05, 0.20, "EL"),
    el_noforst_midter:   pfd(0.02, 0.12, "EL"),
    el_blueled:          uniformDraw(0.00, 0.03),
    el_imm_penalty:      uniformDraw(0.15, 0.40),

    // RV scenarios — use RV's flex
    rv_in_govt:          pfd(0.92, 0.99, "RV"),
    rv_excl_green_high:  pfd(0.45, 0.75, "RV"),
    rv_excl_green_med:   pfd(0.30, 0.55, "RV"),
    rv_excl_green_low:   pfd(0.10, 0.30, "RV"),
    rv_blueled:          uniformDraw(0.02, 0.15),
    rv_blueled_df:       uniformDraw(0.00, 0.05),
    rv_imm_penalty:      uniformDraw(0.10, 0.30),

    // M scenarios — use M's flex
    m_in_govt:           pfd(0.92, 0.99, "M"),
    m_excl_centrist:     pfd(0.30, 0.60, "M"),
    m_excl_formueskat:   pfd(0.03, 0.15, "M"),
    m_excl_substitute:   pfd(params.m_substitute_pfor_lo || 0.15,
                             params.m_substitute_pfor_hi || 0.45, "M"),
    m_blueled:           pfd(0.35, 0.65, "M"),
    m_forst_penalty:     uniformDraw(0.20, 0.50),
    m_imm_penalty:       uniformDraw(0.05, 0.15),

    // KF scenarios — use KF's flex
    kf_in_govt:          pfd(0.92, 0.99, "KF"),
    kf_excl_sled_good:   pfd(0.08, 0.35, "KF"),
    kf_excl_sled_bad:    pfd(0.02, 0.10, "KF"),
    kf_blueled:          pfd(0.85, 0.97, "KF"),

    // DF scenarios — use DF's flex
    df_blue_restrictive: pfd(0.50, 0.85, "DF"),
    df_blue_moderate:    pfd(0.20, 0.50, "DF"),
    df_blue_status_quo:  pfd(0.05, 0.25, "DF"),
    df_m_penalty:        uniformDraw(0.20, 0.50),
    df_sled:             uniformDraw(0.00, 0.05),
    m_bp_penalty:        uniformDraw(0.75, 0.92),

    // DD scenarios — use DD's flex
    dd_in_govt:          pfd(0.90, 0.99, "DD"),
    dd_blue_noM:         pfd(0.75, 0.95, "DD"),
    dd_blue_M:           pfd(0.10, 0.30, "DD"),
    dd_sled:             uniformDraw(0.00, 0.05),

    // V scenarios — use V's flex
    v_in_govt:   pfd(0.90, 0.99, "V"),
    v_blue_excl: pfd(0.70, 0.90, "V"),
    v_sled_in:   pfd(0.85, 0.97, "V"),
    v_sled_excl: uniformDraw(0.00, 0.05),

    // LA scenarios — use LA's flex
    la_in_govt:   pfd(0.90, 0.99, "LA"),
    la_blue_excl: pfd(0.70, 0.90, "LA"),
    la_sled_excl: uniformDraw(0.00, 0.05),

    // BP scenarios — use BP's flex
    bp_blue: pfd(0.70, 0.90, "BP"),
    bp_sled: uniformDraw(0.00, 0.05),

    // ALT scenarios — use ALT's flex
    alt_sled_red:    pfd(0.45, 0.75, "ALT"),
    alt_sled_midter: pfd(0.10, 0.35, "ALT"),
    alt_blueled:     uniformDraw(0.00, 0.05),

    // NA seats (per-seat draws — neutral flex)
    na_red_same:    pfd(0.70, 0.90, "GL1"),
    na_red_opp:     uniformDraw(0.02, 0.10),
    na_blue_same:   pfd(0.70, 0.90, "GL1"),
    na_blue_opp:    uniformDraw(0.02, 0.10),
    na_flexible:    uniformDraw(0.30, 0.70),
    na_gl_imm_pen:  uniformDraw(0.30, 0.60),

    // V acceptance of S-led invitation
    v_accept_sled: uniformDraw(0.10, 0.40),

    // SF acceptance of governing with M (sweepable via params)
    sf_accept_m: sfAcceptMDraw(params.sfAcceptM_lo || 1.0, params.sfAcceptM_hi || 1.0),
  };
}

// ============================================================================
// DETERMINISTIC BUDGET VOTE EVALUATION
// ============================================================================
// Given pre-drawn bases, compute {pFor, pAbstain, pAgainst} for a party
// given government composition and platform. No random draws here.

function evalBudgetVote(partyId, govSet, platform, bases, params, naAlignments, pmParty, cfg) {
  const side = govSide(govSet);

  // demandPM: party votes AGAINST any budget where it's not PM — whether
  // inside or outside government. A party that demands PM won't join a
  // government as junior partner either.
  // S demands PM unless sRelaxPM is set (models S accepting a non-S PM).
  // M demands PM only if mDemandPM cfg is set (sweepable).
  const demandsPM = (partyId === "S" && !(cfg && cfg.sRelaxPM)) || (partyId === "M" && cfg && cfg.mDemandPM);
  if (demandsPM && pmParty !== partyId) {
    return { pFor: 0, pAbstain: 0.02, pAgainst: 0.98 };
  }

  // demandGov: M insists on being IN government (but not necessarily as PM).
  // When active, M votes AGAINST any budget for a government that excludes M.
  // M in government behaves normally. This is the "kongelig undersøger" strategy:
  // Løkke blocks formation paths that don't include Moderaterne.
  if (partyId === "M" && cfg && cfg.mDemandGov && !govSet.has("M")) {
    return { pFor: 0, pAbstain: 0.02, pAgainst: 0.98 };
  }

  // Government parties vote FOR (near-certain), with soft constraint penalties
  if (govSet.has(partyId)) {
    // V in S-led government: use drawn v_sled_in base instead of generic 0.98
    let inGovPFor = (partyId === "V" && govSet.has("S")) ? bases.v_sled_in : 0.98;
    // M in government + fiscal=expansive → penalty (M values fiscal discipline)
    if (partyId === "M" && platform.fiscal === "expansive") inGovPFor *= 0.85;
    // SF in government + fiscal=tight → penalty (SF demands welfare expansion)
    if (partyId === "SF" && platform.fiscal === "tight") inGovPFor *= 0.80;
    const r = 1 - inGovPFor;
    return { pFor: inGovPFor, pAbstain: r * 0.75, pAgainst: r * 0.25 };
  }

  let pFor, abstainShare;

  switch (partyId) {
    case "SF": {
      if (side === "red") {
        if (govSet.has("M")) {
          pFor = bases.sf_excl_midter;
          abstainShare = params.sf_budget_abstain_sm || 0.50;
        } else if ((platform.taxation === "formueskat" || platform.taxation === "substitute") &&
                   (platform.green === "high" || platform.green === "medium")) {
          pFor = bases.sf_excl_sled_good;
          abstainShare = params.sf_budget_abstain_sf || 0.75;
        } else {
          pFor = bases.sf_excl_sled_bad;
          abstainShare = params.sf_budget_abstain_sf || 0.75;
        }
      } else {
        pFor = bases.sf_blueled;
        abstainShare = 0.30;
      }
      // Composition signal: taxation=none + fiscal=tight → right-tilted budget
      if (platform.taxation === "none" && platform.fiscal === "tight") pFor *= 0.70;
      break;
    }

    case "EL": {
      if (side === "red") {
        if (platform.forstaelsespapir === "yes" &&
            (platform.taxation === "formueskat" || platform.taxation === "substitute")) {
          pFor = bases.el_forst_prog;
        } else if (platform.forstaelsespapir === "yes") {
          pFor = bases.el_forst_none;
        } else if (!govSet.has("M")) {
          pFor = bases.el_noforst_red;
        } else {
          pFor = bases.el_noforst_midter;
        }
        abstainShare = cfg.elAbstainShare;
        if (platform.immigration === "restrictive") pFor *= bases.el_imm_penalty;
      } else {
        pFor = bases.el_blueled;
        abstainShare = 0.25;
      }
      // Composition signal: taxation=none + fiscal=tight → right-tilted budget
      if (platform.taxation === "none" && platform.fiscal === "tight") pFor *= 0.70;
      break;
    }

    case "RV": {
      if (govSet.has("RV")) {
        pFor = bases.rv_in_govt;
        abstainShare = 0.75;
      } else if (side === "red") {
        if (platform.green === "high") pFor = bases.rv_excl_green_high;
        else if (platform.green === "medium") pFor = bases.rv_excl_green_med;
        else pFor = bases.rv_excl_green_low;
        abstainShare = 0.75;
        if (platform.immigration === "restrictive") pFor *= bases.rv_imm_penalty;
      } else {
        pFor = platform.immigration === "restrictive" ? bases.rv_blueled_df : bases.rv_blueled;
        abstainShare = 0.02;
      }
      break;
    }

    case "M": {
      if (govSet.has("M")) {
        pFor = bases.m_in_govt;
        abstainShare = cfg.mAbstainShare;
      } else if (side === "red") {
        if (platform.taxation === "formueskat") pFor = bases.m_excl_formueskat;
        else if (platform.taxation === "substitute") pFor = bases.m_excl_substitute;
        else pFor = bases.m_excl_centrist;
        abstainShare = cfg.mAbstainShare;
        // M orientation modifier: mPmPref affects willingness to support S-led budgets
        const mPref = cfg && cfg.mPmPref || "S";
        if (mPref === "V") pFor *= cfg.mPrefV_Sled_modifier;       // M going blue — much less willing to support S-led
        else if (mPref === "M") pFor *= cfg.mPrefSelf_modifier;   // M wants PM — less willing to support others
        // mPref === "S" → no change (baseline calibration)
        if (platform.forstaelsespapir === "yes") pFor *= bases.m_forst_penalty;
        if (platform.immigration === "restrictive") pFor *= bases.m_imm_penalty;
      } else {
        pFor = bases.m_blueled;
        abstainShare = cfg.mAbstainShare;
        // M orientation modifier: mPmPref affects willingness to support blue-led budgets
        const mPref = cfg && cfg.mPmPref || "S";
        if (mPref === "V") pFor = Math.min(pFor * cfg.mPrefV_blue_modifier, 0.95);  // M going blue — more willing
        else if (mPref === "M") pFor *= cfg.mPrefSelf_modifier;   // M wants PM — less willing to support others
        // mPref === "S" → no change (baseline calibration)
        // Immigration=restrictive signals DF accommodation — M's stated veto
        if (platform.immigration === "restrictive") pFor *= bases.m_imm_penalty;
        // BP in Folketing — M's aversion to relying on extreme parties
        if (bases.bp_present) pFor *= bases.m_bp_penalty;
      }
      break;
    }

    case "KF": {
      if (govSet.has("KF")) {
        pFor = bases.kf_in_govt;
        abstainShare = 0.60;
      } else if (side === "blue") {
        pFor = bases.kf_blueled;
        abstainShare = 0.20;
      } else {
        if ((platform.green === "high" || platform.green === "medium") &&
            platform.fiscal === "moderate") {
          pFor = bases.kf_excl_sled_good;
        } else {
          pFor = bases.kf_excl_sled_bad;
        }
        abstainShare = 0.60;
      }
      break;
    }

    case "DF": {
      if (side === "blue") {
        if (platform.immigration === "restrictive") pFor = bases.df_blue_restrictive;
        else if (platform.immigration === "moderate") pFor = bases.df_blue_moderate;
        else pFor = bases.df_blue_status_quo;
        if (govSet.has("M")) pFor *= bases.df_m_penalty;
        abstainShare = 0.20;
      } else {
        pFor = bases.df_sled;
        abstainShare = 0.02;
      }
      break;
    }

    case "DD": {
      if (govSet.has("DD")) {
        pFor = bases.dd_in_govt;
        abstainShare = 0.20;
      } else if (side === "blue") {
        pFor = govSet.has("M") ? bases.dd_blue_M : bases.dd_blue_noM;
        abstainShare = 0.20;
      } else {
        pFor = bases.dd_sled;
        abstainShare = 0.02;
      }
      break;
    }

    case "V": {
      if (govSet.has("V")) {
        pFor = bases.v_in_govt;
        abstainShare = 0.75;
      } else if (side === "blue") {
        pFor = bases.v_blue_excl;
        abstainShare = 0.20;
      } else {
        pFor = bases.v_sled_excl;
        abstainShare = 0.02;
      }
      break;
    }

    case "LA": {
      if (govSet.has("LA")) {
        pFor = bases.la_in_govt;
        abstainShare = 0.75;
      } else if (side === "blue") {
        pFor = bases.la_blue_excl;
        abstainShare = 0.20;
      } else {
        pFor = bases.la_sled_excl;
        abstainShare = 0.02;
      }
      break;
    }

    case "BP": {
      pFor = side === "blue" ? bases.bp_blue : bases.bp_sled;
      abstainShare = side === "blue" ? 0.20 : 0.05;
      break;
    }

    case "ALT": {
      if (side === "red") {
        pFor = govSet.has("M") ? bases.alt_sled_midter : bases.alt_sled_red;
        abstainShare = 0.75;
      } else {
        pFor = bases.alt_blueled;
        abstainShare = 0.25;
      }
      break;
    }

    default: {
      // NA seats
      if (NA_IDS.has(partyId)) {
        const alignment = naAlignments[partyId] || "flexible";
        if (alignment === "red") {
          pFor = side === "red" ? bases.na_red_same : bases.na_red_opp;
          abstainShare = 0.75;
        } else if (alignment === "blue") {
          pFor = side === "blue" ? bases.na_blue_same : bases.na_blue_opp;
          abstainShare = 0.20;
        } else {
          pFor = bases.na_flexible;
          abstainShare = 0.50;
          if ((partyId === "GL1" || partyId === "GL2") &&
              platform.immigration === "restrictive") {
            pFor *= bases.na_gl_imm_pen;
          }
        }
      } else {
        // Unknown party fallback
        pFor = 0.05;
        abstainShare = 0.50;
      }
    }
  }

  pFor = clamp01(pFor);
  const r = 1 - pFor;
  return { pFor, pAbstain: clamp01(r * abstainShare), pAgainst: clamp01(r * (1 - abstainShare)) };
}

// ============================================================================
// LAYER 2: CONFIDENCE CHECK
// ============================================================================
function confidenceCheck(govMembers, mandates) {
  const govSet = new Set(govMembers);
  const leader = govMembers[0];
  let opposition = 0;
  for (const id of ALL_PARTY_IDS) {
    if (!mandates[id] || mandates[id] < 1) continue;
    if (wouldVoteNoConfidence(id, govSet, leader)) opposition += mandates[id];
  }
  return { passes: opposition < 90, opposition };
}

// ============================================================================
// LAYER 2: DP COMPUTATION OF P(PASSAGE)
// ============================================================================
// Uses bounded flat arrays. Reuses pre-allocated buffers.
const DP_MAX = 180;
const DP_SIZE = DP_MAX * DP_MAX;
let _dpA = new Float64Array(DP_SIZE);
let _dpB = new Float64Array(DP_SIZE);

function runDP(govMandates, parties, minForVotes, initAgainst) {
  const a0 = initAgainst || 0;
  let dp = _dpA;
  let dpN = _dpB;
  dp.fill(0);

  dp[govMandates * DP_MAX + a0] = 1.0;
  let fMin = govMandates, fMax = govMandates;
  let aMin = a0, aMax = a0;

  for (let pi = 0; pi < parties.length; pi++) {
    const m = parties[pi].m;
    const pF = parties[pi].pFor;
    const pAg = parties[pi].pAgainst;
    const pAb = parties[pi].pAbstain;

    const newFMax = Math.min(fMax + m, DP_MAX - 1);
    const newAMax = Math.min(aMax + m, DP_MAX - 1);

    // Clear target region
    for (let f = fMin; f <= newFMax; f++) {
      const base = f * DP_MAX;
      for (let a = aMin; a <= newAMax; a++) dpN[base + a] = 0;
    }

    for (let f = fMin; f <= fMax; f++) {
      const base = f * DP_MAX;
      for (let a = aMin; a <= aMax; a++) {
        const prob = dp[base + a];
        if (prob < 1e-15) continue;
        const fNew = f + m;
        if (fNew < DP_MAX) dpN[fNew * DP_MAX + a] += prob * pF;
        const aNew = a + m;
        if (aNew < DP_MAX) dpN[base + aNew] += prob * pAg;
        dpN[base + a] += prob * pAb;
      }
    }

    const tmp = dp; dp = dpN; dpN = tmp;
    fMax = newFMax;
    aMax = newAMax;
  }

  let pPassage = 0;
  const startF = Math.max(fMin, minForVotes);
  for (let f = startF; f <= fMax; f++) {
    const base = f * DP_MAX;
    const aLimit = Math.min(f - 1, aMax);
    for (let a = aMin; a <= aLimit; a++) pPassage += dp[base + a];
  }

  _dpA = dp; _dpB = dpN;
  return pPassage;
}

// Compute P(passage) with EL-M sequential conditioning
function computePpassage(govMembers, platform, mandates, bases, params, naAlignments, cfg) {
  const govSet = new Set(govMembers);
  const minForVotes = cfg.minForVotes != null ? cfg.minForVotes : 70;

  const pmParty = govMembers[0]; // PM is first member by convention

  // Government members who demand PM but aren't PM get treated as non-gov
  // (their mandates go to the DP instead of being auto-counted as FOR)
  let govMandates = 0;
  const rebellingGovMembers = [];
  for (const id of govMembers) {
    const demandsPM = (id === "S" && !(cfg && cfg.sRelaxPM)) || (id === "M" && cfg && cfg.mDemandPM);
    if (demandsPM && pmParty !== id) {
      rebellingGovMembers.push(id); // Process in DP with pFor=0
    } else {
      govMandates += mandates[id] || 0;
    }
  }

  // Collect non-government parties with their vote probabilities
  const nonGovParties = [];
  let elEntry = null;
  let hasMOutside = false;

  for (const id of ALL_PARTY_IDS) {
    if (!mandates[id] || mandates[id] < 1) continue;
    if (govSet.has(id) && !rebellingGovMembers.includes(id)) continue;
    const vote = evalBudgetVote(id, govSet, platform, bases, params, naAlignments, pmParty, cfg);
    const entry = { id, m: mandates[id], pFor: vote.pFor, pAbstain: vote.pAbstain, pAgainst: vote.pAgainst };
    nonGovParties.push(entry);
    if (id === "EL") elEntry = entry;
    if (id === "M") hasMOutside = true;
  }

  // EL-M conditioning: only when both EL and M are outside government AND S-led
  if (elEntry && hasMOutside && pmParty === "S") {
    const elMPenalty = cfg.elMPenalty || 0.70;
    const elMBoost = cfg.elMBoost || 1.10;
    const hasForst = platform.forstaelsespapir === "yes";
    const effectivePenalty = hasForst ? 1 - (1 - elMPenalty) * 0.5 : elMPenalty;

    // Build party lists for each EL outcome (without EL, M adjusted)
    const partiesNoEL = [];
    const partiesNoEL_Mpen = [];
    const partiesNoEL_Mboost = [];

    for (const p of nonGovParties) {
      if (p.id === "EL") continue;
      partiesNoEL.push(p);
      if (p.id === "M") {
        const mAbs = cfg.mAbstainShare;
        const penFor = clamp01(p.pFor * effectivePenalty);
        const penR = 1 - penFor;
        partiesNoEL_Mpen.push({ ...p, pFor: penFor, pAbstain: penR * mAbs, pAgainst: penR * (1 - mAbs) });
        const boostFor = clamp01(p.pFor * elMBoost);
        const boostR = 1 - boostFor;
        partiesNoEL_Mboost.push({ ...p, pFor: boostFor, pAbstain: boostR * mAbs, pAgainst: boostR * (1 - mAbs) });
      } else {
        partiesNoEL_Mpen.push(p);
        partiesNoEL_Mboost.push(p);
      }
    }

    const pELfor = runDP(govMandates + elEntry.m, partiesNoEL_Mpen, minForVotes, 0);
    const pELabstain = runDP(govMandates, partiesNoEL, minForVotes, 0);
    const pELagainst = runDP(govMandates, partiesNoEL_Mboost, minForVotes, elEntry.m);

    return elEntry.pFor * pELfor + elEntry.pAbstain * pELabstain + elEntry.pAgainst * pELagainst;
  }

  return runDP(govMandates, nonGovParties, minForVotes);
}

// ============================================================================
// PLATFORM CACHE (dynamic, built from enumerated coalitions)
// ============================================================================

function buildPlatformCache(coalitions) {
  const cache = {};
  for (const coal of coalitions) {
    const key = coal.members.join("+");
    if (!cache[key]) cache[key] = getCoherentPlatforms(coal.members);
  }
  return cache;
}

// ============================================================================
// COALITION-THEORY SCORING COMPONENTS
// ============================================================================

// 1. Average pairwise LR distance within government coalition parties
function avgPairwiseLRDist(govMembers, parties) {
  if (govMembers.length < 2) return 0;
  let totalDist = 0, pairs = 0;
  for (let i = 0; i < govMembers.length; i++) {
    for (let j = i + 1; j < govMembers.length; j++) {
      const a = parties.find(p => p.id === govMembers[i]);
      const b = parties.find(p => p.id === govMembers[j]);
      if (a && b) {
        totalDist += Math.abs(a.lr - b.lr) / 9; // normalize to 0-1
        pairs++;
      }
    }
  }
  return pairs > 0 ? totalDist / pairs : 0;
}

// 2. MWCC helper: is the coalition connected on the LR axis?
// Allows at most 1 gov-eligible party within the LR range to be missing.
function isConnected(govMembers, allParties) {
  if (govMembers.length <= 1) return true;
  const lrs = govMembers.map(id => {
    const p = allParties.find(pp => pp.id === id);
    return p ? p.lr : 5;
  });
  const minLr = Math.min(...lrs);
  const maxLr = Math.max(...lrs);
  // Count gov-eligible parties in the LR range that are NOT in coalition
  const gaps = allParties
    .filter(p => p.lr >= minLr && p.lr <= maxLr && p.govEligible)
    .filter(p => !govMembers.includes(p.id));
  return gaps.length <= 1;
}

// 3. MWCC helper: is the coalition minimum winning?
// Oversized if any single member can be removed and gov mandates still >= 90.
function isMinimumWinning(govMembers, mandates) {
  const total = govMembers.reduce((s, id) => s + (mandates[id] || 0), 0);
  if (total >= 90) {
    // Oversized — check if any member is superfluous
    for (const id of govMembers) {
      if (total - (mandates[id] || 0) >= 90) return false;
    }
  }
  return true;
}

// Combined MWCC bonus
function mwccBonus(govMembers, mandates, allParties, cfg) {
  const connected = isConnected(govMembers, allParties);
  const minWin = isMinimumWinning(govMembers, mandates);
  const fullBonus = cfg.mwccFullBonus;
  if (connected && minWin) return fullBonus;  // Full MWCC bonus
  if (connected) return 1.08;            // Connected only: 8% bonus
  if (minWin) return 1.05;               // MWC only: 5% bonus
  return 1.0;                            // Neither: no bonus
}

// Heuristic pre-filter score: fast expected-FOR approximation
const TOP_K_PLATFORMS = 4;

function heuristicScore(govMembers, platform, mandates, bases, params, naAlignments, formateur, taxWeight, cfg) {
  const govSet = new Set(govMembers);
  let expectedFor = 0;
  for (const id of ALL_PARTY_IDS) {
    if (!mandates[id] || mandates[id] < 1) continue;
    if (govSet.has(id)) { expectedFor += mandates[id]; continue; }
    const pmPartyH = govMembers[0];
    const vote = evalBudgetVote(id, govSet, platform, bases, params, naAlignments, pmPartyH, cfg);
    expectedFor += mandates[id] * vote.pFor;
  }
  return expectedFor * getPreferenceWeight(formateur, platform, taxWeight);
}

// Evaluate a coalition: find best platform by policy-weighted P(passage).
function evaluatePackage(coalition, mandates, bases, params, naAlignments, cfg, platformCache) {
  const key = coalition.members.join("+");
  const platforms = platformCache[key];
  if (!platforms || platforms.length === 0) return null;

  const formateur = coalition.leader;
  const taxWeight = cfg.taxWeight || 1.00;

  // Coalition-theory scoring components
  const avgDist = avgPairwiseLRDist(coalition.members, PARTIES);
  const ideoFit = Math.max(0.3, 1 - avgDist * (cfg.distPenalty || 1.5));
  const sizeBon = Math.max(0.5, 1 - (coalition.members.length - 1) * (cfg.sizePenalty || 0.08));
  const mwcc = mwccBonus(coalition.members, mandates, PARTIES, cfg);
  const precBonus = historicalPrecedentBonus(coalition.members, cfg);

  // Reorder members so formateur is first (PM convention)
  const orderedMembers = [formateur, ...coalition.members.filter(id => id !== formateur)];

  // If few platforms, evaluate all with full DP (no pre-filter needed)
  if (platforms.length <= TOP_K_PLATFORMS) {
    let bestScore = -1, bestPPassage = 0, bestPlatform = null;
    for (const platform of platforms) {
      const pPassage = computePpassage(orderedMembers, platform, mandates, bases, params, naAlignments, cfg);
      const score = pPassage * getPreferenceWeight(formateur, platform, taxWeight) * ideoFit * sizeBon * mwcc * precBonus;
      if (score > bestScore) { bestScore = score; bestPPassage = pPassage; bestPlatform = platform; }
    }
    return bestPlatform ? { pPassage: bestPPassage, score: bestScore, bestPlatform } : null;
  }

  // Pre-filter: score all platforms with fast expected-FOR heuristic
  const scored = [];
  for (let i = 0; i < platforms.length; i++) {
    scored.push({ idx: i, h: heuristicScore(orderedMembers, platforms[i], mandates, bases, params, naAlignments, formateur, taxWeight, cfg) });
  }
  scored.sort((a, b) => b.h - a.h);

  // Full DP on top candidates only
  let bestScore = -1, bestPPassage = 0, bestPlatform = null;
  const limit = Math.min(TOP_K_PLATFORMS, scored.length);
  for (let k = 0; k < limit; k++) {
    const platform = platforms[scored[k].idx];
    const pPassage = computePpassage(orderedMembers, platform, mandates, bases, params, naAlignments, cfg);
    const score = pPassage * getPreferenceWeight(formateur, platform, taxWeight) * ideoFit * sizeBon * mwcc * precBonus;
    if (score > bestScore) { bestScore = score; bestPPassage = pPassage; bestPlatform = platform; }
  }
  return bestPlatform ? { pPassage: bestPPassage, score: bestScore, bestPlatform } : null;
}

// ============================================================================
// DYAD ACCEPTANCE CHECK
// ============================================================================

function checkDyadAcceptance(members, flexibility) {
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const [lo, hi] = dyadAcceptanceRange(members[i], members[j]);
      if (lo >= 1.0) continue;
      const threshold = partyFlexDraw(lo, hi, members[i], flexibility);
      if (Math.random() > threshold) return false;
    }
  }
  return true;
}

// ============================================================================
// FORMATEUR PROTOCOL
// ============================================================================

// Frederiksen preference bonus: redPreference ∈ [0,1] controls preference
// across three tiers:
//   redPreference → 1.0: prefers pure red (S+SF, S+SF+RV, S-alone)
//   redPreference → 0.5: neutral across all coalition types
//   redPreference → 0.0: prefers centrist without SF (S+M, S+RV)
function frederiksenBonus(pkg, redPreference) {
  const members = new Set(pkg.members);
  const hasBlueOrSwingPartner = members.has("M") || members.has("V") || members.has("KF");
  const hasLeftParty = members.has("SF") || members.has("EL") || members.has("ALT");

  // Stochastic noise: exp(0.1 * N(0,1))
  const noise = Math.exp(0.1 * normDraw(0, 1));

  // Base bonus for midter (any package with M/V/KF)
  const midterBase = (1 - redPreference) * 0.3;
  // Centrist split: only active below redPreference=0.5
  const centristEdge = Math.max(0, 0.5 - redPreference);

  if (!hasBlueOrSwingPartner) {
    // Pure red: S-alone, S+SF, S+SF+RV, S+RV
    return (1.0 + redPreference * 0.3) * noise;
  } else if (!hasLeftParty) {
    // Centrist: S+M, S+V, S+V+M (no SF/EL/ALT)
    return (1.0 + midterBase + centristEdge * 0.6) * noise;
  } else {
    // Broad: S+SF+M, S+SF+RV+M (has both swing and left)
    return (1.0 + midterBase - centristEdge * 0.4) * noise;
  }
}

// Determine formateur order: endogenous to mandate distribution and M orientation.
function determineFormateurOrder(mandates, cfg) {
  const blueBloc = (mandates["V"]||0) + (mandates["LA"]||0) + (mandates["KF"]||0) +
                   (mandates["DD"]||0) + (mandates["DF"]||0) + (mandates["BP"]||0);
  const redBloc = (mandates["S"]||0) + (mandates["SF"]||0) + (mandates["EL"]||0) +
                  (mandates["ALT"]||0) + (mandates["RV"]||0);
  let effectivePBF;
  if (cfg._pBlueFormateurExplicit) {
    effectivePBF = cfg.pBlueFormateur;
  } else if (blueBloc >= 90) {
    effectivePBF = 0.95;
  } else if (redBloc >= 90) {
    effectivePBF = 0.02;
  } else {
    const mPref = cfg.mPmPref || "S";
    const mBlueBloc = blueBloc + (mandates["M"] || 0);
    if (mPref === "V" && mBlueBloc >= 90) effectivePBF = 0.55;
    else if (mPref === "V") effectivePBF = 0.35;
    else if (mPref === "M") effectivePBF = 0.20;
    else effectivePBF = 0.05;
  }
  return Math.random() < effectivePBF; // true = blue first
}

// Multi-round formateur protocol
function selectGovernment(mandates, naAlignments, params, cfg, coalitions, platformCache) {
  const maxRounds = cfg.maxFormationRounds || 3;
  const flexIncrement = cfg.flexIncrement || 0.05;
  const viabilityThreshold = cfg.viabilityThreshold || 0.50;
  const redPreference = cfg.redPreference != null ? cfg.redPreference : 0.5;

  const sLed = coalitions.filter(c => c.leader === "S");
  const blueLed = coalitions.filter(c => c.leader === "V" || c.leader === "LA");
  const mLed = coalitions.filter(c => c.leader === "M");

  for (let round = 0; round < maxRounds; round++) {
    const roundFlex = Math.min(0.5, (cfg.flexibility || 0) + round * flexIncrement);
    const roundCfg = { ...cfg, flexibility: roundFlex };
    const bases = drawBudgetBases(params, roundCfg);
    bases.bp_present = (mandates["BP"] || 0) > 0;

    const blueFirst = determineFormateurOrder(mandates, roundCfg);

    function tryGroup(groupCoalitions, bonus_fn) {
      const results = [];
      for (const coal of groupCoalitions) {
        if (!confidenceCheck(coal.members, mandates).passes) continue;
        if (!checkDyadAcceptance(coal.members, roundFlex)) continue;
        // V acceptance gate for S-led coalitions with V
        if (coal.leader === "S" && coal.members.includes("V")) {
          if (Math.random() > bases.v_accept_sled) continue;
        }
        // SF acceptance gate for coalitions with both SF and M
        if (coal.members.includes("SF") && coal.members.includes("M")) {
          if (Math.random() > bases.sf_accept_m) continue;
        }
        const result = evaluatePackage(coal, mandates, bases, params, naAlignments, roundCfg, platformCache);
        if (result && result.pPassage > viabilityThreshold) {
          const conf = confidenceCheck(coal.members, mandates);
          const bonus = bonus_fn ? bonus_fn(coal) : 1.0;
          const totalScore = result.score * bonus;
          results.push({ coal, result, conf, totalScore, pm: coal.leader });
        }
      }
      if (results.length === 0) return null;
      results.sort((a, b) => b.totalScore - a.totalScore);
      const best = results[0];
      return {
        pm: best.pm,
        govType: classifyGovType(best.coal.members),
        coalition: best.coal.name,
        members: best.coal.members,
        bestPlatform: best.result.bestPlatform,
        pPassage: best.result.pPassage,
        score: best.totalScore,
        confidence: best.conf,
        concessions: coalitionConcessions(best.coal.members, best.result.bestPlatform),
      };
    }

    const sLedBonus = (coal) => frederiksenBonus(coal, redPreference);
    const blueBonus = (coal) => {
      const bluePM = (mandates["LA"] || 0) > (mandates["V"] || 0) ? "LA" : "V";
      const leaderBonus = coal.leader === bluePM ? 1.15 : 1.0;
      return leaderBonus * Math.exp(0.1 * normDraw(0, 1));
    };
    const mLedBonus = (coal) => Math.exp(0.1 * normDraw(0, 1));

    let result;
    if (blueFirst) {
      result = tryGroup(blueLed, blueBonus) || tryGroup(sLed, sLedBonus) || tryGroup(mLed, mLedBonus);
    } else {
      result = tryGroup(sLed, sLedBonus) || tryGroup(blueLed, blueBonus) || tryGroup(mLed, mLedBonus);
    }

    if (result) {
      result.formationRound = round + 1;
      return result;
    }
  }

  return null;
}

// ============================================================================
// MAIN SIMULATION LOOP
// ============================================================================
function runSim(userCfg, N) {
  const mandateOverrides = userCfg.mandates || {};
  const sweepParams = userCfg.sweep || {};
  const cfg = {
    redPreference: userCfg.cfg?.redPreference != null ? userCfg.cfg.redPreference : 0.5,
    flexibility: userCfg.cfg?.flexibility != null ? userCfg.cfg.flexibility : 0,
    viabilityThreshold: userCfg.cfg?.viabilityThreshold != null ? userCfg.cfg.viabilityThreshold : 0.50,
    minForVotes: userCfg.cfg?.minForVotes != null ? userCfg.cfg.minForVotes : 70,
    taxWeight: userCfg.cfg?.taxWeight || 1.00,
    elMPenalty: userCfg.cfg?.elMPenalty || 0.70,
    elMBoost: userCfg.cfg?.elMBoost || 1.10,
    mPmPref: userCfg.cfg?.mPmPref || "S",
    mDemandPM: userCfg.cfg?.mDemandPM || false,
    mDemandGov: userCfg.cfg?.mDemandGov != null ? userCfg.cfg.mDemandGov : true,
    sRelaxPM: userCfg.cfg?.sRelaxPM || false,
    distPenalty: userCfg.cfg?.distPenalty != null ? userCfg.cfg.distPenalty : 1.5,
    sizePenalty: userCfg.cfg?.sizePenalty != null ? userCfg.cfg.sizePenalty : 0.08,
    precedentWeight: userCfg.cfg?.precedentWeight != null ? userCfg.cfg.precedentWeight : 0.02,
    mPrefV_Sled_modifier: userCfg.cfg?.mPrefV_Sled_modifier != null ? userCfg.cfg.mPrefV_Sled_modifier : 0.55,
    mPrefV_blue_modifier: userCfg.cfg?.mPrefV_blue_modifier != null ? userCfg.cfg.mPrefV_blue_modifier : 1.25,
    mPrefSelf_modifier: userCfg.cfg?.mPrefSelf_modifier != null ? userCfg.cfg.mPrefSelf_modifier : 0.60,
    elAbstainShare: userCfg.cfg?.elAbstainShare != null ? userCfg.cfg.elAbstainShare : 0.85,
    mAbstainShare: userCfg.cfg?.mAbstainShare != null ? userCfg.cfg.mAbstainShare : 0.50,
    mwccFullBonus: userCfg.cfg?.mwccFullBonus != null ? userCfg.cfg.mwccFullBonus : 1.15,
    naRedShift: userCfg.cfg?.naRedShift != null ? userCfg.cfg.naRedShift : 0,
    pBlueFormateur: userCfg.cfg?.pBlueFormateur != null ? userCfg.cfg.pBlueFormateur : 0.15,
    _pBlueFormateurExplicit: userCfg.cfg?.pBlueFormateur != null,
    // New sim4 params
    maxFormationRounds: userCfg.cfg?.maxFormationRounds || 3,
    flexIncrement: userCfg.cfg?.flexIncrement || 0.05,
    perturbation: userCfg.cfg?.perturbation || 0,
    stretchedEligibility: userCfg.cfg?.stretchedEligibility || [],
  };

  const sweepDefaults = {
    sf_budget_abstain_sm: 0.50,
    sf_budget_abstain_sf: 0.75,
    m_substitute_pfor_lo: 0.15,
    m_substitute_pfor_hi: 0.45,
    sfAcceptM_lo: 0.30,
    sfAcceptM_hi: 0.70,
  };

  const sweepKeys = Object.keys(sweepParams);
  if (sweepKeys.length > 0) {
    return runSweep(sweepKeys, sweepParams, sweepDefaults, mandateOverrides, cfg, N);
  }

  return { results: [runSinglePoint(mandateOverrides, { ...sweepDefaults }, cfg, N)] };
}

function runSweep(sweepKeys, sweepParams, defaults, mandateOverrides, cfg, N) {
  // Apply all single-value params (scalars and single-element arrays) as fixed overrides
  const fixedDefaults = { ...defaults };
  for (const k of sweepKeys) {
    const v = sweepParams[k];
    if (Array.isArray(v) && v.length === 1) fixedDefaults[k] = v[0];
    else if (!Array.isArray(v)) fixedDefaults[k] = v;
  }
  // Find a multi-value array key to sweep over (if any)
  const key = sweepKeys.find(k => Array.isArray(sweepParams[k]) && sweepParams[k].length > 1);
  if (!key) {
    // No multi-value sweep — run a single point with all overrides
    return { results: [runSinglePoint(mandateOverrides, fixedDefaults, cfg, N)] };
  }
  const values = sweepParams[key];

  const results = [];
  for (const val of values) {
    const params = { ...fixedDefaults, [key]: val };
    const cfgCopy = { ...cfg };
    // Propagate any sweep keys to cfg if they match cfg param names
    const cfgKeys = ["redPreference","viabilityThreshold","minForVotes","taxWeight",
      "elMPenalty","mPmPref","distPenalty","sizePenalty",
      "flexibility","precedentWeight"];
    for (const k of sweepKeys) {
      if (k !== key && fixedDefaults[k] != null && cfgKeys.includes(k)) {
        cfgCopy[k] = fixedDefaults[k];
      }
    }
    if (cfgKeys.includes(key)) cfgCopy[key] = val;
    results.push(runSinglePoint(mandateOverrides, params, cfgCopy, N));
  }
  return { sweepParam: key, results };
}

function runSinglePoint(mandateOverrides, params, cfg, N) {
  // Fixed mandates
  const baseMandates = getMandates(mandateOverrides);

  // Enumerate coalitions ONCE (deterministic with fixed mandates)
  const coalitions = enumerateCoalitions(baseMandates, cfg);
  const platformCache = buildPlatformCache(coalitions);

  const agg = {
    pmCounts: {},
    govTypeCounts: {},
    coalitionCounts: {},
    packageViability: {},
    noGovCount: 0,
    confidenceData: { sLedOpp: 0, blueLedOpp: 0, sLedCount: 0, blueLedCount: 0 },
    formationRounds: { total: 0, dist: {} },
    mInGov: 0,
    mAsPm: 0,
    concessionSums: {},
    concessionCounts: {},
  };

  for (let i = 0; i < N; i++) {
    // Optional perturbation for sensitivity analysis
    const mdt = perturbMandates(baseMandates, cfg.perturbation);
    const naAlignments = drawNAAlignments(cfg);

    const result = selectGovernment(mdt, naAlignments, params, cfg, coalitions, platformCache);

    if (!result) {
      agg.noGovCount++;
      agg.govTypeCounts["none"] = (agg.govTypeCounts["none"] || 0) + 1;
      continue;
    }

    agg.pmCounts[result.pm] = (agg.pmCounts[result.pm] || 0) + 1;
    agg.govTypeCounts[result.govType] = (agg.govTypeCounts[result.govType] || 0) + 1;
    agg.coalitionCounts[result.coalition] = (agg.coalitionCounts[result.coalition] || 0) + 1;

    // Formation rounds tracking
    agg.formationRounds.total += result.formationRound;
    agg.formationRounds.dist[result.formationRound] = (agg.formationRounds.dist[result.formationRound] || 0) + 1;

    // Kingmaker tracking
    if (result.members.includes("M")) agg.mInGov++;
    if (result.pm === "M") agg.mAsPm++;

    // Package viability
    const pKey = result.coalition;
    if (!agg.packageViability[pKey]) {
      agg.packageViability[pKey] = { pPassageSum: 0, count: 0, platforms: {} };
    }
    agg.packageViability[pKey].pPassageSum += result.pPassage;
    agg.packageViability[pKey].count += 1;
    const platStr = platformToString(result.bestPlatform);
    agg.packageViability[pKey].platforms[platStr] = (agg.packageViability[pKey].platforms[platStr] || 0) + 1;

    // Concession tracking
    if (result.concessions) {
      if (!agg.concessionSums[pKey]) {
        agg.concessionSums[pKey] = {};
        agg.concessionCounts[pKey] = 0;
      }
      agg.concessionCounts[pKey]++;
      for (const [partyId, conc] of Object.entries(result.concessions)) {
        agg.concessionSums[pKey][partyId] = (agg.concessionSums[pKey][partyId] || 0) + conc.total;
      }
    }

    // Confidence data
    if (result.confidence) {
      if (result.pm === "S") {
        agg.confidenceData.sLedOpp += result.confidence.opposition;
        agg.confidenceData.sLedCount++;
      } else {
        agg.confidenceData.blueLedOpp += result.confidence.opposition;
        agg.confidenceData.blueLedCount++;
      }
    }
  }

  return formatOutput(agg, params, cfg, N);
}

function formatOutput(agg, params, cfg, N) {
  const pm = {};
  for (const [k, v] of Object.entries(agg.pmCounts)) pm[k] = +((v / N) * 100).toFixed(2);

  const govType = {};
  for (const [k, v] of Object.entries(agg.govTypeCounts)) govType[k] = +((v / N) * 100).toFixed(2);

  const topCoalitions = Object.entries(agg.coalitionCounts)
    .sort((a, b) => b[1] - a[1]).slice(0, 15)
    .map(([govt, count]) => {
      const pv = agg.packageViability[govt];
      let bestPlatform = "N/A";
      if (pv?.platforms) {
        bestPlatform = Object.entries(pv.platforms).sort((a, b) => b[1] - a[1])[0]?.[0] || "N/A";
      }
      const avgPPassage = pv ? +(pv.pPassageSum / pv.count).toFixed(3) : 0;
      return { govt, pct: +((count / N) * 100).toFixed(2), avgPPassage, bestPlatform };
    });

  const packageViability = {};
  for (const [k, v] of Object.entries(agg.packageViability)) {
    const bestPlat = Object.entries(v.platforms).sort((a, b) => b[1] - a[1])[0];
    packageViability[k] = {
      pPassage_avg: +(v.pPassageSum / v.count).toFixed(3),
      count: v.count,
      bestPlatform: bestPlat ? bestPlat[0] : "N/A",
    };
  }

  const confidenceCheckData = {};
  if (agg.confidenceData.sLedCount > 0) {
    confidenceCheckData["S-led_avg_opposition"] =
      +(agg.confidenceData.sLedOpp / agg.confidenceData.sLedCount).toFixed(1);
  }
  if (agg.confidenceData.blueLedCount > 0) {
    confidenceCheckData["blue-led_avg_opposition"] =
      +(agg.confidenceData.blueLedOpp / agg.confidenceData.blueLedCount).toFixed(1);
  }

  // Formation rounds
  const govFormed = N - agg.noGovCount;
  const formationRounds = {
    avg: govFormed > 0 ? +(agg.formationRounds.total / govFormed).toFixed(2) : 0,
    distribution: {},
  };
  for (const [round, count] of Object.entries(agg.formationRounds.dist)) {
    formationRounds.distribution[round] = +((count / govFormed) * 100).toFixed(1);
  }

  // Kingmaker analysis
  const kingmaker = {
    mInGovPct: +((agg.mInGov / N) * 100).toFixed(2),
    mAsPmPct: +((agg.mAsPm / N) * 100).toFixed(2),
    mAsSupportPct: +(((govFormed - agg.mInGov) / N) * 100).toFixed(2),
  };

  // Concessions for top coalitions
  const concessions = {};
  for (const [coal, sums] of Object.entries(agg.concessionSums)) {
    const count = agg.concessionCounts[coal];
    concessions[coal] = {};
    for (const [party, total] of Object.entries(sums)) {
      concessions[coal][party] = +(total / count).toFixed(3);
    }
  }

  return {
    params: { ...params, redPreference: cfg.redPreference, viabilityThreshold: cfg.viabilityThreshold,
              minForVotes: cfg.minForVotes, taxWeight: cfg.taxWeight, mPmPref: cfg.mPmPref,
              distPenalty: cfg.distPenalty, sizePenalty: cfg.sizePenalty,
              precedentWeight: cfg.precedentWeight, flexibility: cfg.flexibility,
              maxFormationRounds: cfg.maxFormationRounds, perturbation: cfg.perturbation },
    N, pm, govType, topCoalitions, packageViability, confidenceCheck: confidenceCheckData,
    formationRounds, kingmaker, concessions,
  };
}

// ============================================================================
// CLI
// ============================================================================
function main() {
  const args = process.argv.slice(2);
  let userCfg = {};
  let N = 3000;

  if (args[0]) {
    const arg0 = args[0].replace(/^['"]|['"]$/g, ''); // strip shell quotes if present
    if (arg0.startsWith("{")) {
      userCfg = JSON.parse(arg0);
      if (args[1]) N = parseInt(args[1]);
    } else {
      N = parseInt(args[0]);
    }
  }

  const t0 = Date.now();
  const output = runSim(userCfg, N);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  output.elapsed_seconds = +elapsed;
  console.log(JSON.stringify(output, null, 2));
}

if (typeof module !== "undefined") {
  module.exports = { runSim, getMandates, perturbMandates, computePpassage, runDP, selectGovernment, confidenceCheck };
}
if (require.main === module) main();
