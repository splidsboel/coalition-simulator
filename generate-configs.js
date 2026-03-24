#!/usr/bin/env node
"use strict";

const DEFAULT_N = 500;
const PARTY_ORDER = ["S", "SF", "EL", "ALT", "RV", "M", "KF", "V", "LA", "DD", "DF", "BP"];

// With endogenous formateur (sim3.js checks blueBloc >= 90),
// pBF=0.15 everywhere. Blue gets formateur automatically when they have majority.
const PBF_BY_SCENARIO = {
  current: 0.15,
  red: 0.15,
  blue: 0.15,
};

const MANDATE_BASELINES = {
  current: {},
  red: { S: 40, SF: 25 },
  blue: { V: 22, LA: 22, KF: 14 },
};

const BLUE_STEP_OVERRIDES = {
  1: { V: 18, LA: 20, KF: 12 },
  2: { V: 19, LA: 20, KF: 13 },
  3: { V: 20, LA: 20, KF: 13 },
  4: { V: 20, LA: 21, KF: 13 },
  5: { V: 21, LA: 21, KF: 13 },
  6: { V: 21, LA: 21, KF: 14 },
  7: { V: 22, LA: 21, KF: 14 },
  8: { V: 22, LA: 22, KF: 14 },
  9: { V: 23, LA: 23, KF: 14 },
  10: { V: 24, LA: 24, KF: 15 },
};

const SPECIAL_MANDATES = {
  knifeEdge: { S: 35, SF: 22 },
  redTide: { S: 42, SF: 25 },
  sfLeverage: { S: 36, SF: 24 },
  historical2019: { S: 48, SF: 14, RV: 16, M: 6 },
  sfSurgeS34SF27: { S: 34, SF: 27 },
  sfSurgeS32SF30: { S: 32, SF: 30 },
  sAlone42: { S: 42 },
  sAlone45: { S: 45 },
  sAlone48: { S: 48 },
};

for (const [step, overrides] of Object.entries(BLUE_STEP_OVERRIDES)) {
  SPECIAL_MANDATES[`blueStep${step}`] = overrides;
}

for (const sfSeats of [23, 25, 27, 30]) {
  SPECIAL_MANDATES[`sfSurge${sfSeats}`] = { SF: sfSeats };
}

const gridConfigs = new Map();
const records = [];
const labelSet = new Set();

function cleanObject(obj) {
  const out = {};
  for (const [key, value] of Object.entries(obj || {})) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function orderObjectKeys(obj) {
  const clean = cleanObject(obj);
  const out = {};
  for (const key of Object.keys(clean).sort()) {
    out[key] = clean[key];
  }
  return out;
}

function orderMandates(mandates) {
  const clean = cleanObject(mandates);
  const out = {};

  for (const party of PARTY_ORDER) {
    if (clean[party] != null) {
      out[party] = clean[party];
    }
  }

  for (const key of Object.keys(clean).sort()) {
    if (!(key in out)) {
      out[key] = clean[key];
    }
  }

  return out;
}

function withDefaultPBF(defaultValue, cfg) {
  const cleanCfg = cleanObject(cfg);
  if (cleanCfg.pBlueFormateur == null) {
    cleanCfg.pBlueFormateur = defaultValue;
  }
  return cleanCfg;
}

function buildConfig(mandates, cfg, sweep) {
  const config = {};
  const orderedMandates = orderMandates(mandates);
  const orderedCfg = orderObjectKeys(cfg);
  const orderedSweep = orderObjectKeys(sweep);

  if (Object.keys(orderedMandates).length > 0) {
    config.mandates = orderedMandates;
  }
  if (Object.keys(orderedCfg).length > 0) {
    config.cfg = orderedCfg;
  }
  if (Object.keys(orderedSweep).length > 0) {
    config.sweep = orderedSweep;
  }

  return config;
}

function addBuiltRecord(label, config, n = DEFAULT_N) {
  if (labelSet.has(label)) {
    throw new Error(`Duplicate label: ${label}`);
  }
  labelSet.add(label);
  records.push({ label, config, n });
}

function addRecord(label, mandates = {}, cfg = {}, sweep = {}, n = DEFAULT_N) {
  addBuiltRecord(label, buildConfig(mandates, cfg, sweep), n);
}

function scenarioConfig(scenario, cfg, sweep) {
  return buildConfig(
    MANDATE_BASELINES[scenario],
    withDefaultPBF(PBF_BY_SCENARIO[scenario], cfg),
    sweep,
  );
}

function currentConfig(cfg, sweep) {
  return scenarioConfig("current", cfg, sweep);
}

function specialMandateConfig(mandates, cfg, sweep, pBlueFormateur = PBF_BY_SCENARIO.current) {
  return buildConfig(mandates, withDefaultPBF(pBlueFormateur, cfg), sweep);
}

function addScenarioRecord(label, scenario, cfg, sweep, n = DEFAULT_N) {
  addBuiltRecord(label, scenarioConfig(scenario, cfg, sweep), n);
}

function addCurrentRecord(label, cfg, sweep, n = DEFAULT_N) {
  addScenarioRecord(label, "current", cfg, sweep, n);
}

function addSpecialRecord(label, mandates, cfg, sweep, pBlueFormateur = PBF_BY_SCENARIO.current, n = DEFAULT_N) {
  addBuiltRecord(label, specialMandateConfig(mandates, cfg, sweep, pBlueFormateur), n);
}

function gridKey(scenario, behavior, orientation, pref, sf, sRelaxPM = false) {
  const suffix = sRelaxPM ? "+sRelaxPM" : "";
  return `${scenario}-${behavior}-${orientation}-${pref}-${sf}${suffix}`;
}

function gridLabel(scenario, behavior, orientation, pref, sf, sRelaxPM = false) {
  return `grid:${gridKey(scenario, behavior, orientation, pref, sf, sRelaxPM)}`;
}

function registerGridRecord(key, config) {
  gridConfigs.set(key, config);
  addBuiltRecord(`grid:${key}`, config);
}

function generateGrid() {
  const scenarios = [
    { code: "current" },
    { code: "red" },
    { code: "blue" },
  ];
  const behaviors = [
    { code: "demandGov", cfg: { mDemandGov: true } },
    { code: "standard", cfg: {} },
    { code: "demandPM", cfg: { mDemandPM: true } },
  ];
  const orientations = [
    { code: "S", cfg: {} },
    { code: "V", cfg: { mPmPref: "V" } },
    { code: "self", cfg: { mPmPref: "M" } },
  ];
  const preferences = [
    { code: "r80", cfg: { redPreference: 0.8 } },
    { code: "r50", cfg: {} },
    { code: "r20", cfg: { redPreference: 0.2 } },
  ];
  const sfLevels = [
    { code: "s70", sweep: { sf_budget_abstain_sm: [0.7] } },
    { code: "s50", sweep: {} },
    { code: "s30", sweep: { sf_budget_abstain_sm: [0.3] } },
  ];

  for (const scenario of scenarios) {
    for (const behavior of behaviors) {
      for (const orientation of orientations) {
        for (const preference of preferences) {
          for (const sf of sfLevels) {
            const cfg = { ...behavior.cfg, ...orientation.cfg, ...preference.cfg };
            const key = gridKey(
              scenario.code,
              behavior.code,
              orientation.code,
              preference.code,
              sf.code,
            );
            registerGridRecord(key, scenarioConfig(scenario.code, cfg, sf.sweep));

            if (scenario.code === "current") {
              const relaxKey = gridKey(
                scenario.code,
                behavior.code,
                orientation.code,
                preference.code,
                sf.code,
                true,
              );
              registerGridRecord(relaxKey, currentConfig({ ...cfg, sRelaxPM: true }, sf.sweep));
            }
          }
        }
      }
    }
  }
}

function addGridAlias(label, key, n = DEFAULT_N) {
  const config = gridConfigs.get(key);
  if (!config) {
    throw new Error(`Unknown grid alias target: ${key}`);
  }
  addBuiltRecord(label, config, n);
}

function generateAliases() {
  const mappedAliases = [
    ["baseline", "current-standard-S-r50-s50"],
    ["M->V", "current-standard-V-r50-s50"],
    ["M->self", "current-standard-self-r50-s50"],
    ["M-demands-PM", "current-demandPM-S-r50-s50"],
    ["baseline+M->S", "current-standard-S-r50-s50"],
    ["baseline+M->V", "current-standard-V-r50-s50"],
    ["baseline+M->M", "current-standard-self-r50-s50"],
    ["red-majority", "red-standard-S-r50-s50"],
    ["red-majority+M->S", "red-standard-S-r50-s50"],
    ["red-majority+M->V", "red-standard-V-r50-s50"],
    ["red-majority+M->M", "red-standard-self-r50-s50"],
    ["archetype:blue-surge", "blue-standard-S-r50-s50"],
    ["blue-strong+M->S", "blue-standard-S-r50-s50"],
    ["blue-strong+M->V", "blue-standard-V-r50-s50"],
    ["blue-strong+M->M", "blue-standard-self-r50-s50"],
    ["mDemandGov+current-polls", "current-demandGov-S-r50-s50"],
    ["mDemandGov+M->S", "current-demandGov-S-r50-s50"],
    ["mDemandGov+M->V", "current-demandGov-V-r50-s50"],
    ["mDemandGov+M->self", "current-demandGov-self-r50-s50"],
    ["mDemandGov+red-majority", "red-demandGov-S-r50-s50"],
    ["mDemandGov+blue-surge", "blue-demandGov-S-r50-s50"],
    ["redPref=0.8", "current-standard-S-r80-s50"],
    ["redPref=0.5", "current-standard-S-r50-s50"],
    ["redPref=0.2", "current-standard-S-r20-s50"],
  ];

  const sRelaxAliases = [
    ["sRelaxPM+baseline", "current-standard-S-r50-s50+sRelaxPM"],
    ["sRelaxPM+mDemandGov", "current-demandGov-S-r50-s50+sRelaxPM"],
    ["sRelaxPM+M->V", "current-standard-V-r50-s50+sRelaxPM"],
    ["sRelaxPM+M-demands-PM", "current-demandPM-S-r50-s50+sRelaxPM"],
  ];

  for (const [label, key] of mappedAliases) {
    addGridAlias(label, key);
  }

  for (const [label, key] of sRelaxAliases) {
    addGridAlias(label, key);
  }

  addSpecialRecord("archetype:knife-edge", SPECIAL_MANDATES.knifeEdge);
  addSpecialRecord("mDemandGov+red-weakened", SPECIAL_MANDATES.knifeEdge, { mDemandGov: true });
  addCurrentRecord("mDemandGov+mDemandPM", { mDemandGov: true, mDemandPM: true });

  addCurrentRecord("redPref=0.0", { redPreference: 0.0 });
  addCurrentRecord("redPref=0.35", { redPreference: 0.35 });
  addCurrentRecord("redPref=0.65", { redPreference: 0.65 });
  addCurrentRecord("redPref=1.0", { redPreference: 1.0 });

  addCurrentRecord("flex=0.4", { flexibility: 0.4 });
  addCurrentRecord("flex=-0.4", { flexibility: -0.4 });
  addCurrentRecord("flex=-0.2", { flexibility: -0.2 });
  addCurrentRecord("flex=0.0", { flexibility: 0.0 });
  addCurrentRecord("flex=0.2", { flexibility: 0.2 });
}

function generateGridlockTier1() {
  addCurrentRecord("GRIDLOCK:demandPM+pBF=0+baseline", { mDemandPM: true, pBlueFormateur: 0.0 });
  addSpecialRecord("GRIDLOCK:demandPM+pBF=0+knife-edge", SPECIAL_MANDATES.knifeEdge, { mDemandPM: true }, undefined, 0.0);
  addRecord("GRIDLOCK:demandPM+pBF=0+blue-strong", MANDATE_BASELINES.blue, { mDemandPM: true, pBlueFormateur: 0.0 });
  addRecord("GRIDLOCK:demandPM+pBF=0.2+blue-strong", MANDATE_BASELINES.blue, { mDemandPM: true, pBlueFormateur: 0.2 });
}

function generateArchetypes() {
  addRecord("archetype:red-tide", SPECIAL_MANDATES.redTide, { pBlueFormateur: 0.0, redPreference: 0.8 });
  addSpecialRecord("archetype:sf-leverage", SPECIAL_MANDATES.sfLeverage, {}, { sf_budget_abstain_sm: [0.35] });
  addCurrentRecord(
    "archetype:midter-forced",
    { redPreference: 0.3, flexibility: 0.2 },
    { m_substitute_pfor_hi: [0.55], m_substitute_pfor_lo: [0.35] },
  );
  addCurrentRecord("archetype:m-goes-blue", { mPmPref: "V", redPreference: 0.6 });
  addCurrentRecord("archetype:broad-compromise", { redPreference: 0.3, viabilityThreshold: 0.7, flexibility: 0.2 });
  addRecord("archetype:historical-2019", SPECIAL_MANDATES.historical2019, { pBlueFormateur: 0.0, redPreference: 0.7 });
}

function generateParametricSweeps() {
  const addCurrent = (label, cfg, sweep) => {
    addRecord(label, {}, withDefaultPBF(PBF_BY_SCENARIO.current, cfg), sweep);
  };

  for (const val of [0.3, 0.4, 0.5, 0.6, 0.7]) {
    addCurrent(`sf-abstain-sm=${val}`, undefined, { sf_budget_abstain_sm: [val] });
  }

  for (const val of [0.3, 0.4, 0.5, 0.7]) {
    addCurrent(`viab-threshold=${val}`, { viabilityThreshold: val });
  }

  const mSubstitutePairs = [
    ["m-substitute=[0.05,0.35]", 0.05, 0.35],
    ["m-substitute=[0.15,0.45]", 0.15, 0.45],
    ["m-substitute=[0.25,0.55]", 0.25, 0.55],
    ["m-substitute=[0.35,0.65]", 0.35, 0.65],
    ["m-substitute=[0.45,0.75]", 0.45, 0.75],
  ];
  for (const [label, lo, hi] of mSubstitutePairs) {
    addCurrent(label, undefined, { m_substitute_pfor_hi: [hi], m_substitute_pfor_lo: [lo] });
  }

  for (const val of [0.5, 1.0, 1.5, 2.5, 3.0]) {
    addCurrent(`distPenalty=${val}`, { distPenalty: val });
  }

  for (const val of [0.03, 0.08, 0.12, 0.18]) {
    addCurrent(`sizePenalty=${val}`, { sizePenalty: val });
  }

  for (const val of [0.0, 0.02, 0.05, 0.08]) {
    addCurrent(`precedentWeight=${val}`, { precedentWeight: val });
  }

  for (const val of [1.0, 1.08, 1.15]) {
    addCurrent(`tax-weight=${val}`, { taxWeight: val });
  }

  for (const val of [0.25, 0.35, 0.55, 0.75]) {
    addCurrent(`mPrefV-Sled=${val}`, { mPrefV_Sled_modifier: val });
  }

  for (const val of [0.9, 1.1, 1.25, 1.5, 1.8]) {
    addCurrent(`mPrefV-blue=${val}`, { mPrefV_blue_modifier: val });
  }

  for (const val of [0.45, 0.6, 0.75]) {
    addCurrent(`mPrefSelf=${val}`, { mPrefSelf_modifier: val });
  }

  for (const [label, val] of [["0.65", 0.65], ["0.75", 0.75], ["0.85", 0.85], ["0.90", 0.90]]) {
    addCurrent(`elAbstain=${label}`, { elAbstainShare: val });
  }

  for (const [label, val] of [["0.30", 0.30], ["0.45", 0.45], ["0.50", 0.50], ["0.65", 0.65]]) {
    addCurrent(`mAbstain=${label}`, { mAbstainShare: val });
  }

  for (const [label, val] of [["-0.10", -0.10], ["0", 0], ["0.10", 0.10]]) {
    addCurrent(`naRedShift=${label}`, { naRedShift: val });
  }

  for (const [label, val] of [["1.05", 1.05], ["1.10", 1.10], ["1.15", 1.15], ["1.25", 1.25]]) {
    addCurrent(`mwccFullBonus=${label}`, { mwccFullBonus: val });
  }

  for (const [label, val] of [["0.50", 0.50], ["0.65", 0.65], ["0.70", 0.70], ["0.85", 0.85]]) {
    addCurrent(`elMPenalty=${label}`, { elMPenalty: val });
  }

  for (const val of [60, 70, 80]) {
    addCurrent(`minForVotes=${val}`, { minForVotes: val });
  }

  for (const [label, val] of [["0.0", 0.0], ["0.1", 0.1], ["0.2", 0.2], ["0.3", 0.3], ["0.4", 0.4]]) {
    addRecord(`pBlueFormateur=${label}`, {}, { pBlueFormateur: val });
  }

  for (const [label, val] of [["-2.0", -2.0], ["-1.0", -1.0], ["0.0", 0.0], ["1.0", 1.0], ["2.0", 2.0]]) {
    addCurrent(`blocBiasBlue=${label}`, { blocBiasBlue: val });
  }

  for (const [label, val] of [["-2.0", -2.0], ["-1.0", -1.0], ["0.0", 0.0], ["1.0", 1.0], ["2.0", 2.0]]) {
    addCurrent(`blocBiasRed=${label}`, { blocBiasRed: val });
  }
}

function generateSigmaBlocSweeps() {
  const values = [3.0, 4.0, 5.0, 6.0, 8.0];

  for (const value of values) {
    const label = value.toFixed(1);
    addCurrentRecord(`sigmaBloc=${label}`, { sigmaBloc: value });
    addCurrentRecord(`sigmaBloc=${label}+mDemandGov`, { sigmaBloc: value, mDemandGov: true });
    addCurrentRecord(`sigmaBloc=${label}+sRelaxPM`, { sigmaBloc: value, sRelaxPM: true });
  }
}

function generateInteractions() {
  const addCurrent = (label, cfg, sweep) => {
    addCurrentRecord(label, cfg, sweep);
  };
  const addKnifeEdge = (label, cfg, sweep, pBlueFormateur = PBF_BY_SCENARIO.current) => {
    addSpecialRecord(label, SPECIAL_MANDATES.knifeEdge, cfg, sweep, pBlueFormateur);
  };
  const addRed = (label, cfg, sweep, pBlueFormateur = PBF_BY_SCENARIO.red) => {
    addRecord(label, MANDATE_BASELINES.red, withDefaultPBF(pBlueFormateur, cfg), sweep);
  };
  const addBlue = (label, cfg, sweep, pBlueFormateur = PBF_BY_SCENARIO.blue) => {
    addRecord(label, MANDATE_BASELINES.blue, withDefaultPBF(pBlueFormateur, cfg), sweep);
  };

  addCurrent("M->V+demandPM", { mPmPref: "V", mDemandPM: true });
  addCurrent("M->self+demandPM", { mPmPref: "M", mDemandPM: true });
  addCurrent("M->S+demandPM", { mPmPref: "S", mDemandPM: true });

  for (const pref of ["S", "V", "M"]) {
    for (const rp of [0.2, 0.5, 0.8]) {
      addCurrent(`M->${pref}+redPref=${rp}`, { mPmPref: pref, redPreference: rp });
    }
  }

  for (const pref of ["S", "V", "M"]) {
    for (const fl of [-0.3, 0.3]) {
      addCurrent(`M->${pref}+flex=${fl}`, { mPmPref: pref, flexibility: fl });
    }
  }

  for (const pbf of [0.2, 0.3]) {
    addRecord(`pBF=${pbf}+baseline`, {}, { pBlueFormateur: pbf });
    addKnifeEdge(`pBF=${pbf}+knife-edge`, undefined, undefined, pbf);
    addBlue(`pBF=${pbf}+blue-strong`, undefined, undefined, pbf);
    addRed(`pBF=${pbf}+red-strong`, undefined, undefined, pbf);
  }

  for (const pref of ["S", "V", "M"]) {
    addRecord(`pBF=0.2+M->${pref}`, {}, { pBlueFormateur: 0.2, mPmPref: pref });
  }
  for (const pref of ["S", "V", "M"]) {
    addRecord(`pBF=0.3+M->${pref}`, {}, { pBlueFormateur: 0.3, mPmPref: pref });
  }

  for (const pbf of [0.2, 0.3]) {
    addRecord(`pBF=${pbf}+demandPM=false`, {}, { pBlueFormateur: pbf, mDemandPM: false });
    addRecord(`pBF=${pbf}+demandPM=true`, {}, { pBlueFormateur: pbf, mDemandPM: true });
  }

  for (const sa of [0.3, 0.7]) {
    for (const rp of [0.3, 0.7]) {
      addCurrent(`sf-abstain=${sa}+redPref=${rp}`, { redPreference: rp }, { sf_budget_abstain_sm: [sa] });
    }
  }

  for (const ea of [0.65, 0.90]) {
    for (const pref of ["S", "V"]) {
      addCurrent(`elAbstain=${ea}+M->${pref}`, { elAbstainShare: ea, mPmPref: pref });
    }
  }

  for (const ep of [0.50, 0.85]) {
    for (const pref of ["S", "V"]) {
      addCurrent(`elMPenalty=${ep}+M->${pref}`, { elMPenalty: ep, mPmPref: pref });
    }
  }

  for (const fl of [-0.3, 0.3]) {
    for (const vt of [0.3, 0.7]) {
      addCurrent(`flex=${fl}+viab=${vt}`, { flexibility: fl, viabilityThreshold: vt });
    }
  }

  for (const sled of [0.35, 0.55, 0.75]) {
    addCurrent(`V-lean:Sled=${sled}+blue=1.25`, {
      mPmPref: "V",
      mPrefV_Sled_modifier: sled,
      mPrefV_blue_modifier: 1.25,
    });
  }

  for (const blue of [0.9, 1.6]) {
    addCurrent(`V-lean:Sled=0.55+blue=${blue}`, {
      mPmPref: "V",
      mPrefV_Sled_modifier: 0.55,
      mPrefV_blue_modifier: blue,
    });
  }

  for (const rp of [0.2, 0.8]) {
    for (const fl of [-0.3, 0.3]) {
      addCurrent(`redPref=${rp}+flex=${fl}`, { redPreference: rp, flexibility: fl });
    }
  }

  for (const pref of ["S", "V"]) {
    for (const pbf of [0.0, 0.2]) {
      addRecord(`TRIANGLE:M->${pref}+pBF=${pbf}+baseline`, {}, { mPmPref: pref, pBlueFormateur: pbf });
      addKnifeEdge(`TRIANGLE:M->${pref}+pBF=${pbf}+knife-edge`, { mPmPref: pref }, undefined, pbf);
      addBlue(`TRIANGLE:M->${pref}+pBF=${pbf}+blue-strong`, { mPmPref: pref }, undefined, pbf);
    }
  }

  for (const pbf of [0.0, 0.2]) {
    const baselineLabel = `GRIDLOCK:demandPM+pBF=${pbf}+baseline`;
    if (!labelSet.has(baselineLabel)) {
      addRecord(baselineLabel, {}, { mDemandPM: true, pBlueFormateur: pbf });
    }

    const knifeEdgeLabel = `GRIDLOCK:demandPM+pBF=${pbf}+knife-edge`;
    if (!labelSet.has(knifeEdgeLabel)) {
      addKnifeEdge(knifeEdgeLabel, { mDemandPM: true }, undefined, pbf);
    }

    const blueLabel = `GRIDLOCK:demandPM+pBF=${pbf}+blue-strong`;
    if (!labelSet.has(blueLabel)) {
      addBlue(blueLabel, { mDemandPM: true }, undefined, pbf);
    }
  }
}

function generatePhaseTransitionProbes() {
  const blueSteps = Object.keys(BLUE_STEP_OVERRIDES).map(Number).sort((a, b) => a - b);

  for (const step of blueSteps) {
    addSpecialRecord(`blue-step-${step}`, SPECIAL_MANDATES[`blueStep${step}`]);
  }

  for (const step of blueSteps) {
    addSpecialRecord(`blue-step-${step}+demandPM`, SPECIAL_MANDATES[`blueStep${step}`], { mDemandPM: true });
  }

  addCurrentRecord("forst-tradeoff:ELhigh+Mharsh", { flexibility: 0.3, mPrefV_Sled_modifier: 0.35 });
  addCurrentRecord("forst-tradeoff:ELhigh+Mmild", { flexibility: 0.3, mPrefV_Sled_modifier: 0.75 });
  addCurrentRecord("forst-tradeoff:ELbase+Mharsh", { flexibility: 0.0, mPrefV_Sled_modifier: 0.35 });
  addCurrentRecord("forst-tradeoff:ELbase+Mmild", { flexibility: 0.0, mPrefV_Sled_modifier: 0.75 });
  addCurrentRecord("forst-tradeoff:ELlow+Mharsh", { flexibility: -0.3, mPrefV_Sled_modifier: 0.35 });
  addCurrentRecord("forst-tradeoff:ELlow+Mmild", { flexibility: -0.3, mPrefV_Sled_modifier: 0.75 });

  addCurrentRecord("demandPM+redPref=0.2", { mDemandPM: true, redPreference: 0.2 });
  addCurrentRecord("demandPM+redPref=0.5", { mDemandPM: true, redPreference: 0.5 });
  addCurrentRecord("demandPM+redPref=0.8", { mDemandPM: true, redPreference: 0.8 });
  addCurrentRecord("demandPM+redPref=1.0", { mDemandPM: true, redPreference: 1.0 });

  for (const sfSeats of [23, 25, 27, 30]) {
    addSpecialRecord(`SF-surge:SF=${sfSeats}`, SPECIAL_MANDATES[`sfSurge${sfSeats}`]);
  }
  addSpecialRecord("SF-surge:S=34+SF=27", SPECIAL_MANDATES.sfSurgeS34SF27);
  addSpecialRecord("SF-surge:S=32+SF=30", SPECIAL_MANDATES.sfSurgeS32SF30);

  addSpecialRecord("S-alone:S=42+flex=0.2", SPECIAL_MANDATES.sAlone42, { flexibility: 0.2 });
  addSpecialRecord("S-alone:S=45+flex=0.2", SPECIAL_MANDATES.sAlone45, { flexibility: 0.2 });
  addSpecialRecord("S-alone:S=48+flex=0.2", SPECIAL_MANDATES.sAlone48, { flexibility: 0.2 });
  addSpecialRecord("S-alone:S=42+flex=0.4", SPECIAL_MANDATES.sAlone42, { flexibility: 0.4 });

  for (const bias of [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0]) {
    const label = bias.toFixed(1);
    addCurrentRecord(`pollError:blue+${label}`, { blocBiasBlue: bias });
  }
  for (const bias of [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0]) {
    const label = bias.toFixed(1);
    addCurrentRecord(`pollError:blue+${label}+demandPM`, { blocBiasBlue: bias, mDemandPM: true });
  }
}

function generateDemandGovExtras() {
  for (const rp of [0.2, 0.5, 0.8, 1.0]) {
    addCurrentRecord(`mDemandGov+redPref=${rp}`, { mDemandGov: true, redPreference: rp });
  }

  for (const fl of [-0.3, 0.3]) {
    addCurrentRecord(`mDemandGov+flex=${fl}`, { mDemandGov: true, flexibility: fl });
  }

  for (const pbf of [0.0, 0.2, 0.35]) {
    addRecord(`mDemandGov+pBF=${pbf}`, {}, { mDemandGov: true, pBlueFormateur: pbf });
  }

  for (const sa of [0.3, 0.7]) {
    addCurrentRecord(`mDemandGov+sf-abstain=${sa}`, { mDemandGov: true }, { sf_budget_abstain_sm: [sa] });
  }

  for (const bias of [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0]) {
    addCurrentRecord(`mDemandGov+pollError:blue+${bias.toFixed(1)}`, { mDemandGov: true, blocBiasBlue: bias });
  }

  for (const step of Object.keys(BLUE_STEP_OVERRIDES).map(Number).sort((a, b) => a - b)) {
    addSpecialRecord(`mDemandGov+blue-step-${step}`, SPECIAL_MANDATES[`blueStep${step}`], { mDemandGov: true });
  }
}

function generatePriorsGridFills() {
  addSpecialRecord("M->V+knife-edge", SPECIAL_MANDATES.knifeEdge, { mPmPref: "V" });
  addSpecialRecord("M->self+knife-edge", SPECIAL_MANDATES.knifeEdge, { mPmPref: "M" });
  addScenarioRecord("M-demands-PM+red-majority", "red", { mDemandPM: true });
  addSpecialRecord("M-demands-PM+knife-edge", SPECIAL_MANDATES.knifeEdge, { mDemandPM: true });
  addScenarioRecord("M-demands-PM+blue-surge", "blue", { mDemandPM: true });
}

function generateElectionNightSpecials() {
  for (const sfSeats of [23, 25, 27, 30]) {
    addSpecialRecord(`SF-surge:SF=${sfSeats}+mDemandGov`, SPECIAL_MANDATES[`sfSurge${sfSeats}`], { mDemandGov: true });
  }
  addSpecialRecord("SF-surge:S=34+SF=27+mDemandGov", SPECIAL_MANDATES.sfSurgeS34SF27, { mDemandGov: true });

  addSpecialRecord("S-alone:S=42+mDemandGov", SPECIAL_MANDATES.sAlone42, { mDemandGov: true }, undefined, 0.0);
  addSpecialRecord("S-alone:S=45+mDemandGov", SPECIAL_MANDATES.sAlone45, { mDemandGov: true }, undefined, 0.0);

  addRecord("archetype:red-tide+mDemandGov", SPECIAL_MANDATES.redTide, { mDemandGov: true, pBlueFormateur: 0.0, redPreference: 0.8 });
  addCurrentRecord("archetype:broad-compromise+mDemandGov", {
    mDemandGov: true,
    redPreference: 0.3,
    viabilityThreshold: 0.7,
    flexibility: 0.2,
  });
  addCurrentRecord(
    "archetype:midter-forced+mDemandGov",
    { mDemandGov: true, redPreference: 0.3, flexibility: 0.2 },
    { m_substitute_pfor_hi: [0.55], m_substitute_pfor_lo: [0.35] },
  );
  addCurrentRecord("archetype:m-goes-blue+mDemandGov", { mDemandGov: true, mPmPref: "V", redPreference: 0.6 });
}

function emit() {
  for (const record of records) {
    process.stdout.write(`${record.label}|${JSON.stringify(record.config)}|${record.n}\n`);
  }
  process.stderr.write(`total configs: ${records.length}\n`);
}

generateGrid();
generateAliases();
generateGridlockTier1();
generateArchetypes();
generateParametricSweeps();
generateSigmaBlocSweeps();
generateInteractions();
generatePhaseTransitionProbes();
generateDemandGovExtras();
generatePriorsGridFills();
generateElectionNightSpecials();

// M-mandate sweep: how does M's size affect its leverage?
// Varies M from 5 to 15 mandates (partial override, stochastic for other parties)
function generateMandateSweeps() {
  for (const mSeats of [5, 6, 7, 8, 9, 10, 11, 12, 13, 15]) {
    addRecord(`M-mandater=${mSeats}`, {M: mSeats}, {pBlueFormateur: 0.15});
    addRecord(`M-mandater=${mSeats}+demandGov`, {M: mSeats}, {pBlueFormateur: 0.15, mDemandGov: true});
  }
  // Red bloc sweep: varies S (largest red party) from 30 to 45
  for (const sSeats of [30, 33, 35, 38, 40, 42, 45]) {
    addRecord(`S-mandater=${sSeats}`, {S: sSeats}, {pBlueFormateur: 0.15});
  }
}
generateMandateSweeps();

emit();
