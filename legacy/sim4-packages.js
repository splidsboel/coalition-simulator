// sim4-packages.js — Algorithmic coalition enumeration, policy grid, concession tracking
// Post-election simulator: coalitions are enumerated algorithmically, not hardcoded.

const { PARTIES, PARTY_IDEALS, DIMENSION_ORDINALS, DIMENSION_MAX_DIST } = require("./sim4-parties.js");

// ============================================================================
// POLICY DIMENSIONS
// ============================================================================
const DIMENSIONS = {
  taxation:         ["formueskat", "substitute", "none"],
  forstaelsespapir: ["yes", "no"],
  green:            ["high", "medium", "low"],
  immigration:      ["restrictive", "moderate", "status_quo"],
  fiscal:           ["expansive", "moderate", "tight"],
};

// ============================================================================
// FULL PLATFORM GRID (3×2×3×3×3 = 162 combinations)
// ============================================================================
function generateFullGrid() {
  const grid = [];
  for (const taxation of DIMENSIONS.taxation)
    for (const forstaelsespapir of DIMENSIONS.forstaelsespapir)
      for (const green of DIMENSIONS.green)
        for (const immigration of DIMENSIONS.immigration)
          for (const fiscal of DIMENSIONS.fiscal)
            grid.push({ taxation, forstaelsespapir, green, immigration, fiscal });
  return grid;
}
const FULL_GRID = generateFullGrid();

// ============================================================================
// PLATFORM COHERENCE CONSTRAINTS (expanded for new coalition types)
// ============================================================================

function isStructurallyIncoherent(platform) {
  // formueskat + tight fiscal = incoherent
  if (platform.taxation === "formueskat" && platform.fiscal === "tight") return true;
  // none taxation + expansive fiscal = incoherent
  if (platform.taxation === "none" && platform.fiscal === "expansive") return true;
  return false;
}

function violatesMemberConstraints(platform, govMembers) {
  const s = new Set(govMembers);
  // M → no formueskat
  if (s.has("M") && platform.taxation === "formueskat") return true;
  // SF → no "none" taxation, no "low" green
  if (s.has("SF") && platform.taxation === "none") return true;
  if (s.has("SF") && platform.green === "low") return true;
  // V → taxation=none, no forståelsespapir, no "high" green, no status_quo immigration
  if (s.has("V") && platform.taxation !== "none") return true;
  if (s.has("V") && platform.forstaelsespapir === "yes") return true;
  if (s.has("V") && platform.green === "high") return true;
  if (s.has("V") && platform.immigration === "status_quo") return true;
  // LA → no forståelsespapir, no "high" green, no formueskat
  if (s.has("LA") && platform.forstaelsespapir === "yes") return true;
  if (s.has("LA") && platform.green === "high") return true;
  if (s.has("LA") && platform.taxation === "formueskat") return true;
  // KF → no forståelsespapir
  if (s.has("KF") && platform.forstaelsespapir === "yes") return true;
  // DD → no status_quo immigration, no forståelsespapir
  if (s.has("DD") && platform.immigration === "status_quo") return true;
  if (s.has("DD") && platform.forstaelsespapir === "yes") return true;
  // DF (if in govt via stretchedEligibility) → same as DD
  if (s.has("DF") && platform.immigration === "status_quo") return true;
  if (s.has("DF") && platform.forstaelsespapir === "yes") return true;
  return false;
}

function isPlatformCoherent(platform, govMembers) {
  if (isStructurallyIncoherent(platform)) return false;
  if (violatesMemberConstraints(platform, govMembers)) return false;
  return true;
}

function getCoherentPlatforms(govMembers) {
  return FULL_GRID.filter(p => isPlatformCoherent(p, govMembers));
}

// ============================================================================
// ALGORITHMIC COALITION ENUMERATION
// ============================================================================
// Generates all viable government coalitions from the party set.
// Filters: must have PM candidate, minimum seats, max 5 parties,
// at least 1 coherent platform.

function enumerateCoalitions(mandates, cfg) {
  const eligible = PARTIES.filter(p => p.govEligible).map(p => p.id);

  // Stretched eligibility: include additional parties (e.g., DF) when configured
  if (cfg && cfg.stretchedEligibility) {
    for (const id of cfg.stretchedEligibility) {
      if (!eligible.includes(id)) eligible.push(id);
    }
  }

  const coalitions = [];
  const n = eligible.length;

  for (let mask = 1; mask < (1 << n); mask++) {
    const members = [];
    let seats = 0;
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) {
        members.push(eligible[i]);
        seats += mandates[eligible[i]] || 0;
      }
    }

    // Must include a PM-eligible party (S, M, V, or LA)
    if (!members.some(id => PARTIES.find(p => p.id === id)?.pmEligible)) continue;
    // Single-party coalitions only for parties with ≥14 seats
    if (members.length === 1 && seats < 14) continue;
    // Minimum 20 seats total
    if (seats < 20) continue;
    // Max 5 parties in government
    if (members.length > 5) continue;

    const sorted = [...members].sort();
    // Must have at least 1 coherent platform
    const platforms = getCoherentPlatforms(sorted);
    if (platforms.length === 0) continue;

    // Determine leader: largest PM-eligible member
    let leader = null, leaderSeats = 0;
    for (const id of sorted) {
      const p = PARTIES.find(x => x.id === id);
      if (p?.pmEligible) {
        const s = mandates[id] || 0;
        if (s > leaderSeats) { leader = id; leaderSeats = s; }
      }
    }

    coalitions.push({
      id: mask,
      name: sorted.length === 1 ? `${sorted[0]}-alone` : sorted.join("+"),
      members: sorted,
      leader,
      seats,
      platformCount: platforms.length,
    });
  }

  return coalitions;
}

// ============================================================================
// CONCESSION COMPUTATION
// ============================================================================
// Compute how far a party moves from its ideal point to accept a platform.
// Returns normalized total [0,1] and per-dimension detail.

function computeConcession(partyId, platform) {
  const ideal = PARTY_IDEALS[partyId];
  if (!ideal) return { total: 0, rawTotal: 0, dimensions: {} };

  const dimensions = {};
  let totalDist = 0, maxDist = 0;

  for (const dim of Object.keys(DIMENSION_ORDINALS)) {
    const idealOrd = DIMENSION_ORDINALS[dim][ideal[dim]];
    const actualOrd = DIMENSION_ORDINALS[dim][platform[dim]];
    const dist = Math.abs(idealOrd - actualOrd);
    const maxD = DIMENSION_MAX_DIST[dim];
    dimensions[dim] = { ideal: ideal[dim], actual: platform[dim], distance: dist, maxDistance: maxD };
    totalDist += dist;
    maxDist += maxD;
  }

  return { total: maxDist > 0 ? +(totalDist / maxDist).toFixed(3) : 0, rawTotal: totalDist, dimensions };
}

// Compute concession vector for all government members
function coalitionConcessions(govMembers, platform) {
  const result = {};
  for (const id of govMembers) result[id] = computeConcession(id, platform);
  return result;
}

// ============================================================================
// PREFERENCE WEIGHTS (per formateur — adapted from sim3)
// ============================================================================

function preferenceWeight_S(platform, taxWeight) {
  let w = 1.0;
  if (platform.taxation === "formueskat") w *= taxWeight;
  else if (platform.taxation === "none") w *= (1.0 / taxWeight);
  if (platform.green === "high") w *= 1.03;
  else if (platform.green === "low") w *= 0.97;
  if (platform.immigration === "restrictive") w *= 0.97;
  if (platform.fiscal === "expansive") w *= 1.03;
  else if (platform.fiscal === "tight") w *= 0.97;
  return w;
}

function preferenceWeight_V(platform) {
  let w = 1.0;
  if (platform.taxation === "none") w *= 1.05;
  else if (platform.taxation === "formueskat") w *= 0.85;
  if (platform.immigration === "moderate") w *= 1.02;
  if (platform.fiscal === "tight") w *= 1.03;
  else if (platform.fiscal === "expansive") w *= 0.95;
  return w;
}

function preferenceWeight_LA(platform) {
  let w = 1.0;
  if (platform.taxation === "none") w *= 1.08;
  else if (platform.taxation === "formueskat") w *= 0.80;
  if (platform.fiscal === "tight") w *= 1.05;
  else if (platform.fiscal === "expansive") w *= 0.90;
  return w;
}

function preferenceWeight_M(platform) {
  let w = 1.0;
  if (platform.taxation === "substitute") w *= 1.05;
  else if (platform.taxation === "formueskat") w *= 0.85;
  if (platform.fiscal === "moderate") w *= 1.03;
  return w;
}

function getPreferenceWeight(formateur, platform, taxWeight) {
  if (formateur === "S") return preferenceWeight_S(platform, taxWeight);
  if (formateur === "V") return preferenceWeight_V(platform);
  if (formateur === "LA") return preferenceWeight_LA(platform);
  if (formateur === "M") return preferenceWeight_M(platform);
  return 1.0;
}

// ============================================================================
// GOVERNMENT TYPE CLASSIFICATION (expanded)
// ============================================================================

function classifyGovType(members) {
  if (members.length === 1) {
    if (members[0] === "S") return "S-alone";
    if (members[0] === "M") return "M-alone";
    return "minority";
  }

  const hasRed = members.some(id => ["S", "SF", "EL", "ALT", "RV"].includes(id));
  const hasBlue = members.some(id => ["V", "LA", "KF", "DD", "DF", "BP"].includes(id));
  const hasSwing = members.some(id => id === "M");

  if (hasRed && hasBlue && hasSwing) return "midter";
  if (hasRed && hasBlue) return "cross";
  if (hasRed && !hasBlue && !hasSwing) return "red";
  if (hasRed && hasSwing && !hasBlue) return "center-left";
  if (hasBlue && hasSwing && !hasRed) return "center-right";
  if (hasBlue && !hasRed) return "blue";
  return "other";
}

// ============================================================================
// PLATFORM STRING REPRESENTATION
// ============================================================================
function platformToString(p) {
  return `${p.taxation}/${p.forstaelsespapir}/${p.green}/${p.immigration}/${p.fiscal}`;
}

module.exports = {
  DIMENSIONS, FULL_GRID, getCoherentPlatforms, isPlatformCoherent,
  enumerateCoalitions,
  computeConcession, coalitionConcessions,
  getPreferenceWeight, platformToString, classifyGovType,
};
