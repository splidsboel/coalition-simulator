(function() {
const sim5Parties =
  typeof module !== "undefined" && module.exports
    ? require("./sim5-parties.js")
    : globalThis.Sim5Parties;

if (!sim5Parties) {
  throw new Error("sim5-coalitions.js requires sim5-parties.js to be loaded first.");
}

const {
  PARTIES_LIST,
  PARTIES_MAP,
  DIMENSIONS,
  SCALE_MAX,
  isWithinRange,
  distancePastFloor
} = sim5Parties;

function clampToScale(value, dimension) {
  return Math.max(0, Math.min(SCALE_MAX[dimension], value));
}

function getMandatesForParty(id, mandates) {
  if (mandates && Object.prototype.hasOwnProperty.call(mandates, id)) {
    return mandates[id] || 0;
  }

  return PARTIES_MAP[id] ? PARTIES_MAP[id].mandates || 0 : 0;
}

function getEligiblePartyIds(parties, cfg) {
  const sourceParties = Array.isArray(parties) && parties.length ? parties : PARTIES_LIST;
  const eligible = [];
  const seen = new Set();

  for (const party of sourceParties) {
    if (!party || !party.id || !party.govEligible || seen.has(party.id)) {
      continue;
    }

    eligible.push(party.id);
    seen.add(party.id);
  }

  const stretched = cfg && Array.isArray(cfg.stretchedEligibility)
    ? cfg.stretchedEligibility
    : [];

  for (const id of stretched) {
    if (!seen.has(id) && PARTIES_MAP[id]) {
      eligible.push(id);
      seen.add(id);
    }
  }

  return eligible;
}

function pickLeader(memberIds, mandates) {
  let leader = null;
  let leaderSeats = -1;

  for (const id of memberIds) {
    const party = PARTIES_MAP[id];
    if (!party || !party.pmEligible) {
      continue;
    }

    const seats = getMandatesForParty(id, mandates);
    if (leader === null || seats > leaderSeats || (seats === leaderSeats && id < leader)) {
      leader = id;
      leaderSeats = seats;
    }
  }

  return leader;
}

function negotiatePlatform(govMembers, cfg) {
  if (!Array.isArray(govMembers) || govMembers.length === 0) {
    return null;
  }

  const parties = govMembers.map(id => PARTIES_MAP[id]).filter(Boolean);
  if (parties.length !== govMembers.length) {
    return null;
  }

  const leader = parties[0];
  const formateurPull = cfg && typeof cfg.formateurPull === "number" ? cfg.formateurPull : 0.3;
  const platform = {};

  // Coalition essentiality: a party's bargaining power reflects not just
  // its seats × issue weight, but how essential it is to the coalition.
  // M (14 seats) is the kingmaker — without M, S+RV+SF has only 68 seats.
  // Essentiality = totalSeats / (totalSeats - partySeats). Ranges from
  // ~1.2 for small essential partners to ~1.9 for the formateur.
  const totalSeats = parties.reduce((s, p) => s + (p.mandates || 0), 0);
  const essentiality = {};
  for (const party of parties) {
    const seats = party.mandates || 0;
    essentiality[party.id] = totalSeats / Math.max(1, totalSeats - seats);
  }

  for (const dimension of DIMENSIONS) {
    let weightedIdealSum = 0;
    let weightSum = 0;

    for (const party of parties) {
      const position = party.positions[dimension];
      // Pull = mandates × issue_weight × essentiality
      const pull = (party.mandates || 0) * position.weight * essentiality[party.id];

      weightedIdealSum += pull * position.ideal;
      weightSum += pull;
    }

    const leaderPosition = leader.positions[dimension];
    const extraLeaderPull = formateurPull * (leader.mandates || 0) * leaderPosition.weight;
    weightedIdealSum += extraLeaderPull * leaderPosition.ideal;
    weightSum += extraLeaderPull;

    const centroid = weightSum === 0 ? 0 : weightedIdealSum / weightSum;
    platform[dimension] = clampToScale(Math.round(centroid), dimension);
  }

  // Soft floor enforcement: instead of a binary threshold, the platform
  // is pulled toward each party's floor proportional to floorStrength =
  // weight × essentiality. When multiple parties have conflicting floors,
  // the strongest pull wins — no null returns from floor conflicts.
  // This replaces the old binary floorThreshold at 0.70.
  for (const dimension of DIMENSIONS) {
    // Collect all floor violations for this dimension
    const violations = [];
    for (const party of parties) {
      const position = party.positions[dimension];
      if (isWithinRange(platform[dimension], position)) continue;

      const strength = position.weight * (essentiality[party.id] || 1);
      if (strength < 0.3) continue;  // very low-stake parties don't pull

      const floorVal = clampToScale(position.floor, dimension);
      violations.push({ party: party.id, floor: floorVal, strength });
    }

    if (violations.length === 0) continue;

    // Collect ALL parties' floor preferences on this dimension (even
    // those in range) to compute the full picture. Parties in range
    // implicitly "vote" for the current platform value.
    let floorSum = 0;
    let strengthSum = 0;
    for (const party of parties) {
      const position = party.positions[dimension];
      const strength = position.weight * (essentiality[party.id] || 1);
      if (strength < 0.3) continue;

      if (isWithinRange(platform[dimension], position)) {
        // Party is satisfied with current platform — votes for it
        floorSum += platform[dimension] * strength;
      } else {
        // Party violated — votes for their floor
        floorSum += clampToScale(position.floor, dimension) * strength;
      }
      strengthSum += strength;
    }

    if (strengthSum >= 0.8) {
      const compromise = clampToScale(Math.round(floorSum / strengthSum), dimension);
      platform[dimension] = compromise;
    }
  }

  return platform;
}

function computeConcessions(govMembers, platform) {
  const concessions = {};

  for (const id of govMembers) {
    const party = PARTIES_MAP[id];
    if (!party) {
      continue;
    }

    const dimensions = {};
    let weightedSum = 0;
    let weightSum = 0;

    for (const dimension of DIMENSIONS) {
      const position = party.positions[dimension];
      const distance = Math.abs((platform[dimension] || 0) - position.ideal) / SCALE_MAX[dimension];
      const weighted = distance * position.weight;

      dimensions[dimension] = { distance, weighted };
      weightedSum += weighted;
      weightSum += position.weight;
    }

    concessions[id] = {
      total: weightSum === 0 ? 0 : weightedSum / weightSum,
      dimensions
    };
  }

  return concessions;
}

function enumerateCoalitions(parties, mandates, cfg) {
  const eligible = getEligiblePartyIds(parties, cfg);
  const coalitions = [];
  const partyCount = eligible.length;

  for (let mask = 1; mask < (1 << partyCount); mask++) {
    const members = [];
    let seats = 0;

    for (let i = 0; i < partyCount; i++) {
      if (!(mask & (1 << i))) {
        continue;
      }

      const id = eligible[i];
      members.push(id);
      seats += getMandatesForParty(id, mandates);

      if (members.length > 5) {
        break;
      }
    }

    if (members.length > 5) {
      continue;
    }

    if (members.length === 1 && seats < 14) {
      continue;
    }

    if (seats < 20) {
      continue;
    }

    const sortedMembers = [...members].sort();
    const leader = pickLeader(sortedMembers, mandates);
    if (!leader) {
      continue;
    }

    const negotiationOrder = [leader, ...sortedMembers.filter(id => id !== leader)];
    const platform = negotiatePlatform(negotiationOrder, cfg);
    if (!platform) {
      continue;
    }

    coalitions.push({
      id: mask,
      government: sortedMembers,
      leader,
      seats,
      platform,
      concessions: computeConcessions(sortedMembers, platform)
    });
  }

  return coalitions;
}

function classifyGovType(members) {
  if (!Array.isArray(members) || members.length === 0) {
    return "other";
  }

  if (members.length === 1) {
    return `${members[0]}-alone`;
  }

  let hasRed = false;
  let hasBlue = false;
  let hasSwing = false;

  for (const id of members) {
    const bloc = PARTIES_MAP[id] ? PARTIES_MAP[id].bloc : null;
    if (bloc === "red") {
      hasRed = true;
    } else if (bloc === "blue") {
      hasBlue = true;
    } else if (bloc === "swing") {
      hasSwing = true;
    }
  }

  if (hasRed && hasBlue) {
    return "cross";
  }

  if (hasRed && hasSwing && !hasBlue) {
    return "center-left";
  }

  if (hasBlue && hasSwing && !hasRed) {
    return "center-right";
  }

  if (hasRed && !hasBlue && !hasSwing) {
    return "red";
  }

  if (hasBlue && !hasRed && !hasSwing) {
    return "blue";
  }

  if (hasSwing && !hasRed && !hasBlue) {
    return "midter";
  }

  return "other";
}

function getGovSide(coalition) {
  const members = coalition && Array.isArray(coalition.government)
    ? coalition.government
    : [];

  if (members.includes("S")) {
    return "red";
  }

  if (members.includes("V") || members.includes("LA")) {
    return "blue";
  }

  if (members.includes("M")) {
    const partners = members.filter(id => id !== "M");
    const hasRedPartners = partners.some(id => PARTIES_MAP[id] && PARTIES_MAP[id].bloc === "red");
    const hasBluePartners = partners.some(id => PARTIES_MAP[id] && PARTIES_MAP[id].bloc === "blue");

    if ((!hasRedPartners && !hasBluePartners) || (hasRedPartners && hasBluePartners)) {
      return "center";
    }
  }

  return "other";
}

function classifyCoalitionCategory(members) {
  const RED = new Set(["S", "SF", "EL", "ALT", "RV"]);
  const BLUE = new Set(["V", "LA", "KF", "DF", "DD", "BP"]);

  let hasRed = false, hasBlue = false, hasSwing = false;
  for (const id of members) {
    if (RED.has(id)) hasRed = true;
    else if (BLUE.has(id)) hasBlue = true;
    else if (id === "M") hasSwing = true;
  }

  if (hasRed && hasBlue) return "cross-bloc";
  if (hasRed && hasSwing) return "center-red";
  if (hasBlue && hasSwing) return "center-blue";
  if (hasRed) return "red";
  if (hasBlue) return "blue";
  return "center-red";  // M-alone
}

const exportedSim5Coalitions = {
  enumerateCoalitions,
  negotiatePlatform,
  computeConcessions,
  classifyGovType,
  classifyCoalitionCategory,
  getGovSide
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = exportedSim5Coalitions;
} else {
  globalThis.Sim5Coalitions = exportedSim5Coalitions;
}
})();
