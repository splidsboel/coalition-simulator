(function() {
const sim5Parties =
  typeof module !== "undefined" && module.exports
    ? require("./sim5-parties.js")
    : globalThis.Sim5Parties;

const sim5Coalitions =
  typeof module !== "undefined" && module.exports
    ? require("./sim5-coalitions.js")
    : globalThis.Sim5Coalitions;

if (!sim5Parties) {
  throw new Error("sim5-engine.js requires sim5-parties.js to be loaded first.");
}

if (!sim5Coalitions) {
  throw new Error("sim5-engine.js requires sim5-coalitions.js to be loaded first.");
}

const {
  NA_SEATS,
  DIMENSIONS,
  SCALE_MAX,
  PARTIES_MAP,
  PARTIES_LIST,
  isWithinRange,
  distancePastFloor,
  policyDistance
} = sim5Parties;

const {
  enumerateCoalitions,
  classifyGovType,
  getGovSide
} = sim5Coalitions;

const HISTORICAL_PRECEDENTS = {
  "S": 7,
  "S+RV": 5,
  "S+SF": 0,
  "RV+S+SF": 1,
  "V": 4,
  "KF+V": 5,
  "KF+LA+V": 1,
  "M+S+V": 2,
  "EL+RV+S+SF": 1,
  "M+S": 1,
  "M+S+SF": 0,
  "M+RV+S+SF": 0,
  "S+V": 1,
  "KF+M": 0,
  "DD+KF+LA+V": 0,
  "KF+S": 0,
  "LA+M": 0,
  "DD+V": 0,
  "DD+LA": 0,
  "KF+LA+M+V": 0,
  "M": 0,
  "LA": 0
};

const SIZE_PENALTIES = [1.0, 0.96, 0.88, 0.72];
const DP_MAX = 180;
const DP_SIZE = DP_MAX * DP_MAX;

let _dpA = new Float64Array(DP_SIZE);
let _dpB = new Float64Array(DP_SIZE);

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function normDraw(mean, sigma) {
  if (!sigma) return mean;
  let u1 = 0;
  let u2 = 0;
  while (!u1) u1 = Math.random();
  while (!u2) u2 = Math.random();
  return mean + sigma * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function uniformDraw(lo, hi) {
  return lo + Math.random() * (hi - lo);
}

function flexDraw(lo, hi, flexibility) {
  if (!flexibility) return uniformDraw(lo, hi);
  const center = 0.5 + flexibility;
  const u1 = Math.random();
  const u2 = Math.random();
  const raw = (u1 + u2) / 2;
  const shifted = Math.max(0, Math.min(1, raw + (center - 0.5)));
  return lo + shifted * (hi - lo);
}

function partyFlexDraw(lo, hi, partyId, globalFlex) {
  const party = PARTIES_MAP[partyId];
  const harshness = party ? party.globalHarshness || 0 : 0;
  const effectiveFlex = Math.max(-0.5, Math.min(0.5, (0.5 - harshness) + (globalFlex || 0)));
  return flexDraw(lo, hi, effectiveFlex);
}

function runDP(govMandates, parties, minForVotes, initAgainst) {
  const a0 = initAgainst || 0;
  let dp = _dpA;
  let dpN = _dpB;
  dp.fill(0);

  dp[govMandates * DP_MAX + a0] = 1.0;
  let fMin = govMandates;
  let fMax = govMandates;
  let aMin = a0;
  let aMax = a0;

  for (let pi = 0; pi < parties.length; pi++) {
    const party = parties[pi];
    const m = party.m;
    const pF = party.pFor;
    const pAb = party.pAbstain;
    const pAg = party.pAgainst;

    const newFMax = Math.min(fMax + m, DP_MAX - 1);
    const newAMax = Math.min(aMax + m, DP_MAX - 1);

    for (let f = fMin; f <= newFMax; f++) {
      const row = f * DP_MAX;
      for (let a = aMin; a <= newAMax; a++) {
        dpN[row + a] = 0;
      }
    }

    for (let f = fMin; f <= fMax; f++) {
      const row = f * DP_MAX;
      for (let a = aMin; a <= aMax; a++) {
        const prob = dp[row + a];
        if (prob < 1e-15) continue;

        const fNew = f + m;
        if (fNew < DP_MAX) dpN[fNew * DP_MAX + a] += prob * pF;

        const aNew = a + m;
        if (aNew < DP_MAX) dpN[row + aNew] += prob * pAg;

        dpN[row + a] += prob * pAb;
      }
    }

    const tmp = dp;
    dp = dpN;
    dpN = tmp;
    fMax = newFMax;
    aMax = newAMax;
  }

  let pPassage = 0;
  const startF = Math.max(fMin, minForVotes);
  for (let f = startF; f <= fMax; f++) {
    const row = f * DP_MAX;
    const aLimit = Math.min(f - 1, aMax);
    for (let a = aMin; a <= aLimit; a++) {
      pPassage += dp[row + a];
    }
  }

  _dpA = dp;
  _dpB = dpN;
  return pPassage;
}

function relationshipValue(party, otherId, key, fallback) {
  if (!party || !party.relationships || !otherId) return fallback;
  const rel = party.relationships[otherId];
  if (!rel || rel[key] == null) return fallback;
  return rel[key];
}

function splitVote(pFor, abstainShare) {
  const pForClamped = clamp01(pFor);
  const share = clamp01(abstainShare);
  const remainder = 1 - pForClamped;
  const pAbstain = remainder * share;
  return {
    pFor: pForClamped,
    pAbstain,
    pAgainst: Math.max(0, 1 - pForClamped - pAbstain)
  };
}

function computePositionBasedPFor(party, platform, coalition, cfg) {
  let supportScore = 0;
  let totalWeight = 0;

  for (const dimension of DIMENSIONS) {
    const position = party.positions[dimension];
    const weight = position.weight;
    const dist = Math.abs((platform[dimension] || 0) - position.ideal) / SCALE_MAX[dimension];

    if (isWithinRange(platform[dimension], position)) {
      supportScore += weight * (1 - dist * 0.6);
    } else {
      supportScore -= weight * (0.5 + distancePastFloor(platform[dimension], position, dimension));
    }

    totalWeight += weight;
  }

  if (totalWeight === 0) return 0.5;

  const normalized = supportScore / totalWeight;
  const sensitivity = cfg.voteSensitivity || 4.0;
  let pFor = 1 / (1 + Math.exp(-sensitivity * normalized));
  const govSide = getGovSide(coalition);

  if (party.bloc === govSide) {
    pFor *= 1.15;
  } else if (party.bloc !== "swing" && govSide !== "swing" && party.bloc !== govSide) {
    pFor *= 0.70;
  }

  return clamp01(pFor);
}

function computeAbstainShare(party, coalition) {
  const members = coalition && Array.isArray(coalition.government) ? coalition.government : [];
  if (members.length === 0) return 0.5;

  let totalDist = 0;
  let count = 0;

  for (const id of members) {
    const govParty = PARTIES_MAP[id];
    if (!govParty) continue;
    totalDist += policyDistance(party, govParty);
    count++;
  }

  const avgDist = count ? totalDist / count : 0.5;
  let share = clamp01(0.85 - avgDist * 0.8);

  // Parties that reject the PM vote against, not abstain. In Danish politics,
  // opposition parties don't abstain on finansloven — they vote against.
  if (coalition.leader) {
    const pmAcceptance = relationshipValue(party, coalition.leader, "asPM", 1.0);
    share *= Math.max(0.05, pmAcceptance);
  }

  return share;
}

function evalBudgetVote(partyId, coalition, platform, cfg) {
  const party = PARTIES_MAP[partyId];
  if (!party) {
    return { pFor: 0, pAbstain: 0.5, pAgainst: 0.5 };
  }

  if (party.pmDemand && coalition.leader !== partyId) {
    return { pFor: 0, pAbstain: 0.02, pAgainst: 0.98 };
  }

  // M demands PM (cfg toggle, default off): M votes against any government
  // where Løkke is not PM.
  if (partyId === "M" && cfg.mDemandPM && coalition.leader !== "M") {
    return { pFor: 0, pAbstain: 0.02, pAgainst: 0.98 };
  }

  if (partyId === "M" && cfg.mDemandGov && !coalition.government.includes("M")) {
    return { pFor: 0, pAbstain: 0.02, pAgainst: 0.98 };
  }

  // S demands government participation (default on): S votes against any
  // government it is not part of, just like M's mDemandGov.
  const sDemandGov = cfg.sDemandGov != null ? cfg.sDemandGov : true;
  if (partyId === "S" && sDemandGov && !coalition.government.includes("S")) {
    return { pFor: 0, pAbstain: 0.02, pAgainst: 0.98 };
  }

  if (coalition.government.includes(partyId)) {
    let pFor = 0.98;

    for (const dimension of DIMENSIONS) {
      const position = party.positions[dimension];
      if (position.weight >= 0.7 && !isWithinRange(platform[dimension], position)) {
        pFor *= 0.85;
      }
    }

    return {
      pFor,
      pAbstain: (1 - pFor) * 0.75,
      pAgainst: (1 - pFor) * 0.25
    };
  }

  const forstPosition = party.positions.forstaaelsespapir;
  if (forstPosition.weight >= 0.95 && forstPosition.ideal === 0) {
    const hasForst = Array.isArray(coalition.support)
      && coalition.support.some(entry => entry.party === partyId && entry.type === "forstaaelsespapir");
    let pFor;
    const flexibility = 0.5 - (party.globalHarshness || 0);

    if (hasForst) {
      pFor = flexDraw(0.80, 0.95, flexibility);
      const immigration = party.positions.immigration;
      if (
        immigration.weight > 0.7 &&
        Math.abs((platform.immigration || 0) - immigration.ideal) > 2
      ) {
        pFor *= 0.85;
      }
    } else {
      pFor = flexDraw(0.02, 0.10, flexibility);
    }

    // Apply relationship modifiers: even with a forståelsespapir, a support
    // party's willingness to vote for the budget is tempered by who is actually
    // in the government. EL won't blindly support a government containing
    // parties it deeply opposes (e.g. M) at full strength.
    // Use sqrt-softened product: a formal written agreement dampens but doesn't
    // eliminate discomfort. Without softening, moderate values like 0.68 × 0.55
    // × 0.90 = 0.34 would nearly kill support even for plausible arrangements.
    let relMod = relationshipValue(party, coalition.leader, "asPM", 1.0);
    for (const member of coalition.government) {
      if (member === coalition.leader) continue;
      relMod *= relationshipValue(party, member, "tolerateInGov", 1.0);
    }
    pFor *= Math.sqrt(relMod);

    return splitVote(pFor, computeAbstainShare(party, coalition));
  }

  let pFor = computePositionBasedPFor(party, platform, coalition, cfg);

  // Participation demand penalty: parties that strongly demand cabinet seats
  // reduce their support when excluded, to pressure the formateur into including them.
  // SF "government or nothing," RV "I'm a power person," etc.
  const govPref = party.participationPref ? party.participationPref.government : 0;
  if (govPref >= 0.50) {
    const pmAcceptance = relationshipValue(party, coalition.leader, "asPM", 1.0);
    if (pmAcceptance > 0.20) {
      // This is a government they'd want to be in — penalize exclusion
      // Quadratic: stronger demand = much steeper penalty
      const exclusionFactor = Math.max(0.05, 1 - govPref * govPref);
      pFor *= exclusionFactor;
    }
  }

  pFor *= relationshipValue(party, coalition.leader, "asPM", 1.0);

  for (const member of coalition.government) {
    if (member === coalition.leader) continue;
    pFor *= relationshipValue(party, member, "tolerateInGov", 1.0);
  }

  return splitVote(pFor, computeAbstainShare(party, coalition));
}

function evalNABudgetVote(seatId, coalition, cfg) {
  const alignments = cfg._naAlignments || cfg.naAlignments || {};
  const alignment = alignments[seatId] || "flexible";
  const govSide = getGovSide(coalition);

  if (alignment === "red") {
    if (govSide === "red") return { pFor: 0.78, pAbstain: 0.17, pAgainst: 0.05 };
    if (govSide === "blue") return { pFor: 0.05, pAbstain: 0.17, pAgainst: 0.78 };
    return { pFor: 0.42, pAbstain: 0.38, pAgainst: 0.20 };
  }

  if (alignment === "blue") {
    if (govSide === "blue") return { pFor: 0.78, pAbstain: 0.17, pAgainst: 0.05 };
    if (govSide === "red") return { pFor: 0.05, pAbstain: 0.17, pAgainst: 0.78 };
    return { pFor: 0.42, pAbstain: 0.38, pAgainst: 0.20 };
  }

  return { pFor: 0.40, pAbstain: 0.40, pAgainst: 0.20 };
}

function confidenceCheck(government, mandates, cfg) {
  const leader = Array.isArray(government) && government.length ? government[0] : null;
  if (!leader) return { passes: false, opposition: 179 };

  const govSet = new Set(government);
  let opposition = 0;
  const threshold = cfg.mistillidThreshold || 0.10;

  for (const party of PARTIES_LIST) {
    if (govSet.has(party.id)) continue;
    const asPM = relationshipValue(party, leader, "asPM", 1.0);
    if (asPM < threshold) {
      opposition += mandates[party.id] || 0;
    }
  }

  const alignments = cfg._naAlignments || cfg.naAlignments || {};
  const govSide = getGovSide({ government, leader });
  for (const seat of NA_SEATS) {
    const alignment = alignments[seat.id] || "flexible";
    if ((alignment === "red" && govSide === "blue") || (alignment === "blue" && govSide === "red")) {
      opposition += mandates[seat.id] || seat.mandates || 0;
    }
  }

  return { passes: opposition < 90, opposition };
}

function identifyConditioningPair(coalition, nonGovParties, cfg) {
  const govSide = getGovSide(coalition);
  const pivotParty = nonGovParties.find(entry => entry.id === "M") || null;

  if (!pivotParty) return null;

  if (govSide === "red" || govSide === "center") {
    const flankParties = nonGovParties.filter(entry => entry.id === "EL" || entry.id === "ALT");
    if (flankParties.length > 0) {
      return {
        flankParties,
        pivotParty,
        penalty: cfg.elMPenalty || 0.70,
        boost: cfg.elMBoost || 1.10
      };
    }
  }

  if (govSide === "blue") {
    const flankParties = nonGovParties.filter(entry => entry.id === "DF");
    if (flankParties.length > 0) {
      return {
        flankParties,
        pivotParty,
        penalty: cfg.dfMPenalty || 0.75,
        boost: cfg.dfMBoost || 1.15
      };
    }
  }

  return null;
}

function adjustVoteEntry(entry, pForMultiplier) {
  const pFor = clamp01(entry.pFor * pForMultiplier);
  const remaining = Math.max(0, 1 - entry.pFor);
  const abstainShare = remaining > 1e-12 ? entry.pAbstain / remaining : 0;
  return splitVote(pFor, abstainShare);
}

function computePpassage(coalition, platform, mandates, cfg) {
  const government = coalition.government || [];
  const govSet = new Set(government);
  const minForVotes = cfg.minForVotes != null ? cfg.minForVotes : 70;

  let govMandates = 0;
  const rebellingGov = new Set();

  for (const id of government) {
    const party = PARTIES_MAP[id];
    // Party demands PM but isn't PM → rebels (votes against from inside gov)
    const demandsPM = (party && party.pmDemand) || (id === "M" && cfg.mDemandPM);
    if (demandsPM && coalition.leader !== id) {
      rebellingGov.add(id);
      continue;
    }
    govMandates += mandates[id] || 0;
  }

  const nonGovParties = [];

  for (const party of PARTIES_LIST) {
    const inGovernment = govSet.has(party.id);
    if (inGovernment && !rebellingGov.has(party.id)) continue;

    const m = mandates[party.id] || 0;
    if (m < 1) continue;

    const vote = evalBudgetVote(party.id, coalition, platform, cfg);
    nonGovParties.push({
      id: party.id,
      m,
      pFor: vote.pFor,
      pAbstain: vote.pAbstain,
      pAgainst: vote.pAgainst
    });
  }

  for (const seat of NA_SEATS) {
    const m = mandates[seat.id] || seat.mandates || 0;
    if (m < 1) continue;
    const vote = evalNABudgetVote(seat.id, coalition, cfg);
    nonGovParties.push({
      id: seat.id,
      m,
      pFor: vote.pFor,
      pAbstain: vote.pAbstain,
      pAgainst: vote.pAgainst
    });
  }

  const pair = identifyConditioningPair(coalition, nonGovParties, cfg);
  if (!pair) {
    return runDP(govMandates, nonGovParties, minForVotes, 0);
  }

  const hasForst = Array.isArray(coalition.support) && pair.flankParties.some(flank =>
    coalition.support.some(entry => entry.party === flank.id && entry.type === "forstaaelsespapir")
  );
  const effectivePenalty = hasForst ? 1 - (1 - pair.penalty) * 0.5 : pair.penalty;
  const excluded = new Set([pair.pivotParty.id, ...pair.flankParties.map(flank => flank.id)]);
  const staticParties = nonGovParties.filter(entry => !excluded.has(entry.id));

  function conditionedPassage(index, addedFor, addedAgainst, pivotMultiplier) {
    if (index >= pair.flankParties.length) {
      const adjusted = staticParties.slice();
      const pivotAdjusted = adjustVoteEntry(pair.pivotParty, pivotMultiplier);
      adjusted.push({
        id: pair.pivotParty.id,
        m: pair.pivotParty.m,
        pFor: pivotAdjusted.pFor,
        pAbstain: pivotAdjusted.pAbstain,
        pAgainst: pivotAdjusted.pAgainst
      });
      return runDP(govMandates + addedFor, adjusted, minForVotes, addedAgainst);
    }

    const flank = pair.flankParties[index];
    return flank.pFor * conditionedPassage(index + 1, addedFor + flank.m, addedAgainst, pivotMultiplier * effectivePenalty)
      + flank.pAbstain * conditionedPassage(index + 1, addedFor, addedAgainst, pivotMultiplier)
      + flank.pAgainst * conditionedPassage(index + 1, addedFor, addedAgainst + flank.m, pivotMultiplier * pair.boost);
  }

  return conditionedPassage(0, 0, 0, 1);
}

function avgPairwisePolicyDistance(government) {
  if (!government || government.length < 2) return 0;

  let total = 0;
  let pairs = 0;

  for (let i = 0; i < government.length; i++) {
    for (let j = i + 1; j < government.length; j++) {
      const partyA = PARTIES_MAP[government[i]];
      const partyB = PARTIES_MAP[government[j]];
      if (!partyA || !partyB) continue;
      total += policyDistance(partyA, partyB);
      pairs++;
    }
  }

  return pairs ? total / pairs : 0;
}

function coalitionConnected(government, cfg) {
  if (!government || government.length <= 1) return true;
  return avgPairwisePolicyDistance(government) < (cfg.connectedThreshold || 0.4);
}

function coalitionMinimumWinningLike(government, mandates) {
  const seats = government.reduce((sum, id) => sum + (mandates[id] || 0), 0);

  if (seats >= 90) {
    for (const id of government) {
      if (seats - (mandates[id] || 0) >= 90) return false;
    }
    return true;
  }

  const threshold = seats * 0.08;
  for (const id of government) {
    if ((mandates[id] || 0) < threshold) return false;
  }
  return true;
}

function mwccBonus(government, mandates, cfg) {
  const connected = coalitionConnected(government, cfg);
  const minimumWinning = coalitionMinimumWinningLike(government, mandates);
  const fullBonus = cfg.mwccFullBonus != null ? cfg.mwccFullBonus : 1.15;

  if (connected && minimumWinning) return fullBonus;
  if (connected) return 1.08;
  if (minimumWinning) return 1.05;
  return 1.0;
}

function historicalPrecedentBonus(government, cfg) {
  const key = government.slice().sort().join("+");
  const score = HISTORICAL_PRECEDENTS[key] || 0;
  const weight = cfg.precedentWeight != null ? cfg.precedentWeight : 0;
  return 1 + score * weight;
}

function scoreCoalition(coalition, mandates, pPassage, cfg) {
  const government = coalition.government || [];
  const seats = government.reduce((sum, id) => sum + (mandates[id] || 0), 0);
  const nGov = government.length;
  const avgDist = avgPairwisePolicyDistance(government);
  const ideoFit = Math.max(0.3, 1 - avgDist * (cfg.distPenalty || 1.5));
  const sizePenalty = SIZE_PENALTIES[Math.max(0, Math.min(nGov, SIZE_PENALTIES.length) - 1)] || SIZE_PENALTIES[SIZE_PENALTIES.length - 1];
  const mwcc = mwccBonus(government, mandates, cfg);

  let flexBonus = 1.0;
  if (seats < 90) {
    if (nGov <= 2) flexBonus = 1.12;
    else if (nGov === 3) flexBonus = 1.0;
    else flexBonus = 0.82;
  }

  let hasRed = false;
  let hasBlue = false;
  for (const id of government) {
    const bloc = PARTIES_MAP[id] ? PARTIES_MAP[id].bloc : null;
    if (bloc === "red") hasRed = true;
    if (bloc === "blue") hasBlue = true;
  }

  const crossBloc = hasRed && hasBlue && seats < 90 ? 0.65 : 1.0;
  const precedent = historicalPrecedentBonus(government, cfg);
  // Nonlinear passage: formateurs strongly prefer high P(passage) over marginal viability.
  // Exponent > 1 amplifies the gap: P=0.99 vs P=0.86 matters more than their ratio suggests.
  const passageExp = cfg.passageExponent != null ? cfg.passageExponent : 2.0;
  const passageScore = Math.pow(pPassage, passageExp);

  return passageScore * ideoFit * sizePenalty * mwcc * flexBonus * crossBloc * precedent;
}

function frederiksenBonus(coalition, redPreference) {
  const members = new Set(coalition.government || []);
  const hasBlueOrSwingPartner = members.has("M") || members.has("V") || members.has("KF");
  const hasLeftParty = members.has("SF") || members.has("EL") || members.has("ALT");
  const noise = Math.exp(0.1 * normDraw(0, 1));
  const midterBase = (1 - redPreference) * 0.3;
  const centristEdge = Math.max(0, 0.5 - redPreference);

  if (!hasBlueOrSwingPartner) {
    return (1.0 + redPreference * 0.3) * noise;
  }

  if (!hasLeftParty) {
    return (1.0 + midterBase + centristEdge * 0.6) * noise;
  }

  return (1.0 + midterBase - centristEdge * 0.4) * noise;
}

function determineFormateurOrder(mandates, cfg) {
  // Manual override: user can force formateur order
  if (cfg.formateurOverride === "red") return false;   // red first
  if (cfg.formateurOverride === "blue") return true;   // blue first

  const blueBloc = (mandates.V || 0) + (mandates.LA || 0) + (mandates.KF || 0)
    + (mandates.DD || 0) + (mandates.DF || 0) + (mandates.BP || 0);
  const redBloc = (mandates.S || 0) + (mandates.SF || 0) + (mandates.EL || 0)
    + (mandates.ALT || 0) + (mandates.RV || 0);

  let effectivePBF;
  if (cfg._pBlueFormateurExplicit) {
    effectivePBF = cfg.pBlueFormateur;
  } else if (blueBloc >= 90) {
    effectivePBF = 0.95;
  } else if (redBloc >= 90) {
    effectivePBF = 0.02;
  } else {
    const mPref = cfg.mPmPref || "neutral";
    const mBlueBloc = blueBloc + (mandates.M || 0);
    if (mPref === "V" && mBlueBloc >= 90) effectivePBF = 0.55;
    else if (mPref === "V") effectivePBF = 0.35;
    else if (mPref === "M") effectivePBF = 0.20;
    else if (mPref === "neutral") effectivePBF = 0.12;
    else effectivePBF = 0.05;
  }

  return Math.random() < effectivePBF;
}

function determineForstaaelsespapir(government, outsideParties, platform, cfg) {
  const offers = [];
  const threshold = cfg.forstMinAcceptance != null ? cfg.forstMinAcceptance : 0.30;
  const normalizedOutside = outsideParties.map(entry => (typeof entry === "string" ? entry : entry && entry.id)).filter(Boolean);

  for (const partyId of normalizedOutside) {
    const party = PARTIES_MAP[partyId];
    if (!party) continue;

    const position = party.positions.forstaaelsespapir;
    if (!(position.weight >= 0.95 && position.ideal === 0)) {
      continue;
    }

    let accepted = false;
    for (const govId of government) {
      const govParty = PARTIES_MAP[govId];
      const tolerate = relationshipValue(govParty, partyId, "tolerateInGov", 0);
      if (tolerate > threshold) {
        accepted = true;
        break;
      }
    }

    if (accepted) {
      offers.push({ party: partyId, type: "forstaaelsespapir" });
    }
  }

  return offers;
}

function checkDyadAcceptance(members, flexibility) {
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const partyI = PARTIES_MAP[members[i]];
      const partyJ = PARTIES_MAP[members[j]];
      if (!partyI || !partyJ) continue;

      const ij = relationshipValue(partyI, members[j], "inGov", 1.0);
      if (ij < 1.0) {
        // Range scales proportionally: low acceptance = narrow range, high = wider
        const spread = Math.max(0.05, ij * 0.4);
        const thresholdIJ = partyFlexDraw(ij, Math.min(1, ij + spread), members[i], flexibility);
        if (Math.random() > thresholdIJ) return false;
      }

      const ji = relationshipValue(partyJ, members[i], "inGov", 1.0);
      if (ji < 1.0) {
        const spread = Math.max(0.05, ji * 0.4);
        const thresholdJI = partyFlexDraw(ji, Math.min(1, ji + spread), members[j], flexibility);
        if (Math.random() > thresholdJI) return false;
      }
    }
  }

  return true;
}

function withLeaderFirst(government, leader) {
  return [leader, ...government.filter(id => id !== leader)];
}

function selectGovernment(mandates, naAlignments, cfg, coalitions) {
  const maxRounds = cfg.maxFormationRounds || 3;
  const flexIncrement = cfg.flexIncrement || 0.05;
  const viabilityThreshold = cfg.viabilityThreshold != null ? cfg.viabilityThreshold : 0.60;
  const redPreference = cfg.redPreference != null ? cfg.redPreference : 0.5;

  const sLed = coalitions.filter(coalition => coalition.leader === "S");
  const blueLed = coalitions.filter(coalition => coalition.leader === "V");
  const mLed = coalitions.filter(coalition => coalition.leader === "M");

  // Gradual search: formateurs explore lean options first, then broaden.
  // Round 1: up to 2 parties. Round 2: up to 3. Round 3+: up to 4.
  const partyLimits = cfg.maxPartiesPerRound || [2, 3, 4, 4, 4];

  for (let round = 0; round < maxRounds; round++) {
    const roundFlex = Math.min(0.5, (cfg.flexibility || 0) + round * flexIncrement);
    const roundCfg = {
      ...cfg,
      flexibility: roundFlex,
      _naAlignments: naAlignments
    };
    const blueFirst = determineFormateurOrder(mandates, roundCfg);
    const roundPartyLimit = partyLimits[Math.min(round, partyLimits.length - 1)];

    function tryGroup(groupCoalitions, bonusFn) {
      let best = null;

      // Filter to coalitions the formateur would consider this round
      const roundCandidates = groupCoalitions.filter(c => c.government.length <= roundPartyLimit);

      for (const rawCoalition of roundCandidates) {
        const orderedGovernment = withLeaderFirst(rawCoalition.government, rawCoalition.leader);
        const coalition = {
          ...rawCoalition,
          government: orderedGovernment
        };

        const confidence = confidenceCheck(orderedGovernment, mandates, roundCfg);
        if (!confidence.passes) continue;
        if (!checkDyadAcceptance(orderedGovernment, roundFlex)) continue;

        const outsideParties = PARTIES_LIST
          .map(party => party.id)
          .filter(id => !orderedGovernment.includes(id));
        const support = determineForstaaelsespapir(orderedGovernment, outsideParties, coalition.platform, roundCfg);
        coalition.support = support;

        const pPassage = computePpassage(coalition, coalition.platform, mandates, roundCfg);
        if (pPassage < viabilityThreshold) continue;

        const baseScore = scoreCoalition(coalition, mandates, pPassage, roundCfg);
        const bonus = bonusFn ? bonusFn(coalition) : 1.0;
        const totalScore = baseScore * bonus;

        if (!best || totalScore > best.score) {
          best = {
            pm: coalition.leader,
            govType: classifyGovType(orderedGovernment),
            coalition: orderedGovernment.join("+"),
            government: orderedGovernment,
            leader: coalition.leader,
            platform: coalition.platform,
            support,
            pPassage,
            score: totalScore,
            confidence,
            formationRound: round + 1,
            govProfile: governabilityProfile(coalition, coalition.platform, mandates)
          };
        }
      }

      return best;
    }

    const sLedBonus = coalition => frederiksenBonus(coalition, redPreference);
    const blueBonus = coalition => {
      const bluePM = (mandates.LA || 0) > (mandates.V || 0) ? "LA" : "V";
      const leaderBonus = coalition.leader === bluePM ? 1.15 : 1.0;
      return leaderBonus * Math.exp(0.1 * normDraw(0, 1));
    };
    const mLedBonus = () => Math.exp(0.1 * normDraw(0, 1));

    let result;
    if (blueFirst) {
      result = tryGroup(blueLed, blueBonus) || tryGroup(sLed, sLedBonus) || tryGroup(mLed, mLedBonus);
    } else {
      result = tryGroup(sLed, sLedBonus) || tryGroup(blueLed, blueBonus) || tryGroup(mLed, mLedBonus);
    }

    if (result) {
      result.formateurOrder = blueFirst ? "blå først" : "rød først";
      return result;
    }
  }

  return null;
}

function governabilityProfile(coalition, platform, mandates) {
  const government = coalition && Array.isArray(coalition.government) ? coalition.government : [];
  const govSet = new Set(government);
  const profile = {};

  // Skip structural dimensions that aren't legislative policy areas
  const policyDimensions = DIMENSIONS.filter(d => d !== "forstaaelsespapir");

  for (const dimension of policyDimensions) {
    let support = 0;
    let opposition = 0;

    for (const party of PARTIES_LIST) {
      if (govSet.has(party.id)) continue;

      const position = party.positions[dimension];
      const weight = position.weight;
      const dist = Math.abs((platform[dimension] || 0) - position.ideal) / SCALE_MAX[dimension];
      const seats = mandates[party.id] || 0;

      if (isWithinRange(platform[dimension], position)) {
        support += seats * weight * (1 - dist);
      } else {
        opposition += seats * weight;
      }
    }

    const total = support + opposition;
    profile[dimension] = {
      feasibility: total > 0 ? support / total : 0.5,
      support,
      opposition
    };
  }

  return profile;
}

function drawNAAlignments(cfg) {
  const shift = cfg.naRedShift || 0;
  const alignments = {};

  for (const seat of NA_SEATS) {
    let pRed = seat.pRed + shift;
    let pBlue = seat.pBlue - shift;
    const pFlexible = seat.pFlexible;

    pRed = Math.max(0, Math.min(1, pRed));
    pBlue = Math.max(0, Math.min(1, pBlue));

    const total = pRed + pFlexible + pBlue;
    const pRedN = pRed / total;
    const pFlexN = pFlexible / total;
    const r = Math.random();

    if (r < pRedN) alignments[seat.id] = "red";
    else if (r < pRedN + pFlexN) alignments[seat.id] = "flexible";
    else alignments[seat.id] = "blue";
  }

  return alignments;
}

function buildMandates(userParams) {
  const overrides = userParams.mandateOverrides || userParams.mandates || {};
  const mandates = {};

  for (const party of PARTIES_LIST) {
    mandates[party.id] = overrides[party.id] != null ? overrides[party.id] : party.mandates;
  }

  for (const seat of NA_SEATS) {
    mandates[seat.id] = overrides[seat.id] != null ? overrides[seat.id] : seat.mandates;
  }

  return mandates;
}

function buildConfig(userParams) {
  const defaults = {
    flexibility: 0,
    viabilityThreshold: 0.70,
    minForVotes: 70,
    distPenalty: 1.5,
    precedentWeight: 0,
    mDemandGov: true,
    sDemandGov: true,
    mPmPref: "neutral",
    // Frederiksen appointed as kongelig undersøger (March 2026): red forms first.
    formateurOverride: "red",
    redPreference: 0.5,
    maxFormationRounds: 3,
    flexIncrement: 0.05,
    voteSensitivity: 4.0,
    formateurPull: 0.3,
    floorThreshold: 0.7,
    mistillidThreshold: 0.10
  };

  const cfg = { ...defaults };
  const sources = [userParams.cfg || {}, userParams];

  for (const source of sources) {
    for (const key of Object.keys(defaults)) {
      if (source[key] != null) cfg[key] = source[key];
    }
  }

  if ((userParams.cfg || {}).pBlueFormateur != null || userParams.pBlueFormateur != null) {
    cfg.pBlueFormateur = (userParams.cfg || {}).pBlueFormateur != null
      ? userParams.cfg.pBlueFormateur
      : userParams.pBlueFormateur;
    cfg._pBlueFormateurExplicit = true;
  }

  const passthroughKeys = [
    "elMPenalty",
    "elMBoost",
    "dfMPenalty",
    "dfMBoost",
    "forstMinAcceptance",
    "connectedThreshold",
    "mwccFullBonus",
    "naRedShift",
    "formateurOverride",
    "sDemandGov",
    "mDemandPM"
  ];

  for (const key of passthroughKeys) {
    if ((userParams.cfg || {})[key] != null) cfg[key] = userParams.cfg[key];
    else if (userParams[key] != null) cfg[key] = userParams[key];
  }

  return cfg;
}

function roundPct(value, total) {
  return total > 0 ? +((value / total) * 100).toFixed(2) : 0;
}

function simulate(userParams, N) {
  const params = userParams || {};
  const iterations = Number.isFinite(N) ? N : 3000;
  const mandates = buildMandates(params);
  const cfg = buildConfig(params);
  const coalitions = enumerateCoalitions(PARTIES_LIST, mandates, cfg);

  const agg = {
    pmCounts: {},
    govTypeCounts: {},
    coalitionCounts: {},
    formationRounds: { total: 0, distribution: {} },
    formateurOrder: {},
    noGovCount: 0
  };

  for (let i = 0; i < iterations; i++) {
    const naAlignments = drawNAAlignments(cfg);
    const result = selectGovernment(mandates, naAlignments, cfg, coalitions);

    if (!result) {
      agg.noGovCount++;
      agg.govTypeCounts.none = (agg.govTypeCounts.none || 0) + 1;
      continue;
    }

    agg.pmCounts[result.pm] = (agg.pmCounts[result.pm] || 0) + 1;
    if (result.formateurOrder) {
      agg.formateurOrder[result.formateurOrder] = (agg.formateurOrder[result.formateurOrder] || 0) + 1;
    }
    agg.govTypeCounts[result.govType] = (agg.govTypeCounts[result.govType] || 0) + 1;

    if (!agg.coalitionCounts[result.coalition]) {
      agg.coalitionCounts[result.coalition] = {
        count: 0,
        pPassageSum: 0,
        platform: result.platform,
        govProfile: result.govProfile
      };
    }

    agg.coalitionCounts[result.coalition].count++;
    agg.coalitionCounts[result.coalition].pPassageSum += result.pPassage;
    agg.formationRounds.total += result.formationRound;
    agg.formationRounds.distribution[result.formationRound] =
      (agg.formationRounds.distribution[result.formationRound] || 0) + 1;
  }

  const pm = {};
  for (const id of Object.keys(agg.pmCounts)) {
    pm[id] = roundPct(agg.pmCounts[id], iterations);
  }

  const govType = {};
  for (const type of Object.keys(agg.govTypeCounts)) {
    govType[type] = roundPct(agg.govTypeCounts[type], iterations);
  }

  const topCoalitions = Object.entries(agg.coalitionCounts)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 15)
    .map(([govt, data]) => ({
      govt,
      pct: roundPct(data.count, iterations),
      avgPPassage: +(data.pPassageSum / data.count).toFixed(3),
      platform: data.platform,
      govProfile: data.govProfile
    }));

  const formed = iterations - agg.noGovCount;
  const formationRounds = {
    avg: formed > 0 ? +(agg.formationRounds.total / formed).toFixed(2) : 0,
    distribution: {}
  };

  for (const round of Object.keys(agg.formationRounds.distribution)) {
    formationRounds.distribution[round] = formed > 0
      ? +((agg.formationRounds.distribution[round] / formed) * 100).toFixed(1)
      : 0;
  }

  return {
    N: iterations,
    pm,
    govType,
    topCoalitions,
    formationRounds,
    formateurOrder: Object.fromEntries(
      Object.entries(agg.formateurOrder).map(([k, v]) => [k, roundPct(v, formed)])
    ),
    noGovPct: roundPct(agg.noGovCount, iterations)
  };
}

const exportedSim5Engine = {
  simulate,
  runDP,
  evalBudgetVote,
  computePpassage,
  scoreCoalition,
  selectGovernment,
  confidenceCheck,
  governabilityProfile
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = exportedSim5Engine;
} else {
  globalThis.Sim5Engine = exportedSim5Engine;
}
})();
