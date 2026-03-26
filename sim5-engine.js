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

const SIZE_PENALTIES = [1.0, 0.96, 0.90, 0.82];

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

function relationshipValue(party, otherId, key, fallback) {
  if (!party || !party.relationships || !otherId) return fallback;
  const rel = party.relationships[otherId];
  if (!rel || rel[key] == null) return fallback;
  return rel[key];
}

function blocBudgetVote(partyId, coalition, cfg) {
  const party = PARTIES_MAP[partyId];
  if (!party) return { pFor: 0.3, pAbstain: 0.3, pAgainst: 0.4 };
  const govIds = coalition.government;
  const leader = coalition.leader;
  const govSide = getGovSide(coalition);

  // Demand gates
  if (partyId === "S" && (cfg.sDemandGov != null ? cfg.sDemandGov : true) && !govIds.includes("S")) {
    return { pFor: 0.01, pAbstain: 0.04, pAgainst: 0.95 };
  }
  if (partyId === "M" && cfg.mDemandGov && !govIds.includes("M")) {
    return { pFor: 0.01, pAbstain: 0.04, pAgainst: 0.95 };
  }
  if (party.pmDemand && coalition.leader !== partyId) {
    return { pFor: 0.01, pAbstain: 0.04, pAgainst: 0.95 };
  }
  if (partyId === "M" && cfg.mDemandPM && coalition.leader !== "M") {
    return { pFor: 0.01, pAbstain: 0.04, pAgainst: 0.95 };
  }

  // Government members: near-certain FOR
  if (govIds.includes(partyId)) {
    return { pFor: 0.97, pAbstain: 0.02, pAgainst: 0.01 };
  }

  // EL forståelsespapir path (empirically calibrated from calibration.md)
  if (partyId === "EL") {
    const hasForst = Array.isArray(coalition.support)
      && coalition.support.some(s => s.party === "EL" && s.type === "forstaaelsespapir");
    if (hasForst) return { pFor: 0.93, pAbstain: 0.05, pAgainst: 0.02 };
    return { pFor: 0.03, pAbstain: 0.07, pAgainst: 0.90 };
  }

  // Bloc alignment base rate
  let base;
  if (party.bloc === govSide) {
    base = 0.65;
  } else if (party.bloc === "swing" || govSide === "center") {
    base = 0.35;
  } else {
    base = 0.05;
  }

  // PM acceptance (sqrt-softened)
  const asPM = relationshipValue(party, leader, "asPM", 1.0);
  base *= Math.max(0.1, Math.sqrt(asPM));

  // Tolerate government members (sqrt-softened)
  for (const memberId of govIds) {
    if (memberId === leader) continue;
    const tolerate = relationshipValue(party, memberId, "tolerateInGov", 1.0);
    base *= Math.max(0.2, Math.pow(tolerate, 0.5));
  }

  // Participation demand exclusion penalty
  const govPref = party.participationPref ? party.participationPref.government : 0;
  if (govPref >= 0.50 && asPM > 0.20) {
    base *= Math.max(0.15, 1 - govPref * 0.5);
  }

  // Strategic voting: when M demands gov but is excluded, blue parties
  // oppose harder to support M's leverage (they prefer govt WITH M)
  const mExcluded = cfg.mDemandGov && !govIds.includes("M");
  if (mExcluded && party.bloc === "blue") {
    base *= 0.15;
  }
  if (mExcluded && party.bloc === "swing" && partyId !== "M") {
    base *= 0.3;
  }

  // Policy-distance modifier: bloc loyalty is the default driver, but
  // floor violations on high-weight issues create friction. A same-bloc
  // party that agrees on everything gets the full base rate; one where
  // the platform crosses key red lines gets penalized.
  if (coalition.platform) {
    let violations = 0;
    for (const dimension of DIMENSIONS) {
      if (dimension === "forstaaelsespapir") continue;
      const position = party.positions[dimension];
      if (position.weight >= 0.60 && !isWithinRange(coalition.platform[dimension], position)) {
        violations++;
      }
    }
    // Each violation: 0.88 multiplier (moderate — bloc loyalty dominates
    // but 3+ violations create real friction)
    if (violations > 0) {
      base *= Math.pow(0.88, Math.min(violations, 4));
    }
  }

  const pFor = Math.min(0.95, Math.max(0.01, base));
  const pAgainst = Math.max(0.02, (1 - pFor) * 0.7);
  const pAbstain = Math.max(0, 1 - pFor - pAgainst);
  return { pFor, pAbstain, pAgainst };
}

function evalNABudgetVote(seatId, coalition, cfg) {
  // Strong norm: NA mandates never participate in toppling a government.
  // They either vote FOR or abstain — voting against is near-zero.
  // Exception: Greenlandic seats actively oppose governments containing DF,
  // whose proposal for a Danish referendum on Greenlandic independence is
  // an existential sovereignty threat (both GL-NAL and GL-IA briefs).
  const alignments = cfg._naAlignments || cfg.naAlignments || {};
  const alignment = alignments[seatId] || "flexible";
  const govSide = getGovSide(coalition);
  const government = coalition.government || [];

  // Greenlandic DF exception: break abstain norm on sovereignty grounds
  if ((seatId === "GL-NAL" || seatId === "GL-IA") && government.includes("DF")) {
    return { pFor: 0.02, pAbstain: 0.18, pAgainst: 0.80 };
  }

  if (alignment === "red") {
    if (govSide === "red") return { pFor: 0.80, pAbstain: 0.18, pAgainst: 0.02 };
    if (govSide === "blue") return { pFor: 0.05, pAbstain: 0.93, pAgainst: 0.02 };
    return { pFor: 0.42, pAbstain: 0.55, pAgainst: 0.03 };
  }

  if (alignment === "blue") {
    if (govSide === "blue") return { pFor: 0.80, pAbstain: 0.18, pAgainst: 0.02 };
    if (govSide === "red") return { pFor: 0.05, pAbstain: 0.93, pAgainst: 0.02 };
    return { pFor: 0.42, pAbstain: 0.55, pAgainst: 0.03 };
  }

  return { pFor: 0.40, pAbstain: 0.57, pAgainst: 0.03 };
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

function computePpassage(coalition, platform, mandates, cfg) {
  const government = coalition.government || [];
  const govSet = new Set(government);
  const minForVotes = cfg.minForVotes != null ? cfg.minForVotes : 70;

  let govMandates = 0;
  for (const id of government) {
    const party = PARTIES_MAP[id];
    const demandsPM = (party && party.pmDemand) || (id === "M" && cfg.mDemandPM);
    if (demandsPM && coalition.leader !== id) continue;
    govMandates += mandates[id] || 0;
  }

  // Collect non-government party bloc vote probabilities
  const votingParties = [];
  for (const party of PARTIES_LIST) {
    if (govSet.has(party.id)) continue;
    const m = mandates[party.id] || 0;
    if (m < 1) continue;
    const vote = blocBudgetVote(party.id, coalition, cfg);
    votingParties.push({
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
    votingParties.push({
      id: seat.id,
      m,
      pFor: vote.pFor,
      pAbstain: vote.pAbstain,
      pAgainst: vote.pAgainst
    });
  }

  // Monte Carlo bloc voting: each party votes as a single unit
  const MC_DRAWS = 800;
  let passes = 0;
  for (let i = 0; i < MC_DRAWS; i++) {
    let forVotes = govMandates;
    let againstVotes = 0;
    for (const vp of votingParties) {
      const r = Math.random();
      if (r < vp.pFor) {
        forVotes += vp.m;
      } else if (r >= vp.pFor + vp.pAbstain) {
        againstVotes += vp.m;
      }
    }
    if (forVotes >= minForVotes && forVotes > againstVotes) passes++;
  }
  return passes / MC_DRAWS;
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
    else flexBonus = 0.90;
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
  const noise = Math.exp(0.15 * normDraw(0, 1));
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

function determineForstaaelsespapir(government, outsideParties, platform, cfg) {
  // Forståelsespapir negotiation is probabilistic: P(deal) = average
  // tolerateInGov across ALL government parties, not just the most willing.
  // This reflects that M's "no far-left dependency" red line creates real
  // friction even when SF champions EL's inclusion.
  const offers = [];
  const minThreshold = cfg.forstMinAcceptance != null ? cfg.forstMinAcceptance : 0.20;
  const normalizedOutside = outsideParties.map(entry => (typeof entry === "string" ? entry : entry && entry.id)).filter(Boolean);

  for (const partyId of normalizedOutside) {
    const party = PARTIES_MAP[partyId];
    if (!party) continue;

    const position = party.positions.forstaaelsespapir;
    if (!(position.weight >= 0.95 && position.ideal === 0)) {
      continue;
    }

    // Average tolerateInGov across all government parties
    let tolerateSum = 0;
    for (const govId of government) {
      const govParty = PARTIES_MAP[govId];
      tolerateSum += relationshipValue(govParty, partyId, "tolerateInGov", 0);
    }
    const avgTolerate = government.length > 0 ? tolerateSum / government.length : 0;

    // Probabilistic: must exceed minimum AND pass stochastic draw
    if (avgTolerate >= minThreshold && Math.random() < avgTolerate) {
      offers.push({ party: partyId, type: "forstaaelsespapir" });
    }
  }

  return offers;
}

function checkDyadAcceptance(members, flexibility) {
  for (const id of members) {
    const party = PARTIES_MAP[id];
    if (!party) continue;
    let minInGov = 1.0;
    for (const otherId of members) {
      if (otherId === id) continue;
      const val = relationshipValue(party, otherId, "inGov", 1.0);
      if (val < minInGov) minInGov = val;
    }
    if (minInGov >= 1.0) continue;
    if (minInGov < 0.05) return false;
    const spread = Math.max(0.05, minInGov * 0.4);
    const threshold = minInGov + Math.random() * Math.min(spread, 1 - minInGov);
    if (Math.random() > threshold) return false;
  }

  return true;
}

function withLeaderFirst(government, leader) {
  return [leader, ...government.filter(id => id !== leader)];
}

function selectGovernment(mandates, naAlignments, cfg, coalitions) {
  const viabilityThreshold = cfg.viabilityThreshold != null ? cfg.viabilityThreshold : 0.70;
  const blueViabilityThreshold = cfg.blueViabilityThreshold != null ? cfg.blueViabilityThreshold : 0.10;
  const redPreference = cfg.redPreference != null ? cfg.redPreference : 0.5;
  const maxRedRounds = cfg.maxFormationRounds != null ? cfg.maxFormationRounds : 3;
  const flexIncrement = cfg.flexIncrement || 0.05;
  const maxParties = 4;

  const sLed = coalitions.filter(coalition => coalition.leader === "S");
  const blueLed = coalitions.filter(coalition => coalition.leader === "V");
  const mLed = coalitions.filter(coalition => coalition.leader === "M");

  function tryGroup(groupCoalitions, bonusFn, roundCfg, threshold) {
    let best = null;
    const candidates = groupCoalitions.filter(c => c.government.length <= maxParties);

    for (const rawCoalition of candidates) {
      const orderedGovernment = withLeaderFirst(rawCoalition.government, rawCoalition.leader);
      const coalition = { ...rawCoalition, government: orderedGovernment };

      const confidence = confidenceCheck(orderedGovernment, mandates, roundCfg);
      if (!confidence.passes) continue;
      if (!checkDyadAcceptance(orderedGovernment, roundCfg.flexibility || 0)) continue;

      const outsideParties = PARTIES_LIST
        .map(party => party.id)
        .filter(id => !orderedGovernment.includes(id));
      const support = determineForstaaelsespapir(orderedGovernment, outsideParties, coalition.platform, roundCfg);
      coalition.support = support;

      const pPassage = computePpassage(coalition, coalition.platform, mandates, roundCfg);
      if (pPassage < threshold) continue;

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
          formationRound: 1,
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
    return leaderBonus * Math.exp(0.15 * normDraw(0, 1));
  };
  const mLedBonus = () => Math.exp(0.15 * normDraw(0, 1));

  // Counterfactual: blue formateur first (if user overrides)
  const blueFirst = cfg.formateurOverride === "blue";

  if (blueFirst) {
    // Blue formateur rounds: blue faces tough arithmetic, uses desperation threshold
    for (let round = 0; round < maxRedRounds; round++) {
      const roundFlex = Math.min(0.5, (cfg.flexibility || 0) + round * flexIncrement);
      const roundCfg = { ...cfg, flexibility: roundFlex, _naAlignments: naAlignments };
      const result = tryGroup(blueLed, blueBonus, roundCfg, blueViabilityThreshold)
        || tryGroup(mLed, mLedBonus, roundCfg, blueViabilityThreshold);
      if (result) {
        result.formationRound = round + 1;
        result.formateurOrder = "blå først";
        return result;
      }
    }
    // Fallback: S formateur with normal threshold
    const fallbackCfg = { ...cfg, flexibility: (cfg.flexibility || 0) + maxRedRounds * flexIncrement, _naAlignments: naAlignments };
    const result = tryGroup(sLed, sLedBonus, fallbackCfg, viabilityThreshold);
    if (result) {
      result.formationRound = maxRedRounds + 1;
      result.formateurOrder = "rød først";
      return result;
    }
    return null;
  }

  // S formateur rounds: Frederiksen tries with increasing flexibility
  for (let round = 0; round < maxRedRounds; round++) {
    const roundFlex = Math.min(0.5, (cfg.flexibility || 0) + round * flexIncrement);
    const roundCfg = { ...cfg, flexibility: roundFlex, _naAlignments: naAlignments };
    const result = tryGroup(sLed, sLedBonus, roundCfg, viabilityThreshold);
    if (result) {
      result.formationRound = round + 1;
      result.formateurOrder = "rød først";
      return result;
    }
  }

  // Blue formateur round: desperation fallback with lower threshold
  const blueCfg = { ...cfg, flexibility: (cfg.flexibility || 0) + maxRedRounds * flexIncrement, _naAlignments: naAlignments };
  const result = tryGroup(blueLed, blueBonus, blueCfg, blueViabilityThreshold)
    || tryGroup(mLed, mLedBonus, blueCfg, blueViabilityThreshold);
  if (result) {
    result.formationRound = maxRedRounds + 1;
    result.formateurOrder = "blå først";
    return result;
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
    blueViabilityThreshold: 0.10,
    minForVotes: 70,
    distPenalty: 1.5,
    precedentWeight: 0,
    mDemandGov: true,
    sDemandGov: true,
    // Frederiksen appointed as kongelig undersøger (March 2026): red forms first.
    formateurOverride: "red",
    redPreference: 0.5,
    maxFormationRounds: 1,
    flexIncrement: 0.05,
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

  const passthroughKeys = [
    "forstMinAcceptance",
    "connectedThreshold",
    "mwccFullBonus",
    "naRedShift",
    "formateurOverride",
    "sDemandGov",
    "mDemandPM",
    "mElTolerate"
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
  // Apply user-adjustable M→EL tolerance (dashboard slider)
  const _origMEL = PARTIES_MAP.M.relationships.EL.tolerateInGov;
  if (cfg.mElTolerate != null) {
    PARTIES_MAP.M.relationships.EL.tolerateInGov = cfg.mElTolerate;
  }

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
    // Per-iteration confidence-interval variation
    const _savedSFM = PARTIES_MAP.SF.relationships.M.inGov;
    const _savedMSF = PARTIES_MAP.M.relationships.SF.inGov;
    PARTIES_MAP.SF.relationships.M.inGov = clamp01(normDraw(_savedSFM, 0.06));
    PARTIES_MAP.M.relationships.SF.inGov = clamp01(normDraw(_savedMSF, 0.06));

    // M→EL tolerateInGov CI: central unknown — will Løkke accept EL as external support?
    const _savedMEL = PARTIES_MAP.M.relationships.EL.tolerateInGov;
    PARTIES_MAP.M.relationships.EL.tolerateInGov = clamp01(normDraw(_savedMEL, 0.10));

    // M↔DF stochastic relaxation (12% of draws)
    let _dfRelaxed = false;
    const _savedMDF = {};
    if (Math.random() < 0.12) {
      _dfRelaxed = true;
      _savedMDF.mdf_t = PARTIES_MAP.M.relationships.DF.tolerateInGov;
      _savedMDF.dfm_t = PARTIES_MAP.DF.relationships.M.tolerateInGov;
      _savedMDF.mdf_s = PARTIES_MAP.M.relationships.DF.asSupport;
      _savedMDF.dfm_s = PARTIES_MAP.DF.relationships.M.asSupport;
      _savedMDF.mdf_i = PARTIES_MAP.M.relationships.DF.inGov;
      _savedMDF.dfm_i = PARTIES_MAP.DF.relationships.M.inGov;
      PARTIES_MAP.M.relationships.DF.tolerateInGov = 0.35;
      PARTIES_MAP.DF.relationships.M.tolerateInGov = 0.35;
      PARTIES_MAP.M.relationships.DF.asSupport = 0.30;
      PARTIES_MAP.DF.relationships.M.asSupport = 0.25;
      PARTIES_MAP.M.relationships.DF.inGov = 0.08;
      PARTIES_MAP.DF.relationships.M.inGov = 0.08;
    }

    // Viability threshold CI
    const _iterViability = Math.max(0.50, Math.min(0.85, normDraw(0.70, 0.06)));

    try {
      const naAlignments = drawNAAlignments(cfg);
      const iterCfg = { ...cfg, viabilityThreshold: _iterViability };
      const result = selectGovernment(mandates, naAlignments, iterCfg, coalitions);

      if (!result) {
        agg.noGovCount++;
        agg.govTypeCounts.none = (agg.govTypeCounts.none || 0) + 1;
      } else {
        agg.pmCounts[result.pm] = (agg.pmCounts[result.pm] || 0) + 1;
        if (result.formateurOrder) {
          agg.formateurOrder[result.formateurOrder] = (agg.formateurOrder[result.formateurOrder] || 0) + 1;
        }
        agg.govTypeCounts[result.govType] = (agg.govTypeCounts[result.govType] || 0) + 1;

        if (!agg.coalitionCounts[result.coalition]) {
          const govIds = result.government;
          const govSet = new Set(govIds);
          const govSeats = govIds.reduce((s, id) => s + (mandates[id] || 0), 0);
          const govSide = getGovSide(result);

          // 1. Forståelsespapir parties (EL)
          const forstPartier = (result.support || []).map(s => s.party);

          // 2. Loose mainland støttepartier: same-bloc, not in govt, not forst
          const looseSupport = [];
          const forstSet = new Set(forstPartier);
          for (const party of PARTIES_LIST) {
            if (govSet.has(party.id) || forstSet.has(party.id)) continue;
            if (party.bloc === govSide && party.participationPref) {
              // Include if they'd plausibly support (same bloc, not demanding govt)
              const govPref = party.participationPref.government || 0;
              if (govPref < 0.50) looseSupport.push(party.id);
            }
          }

          // 3. NA seats — only when they help reach 90
          const naSupport = [];
          const forstSeats = forstPartier.reduce((s, id) => s + ((PARTIES_MAP[id] || {}).mandates || 0), 0);
          const looseSeats = looseSupport.reduce((s, id) => s + ((PARTIES_MAP[id] || {}).mandates || 0), 0);
          const withMainland = govSeats + forstSeats + looseSeats;
          if (withMainland < 90) {
            for (const seat of NA_SEATS) {
              const pAligned = govSide === "red" ? seat.pRed : govSide === "blue" ? seat.pBlue : 0;
              if (pAligned + seat.pFlexible >= 0.50) {
                naSupport.push(seat.id);
              }
            }
          }

          agg.coalitionCounts[result.coalition] = {
            count: 0,
            pPassageSum: 0,
            platform: result.platform,
            govProfile: result.govProfile,
            support: forstPartier,
            looseSupport,
            naSupport
          };
        }

        agg.coalitionCounts[result.coalition].count++;
        agg.coalitionCounts[result.coalition].pPassageSum += result.pPassage;
        agg.formationRounds.total += result.formationRound;
        agg.formationRounds.distribution[result.formationRound] =
          (agg.formationRounds.distribution[result.formationRound] || 0) + 1;
      }
    } finally {
      // Restore per-iteration CI values
      PARTIES_MAP.SF.relationships.M.inGov = _savedSFM;
      PARTIES_MAP.M.relationships.SF.inGov = _savedMSF;
      PARTIES_MAP.M.relationships.EL.tolerateInGov = _savedMEL;
      if (_dfRelaxed) {
        PARTIES_MAP.M.relationships.DF.tolerateInGov = _savedMDF.mdf_t;
        PARTIES_MAP.DF.relationships.M.tolerateInGov = _savedMDF.dfm_t;
        PARTIES_MAP.M.relationships.DF.asSupport = _savedMDF.mdf_s;
        PARTIES_MAP.DF.relationships.M.asSupport = _savedMDF.dfm_s;
        PARTIES_MAP.M.relationships.DF.inGov = _savedMDF.mdf_i;
        PARTIES_MAP.DF.relationships.M.inGov = _savedMDF.dfm_i;
      }
    }
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
      govProfile: data.govProfile,
      support: data.support || [],
      looseSupport: data.looseSupport || [],
      naSupport: data.naSupport || []
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

  // Restore M→EL tolerance
  PARTIES_MAP.M.relationships.EL.tolerateInGov = _origMEL;

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
  blocBudgetVote,
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
