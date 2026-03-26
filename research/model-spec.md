# Model Specification — sim5 (March 2026)

This document describes the current coalition formation simulator: its architecture, design decisions, parameter values, and the reasoning behind each. Written for someone reading the codebase for the first time.

---

## Overview

The simulator models Danish government formation after the 24 March 2026 election. It runs Monte Carlo iterations, each producing a government (or no government). The output is a probability distribution over coalition configurations.

**Current baseline output (N=2000):**

| Coalition | Pct | P(passage) | Support |
|-----------|-----|------------|---------|
| S+M+RV+SF | ~47% | 0.968 | [EL] forst, ALT loose |
| S+M+SF | ~20% | 0.930 | [EL] forst, ALT, NA |
| S+RV+SF | ~17% | 0.758 | [EL] forst, ALT, NA |
| V+KF+LA+M | ~8% | 0.132 | DF, DD, BP loose |
| S+M+RV | ~3% | 0.675 | [EL] forst, ALT, NA |
| NoGov | ~4% | — | |

**Key files:**
- `sim5-parties.js` — party data (positions, relationships, harshness)
- `sim5-coalitions.js` — coalition enumeration and platform negotiation
- `sim5-engine.js` — simulation engine (budget votes, scoring, formateur protocol)
- `index.html` — interactive dashboard

---

## Architecture

### Per-iteration flow

Each Monte Carlo iteration:

1. **CI parameter variation** — draw per-iteration values for uncertain parameters (SF↔M relationship, M→EL tolerance, M↔DF relaxation, viability threshold). CI is disabled for any parameter the user explicitly set via a slider.
2. **NA alignment draw** — each North Atlantic seat drawn as red/flexible/blue
3. **S formateur attempts** — Frederiksen explores all coalitions (up to 4 parties). Each attempt: confidence check → dyad acceptance → forståelsespapir negotiation → bloc P(passage) → score. Best-scoring viable coalition wins. Number of attempts controlled by `maxFormationRounds` (default 1), each with slightly increasing flexibility.
4. **Blue formateur round** (if all S attempts fail) — V-led coalitions tried with lower viability threshold (desperation: Hartling precedent)
5. **Result** — government formed or NoGov

### Bloc voting model

**Core principle:** parties vote as single blocs (all mandates FOR, ABSTAIN, or AGAINST). This reflects Danish party discipline — once a party decides to support a government, all its members vote accordingly.

**What P(passage) represents:** the probability the formateur can negotiate enough support commitments to pass the budget. It is NOT "the probability a random vote passes." Once deals are struck, the budget passes with near-certainty due to party discipline. The stochastic element is whether the deals can be made.

**Implementation:** Monte Carlo with 800 draws. Each draw: every non-government party independently decides (as a bloc) whether to vote FOR, ABSTAIN, or AGAINST. Budget passes if FOR ≥ 70 and FOR > AGAINST.

### Formateur protocol

S formateur attempts, then blue fallback:

1. **S formateur (certain).** Frederiksen was appointed as kongelig undersøger post-election. She explores all S-led coalitions (up to 4 parties). The viability threshold (default 0.70) sets her minimum acceptable P(negotiation success). The `maxFormationRounds` slider (default 1) controls how many attempts she makes, each with a fresh dyad acceptance draw and slightly higher flexibility (+0.05 per attempt).

2. **Blue formateur (if all S attempts fail).** A blue party leader gets the mandate. Uses a much lower viability threshold (default 0.10) because this is a desperation situation — the alternative is no government. This reflects Danish negative parliamentarism: a government with marginal budget passage can still function via vekslende flertal (changing majorities per issue), as Hartling demonstrated with 22 seats in 1973-75.

The "Første formateur" dropdown allows a counterfactual where blue goes first. In this mode, blue rounds use the desperation threshold and S is the fallback with normal threshold.

---

## Budget vote model: `blocBudgetVote`

For each non-government party, a single bloc support probability is computed. The modifiers apply sequentially:

### 1. Demand gates (hard overrides)

| Condition | Result |
|-----------|--------|
| S excluded, `sDemandGov=true` | 1% FOR, 4% abstain, 95% against |
| M excluded, `mDemandGov=true` | 1% FOR, 4% abstain, 95% against |
| Party demands PM but isn't PM | 1% FOR, 4% abstain, 95% against |
| Party IS in government | 97% FOR, 2% abstain, 1% against |

### 2. EL forståelsespapir (empirically calibrated)

EL's voting is binary on whether a forståelsespapir exists — this is the single most well-calibrated parameter in the model, based on EL's complete voting record (see `research/calibration.md`):
- With forståelsespapir: 93% FOR (empirical: 0.92-0.95)
- Without: 3% FOR (empirical: 0.02-0.05)

The forståelsespapir negotiation is **probabilistic** (see section below).

### 3. Bloc alignment base rate

| Relationship to government | Base pFor |
|---------------------------|-----------|
| Same bloc (red party → red govt, blue → blue) | 0.65 |
| Swing or center government | 0.35 |
| Opposite bloc | 0.05 |

**Rationale:** in Danish politics, budget support is primarily about bloc loyalty, not per-dimension policy agreement. DF supports a blue budget because it's blue, not because DF evaluated 12 policy positions independently.

### 4. Relationship modifiers (multiplicative, sqrt-softened)

- **PM acceptance:** `base *= max(0.1, sqrt(asPM))`. A party's willingness to accept the PM. Sqrt softening prevents low asPM values from completely killing support.
- **Tolerate government members:** for each non-leader member, `base *= max(0.2, sqrt(tolerateInGov))`. A party's willingness to tolerate specific parties being in the government it supports externally.

### 5. Participation demand exclusion penalty

If a party strongly wants government (govPref ≥ 0.50) and accepts the PM (asPM > 0.20), being excluded reduces its support: `base *= max(0.15, 1 - govPref × 0.5)`. This captures SF's "government or nothing" stance — SF supports less enthusiastically when excluded from a government it wants to join.

### 6. Strategic opposition

When M demands government but is excluded (`mDemandGov=true` and M not in coalition):
- Blue parties: `base *= 0.15` (actively oppose to support M's inclusion leverage — they prefer a government WITH M)
- Swing parties (non-M): `base *= 0.3`

**Rationale:** blue parties prefer S+M+RV+SF to S+RV+SF, so they vote against the M-less version to force M's inclusion. This is strategic voting based on comparing alternatives, not sincere policy preference.

### 7. Policy-distance modifier

After all relationship/strategic modifiers, floor violations on high-weight policy dimensions reduce support:
- For each dimension with weight ≥ 0.60 where the platform falls outside the party's acceptable range: `base *= 0.88`
- Capped at 4 violations (minimum multiplier: 0.88^4 ≈ 0.60)

**Rationale:** bloc loyalty dominates, but extreme policy mismatches create friction. This ensures user-adjustable policy positions affect budget votes, not just coalition scoring.

### 8. Final conversion

```
pFor = clamp(base, 0.01, 0.95)
pAgainst = max(0.02, (1 - pFor) × 0.7)
pAbstain = 1 - pFor - pAgainst
```

The 70/30 against-to-abstain ratio reflects that parties opposing a government are more likely to vote against than abstain.

---

## Forståelsespapir negotiation

The forståelsespapir is probabilistic, not automatic. For a party that demands one (EL: forstaaelsespapir weight ≥ 0.95, ideal = 0):

1. **Veto check:** if ANY government party has `tolerateInGov < 0.05` for the requesting party, the deal is vetoed entirely. This gives each government party effective veto power.
2. **Probability:** P(deal) = average `tolerateInGov` across all government parties. Must also exceed a minimum threshold (0.20).
3. **Stochastic draw:** if `Math.random() < avgTolerate`, the deal succeeds.

**Example for S+M+RV+SF → EL:**
- S→EL tolerateInGov: 0.75 (S negotiated the 2019 forståelsespapir)
- M→EL tolerateInGov: 0.35 (default; adjustable via slider)
- RV→EL tolerateInGov: 0.84
- SF→EL tolerateInGov: 0.78
- Average: 0.68 → ~68% chance of forståelsespapir

**The M–EL slider** (`mElTolerate`) is the central unknown. At 0: M vetoes → EL never gets forst with any M-containing government. At 0.50+: deal is likely. This is exposed as the most prominent dashboard control.

**Display logic:** parties whose support depends on a forståelsespapir (EL) are only shown as støtteparti when they actually get one. Without it, their 3% FOR doesn't qualify as meaningful support.

---

## Dyad acceptance: per-party minimum

Before a coalition is evaluated for budget passage, each party in the coalition must accept being in government with the others. The check:

1. For each party, find its MINIMUM `inGov` value across all other coalition members.
2. If minimum < 0.05: always block (hard floor — near-categorical vetoes like SF→V are respected).
3. Otherwise: draw a stochastic threshold from `[minInGov, minInGov + spread]` where `spread = max(0.05, minInGov × 0.4)`. If `Math.random() > threshold`, block.

**Why per-party minimum, not all-pairs:** the old model checked all C(N,2) bilateral pairs independently, requiring 12 checks for a 4-party coalition. This multiplicative gate made 4-party coalitions nearly impossible (21% acceptance for S+M+RV+SF). The per-party minimum check requires N checks (one per party), each gated by the party's hardest bilateral relationship. This is more realistic: a party decides whether to accept the coalition as a package, gated by its most difficult relationship.

---

## Scoring: `scoreCoalition`

Once a coalition passes all gates and has a P(passage), it's scored:

```
score = P(passage)^passageExponent × ideoFit × sizePenalty × mwccBonus × flexBonus × crossBlocPenalty × precedentBonus × formateur noise
```

| Component | Formula | Notes |
|-----------|---------|-------|
| Passage score | `P^2.0` | Formateurs prefer high-P coalitions nonlinearly |
| Ideological fit | `max(0.3, 1 - avgPairwiseDist × 1.5)` | Lower internal policy distance = better fit |
| Size penalty | `[1.0, 0.96, 0.90, 0.82][N-1]` | Larger coalitions penalized (Danish norm: small governments) |
| Minority flex bonus | 1.12 (≤2 parties), 1.0 (3), 0.90 (4) | Smaller minorities are more maneuverable |
| MWCC bonus | 1.15 (connected + minimum winning) | Coalition theory: minimum winning connected coalitions are preferred |
| Cross-bloc penalty | 0.65 if red+blue in minority | Cross-bloc minority governments are historically fragile |
| Precedent bonus | `1 + count × precedentWeight` | Historical frequency (currently weight=0, disabled) |
| Formateur noise | `exp(0.15 × N(0,1))` | Stochastic variation in formateur preferences |

### Size penalties rationale

`SIZE_PENALTIES = [1.0, 0.96, 0.90, 0.82]`

Danish government history: 1-party (7-11 govts), 2-party (10 govts), 3-party (6 govts), 4-party (1-2 govts). Larger coalitions are rarer. The specific values are calibrated to produce realistic relative frequencies, not empirically derived from data. They were softened from the original [1.0, 0.96, 0.88, 0.72] during the March 2026 calibration audit because the 0.72 penalty for 4-party coalitions was structurally preventing the expert-consensus S+M+RV+SF from emerging as the top outcome.

---

## Per-iteration CI variation

Each Monte Carlo iteration draws several uncertain parameters from confidence intervals. This replaces the old model's ad hoc scoring noise with principled parameter uncertainty.

**Slider-overrides-CI principle:** when the user moves a slider from its default, the CI variation for that parameter is disabled. The user is expressing a view — the model respects it exactly. CI only applies to parameters left at their defaults.

### SF↔M relationship strength

```
SF→M inGov: draw from N(0.72, 0.06), clamped [0.45, 0.95]
M→SF inGov: draw from N(0.68, 0.06), clamped [0.40, 0.90]
```

**Rationale:** SF's openness to M is the most consequential uncertain parameter. Dyhr says "Løkke has become a different person" but grassroots resistance exists. The sigma of 0.06 reflects genuine uncertainty about whether the SF-M deal can be made on any given attempt.

### M→EL tolerateInGov

```
draw from N(0.35, 0.10), clamped [0, 1]
```

**Rationale:** will Løkke accept EL as external support? His "no far-left dependency" red line is the central unknown. Experts treat it as a negotiating position. The wide sigma (0.10) reflects genuine uncertainty. **Disabled when user moves the M–EL slider.**

### M↔DF stochastic relaxation

12% of iterations: M↔DF relationships relax from near-zero to moderate values:
- `tolerateInGov`: 0.05/0.10 → 0.35/0.35
- `asSupport`: 0.00/0.15 → 0.30/0.25
- `inGov`: 0.00/0.00 → 0.08/0.08

**Rationale:** DF→M is "devour him and his people every single day" (Messerschmidt). Hard zero is the baseline. But DF "has not ruled out being a support party for a blue government where M is also a support party." The 12% relaxation rate represents the low but nonzero probability of pragmatic M-DF cooperation.

### Viability threshold

```
draw from N(0.70, 0.06), clamped [0.50, 0.85]
```

**Rationale:** the formateur's risk tolerance is not fixed. Sometimes Frederiksen might accept a 60% deal; sometimes she insists on 80%. **Disabled when user moves the viability slider.**

---

## Relationship value changes (March 2026 audit)

These values were changed from their initial extraction based on cross-referencing party briefs:

| Relationship | Old | New | Evidence |
|-------------|-----|-----|----------|
| SF→RV inGov | 0.58 | 0.78 | SF's "aldrig igen" targets V/KF, not RV. SF+RV governed together (SRSF 2011-14). Dyhr called M and RV "to midterpartier af samme type." |
| S→RV inGov | 0.72 | 0.88 | S+RV has 5 historical government precedents (most common Danish coalition type). No S statement against RV. |
| RV→SF inGov | 0.65 | 0.78 | RV and SF are "close allies on climate and education." SRSF precedent. |
| SF→M inGov | 0.65 | 0.72 | Dyhr: "Løkke er faktisk blevet en anden som formand for Moderaterne." Explicit repeated openness since early 2024. |
| M→SF inGov | 0.60 | 0.68 | M is "un-dogmatic and solution-oriented." SF is the primary partner in the consensus scenario. |
| SF→M tolerateInGov | 0.00 | 0.65 | Bug fix: was blocking S+M+RV viability. SF willing to join government with M (inGov=0.72) but coded as unwilling to tolerate M from outside (0.00). Toleration should be the lower bar. |
| S→EL tolerateInGov | 0.00 | 0.75 | S negotiated the 2019-22 forståelsespapir with EL. S clearly tolerates EL as external support. |
| M→EL tolerateInGov | 0.00 | 0.35 | Experts treat M's "no far-left dependency" as negotiating position. M reluctantly accepts EL as external support because the alternative is worse. Adjustable via dashboard slider. |

---

## NA seats

Four North Atlantic mandates (2 Faroese, 2 Greenlandic). Each is drawn per iteration as red, flexible, or blue:

| Seat | pRed | pFlexible | pBlue | Notes |
|------|------|-----------|-------|-------|
| FO-JF (Javnaðarflokkurin) | 0.95 | 0.05 | 0.00 | Predictable red |
| FO-SB (Sambandsflokkurin) | 0.00 | 0.05 | 0.95 | Predictable blue |
| GL-NAL (Naleraq) | 0.50 | 0.40 | 0.10 | Swing — pro-independence, transactional |
| GL-IA (Inuit Ataqatigiit) | 0.65 | 0.30 | 0.05 | Red-leaning but refused to pre-commit |

### NA voting norms

NA seats vote in budgets via `evalNABudgetVote` (not replaced by bloc voting since these are individual MFs, not party blocs). **Strong norm: NA MFs never vote against a government.** They either vote FOR or abstain — they avoid participating in toppling governments.

- Aligned with government side: 80% FOR, 18% abstain, 2% against
- Flexible: 40% FOR, 57% abstain, 3% against
- Opposed: 5% FOR, 93% abstain, 2% against

**Exception:** Greenlandic seats (GL-NAL, GL-IA) actively oppose governments containing DF (80% against). DF's proposal for a Danish referendum on Greenlandic independence is an existential sovereignty threat.

### Support display

NA seats are shown as støttepartier in the dashboard **only when they help a coalition reach 90 mandates.** S+M+RV+SF (82 seats + EL 11 + ALT 5 = 98) doesn't need NA display. S+M+SF (72 + 11 + 5 = 88) does.

NA seats are displayed with flag-colored dots (red/white for Greenland, blue/white/red for Faroe) and a separate "+" from mainland støttepartier.

---

## Support party display

The dashboard shows three tiers of support, each with a "+" separator:

1. **Forståelsespapir** (e.g., [EL]): formal agreement, shown in brackets. Only appears if the probabilistic forståelsespapir negotiation succeeded.
2. **Loose støttepartier** (e.g., ALT, or DF/DD/BP for blue): same-bloc parties without formal agreement but likely to vote FOR. Must have govPref < 0.50 (not demanding government). Parties whose support is binary on forståelsespapir (EL) are excluded from loose display if they didn't get one.
3. **NA seats** (flag-colored dots): only shown when the coalition + mainland support < 90 mandates.

---

## Dashboard parameters

### Main scenario controls

| Control | Parameter | Default | Description |
|---------|-----------|---------|-------------|
| M–EL forståelsespapir | `mElTolerate` | 0.35 | M's tolerance for EL as external support. At 0: M vetoes, no EL forst for M-containing govts. At 0.50+: deal likely. Central unknown in formation. **Overrides CI when changed.** |
| Fleksibilitet | `flexibility` | 0 | Global negotiation pressure. Negative = parties hold fast. Positive = parties stretch. |
| Rød præference | `redPreference` | 0.5 | Frederiksen's preference for red vs. broad coalitions. Feeds into `frederiksenBonus`. |
| Viabilitetstærskel | `viabilityThreshold` | 0.70 | S formateur's minimum P(negotiation success). Blue fallback uses 0.10. **Overrides CI when changed.** |
| Forhandlingsforsøg | `maxFormationRounds` | 1 | Attempts within S formateur's mandate. Each: fresh dyad draw, +0.05 flexibility. |
| Første formateur | `formateurOverride` | "red" | "Red" = S first (standard). "Blue" = counterfactual. |
| Iterationer | `N` | 500 | Monte Carlo iterations. |

### Party-level controls

| Control | Parameter | Description |
|---------|-----------|-------------|
| M kræver regering | `mDemandGov` | M votes against any government excluding M. |
| S kræver regering | `sDemandGov` | S votes against any government excluding S. |
| M kræver statsminister | `mDemandPM` | M votes against any govt where Løkke isn't PM. |
| Parti-harshness sliders | `globalHarshness` | Per-party negotiation rigidity. |

### Advanced controls

| Control | Parameter | Default | Description |
|---------|-----------|---------|-------------|
| Stabilitetseksponent | `passageExponent` | 2.0 | P(passage)^exponent in scoring. Higher = prefer stable govts. |
| Afstandsstraff | `distPenalty` | 1.5 | Ideological distance penalty in scoring. |
| Formatørtræk | `formateurPull` | 0.3 | Extra weight formateur gets in platform negotiation. |
| Gulvtærskel | `floorThreshold` | 0.7 | Min position weight for floor enforcement in negotiation. |

### Presets

| Preset | Settings | Scenario |
|--------|----------|----------|
| Baseline | all defaults | Standard post-election prediction |
| Bred midte | redPreference: 0.3, flexibility: 0.1 | Frederiksen prefers broad centre coalition |
| Rød blok | redPreference: 0.8 | Frederiksen prefers pure red coalition |
| Løkke → blå | mPmPref: "V", mDemandGov: false | M aligns blue, doesn't demand government |
| Maksimalt pres | flexibility: 0.3, maxFormationRounds: 3 | Maximum negotiation pressure, multiple attempts |
| SF blokerer M | flexibility: -0.2 | SF refuses to compromise on M |

---

## Previous model (replaced March 2026)

The sim5 engine originally used a per-mandate dynamic programming (DP) model for budget passage. This was replaced with bloc voting after a calibration audit revealed structural flaws. The legacy functions have been removed from the codebase. For reference:

| Old function | What it did | Replaced by |
|-------------|-------------|-------------|
| `runDP()` | DP over 175 mandates, each voting independently | Monte Carlo bloc voting in `computePpassage` |
| `evalBudgetVote()` | Per-mandate vote probability from 12-dimension position matching | `blocBudgetVote()` |
| `computePositionBasedPFor()` | Logistic function over 12 policy dimensions | Bloc alignment base rate |
| `identifyConditioningPair()` | EL↔M Bayesian conditioning | Strategic opposition multiplier |
| `determineFormateurOrder()` | Stochastic formateur draw | Hard-coded two-round protocol |

**Why replaced:** The per-mandate DP model treated each of a party's mandates as an independent coin flip. With DF at P(FOR)=0.04 per mandate, getting all 16 DF seats to vote FOR was vanishingly unlikely. But Danish parties vote as blocs — either all 16 vote FOR or all 16 vote AGAINST. The DP model made minority governments structurally unviable and blue governments arithmetically impossible.
