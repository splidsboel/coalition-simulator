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
  // Strategic orientation: when M pursues blue, M actively opposes S-led budgets
  if (partyId === "M" && cfg._mPursuesBlue && !govIds.includes("M") && govSide === "red") {
    return { pFor: 0.02, pAbstain: 0.08, pAgainst: 0.90 };
  }
  // General "demands government" gate for other parties (SF, RV, V, KF, LA)
  if (cfg.demandGov && cfg.demandGov[partyId] && !govIds.includes(partyId)) {
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
  // 1C: Centrist/blue partners in government reduce EL's willingness to
  // support — EL voted against FL 2014 under Thorning (S+SF+RV) due to
  // centrist RV. Each non-red partner applies a penalty (~0.08).
  if (partyId === "EL") {
    const hasForst = Array.isArray(coalition.support)
      && coalition.support.some(s => s.party === "EL" && s.type === "forstaaelsespapir");
    const centristCount = govIds.filter(id => {
      const p = PARTIES_MAP[id];
      return p && p.bloc !== "red";
    }).length;

    if (hasForst) {
      const centristPenalty = cfg.elCentristPenalty != null ? cfg.elCentristPenalty : 0.08;
      const elForstBase = cfg.elForstBase != null ? cfg.elForstBase : 0.93;
      const elForstRate = Math.max(0.50, elForstBase - centristCount * centristPenalty);
      return { pFor: elForstRate, pAbstain: (1 - elForstRate) * 0.71, pAgainst: (1 - elForstRate) * 0.29 };
    }
    // 1B: Informal EL support tier — without forståelsespapir, EL still
    // negotiated case-by-case under Thorning (voted FOR 2012, 2013, 2015).
    // Red-side governments get an intermediate ~45% FOR rate; non-red get 3%.
    if (govSide === "red") {
      const centristPenalty = cfg.elCentristPenalty != null ? cfg.elCentristPenalty : 0.08;
      const elInformalRate = cfg.elInformalRate != null ? cfg.elInformalRate : 0.45;
      const informalRate = Math.max(0.15, elInformalRate - centristCount * centristPenalty);
      return { pFor: informalRate, pAbstain: (1 - informalRate) * 0.40, pAgainst: (1 - informalRate) * 0.60 };
    }
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

  // 1A: Opposition abstention norm — the largest opposite-bloc party
  // (main opposition) tends to abstain rather than actively topple a
  // government via budget rejection (historical Danish norm). Flip the
  // against:abstain ratio for that party: ~30:70 instead of 70:30.
  const oppositeBloc = govSide === "red" ? "blue" : (govSide === "blue" ? "red" : null);
  let isMainOpposition = false;
  if (oppositeBloc && party.bloc === oppositeBloc) {
    let largestId = null;
    let largestMandates = 0;
    for (const p of PARTIES_LIST) {
      if (p.bloc === oppositeBloc && !govIds.includes(p.id) && p.mandates > largestMandates) {
        largestMandates = p.mandates;
        largestId = p.id;
      }
    }
    isMainOpposition = (partyId === largestId);
  }

  const againstShare = isMainOpposition
    ? (cfg.oppositionAbstention != null ? cfg.oppositionAbstention : 0.3)
    : 0.7;
  const pAgainst = Math.max(0.02, (1 - pFor) * againstShare);
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

  // ── Cross-bloc budget pivot setup ──────────────────────────────
  // Historical rationale: no sitting Danish government has failed to pass
  // a budget. When natural støtteparti defect, the government pivots to
  // the opposite bloc:
  //   - Thorning FL 2014: EL refused → government negotiated with V and KF
  //   - Nyrup efterløn 1998: bypassed SF/EL, negotiated with blue bloc
  //   - Schlüter era: routine compartmentalized majorities across blocs
  //
  // When the initial vote fails for a minority government, we simulate a
  // rescue attempt: parties that voted AGAINST may be recruited as
  // alternative budget partners if they are from the opposite bloc or are
  // swing parties. Rescue probability is moderate (~0.25 base) and
  // modulated by the party's tolerateInGov toward government members —
  // higher tolerance makes recruitment easier.
  const isMinority = govMandates < 90;
  const govSide = getGovSide(coalition);

  // Pre-compute package-deal rescue probability for cross-bloc budget pivot.
  // Historical pattern: rescue was a package deal (government negotiates with
  // V and KF together, not independently). Single draw using the best
  // available partner's tolerance, rather than independent per-party draws
  // that inflate compound probability.
  const rescueBase = cfg.rescueBase != null ? cfg.rescueBase : 0.10;
  let rescueProb = 0;
  const rescueCandidates = [];
  if (isMinority) {
    for (const vp of votingParties) {
      const party = PARTIES_MAP[vp.id];
      if (!party) continue;
      const isOppBloc = (govSide === "red" && party.bloc === "blue")
                     || (govSide === "blue" && party.bloc === "red");
      const isSwing = party.bloc === "swing";
      if (!isOppBloc && !isSwing) continue;

      let tolSum = 0;
      let tolCount = 0;
      for (const memberId of government) {
        const tol = relationshipValue(party, memberId, "tolerateInGov", 0.5);
        tolSum += tol;
        tolCount++;
      }
      const avgTol = tolCount > 0 ? tolSum / tolCount : 0.5;
      const partyRescueProb = Math.min(0.30, Math.max(0.05, rescueBase * avgTol));
      rescueCandidates.push({ id: vp.id, m: vp.m, prob: partyRescueProb });
    }
    // Package-deal probability: use the best available partner's rate.
    // Historically, governments recruited the most willing cross-bloc
    // partner(s) as a bundle — Thorning went to V+KF together, not
    // independently. The single draw avoids the compound-probability
    // inflation of independent per-party draws.
    if (rescueCandidates.length > 0) {
      rescueProb = Math.max(...rescueCandidates.map(c => c.prob));
    }
  }
  const hasRescueCandidates = isMinority && rescueCandidates.length > 0;
  // ── End pivot setup ────────────────────────────────────────────

  for (let i = 0; i < MC_DRAWS; i++) {
    let forVotes = govMandates;
    let againstVotes = 0;

    // Track per-party outcomes for potential rescue attempt
    const partyOutcomes = hasRescueCandidates ? [] : null;

    for (const vp of votingParties) {
      const r = Math.random();
      if (r < vp.pFor) {
        forVotes += vp.m;
        if (partyOutcomes) partyOutcomes.push({ id: vp.id, m: vp.m, vote: "for" });
      } else if (r >= vp.pFor + vp.pAbstain) {
        againstVotes += vp.m;
        if (partyOutcomes) partyOutcomes.push({ id: vp.id, m: vp.m, vote: "against" });
      } else {
        if (partyOutcomes) partyOutcomes.push({ id: vp.id, m: vp.m, vote: "abstain" });
      }
    }

    if (forVotes >= minForVotes && forVotes > againstVotes) {
      passes++;
    } else if (hasRescueCandidates) {
      // ── Cross-bloc budget pivot rescue (package deal) ──────
      // The initial vote failed. The government attempts a single
      // package deal with cross-bloc partners — mirroring historical
      // pattern (Thorning FL 2014: negotiated with V+KF as a package).
      // Single draw at the best partner's probability; if it succeeds,
      // ALL willing cross-bloc parties switch together.
      if (Math.random() < rescueProb) {
        let rescueFor = forVotes;
        let rescueAgainst = againstVotes;
        const candidateIds = new Set(rescueCandidates.map(c => c.id));
        for (const po of partyOutcomes) {
          if (po.vote === "against" && candidateIds.has(po.id)) {
            rescueFor += po.m;
            rescueAgainst -= po.m;
          }
        }
        if (rescueFor >= minForVotes && rescueFor > rescueAgainst) {
          passes++;
        }
      }
    }
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


function scoreCoalition(coalition, mandates, pPassage, cfg) {
  const government = coalition.government || [];
  const seats = government.reduce((sum, id) => sum + (mandates[id] || 0), 0);
  const nGov = government.length;
  const avgDist = avgPairwisePolicyDistance(government);
  const ideoFit = Math.max(0.3, 1 - avgDist * (cfg.distPenalty || 1.5));
  const mwcc = mwccBonus(government, mandates, cfg);

  // Parsimony: formateurs prefer smaller coalitions (fewer veto players,
  // more PM autonomy). Single term replaces the old sizePenalty + flexBonus
  // to avoid triple-counting smallness.
  // Range: ~1.15 for 1-2 parties down to ~0.85 for 4 parties in minority.
  // parsimonySpread controls the strength of size preference.
  // At spread=1.0 (default): values are [1.15, 1.10, 0.95, 0.85].
  // At spread=0.0: all 1.0 (no size preference). CI-varied per iteration.
  const pSpread = cfg.parsimonySpread != null ? cfg.parsimonySpread : 1.0;
  const parsimonyBase = [0.15, 0.10, -0.05, -0.15];
  const parsimonyValues = parsimonyBase.map(b => 1.0 + b * pSpread);
  const parsimony = seats < 90
    ? (parsimonyValues[Math.min(nGov, parsimonyValues.length) - 1] || parsimonyValues[parsimonyValues.length - 1])
    : 1.0;  // majority governments: no parsimony preference

  // Governing ease: formateurs prefer coalitions that can build
  // majorities across policy dimensions (vekslende flertal).
  // Uses existing governabilityProfile computation.
  // Wider range than before to make govEase a meaningful counterweight
  // to parsimony: a 58-seat government with avgFeasibility=0.3 gets 0.8,
  // while an 82-seat coalition with avgFeasibility=0.9 gets 1.4.
  let govEase = 1.0;
  if (coalition.platform) {
    const profile = governabilityProfile(coalition, coalition.platform, mandates);
    const dims = Object.keys(profile);
    if (dims.length > 0) {
      const avgFeasibility = dims.reduce((sum, d) => sum + profile[d].feasibility, 0) / dims.length;
      govEase = 0.5 + 1.0 * avgFeasibility;  // range: ~0.5 to ~1.5
    }
  }

  // 90-vote viability bonus: formateurs strongly prefer coalitions that can
  // command 90 FOR votes (gov + forståelsespapir support) over those relying
  // on skiftende flertal. A government that can't reliably pass budgets
  // wouldn't form in the first place.
  const supportSeats = (coalition.support || []).reduce((sum, s) => {
    const sid = typeof s === "string" ? s : s.party;
    return sum + (mandates[sid] || 0);
  }, 0);
  const reliableSeats = seats + supportSeats;
  // Moderate preference for ≥90 reliable seats in scoring.
  // The main 90-vote gate is in the formateur protocol (tryGroup90First),
  // not here. This factor is a tiebreaker within the same tier.
  const majorityViability = reliableSeats >= 90 ? 1.3 : 0.85;

  // Two-factor scoring: passage feasibility vs coalition quality.
  // w (passageWeight) controls the tradeoff. CI-varied per iteration
  // to express structural uncertainty about how formateurs decide.
  const w = cfg.passageWeight != null ? cfg.passageWeight : 0.65;
  const passage = pPassage;  // no exponent — w controls influence
  const quality = ideoFit * parsimony * mwcc * govEase * majorityViability;
  const score = Math.pow(passage, w) * Math.pow(Math.max(0.01, quality), 1 - w);
  return score;
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

    // Veto check: any government party with tolerateInGov < 0.05 blocks the deal.
    // Then P(deal) = average tolerateInGov across all government parties.
    let vetoed = false;
    let tolerateSum = 0;
    for (const govId of government) {
      const govParty = PARTIES_MAP[govId];
      const t = relationshipValue(govParty, partyId, "tolerateInGov", 0);
      if (t < 0.05) { vetoed = true; break; }
      tolerateSum += t;
    }
    if (vetoed) continue;

    const avgTolerate = government.length > 0 ? tolerateSum / government.length : 0;

    // Probabilistic: must exceed minimum AND pass stochastic draw
    if (avgTolerate >= minThreshold && Math.random() < avgTolerate) {
      offers.push({ party: partyId, type: "forstaaelsespapir" });
    }
  }

  return offers;
}

function checkDyadAcceptance(members, flexibility) {
  const flex = flexibility || 0;
  for (const id of members) {
    const party = PARTIES_MAP[id];
    if (!party) continue;
    let minInGov = 1.0;
    for (const otherId of members) {
      if (otherId === id) continue;
      const val = relationshipValue(party, otherId, "inGov", 1.0);
      if (val < minInGov) minInGov = val;
    }
    // Apply flexibility: positive flex increases effective tolerance,
    // modelling increased willingness to compromise in later formation rounds.
    const effectiveMin = Math.min(1.0, minInGov + flex * 0.5);
    if (effectiveMin >= 1.0) continue;
    if (effectiveMin < 0.05) return false;  // hard floor still respected
    const spread = Math.max(0.05, effectiveMin * 0.4);
    const threshold = effectiveMin + Math.random() * Math.min(spread, 1 - effectiveMin);
    if (Math.random() > threshold) return false;
  }

  return true;
}

function withLeaderFirst(government, leader) {
  return [leader, ...government.filter(id => id !== leader)];
}

function selectGovernment(mandates, naAlignments, cfg, coalitions) {
  const viabilityThreshold = cfg.viabilityThreshold != null ? cfg.viabilityThreshold : 0.75;
  const blueViabilityThreshold = cfg.blueViabilityThreshold != null ? cfg.blueViabilityThreshold : 0.10;
  const redPreference = cfg.redPreference != null ? cfg.redPreference : 0.5;
  const maxRedRounds = cfg.maxFormationRounds != null ? cfg.maxFormationRounds : 3;
  const flexIncrement = cfg.flexIncrement || 0.05;
  const maxParties = 4;

  const sLed = coalitions.filter(coalition => coalition.leader === "S");
  const blueLed = coalitions.filter(coalition => coalition.leader === "V");
  const mLed = coalitions.filter(coalition => coalition.leader === "M");

  // 90-vote filter: identifies coalitions that can plausibly assemble 90
  // FOR votes from gov + friendly non-gov parties. Mirrors blocBudgetVote
  // demand gates exactly to avoid divergence.
  function filter90Viable(candidates, roundCfg) {
    return candidates.filter(c => {
      const govSet = new Set(c.government);
      const govSeats = c.government.reduce((s, id) => s + (mandates[id] || 0), 0);
      const govSide = getGovSide(c);
      let friendlySeats = govSeats;
      for (const p of PARTIES_LIST) {
        if (govSet.has(p.id)) continue;
        const m = mandates[p.id] || 0;
        if (m < 1) continue;
        // Demand gates — aligned with blocBudgetVote (lines 65-84)
        if (p.id === "S" && (roundCfg.sDemandGov != null ? roundCfg.sDemandGov : true)) continue;
        if (p.id === "M" && roundCfg.mDemandGov) continue;
        if (p.id === "M" && roundCfg._mPursuesBlue && govSide === "red") continue;
        if (roundCfg.demandGov && roundCfg.demandGov[p.id]) continue;
        if (p.pmDemand && c.leader !== p.id) continue;
        if (p.id === "M" && roundCfg.mDemandPM && c.leader !== "M") continue;
        // Same-bloc or swing parties that tolerate gov members
        const sameBloc = p.bloc === govSide;
        const isSwing = p.bloc === "swing";
        if (!sameBloc && !isSwing) continue;
        // Minimum tolerance: a veto against any single gov member (e.g.,
        // DF→M at 0.20) excludes the party — not diluted by high tolerance
        // toward others. Default for missing tolerateInGov: 0.70 for same-bloc
        // (natural allies), 0.40 for swing (pragmatic), 0.05 for cross-bloc.
        let minTol = 1.0;
        for (const gid of c.government) {
          const gParty = PARTIES_MAP[gid];
          const defaultTol = sameBloc ? 0.70 : (isSwing ? 0.40 : 0.05);
          const tol = relationshipValue(p, gid, "tolerateInGov", defaultTol);
          if (tol < minTol) minTol = tol;
        }
        if (minTol >= 0.30) friendlySeats += m;
      }
      return friendlySeats >= 90;
    });
  }

  // require90: when true, ONLY 90-viable coalitions are considered (no
  // fallback to sub-90). When false, 90-viable are tried first with
  // sub-90 as fallback. Formateur protocol uses require90=true in early
  // rounds and require90=false only in the final desperation round.
  function tryGroup(groupCoalitions, bonusFn, roundCfg, threshold, require90) {
    const candidates = groupCoalitions.filter(c => c.government.length <= maxParties);

    function evalCandidates(coalitionList) {
      let best = null;
      for (const rawCoalition of coalitionList) {
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

    // Try 90-viable coalitions first
    const viable90 = filter90Viable(candidates, roundCfg);
    const best90 = evalCandidates(viable90);
    if (best90) return best90;

    // Sub-90 fallback: only if require90 is false (desperation rounds)
    if (!require90) {
      return evalCandidates(candidates);
    }
    return null;
  }

  const sLedBonus = coalition => frederiksenBonus(coalition, redPreference);
  const blueBonus = coalition => {
    const bluePM = (mandates.LA || 0) > (mandates.V || 0) ? "LA" : "V";
    const leaderBonus = coalition.leader === bluePM ? 1.15 : 1.0;
    return leaderBonus * Math.exp(0.15 * normDraw(0, 1));
  };
  const mLedBonus = () => Math.exp(0.15 * normDraw(0, 1));

  // Simultaneous mode: all coalitions compete in one pool, best score wins.
  // No sequential formateur advantage — the scoring function decides.
  const simultaneous = cfg.formateurOverride === "simultaneous";

  if (simultaneous) {
    const roundCfg = { ...cfg, flexibility: cfg.flexibility || 0, _naAlignments: naAlignments };
    // Evaluate all groups with the same threshold, pick overall best
    const candidates = [
      tryGroup(sLed, sLedBonus, roundCfg, viabilityThreshold, true),
      tryGroup(blueLed, blueBonus, roundCfg, viabilityThreshold, true),
      tryGroup(mLed, mLedBonus, roundCfg, viabilityThreshold, true)
    ].filter(Boolean);
    // Pick highest score
    let best = null;
    for (const c of candidates) {
      if (!best || c.score > best.score) best = c;
    }
    if (best) {
      best.formationRound = 1;
      best.formateurOrder = best.government[0] === "S" ? "rød først" : "blå først";
      return best;
    }
    // Desperation fallback: allow sub-90 coalitions
    const despCfg = { ...cfg, flexibility: Math.min(0.5, (cfg.flexibility || 0) + flexIncrement), _naAlignments: naAlignments };
    const despCandidates = [
      tryGroup(sLed, sLedBonus, despCfg, 0.05, false),
      tryGroup(blueLed, blueBonus, despCfg, 0.05, false),
      tryGroup(mLed, mLedBonus, despCfg, 0.05, false)
    ].filter(Boolean);
    let despBest = null;
    for (const c of despCandidates) { if (!despBest || c.score > despBest.score) despBest = c; }
    if (despBest) {
      despBest.formationRound = 2;
      despBest.formateurOrder = "desperation";
      return despBest;
    }
    return null;
  }

  // Counterfactual: blue formateur first (if user overrides)
  const blueFirst = cfg.formateurOverride === "blue";

  if (blueFirst) {
    // Blue formateur rounds: blue faces tough arithmetic, uses desperation threshold
    for (let round = 0; round < maxRedRounds; round++) {
      const roundFlex = Math.min(0.5, (cfg.flexibility || 0) + round * flexIncrement);
      const roundCfg = { ...cfg, flexibility: roundFlex, _naAlignments: naAlignments };
      const result = tryGroup(blueLed, blueBonus, roundCfg, blueViabilityThreshold, true)
        || tryGroup(mLed, mLedBonus, roundCfg, blueViabilityThreshold, true);
      if (result) {
        result.formationRound = round + 1;
        result.formateurOrder = "blå først";
        return result;
      }
    }
    // Fallback: S formateur with normal threshold
    const fallbackCfg = { ...cfg, flexibility: (cfg.flexibility || 0) + maxRedRounds * flexIncrement, _naAlignments: naAlignments };
    const result = tryGroup(sLed, sLedBonus, fallbackCfg, viabilityThreshold, true);
    if (result) {
      result.formationRound = maxRedRounds + 1;
      result.formateurOrder = "rød først";
      return result;
    }

    // Desperation fallback: allow sub-90 coalitions
    const desperationCfgBlue = {
      ...cfg,
      flexibility: (cfg.flexibility || 0) + (maxRedRounds + 1) * flexIncrement,
      _naAlignments: naAlignments
    };
    const desperationResultBlue = tryGroup(sLed, sLedBonus, desperationCfgBlue, 0.05, false)
      || tryGroup(blueLed, blueBonus, desperationCfgBlue, 0.05, false)
      || tryGroup(mLed, mLedBonus, desperationCfgBlue, 0.05, false);
    if (desperationResultBlue) {
      desperationResultBlue.formationRound = maxRedRounds + 2;
      desperationResultBlue.formateurOrder = "desperation";
      return desperationResultBlue;
    }
    return null;
  }

  // S formateur round 1: mandate-constrained
  // The kongerunde mandate specifies which parties Frederiksen must include.
  // Default: SF + RV (from King Frederik's statement: "government with
  // participation of SF and Radikale Venstre"). If mandateParties is null
  // or empty, round 1 is unconstrained (pre-kongerunde or counterfactual).
  const mandateParties = cfg.mandateParties !== undefined ? cfg.mandateParties : null;
  const hasMandateConstraint = mandateParties && mandateParties.length > 0;

  if (hasMandateConstraint) {
    const mandateSet = new Set(mandateParties);
    const mandateCoalitions = sLed.filter(c =>
      [...mandateSet].every(mp => c.government.includes(mp))
    );
    for (let round = 0; round < maxRedRounds; round++) {
      const roundFlex = Math.min(0.5, (cfg.flexibility || 0) + round * flexIncrement);
      const roundCfg = { ...cfg, flexibility: roundFlex, _naAlignments: naAlignments };
      const result = tryGroup(mandateCoalitions, sLedBonus, roundCfg, viabilityThreshold, true);
      if (result) {
        result.formationRound = round + 1;
        result.formateurOrder = "rød først";
        return result;
      }
    }

    // Mandate failed. Historically, the King tries the other bloc before
    // giving the first formateur a broader mandate (1988: Schlüter→Anker;
    // 2015: Thorning→Løkke). Blue gets a turn next.
    const blueAfterMandateNum = maxRedRounds + 1;
    const blueAfterMandateFlex = Math.min(0.5, (cfg.flexibility || 0) + blueAfterMandateNum * flexIncrement);
    const blueAfterMandateCfg = { ...cfg, flexibility: blueAfterMandateFlex, _naAlignments: naAlignments };
    const blueAfterMandate = tryGroup(blueLed, blueBonus, blueAfterMandateCfg, blueViabilityThreshold, true)
      || tryGroup(mLed, mLedBonus, blueAfterMandateCfg, blueViabilityThreshold, true);
    if (blueAfterMandate) {
      blueAfterMandate.formationRound = blueAfterMandateNum;
      blueAfterMandate.formateurOrder = "blå først";
      return blueAfterMandate;
    }

    // Round 3: expanded S mandate — S tries all S-led coalitions with lower
    // threshold (third kongerunde, broader authority, increasing desperation)
    const expandedThreshold = Math.max(0.50, viabilityThreshold - 0.10);
    const expandedNum = blueAfterMandateNum + 1;
    const expandedFlex = Math.min(0.5, (cfg.flexibility || 0) + expandedNum * flexIncrement);
    const expandedCfg = { ...cfg, flexibility: expandedFlex, _naAlignments: naAlignments };
    const expandedResult = tryGroup(sLed, sLedBonus, expandedCfg, expandedThreshold, true);
    if (expandedResult) {
      expandedResult.formationRound = expandedNum;
      expandedResult.formateurOrder = "rød først";
      return expandedResult;
    }
  } else {
    // No mandate constraint (pre-kongerunde or counterfactual): try all S-led
    for (let round = 0; round < maxRedRounds; round++) {
      const roundFlex = Math.min(0.5, (cfg.flexibility || 0) + round * flexIncrement);
      const roundCfg = { ...cfg, flexibility: roundFlex, _naAlignments: naAlignments };
      const result = tryGroup(sLed, sLedBonus, roundCfg, viabilityThreshold, true);
      if (result) {
        result.formationRound = round + 1;
        result.formateurOrder = "rød først";
        return result;
      }
    }
  }

  // Blue formateur round
  const blueRoundNum = hasMandateConstraint ? maxRedRounds + 3 : maxRedRounds + 1;
  const blueFlex = (cfg.flexibility || 0) + (blueRoundNum - 1) * flexIncrement;
  const blueCfg = { ...cfg, flexibility: Math.min(0.5, blueFlex), _naAlignments: naAlignments };
  const result = tryGroup(blueLed, blueBonus, blueCfg, blueViabilityThreshold, true)
    || tryGroup(mLed, mLedBonus, blueCfg, blueViabilityThreshold, true);
  if (result) {
    result.formationRound = blueRoundNum;
    result.formateurOrder = "blå først";
    return result;
  }

  // Desperation fallback: allow sub-90 coalitions (skiftende flertal).
  // Historical precedent: government always forms eventually.
  const desperationRoundNum = blueRoundNum + 1;
  const desperationCfg = {
    ...cfg,
    flexibility: Math.min(0.5, (cfg.flexibility || 0) + (desperationRoundNum - 1) * flexIncrement),
    _naAlignments: naAlignments
  };
  const desperationResult = tryGroup(sLed, sLedBonus, desperationCfg, 0.05, false)
    || tryGroup(blueLed, blueBonus, desperationCfg, 0.05, false)
    || tryGroup(mLed, mLedBonus, desperationCfg, 0.05, false);
  if (desperationResult) {
    desperationResult.formationRound = desperationRoundNum;
    desperationResult.formateurOrder = "desperation";
    return desperationResult;
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
    viabilityThreshold: 0.75,
    blueViabilityThreshold: 0.10,
    minForVotes: 70,
    distPenalty: 1.5,
    passageWeight: 0.65,
    oppositionAbstention: 0.10,  // UPDATE 2026-03-28: opposition votes against, not abstains
    rescueBase: 0.10,
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
    "mElTolerate",
    "passageWeight",
    "oppositionAbstention",
    "rescueBase",
    "elInformalRate",
    "elCentristPenalty",
    "elForstBase",
    "parsimonySpread",
    "mdfCooperationProb"
  ];

  for (const key of passthroughKeys) {
    if ((userParams.cfg || {})[key] != null) cfg[key] = userParams.cfg[key];
    else if (userParams[key] != null) cfg[key] = userParams[key];
  }

  // Build demandGov from party objects when not user-supplied
  if (!cfg.demandGov) {
    cfg.demandGov = {};
    for (const p of PARTIES_LIST) {
      if (p.demandGov) cfg.demandGov[p.id] = true;
    }
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

  // Determine which parameters the user explicitly changed from defaults.
  // When a user moves a slider (or a sweep injects a value), the CI should
  // not override it. CI only applies to parameters left at their defaults.
  const CI_DEFAULTS = {
    mElTolerate: 0.10, viabilityThreshold: 0.75, passageWeight: 0.65, oppositionAbstention: 0.10,
    elInformalRate: 0.45, elCentristPenalty: 0.08, elForstBase: 0.93,
    rescueBase: 0.10, oppositionAbstention: 0.30, distPenalty: 1.50,
    parsimonySpread: 1.0, mdfCooperationProb: 0.12
  };
  function isUserSet(key) {
    if (CI_DEFAULTS[key] == null) return false;
    return cfg[key] != null && Math.abs(cfg[key] - CI_DEFAULTS[key]) > 0.001;
  }

  for (let i = 0; i < iterations; i++) {
    // Per-iteration confidence-interval variation
    // CI only applies to parameters the user hasn't explicitly set.
    // When a user moves a slider, they're expressing a view — respect it exactly.
    // Per-iteration CI on ALL bilateral relationships.
    // Default sigma = 0.05 for all values. Captures genuine uncertainty
    // about negotiation outcomes — no bilateral is a point estimate.
    // Special cases get higher sigma where uncertainty is greater.
    const BILATERAL_SIGMA_DEFAULT = 0.02;  // low default: most bilaterals are well-calibrated
    const BILATERAL_SIGMA_OVERRIDES = {
      // M-facing relationships with higher uncertainty
      "M.EL.tolerateInGov": 0.08,  // main hurdle for center-left govt
      "SF.M.inGov": 0.05,          // untested partnership
      "M.SF.inGov": 0.05,          // policy distance is real
      "EL.M.tolerateInGov": 0.06,  // grassroots constraint
      "DD.M.tolerateInGov": 0.06,  // personal animosity, uncertain resolution
      "RV.M.tolerateInGov": 0.04,  // 2022 trauma — low base, moderate uncertainty
    };
    const _savedAllBilaterals = {};
    for (const party of PARTIES_LIST) {
      if (!party.relationships) continue;
      for (const otherId of Object.keys(party.relationships)) {
        const rel = party.relationships[otherId];
        for (const key of ["inGov", "asSupport", "tolerateInGov", "asPM"]) {
          if (rel[key] == null) continue;
          // Skip M→EL tolerateInGov if user set the mElTolerate slider
          if (party.id === "M" && otherId === "EL" && key === "tolerateInGov" && isUserSet("mElTolerate")) continue;
          const overrideKey = party.id + "." + otherId + "." + key;
          const sigma = BILATERAL_SIGMA_OVERRIDES[overrideKey] || BILATERAL_SIGMA_DEFAULT;
          const saveKey = party.id + "." + otherId + "." + key;
          _savedAllBilaterals[saveKey] = rel[key];
          rel[key] = clamp01(normDraw(rel[key], sigma));
        }
      }
    }

    // M↔DF cooperation probability: continuous draw replacing the old
    // discrete 12% switch. Genuine uncertainty about whether pragmatic
    // M-DF cooperation is possible in any given negotiation.
    const _mdfBase = cfg.mdfCooperationProb != null ? cfg.mdfCooperationProb : 0.12;
    const _dfRelaxProb = isUserSet("mdfCooperationProb")
      ? _mdfBase
      : Math.max(0, Math.min(0.30, normDraw(_mdfBase, 0.04)));
    let _dfRelaxed = false;
    const _savedMDF = {};
    if (Math.random() < _dfRelaxProb) {
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

    // All CI-varied parameters: draw from N(mean, sigma) unless user/sweep
    // set a non-default value. The isUserSet() guard ensures that slider
    // positions and sweep-injected values are respected exactly.
    const _iterViability = isUserSet("viabilityThreshold")
      ? cfg.viabilityThreshold
      : Math.max(0.55, Math.min(0.90, normDraw(0.75, 0.06)));
    const _iterPassageWeight = isUserSet("passageWeight")
      ? cfg.passageWeight
      : Math.max(0.50, Math.min(0.90, normDraw(0.65, 0.08)));
    const _iterElInformal = isUserSet("elInformalRate")
      ? cfg.elInformalRate
      : Math.max(0.20, Math.min(0.70, normDraw(0.45, 0.08)));
    const _iterElCentrist = isUserSet("elCentristPenalty")
      ? cfg.elCentristPenalty
      : Math.max(0.02, Math.min(0.16, normDraw(0.08, 0.02)));
    const _iterElForstBase = isUserSet("elForstBase")
      ? cfg.elForstBase
      : Math.max(0.80, Math.min(0.98, normDraw(0.93, 0.03)));
    const _iterRescueBase = isUserSet("rescueBase")
      ? cfg.rescueBase
      : Math.max(0.03, Math.min(0.25, normDraw(0.10, 0.03)));
    const _iterAbstention = isUserSet("oppositionAbstention")
      ? cfg.oppositionAbstention
      : Math.max(0.03, Math.min(0.25, normDraw(0.10, 0.04)));
    const _iterDistPenalty = isUserSet("distPenalty")
      ? cfg.distPenalty
      : Math.max(0.5, Math.min(2.5, normDraw(1.50, 0.15)));
    const _iterParsimony = isUserSet("parsimonySpread")
      ? cfg.parsimonySpread
      : Math.max(0.3, Math.min(1.5, normDraw(1.0, 0.15)));

    // M strategic orientation draw: Løkke simultaneously negotiates with both
    // blocs. Each iteration, M draws a strategic posture — pursue red (cooperate
    // with S-led coalitions) or pursue blue (block S-led, support blue).
    // This captures the outside-option effect from bargaining theory: M's
    // behavior in red negotiations depends on M's assessment of blue alternatives.
    const _mBlueProb = cfg.mBlueOrientation != null ? cfg.mBlueOrientation : 0.30;
    const _mPursuesBlue = Math.random() < _mBlueProb;

    // When M pursues blue: temporarily make M hostile to S-led coalitions
    const _savedMtoS_inGov = PARTIES_MAP.M.relationships.S.inGov;
    const _savedMtoS_tolerate = PARTIES_MAP.M.relationships.S.tolerateInGov;
    const _savedMtoS_asPM = PARTIES_MAP.M.relationships.S.asPM;
    if (_mPursuesBlue) {
      // M refuses to join or support S-led governments
      PARTIES_MAP.M.relationships.S.inGov = 0.01;
      PARTIES_MAP.M.relationships.S.tolerateInGov = 0.05;
      PARTIES_MAP.M.relationships.S.asPM = 0.01;
    }

    try {
      const naAlignments = drawNAAlignments(cfg);
      const iterCfg = {
        ...cfg,
        viabilityThreshold: _iterViability,
        passageWeight: _iterPassageWeight,
        elInformalRate: _iterElInformal,
        elCentristPenalty: _iterElCentrist,
        elForstBase: _iterElForstBase,
        rescueBase: _iterRescueBase,
        oppositionAbstention: _iterAbstention,
        distPenalty: _iterDistPenalty,
        parsimonySpread: _iterParsimony,
        _mPursuesBlue
      };
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

        // Aggregate per-iteration data
        // Key includes forståelsespapir status so e.g. "S+M+RV+SF" with and
        // without EL forst are separate entries (politically distinct configs)
        const forstPartier = (result.support || []).map(s => s.party);
        const coalKey = result.coalition + (forstPartier.length > 0 ? "|forst:" + forstPartier.sort().join(",") : "");

        if (!agg.coalitionCounts[coalKey]) {
          const govIds = result.government;
          const govSet = new Set(govIds);
          const govSeats = govIds.reduce((s, id) => s + (mandates[id] || 0), 0);
          const govSide = getGovSide(result);

          const looseSupport = [];
          for (const party of PARTIES_LIST) {
            if (govSet.has(party.id)) continue;
            const forstPos = party.positions.forstaaelsespapir;
            if (forstPos && forstPos.weight >= 0.95 && forstPos.ideal === 0) continue;
            if (party.bloc === govSide && party.participationPref) {
              const govPref = party.participationPref.government || 0;
              if (govPref < 0.50) looseSupport.push(party.id);
            }
          }

          const naSupport = [];
          const looseSeats = looseSupport.reduce((s, id) => s + ((PARTIES_MAP[id] || {}).mandates || 0), 0);
          const forstEligible = PARTIES_LIST.filter(p => {
            if (govSet.has(p.id)) return false;
            const fp = p.positions.forstaaelsespapir;
            if (!fp || fp.weight < 0.95 || fp.ideal !== 0) return false;
            // Forst parties only support same-side governments
            const isRedGov = govSide === "red" || govSide === "center-left";
            return (p.bloc === "red" && isRedGov) || (p.bloc !== "red" && !isRedGov);
          });
          const forstSeats = forstPartier.length > 0
            ? forstPartier.reduce((s, id) => s + ((PARTIES_MAP[id] || {}).mandates || 0), 0)
            : 0;
          const withMainlandSupport = govSeats + forstSeats + looseSeats;
          if (withMainlandSupport < 90) {
            for (const seat of NA_SEATS) {
              const pAligned = govSide === "red" ? seat.pRed : govSide === "blue" ? seat.pBlue : 0;
              if (pAligned + seat.pFlexible >= 0.50) {
                naSupport.push(seat.id);
              }
            }
          }

          agg.coalitionCounts[coalKey] = {
            count: 0,
            pPassageSum: 0,
            platform: result.platform,
            govProfile: result.govProfile,
            forstPartier: forstPartier,
            looseSupport,
            naSupport
          };
        }

        const entry = agg.coalitionCounts[coalKey];
        entry.count++;
        entry.pPassageSum += result.pPassage;
        agg.formationRounds.total += result.formationRound;
        agg.formationRounds.distribution[result.formationRound] =
          (agg.formationRounds.distribution[result.formationRound] || 0) + 1;
      }
    } finally {
      // Restore per-iteration CI values for all bilaterals
      for (const party of PARTIES_LIST) {
        if (!party.relationships) continue;
        for (const otherId of Object.keys(party.relationships)) {
          const rel = party.relationships[otherId];
          for (const key of ["inGov", "asSupport", "tolerateInGov", "asPM"]) {
            const saveKey = party.id + "." + otherId + "." + key;
            if (_savedAllBilaterals[saveKey] != null) {
              rel[key] = _savedAllBilaterals[saveKey];
            }
          }
        }
      }
      if (_mPursuesBlue) {
        PARTIES_MAP.M.relationships.S.inGov = _savedMtoS_inGov;
        PARTIES_MAP.M.relationships.S.tolerateInGov = _savedMtoS_tolerate;
        PARTIES_MAP.M.relationships.S.asPM = _savedMtoS_asPM;
      }
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
    .map(([coalKey, data]) => {
      // Strip the "|forst:..." suffix to get the clean government name
      const govt = coalKey.includes("|forst:") ? coalKey.split("|forst:")[0] : coalKey;
      return {
        govt,
        pct: roundPct(data.count, iterations),
        avgPPassage: +(data.pPassageSum / data.count).toFixed(3),
        platform: data.platform,
        govProfile: data.govProfile,
        support: data.forstPartier || [],
        looseSupport: data.looseSupport || [],
        naSupport: data.naSupport || []
      };
    });

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
