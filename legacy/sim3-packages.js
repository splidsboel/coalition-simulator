// sim3-packages.js — Enumerated government packages, platform grid, coherence constraints
// See sim3-spec.md §8, §9.3, §9.4

// ============================================================================
// POLICY DIMENSIONS (spec §5)
// ============================================================================
const DIMENSIONS = {
  taxation:        ["formueskat", "substitute", "none"],
  forstaelsespapir: ["yes", "no"],
  green:           ["high", "medium", "low"],
  immigration:     ["restrictive", "moderate", "status_quo"],
  fiscal:          ["expansive", "moderate", "tight"],
};

// ============================================================================
// ENUMERATED GOVERNMENT PACKAGES (spec §8.1)
// ============================================================================
const PACKAGES = [
  { id: 1,  name: "S-alone",    members: ["S"],             leader: "S" },
  { id: 2,  name: "S+SF",       members: ["S", "SF"],       leader: "S" },
  { id: 3,  name: "S+SF+RV",    members: ["S", "SF", "RV"], leader: "S" },
  { id: 4,  name: "S+RV",       members: ["S", "RV"],       leader: "S" },
  { id: 5,  name: "S+M",        members: ["S", "M"],        leader: "S" },
  { id: 6,  name: "S+SF+M",     members: ["S", "SF", "M"],  leader: "S" },
  { id: 7,  name: "S+SF+RV+M",  members: ["S", "SF", "RV", "M"], leader: "S" },
  { id: 8,  name: "S+V",        members: ["S", "V"],        leader: "S" },
  { id: 9,  name: "S+V+M",      members: ["S", "V", "M"],   leader: "S" },
  { id: 10, name: "V-led blue", members: ["V", "LA", "KF"], leader: "V" },
  { id: 11, name: "LA-led blue",members: ["LA", "V", "KF"], leader: "LA" },
  // Blå midterregering: TLP's proposal (V/LA+KF+M, blue-led with M as junior partner)
  { id: 14, name: "V-led blå midter", members: ["V", "LA", "KF", "M"], leader: "V" },
  { id: 15, name: "LA-led blå midter",members: ["LA", "V", "KF", "M"], leader: "LA" },
  // M-led packages (only evaluated when sRelaxPM = true)
  { id: 12, name: "M+S+SF",    members: ["M", "S", "SF"],  leader: "M" },
  { id: 13, name: "M+S+RV",    members: ["M", "S", "RV"],  leader: "M" },
];

// ============================================================================
// PACKAGE GROUPINGS (S-led vs blue-led vs M-led)
// ============================================================================
const S_LED_PACKAGES = PACKAGES.filter(p => p.leader === "S");
const BLUE_LED_PACKAGES = PACKAGES.filter(p => p.leader === "V" || p.leader === "LA");
const M_LED_PACKAGES = PACKAGES.filter(p => p.leader === "M");

// ============================================================================
// PLATFORM COHERENCE CONSTRAINTS (spec §9.4)
// ============================================================================

// Structural incoherence: these combinations are never valid
function isStructurallyIncoherent(platform) {
  // formueskat + tight fiscal = incoherent
  if (platform.taxation === "formueskat" && platform.fiscal === "tight") return true;
  // none taxation + expansive fiscal = incoherent
  if (platform.taxation === "none" && platform.fiscal === "expansive") return true;
  return false;
}

// Government-member constraints: hard constraints from coalition members
function violatesMemberConstraints(platform, govMembers) {
  const memberSet = new Set(govMembers);

  // M in government -> taxation != formueskat
  if (memberSet.has("M") && platform.taxation === "formueskat") return true;
  // SF in government -> taxation != none
  if (memberSet.has("SF") && platform.taxation === "none") return true;
  // SF in government -> green >= medium
  if (memberSet.has("SF") && platform.green === "low") return true;
  // V in government -> taxation = none
  if (memberSet.has("V") && platform.taxation !== "none") return true;
  // V in government -> immigration != status_quo
  if (memberSet.has("V") && platform.immigration === "status_quo") return true;
  // V in government -> no forståelsespapir (V would never offer EL a written agreement)
  if (memberSet.has("V") && platform.forstaelsespapir === "yes") return true;
  // V in government -> green != high (V opposes maximum green ambition)
  if (memberSet.has("V") && platform.green === "high") return true;
  // LA in government -> no forståelsespapir
  if (memberSet.has("LA") && platform.forstaelsespapir === "yes") return true;
  // LA in government -> green != high
  if (memberSet.has("LA") && platform.green === "high") return true;

  return false;
}

// Check if platform is coherent for a given government package
function isPlatformCoherent(platform, govMembers) {
  if (isStructurallyIncoherent(platform)) return false;
  if (violatesMemberConstraints(platform, govMembers)) return false;
  return true;
}

// ============================================================================
// FULL PLATFORM GRID (3 x 2 x 3 x 3 x 3 = 162 combinations)
// ============================================================================
function generateFullGrid() {
  const grid = [];
  for (const taxation of DIMENSIONS.taxation) {
    for (const forstaelsespapir of DIMENSIONS.forstaelsespapir) {
      for (const green of DIMENSIONS.green) {
        for (const immigration of DIMENSIONS.immigration) {
          for (const fiscal of DIMENSIONS.fiscal) {
            grid.push({ taxation, forstaelsespapir, green, immigration, fiscal });
          }
        }
      }
    }
  }
  return grid;
}

const FULL_GRID = generateFullGrid();

// Get coherent platforms for a specific package
function getCoherentPlatforms(govMembers) {
  return FULL_GRID.filter(p => isPlatformCoherent(p, govMembers));
}

// ============================================================================
// FORMATEUR POLICY PREFERENCES (spec §9.3)
// ============================================================================
// Returns a preference weight multiplier for a platform given the formateur.

function preferenceWeight_S(platform, taxWeight) {
  let w = 1.0;
  // Taxation preference: formueskat preferred (sweepable weight)
  if (platform.taxation === "formueskat") w *= taxWeight;
  else if (platform.taxation === "none") w *= (1.0 / taxWeight);
  // substitute = 1.0 (neutral)

  // Green preference
  if (platform.green === "high") w *= 1.03;
  else if (platform.green === "low") w *= 0.97;

  // Immigration: status_quo/moderate neutral, restrictive mildly dispreferred
  if (platform.immigration === "restrictive") w *= 0.97;

  // Fiscal: moderate neutral, expansive mildly preferred, tight dispreferred
  if (platform.fiscal === "expansive") w *= 1.03;
  else if (platform.fiscal === "tight") w *= 0.97;

  return w;
}

function preferenceWeight_V(platform) {
  let w = 1.0;
  if (platform.taxation === "none") w *= 1.05;
  else if (platform.taxation === "formueskat") w *= 0.85;
  if (platform.immigration === "moderate") w *= 1.02;
  else if (platform.immigration === "restrictive") w *= 1.00;
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

// M as formateur: pragmatic centrist — mild preference for substitute taxation,
// moderate fiscal, no strong policy convictions (consistent with Løkke's profile)
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
// PLATFORM STRING REPRESENTATION
// ============================================================================
function platformToString(p) {
  return `${p.taxation}/${p.forstaelsespapir}/${p.green}/${p.immigration}/${p.fiscal}`;
}

// ============================================================================
// GOVERNMENT TYPE CLASSIFICATION (spec matches sim2 types)
// ============================================================================
function classifyGovType(members) {
  const memberSet = new Set(members);
  if (members.length === 1 && memberSet.has("S")) return "S-alone";

  const hasRed = members.some(id => {
    return id === "S" || id === "SF" || id === "EL" || id === "ALT" || id === "RV";
  });
  const hasBlue = members.some(id => {
    return id === "V" || id === "LA" || id === "KF" || id === "DD" || id === "DF" || id === "BP";
  });
  const hasSwing = members.some(id => id === "M");

  if (hasRed && hasBlue && hasSwing) return "midter";
  if (hasRed && hasBlue) return "cross";

  // Pure red (no M)
  if (hasRed && !hasBlue && !hasSwing) return "red";
  // Red + M = center-left (M's presence makes it a center coalition)
  if (hasRed && hasSwing && !hasBlue) return "center-left";
  // Pure blue or blue + swing
  if (hasBlue) return "blue";
  // All swing
  return "center";
}

// V acceptance probability for S-led invitation (spec §8.1 note)
function vAcceptanceDraw() {
  return uniformDraw(0.10, 0.40);
}

// SF acceptance probability for governing WITH M (spec §8.1 extension)
// Models SF's reluctance to sit in coalition with Moderaterne.
// Olsen Dyhr disagrees with Løkke on 11/24 issues. SF wants government
// but may reject a government that includes M.
// Default: always accept (1.0). When sfAcceptM is enabled, draws from range.
function sfAcceptMDraw(lo, hi) {
  if (lo >= 1.0 && hi >= 1.0) return 1.0; // disabled
  return uniformDraw(lo, hi);
}

function uniformDraw(lo, hi) {
  return lo + Math.random() * (hi - lo);
}

module.exports = {
  DIMENSIONS,
  PACKAGES,
  S_LED_PACKAGES,
  BLUE_LED_PACKAGES,
  M_LED_PACKAGES,
  FULL_GRID,
  getCoherentPlatforms,
  isPlatformCoherent,
  getPreferenceWeight,
  platformToString,
  classifyGovType,
  vAcceptanceDraw,
  sfAcceptMDraw,
};
