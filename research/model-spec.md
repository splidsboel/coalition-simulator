# Model Specification -- sim5 (March 2026)

This document describes the coalition formation simulator: its architecture, calibration, and dashboard controls. Written for someone reading the codebase for the first time.

**Key files:**
- `sim5-parties.js` -- party data (positions, relationships, harshness)
- `sim5-coalitions.js` -- coalition enumeration and platform negotiation
- `sim5-engine.js` -- simulation engine (budget votes, scoring, formateur protocol)
- `index.html` -- interactive dashboard

---

## About this model

The simulator asks two questions about each possible coalition. First, can it pass legislation? This depends on whether the coalition (plus any support parties) controls a majority, and whether the parties involved are policy-compatible enough to sustain legislative agreements. Second, is it a natural coalition to form? Smaller coalitions are preferred over larger ones (since prime ministers don't invite extra parties to the table without reason), and some party combinations have easier working relationships than others. The model scores every possible combination on both dimensions and reports the most likely outcomes. Because some of these judgments involve genuine uncertainty -- how much does legislative math matter versus political convenience? how flexible are party leaders on their red lines? -- the model runs many scenarios with slightly different assumptions and reports the range of results, not just a single prediction.

---

## Current baseline output (N=5,000, post 2026-03-26 update)

| Coalition | Pct (aggregated) | Support | Seats |
|-----------|-----------------|---------|-------|
| S+M+RV+SF | ~34% | [EL] forst, ALT loose | 98 |
| S+RV+SF | ~24% | [EL] forst, ALT loose, NA | 87 |
| S+M+SF | ~19% | [EL] forst, ALT loose, NA | 93 |
| S+M+RV | ~14% | [EL] forst, ALT loose, NA | 81 |
| S+SF | ~5% | [EL] forst, ALT loose, NA | 77 + skift. flertal |
| V+KF+LA+M | ~1% | DF, DD, BP loose | 61 + skift. flertal |
| NoGov | 0% | | |

Coalitions are split by forståelsespapir status in the dashboard (e.g., S+M+RV+SF with EL forst vs. without). When the total including support is below 90, the coalition survives through shifting majorities ("skift. flertal") -- the Danish norm of opposition abstention and cross-bloc budget negotiation.

The distribution reflects genuine uncertainty about the SF--M relationship, M--EL tolerance, and how formateurs trade off budget arithmetic against coalition quality.

---

# Part I: Architecture

These are the principled, institutional parts of the model -- mechanisms grounded in how Danish government formation actually works. They would be the same regardless of which election the model is applied to.

---

## 1. Per-iteration flow

Each Monte Carlo iteration produces one government (or, very rarely, no government). The flow:

1. **CI parameter draws.** Draw per-iteration values for all 13 uncertain parameters from normal distributions (see Section 9). Widths encode confidence: narrow for well-calibrated values, wide for genuinely uncertain ones. CI variation is disabled for any parameter the user explicitly set via a slider.
2. **NA alignment draw.** Each of the four North Atlantic seats is drawn as red, flexible, or blue.
3. **S formateur attempts.** Frederiksen explores all S-led coalitions (up to 4 parties). Each attempt runs the full evaluation pipeline: confidence check, dyad acceptance, forstaelsespapir negotiation, P(passage) computation, scoring. The best-scoring coalition above the viability threshold wins. She gets `maxFormationRounds` attempts (default 1), each with slightly increasing flexibility (+0.05 per round).
4. **Blue fallback.** If all S attempts fail, a blue party leader (V or LA, whichever has more seats) gets the mandate. Uses a much lower viability threshold (default 0.10) because this is a desperation situation -- the alternative is no government.
5. **Desperation round.** If both S and blue fail, a final round tries all formateur groups (S-led, blue-led, M-led) with a floor threshold of 0.05. This reflects the historical pattern that a government always forms eventually (1975: four dronningerunder; 1988: four rounds; Hartling: 22 seats in 1973-75).
6. **Result.** Government formed, or null (NoGov).

---

## 2. Bloc voting model

### What P(passage) represents

P(passage) is the probability the formateur can negotiate enough support commitments to pass the budget. It is NOT "the probability a random vote passes." Once deals are struck, the budget passes with near-certainty due to party discipline. The stochastic element is whether the deals can be made.

### Implementation

Parties vote as single blocs -- all mandates FOR, ABSTAIN, or AGAINST. This reflects Danish party discipline: once a party decides to support a government, all its members vote accordingly. Each non-government party gets a bloc support probability computed by `blocBudgetVote` (see below). A Monte Carlo simulation (800 draws) then determines how often the budget passes: in each draw, every party independently draws its bloc outcome, the budget passes if FOR >= 70 and FOR > AGAINST.

### The `blocBudgetVote` pipeline

For each non-government party, a support probability is computed through a sequential pipeline:

**Step 1: Demand gates (hard overrides).** These fire first and short-circuit everything else:

| Condition | Result |
|-----------|--------|
| S excluded, `sDemandGov=true` | 1% FOR, 4% abstain, 95% against |
| M excluded, `mDemandGov=true` | 1% FOR, 4% abstain, 95% against |
| Party demands PM but isn't PM | 1% FOR, 4% abstain, 95% against |
| Party IS in government | 97% FOR, 2% abstain, 1% against |

**Step 2: EL voting model (three tiers).** EL has its own path, separate from the general pipeline, because EL's voting behavior is binary on institutional arrangements rather than continuous:

- *Forstaelsespapir tier:* If EL has a formal agreement, base FOR rate is 93%, reduced by 8pp per non-red coalition partner (e.g., 85% with M in government, 77% with M+V). This calibrates to the Thorning-era pattern where EL's support degraded with centrist partners. Floor: 50%.
- *Informal tier:* Without a formal agreement but with a red-side government, EL gets ~45% FOR (reduced by 8pp per non-red partner, floor 15%). This reflects the pre-2019 pattern where EL voted for Thorning budgets without any forstaelsespapir.
- *Nothing tier:* Non-red government without forstaelsespapir: 3% FOR.

**Step 3: Bloc alignment base rate.** For all non-EL parties:

| Relationship to government | Base pFor |
|---------------------------|-----------|
| Same bloc | 0.65 |
| Swing or center government | 0.35 |
| Opposite bloc | 0.05 |

**Step 4: Relationship modifiers (multiplicative, sqrt-softened).**

- PM acceptance: `base *= max(0.1, sqrt(asPM))`. Sqrt softening prevents low asPM values from completely killing support.
- Tolerate government members: for each non-leader government member, `base *= max(0.2, sqrt(tolerateInGov))`.

**Step 5: Participation demand exclusion penalty.** If a party strongly wants government (govPref >= 0.50) and accepts the PM (asPM > 0.20), being excluded reduces support: `base *= max(0.15, 1 - govPref * 0.5)`. This captures SF's "government or nothing" stance.

**Step 6: Strategic opposition.** When M demands government but is excluded:
- Blue parties: `base *= 0.15` (actively oppose to force M's inclusion)
- Swing parties (non-M): `base *= 0.3`

**Step 7: Policy-distance modifier.** For each policy dimension with weight >= 0.60 where the platform falls outside the party's acceptable range: `base *= 0.88`. Capped at 4 violations (minimum multiplier ~0.60). Bloc loyalty dominates, but extreme policy mismatches create friction.

**Step 8: Final conversion.**

```
pFor = clamp(base, 0.01, 0.95)
pAgainst = max(0.02, (1 - pFor) * againstShare)
pAbstain = 1 - pFor - pAgainst
```

Where `againstShare` is 0.3 for the main opposition party (largest excluded opposite-bloc party) and 0.7 for all others. See opposition abstention norm below.

### Opposition abstention norm

The largest opposition party gets a flipped against-to-abstain ratio: 30:70 instead of 70:30. This reflects the strong Danish norm that the main opposition abstains rather than actively topples a government via budget rejection. Historical evidence: S abstained on the KVR finanslov in 1989 (allowing passage with only 63 FOR votes); AJ voting against in 1983 was "considered a break with tradition."

---

## 3. Cross-bloc budget pivot

When the initial Monte Carlo budget vote fails for a minority government, the model simulates a rescue attempt. This mirrors the historical pattern of *vekslende flertal* (changing majorities per issue): when natural supporters defect, the government pivots to the opposite bloc.

**Historical basis:**
- Thorning FL 2014: EL refused the budget; government negotiated with V and KF instead.
- Nyrup's efterlon reform (1998): bypassed SF and EL, negotiated with the blue bloc.
- Schluter era (1982-1993): routine compartmentalized majorities across blocs.
- No sitting Danish government has failed to pass a budget.

**Implementation:** For each MC draw where the initial vote fails, parties that voted AGAINST may be recruited as alternative budget partners if they are from the opposite bloc or are swing parties. Each party's rescue probability is `min(0.30, max(0.05, 0.10 * avgTolerateInGov))` -- a conservative base (0.10) modulated by the party's tolerance toward government members. The base rate is deliberately low: historically, cross-bloc budget pivots were rare (~2-3 genuine cases in ~50 budget cycles) and costly. The per-party independence assumption already inflates compound rescue probability relative to the historical pattern of package deals, so the base rate compensates.

If the rescued vote reaches FOR >= 70 and FOR > AGAINST, the draw counts as a pass.

---

## 4. Formateur protocol

### Standard path (red first)

1. **S formateur (certain).** Frederiksen was appointed kongelig undersoger after the March 2026 election. She explores all S-led coalitions (up to 4 parties). The viability threshold (default 0.70, CI-varied) sets her minimum acceptable P(passage). She gets `maxFormationRounds` attempts (default 1), each with a fresh dyad acceptance draw and +0.05 flexibility. The best-scoring viable coalition across all attempts wins.

2. **Blue fallback.** V-led coalitions tried with the blue viability threshold (default 0.10), then M-led coalitions. This is a desperation situation -- the alternative is no government. The low threshold reflects Danish negative parliamentarism: a government with marginal budget passage can function via changing majorities, as Hartling demonstrated with 22 seats.

3. **Desperation.** If both fail, a final round tries S-led, then blue-led, then M-led coalitions with threshold 0.05 and further increased flexibility.

### Counterfactual path (blue first)

The "Forste formateur" dropdown enables a counterfactual where blue goes first. Blue rounds use the desperation threshold; S is the fallback with the normal threshold. Same desperation round at the end.

### Scoring within a formateur stage

Within each formateur's stage, all qualifying coalitions are scored by `scoreCoalition` (see below) multiplied by a formateur-specific bonus:

- **S formateur:** `frederiksenBonus` based on `redPreference` slider. Higher red preference boosts pure-red coalitions; lower boosts broad-centre coalitions. Includes stochastic noise.
- **Blue formateur:** larger-party leader (V or LA by seats) gets a 1.15 bonus. Includes stochastic noise.
- **M formateur:** stochastic noise only.

---

## 5. Platform negotiation

Before a coalition is scored, its policy platform is negotiated via `negotiatePlatform()` in `sim5-coalitions.js`. The platform determines the government's position on each policy dimension, which feeds into ideological fit scoring (ideoFit), policy-distance modifiers in budget votes, and the governability profile (govEase).

### Step 1: Weighted centroid

For each policy dimension, the platform is the weighted average of all government parties' ideal positions:

```
pull_i = mandates_i × issue_weight_i × essentiality_i
platform = Σ(pull_i × ideal_i) / Σ(pull_i) + formateur bonus
```

**Coalition essentiality:** each party's pull includes an essentiality factor = `totalCoalitionSeats / (totalCoalitionSeats - partySeats)`. This gives kingmaker parties (e.g., M at 14 seats in an 82-seat coalition) bargaining power disproportionate to their seats, reflecting that their threat to walk away is credible. Essentiality is parameter-free — derived entirely from the coalition composition.

| Party in S+M+RV+SF | Seats | Essentiality |
|---------------------|-------|-------------|
| S | 38 | 1.86 |
| SF | 20 | 1.32 |
| M | 14 | 1.21 |
| RV | 9 | 1.12 |

**Formateur pull:** the coalition leader (first party) gets an additional 30% weight bonus (adjustable via `formateurPull`), reflecting the PM's agenda-setting power.

### Step 2: Soft floor enforcement

After the centroid is computed, the platform may violate some parties' acceptable ranges (the interval between their ideal and floor positions). The soft floor enforcement pulls the platform toward a compromise:

1. For each dimension, ALL parties "vote" — parties whose floor is violated vote for their floor position; parties within range vote for the current platform.
2. Each vote is weighted by `issue_weight × essentiality`.
3. Parties with strength below 0.3 are excluded (negligible-stake parties don't get floor protection).
4. If total voting strength ≥ 0.8, the weighted compromise replaces the centroid.

This replaces the old binary `floorThreshold` at 0.70, which either fully enforced a party's floor or fully ignored it. The soft system produces compromises between conflicting floors (e.g., S wanting immigration=3 vs M/RV/SF wanting immigration≤2) instead of rejecting the coalition entirely.

**Example for S+M+RV+SF on immigration:**
- S (ideal=3, floor=3, w=0.90, ess=1.86): votes for platform=3, strength=1.68
- M (ideal=1, floor=2, w=0.55, ess=1.21): votes for floor=2, strength=0.66
- RV (ideal=1, floor=2, w=0.44, ess=1.12): votes for floor=2, strength=0.50
- SF (ideal=1, floor=2, w=0.45, ess=1.32): votes for floor=2, strength=0.60
- Compromise: (3×1.68 + 2×0.66 + 2×0.50 + 2×0.60) / (1.68+0.66+0.50+0.60) = 2.49 → rounds to 2

S's dominant weight is partially offset by three partners' combined strength. Result: immigration=2 (status quo), not 3 (S strict).

### Concessions (diagnostic)

After the platform is set, `computeConcessions()` measures each party's weighted distance from its ideal. This is diagnostic only — it does not feed back into the negotiation but is available for dashboard display.

---

## 6. Forstaelsespapir negotiation

The forstaelsespapir is probabilistic, not automatic. For a party that demands one (currently only EL, identified by forstaaelsespapir weight >= 0.95 and ideal = 0):

1. **Veto check.** If ANY government party has `tolerateInGov < 0.05` for the requesting party, the deal is vetoed entirely. Each government party has effective veto power.
2. **Average tolerance.** P(deal) = average `tolerateInGov` across all government parties. Must exceed a minimum threshold (default 0.20).
3. **Stochastic draw.** If `Math.random() < avgTolerate`, the deal succeeds.

**Example for S+M+RV+SF -> EL:**
- S->EL tolerateInGov: 0.75 (S negotiated the 2019 forstaelsespapir)
- M->EL tolerateInGov: 0.35 (adjustable via the M-EL slider)
- RV->EL tolerateInGov: 0.84
- SF->EL tolerateInGov: 0.78
- Average: 0.68 -> ~68% chance of forstaelsespapir

The M-EL slider is the central unknown. At 0: M vetoes, no EL forstaelsespapir with any M-containing government. At 0.50+: deal is likely.

---

## 7. Dyad acceptance

Before a coalition is evaluated for budget passage, each party must accept being in government with the others.

1. For each party, find its MINIMUM `inGov` value across all other coalition members.
2. Apply flexibility: `effectiveMin = min(1.0, minInGov + flex * 0.5)`. Positive flex increases effective tolerance, modeling increased willingness to compromise in later formation rounds.
3. If effectiveMin < 0.05: always block (hard floor -- near-categorical vetoes like SF->V are respected).
4. Otherwise: draw a stochastic threshold from `[effectiveMin, effectiveMin + spread]` where `spread = max(0.05, effectiveMin * 0.4)`. If `Math.random() > threshold`, block.

**Why per-party minimum, not all-pairs:** the old model checked all C(N,2) bilateral pairs independently, requiring 12 checks for a 4-party coalition. This multiplicative gate made 4-party coalitions nearly impossible. The per-party minimum check requires N checks (one per party), each gated by that party's hardest bilateral relationship. A party decides whether to accept the coalition as a package.

---

## 8. Confidence check

Before formation, a confidence check verifies the proposed government wouldn't face an immediate vote of no confidence. For each non-government party: if `asPM < mistillidThreshold` (default 0.10), that party's mandates count as opposition. NA seats aligned against the government side also count. If opposition >= 90, the government fails.

---

## 9. Scoring: two-factor model

Once a coalition passes all gates and has a P(passage), it is scored:

```
score = passage^w * quality^(1-w)
```

Where:
- `passage` = P(passage) from the Monte Carlo budget vote
- `quality` = ideoFit * parsimony * mwcc * govEase
- `w` = passageWeight, CI-varied per iteration as N(0.65, 0.08) clamped [0.50, 0.90]

This two-factor form separates the institutional gate (can this government survive?) from the political judgment (is this a natural coalition?). The weight `w` is CI-varied because we genuinely don't know how much formateurs prioritize arithmetic versus political fit.

### Quality components

**Ideological fit (`ideoFit`):** `max(0.3, 1 - avgPairwiseDist * distPenalty)`. Lower internal policy distance = better fit. `distPenalty` defaults to 1.5.

**Parsimony:** Formateurs prefer smaller coalitions (fewer veto players, more PM autonomy). A single term replacing the old separate sizePenalty and flexBonus, which triple-counted smallness:

| Government size | Minority parsimony | Majority |
|----------------|-------------------|----------|
| 1 party | 1.15 | 1.0 |
| 2 parties | 1.10 | 1.0 |
| 3 parties | 0.95 | 1.0 |
| 4 parties | 0.85 | 1.0 |

Majority governments (>= 90 seats) get no parsimony adjustment -- if you have a majority, you don't care about size.

**MWCC bonus (`mwcc`):** Coalition theory predicts minimum winning connected coalitions are preferred:

| Condition | Bonus |
|-----------|-------|
| Connected AND minimum-winning | 1.15 |
| Connected only | 1.08 |
| Minimum-winning only | 1.05 |
| Neither | 1.00 |

"Connected" means average pairwise policy distance < 0.4. "Minimum winning" means either (a) the coalition holds 90+ seats and removing any party drops it below 90, or (b) every party contributes at least 8% of the coalition's seats.

**Governing ease (`govEase`):** `0.5 + 1.0 * avgFeasibility`, where avgFeasibility is the mean feasibility score from `governabilityProfile` across all policy dimensions. Range ~0.5--1.5. A coalition that can build majorities across many policy dimensions (via *vekslende flertal*) scores higher. This uses the existing per-dimension feasibility computation, which checks how much weighted support vs. opposition exists outside the coalition for each dimension of the platform.

---

## 10. CI variation — full-width framework

Every uncertain parameter is drawn from a normal distribution per Monte Carlo iteration. The width (sigma) encodes confidence: narrow for well-calibrated values, wide for genuinely uncertain ones. This propagates all identified uncertainty through the model rather than committing to point estimates.

**Design principle:** CI-vary by default; only fix a parameter (sigma → 0) if you are exceptionally confident in its value. CI width IS the calibration — adjusting means and widths is how the model is tuned.

**Slider-overrides-CI principle:** when the user moves a slider from its default, the CI variation for that parameter is disabled. The user is expressing a view — the model respects it exactly.

### Parameters varied per iteration (13 draws)

| Parameter | Mean | σ | Clamp | Type | Rationale for width |
|-----------|------|---|-------|------|-------------------|
| SF→M inGov | 0.72 | 0.06 | [0, 1] | Relationship | Genuinely uncertain; no public signal on final willingness |
| M→SF inGov | 0.68 | 0.06 | [0, 1] | Relationship | Reciprocal of SF-M uncertainty |
| M→EL tolerance | 0.35 | 0.10 | [0, 1] | Relationship | Central unknown of the formation; wide σ |
| M-DF cooperation prob | 0.12 | 0.04 | [0, 0.30] | Scenario | Low but uncertain probability of pragmatic cooperation |
| Viability threshold | 0.70 | 0.06 | [0.50, 0.85] | Formateur | Risk appetite not fixed; moderate σ |
| Passage weight (w) | 0.65 | 0.08 | [0.50, 0.90] | Structural | No calibration target; how formateurs weigh passage vs quality is unknown |
| EL informal rate | 0.45 | 0.08 | [0.20, 0.70] | Behavioral | Small sample (Thorning era); wide range plausible |
| EL centrist penalty | 0.08 | 0.02 | [0.02, 0.16] | Behavioral | Small sample; narrow integer range (1-3 partners) |
| EL forst base rate | 0.93 | 0.03 | [0.80, 0.98] | Empirical | Calibrated from 3/3 votes; tiny N but high confidence in direction |
| Rescue base | 0.10 | 0.03 | [0.03, 0.25] | Historical | 2-3 pivots in 50 years; fairly sure it's low, less sure how low |
| Opposition abstention | 0.30 | 0.05 | [0.10, 0.60] | Normative | Norm exists; precise ratio uncertain |
| distPenalty | 1.50 | 0.15 | [0.50, 2.50] | Structural | No calibration target; wide σ reflects genuine uncertainty |
| Parsimony spread | 1.00 | 0.15 | [0.30, 1.50] | Structural | Direction clear (fewer parties preferred); magnitude uncertain |

### M-DF cooperation detail

When the per-iteration M-DF draw succeeds (probability drawn from N(0.12, 0.04)), M↔DF relationships relax from near-zero to moderate values:
- `tolerateInGov`: 0.05/0.10 → 0.35/0.35
- `asSupport`: 0.00/0.15 → 0.30/0.25
- `inGov`: 0.00/0.00 → 0.08/0.08

Rationale: DF→M is "devour him and his people every single day" (Messerschmidt). Hard zero is the baseline. But DF "has not ruled out being a support party for a blue government where M is also a support party."

---

## 11. NA seats

Four North Atlantic mandates (2 Faroese, 2 Greenlandic). Each drawn per iteration:

| Seat | pRed | pFlexible | pBlue | Notes |
|------|------|-----------|-------|-------|
| FO-JF (Javnadarflokkurin) | 0.95 | 0.05 | 0.00 | Predictable red |
| FO-SB (Sambandsflokkurin) | 0.00 | 0.05 | 0.95 | Predictable blue |
| GL-NAL (Naleraq) | 0.50 | 0.40 | 0.10 | Swing -- pro-independence, transactional |
| GL-IA (Inuit Ataqatigiit) | 0.65 | 0.30 | 0.05 | Red-leaning but refused to pre-commit |

### NA voting norms

NA seats vote individually (not as party blocs, since each is a single MF). Strong norm: NA MFs never vote against a government. They either vote FOR or abstain.

- Aligned with government side: 80% FOR, 18% abstain, 2% against
- Flexible: 40% FOR, 57% abstain, 3% against
- Opposed: 5% FOR, 93% abstain, 2% against

**Exception:** Greenlandic seats (GL-NAL, GL-IA) actively oppose governments containing DF (80% against). DF's proposal for a Danish referendum on Greenlandic independence is an existential sovereignty threat.

---

## 12. Support party display and coalition splitting

**Coalition splitting by forståelsespapir status:** The same government composition (e.g., S+M+RV+SF) appears as separate entries depending on whether EL obtained a forståelsespapir. S+M+RV+SF with EL forst (98 seats, very secure) is a politically different configuration from S+M+RV+SF without it (relying on ALT+NA+opposition abstention). The aggregation key includes the forst status.

**Support tiers:** The dashboard shows three tiers of support, each with a "+" separator:

1. **Forstaelsespapir** (e.g., [EL]): formal agreement, shown in brackets. Only appears if the probabilistic negotiation succeeded for that coalition variant.
2. **Loose stottepartier** (e.g., ALT, or DF/DD/BP for blue): same-bloc parties without formal agreement but likely to vote FOR.
3. **NA seats** (flag-colored dots): only shown when the coalition genuinely depends on them to reach 90 -- "tungen på vægtskålen." If government + forst + loose support already reaches 90, NA flags are omitted. NA seat count includes forståelsespapir parties in the threshold check.

**Mandate display:** When the total including all support is below 90, the parenthetical shows "(N + afhold)" indicating the coalition relies on opposition abstention to survive -- the Danish norm that the main opposition abstains rather than votes against.

---

# Part II: Calibration

These are judgment-based, approximate parts of the model. The specific values come from party statements, historical behavior, expert assessment, and (in some cases) fitting to produce reasonable output distributions. Someone applying this model to a different election would need to re-calibrate these values.

---

## Relationship values

All `inGov`, `tolerateInGov`, `asPM`, and `asSupport` values are coded in `sim5-parties.js`. The following values were changed from their initial extraction during the March 2026 calibration audit:

| Relationship | Old | New | Evidence |
|-------------|-----|-----|----------|
| SF->RV inGov | 0.58 | 0.78 | SF's "aldrig igen" targets V/KF, not RV. SF+RV governed together (SRSF 2011-14). Dyhr: M and RV are "to midterpartier af samme type." |
| S->RV inGov | 0.72 | 0.88 | S+RV has 5 historical government precedents (most common Danish coalition type). No S statement against RV. |
| RV->SF inGov | 0.65 | 0.78 | RV and SF are "close allies on climate and education." SRSF precedent. |
| SF->M inGov | 0.65 | 0.72 | Dyhr: "Lokke er faktisk blevet en anden som formand for Moderaterne." Explicit repeated openness since early 2024. |
| M->SF inGov | 0.60 | 0.68 | M is "un-dogmatic and solution-oriented." SF is the primary partner in the consensus scenario. |
| SF->M tolerateInGov | 0.00 | 0.65 | Bug fix: SF willing to join government with M (inGov=0.72) but coded as unwilling to tolerate M from outside (0.00). Toleration should be the lower bar. |
| S->EL tolerateInGov | 0.00 | 0.75 | S negotiated the 2019-22 forstaelsespapir with EL. S clearly tolerates EL as external support. |
| M->EL tolerateInGov | 0.00 | 0.35 | Experts treat M's "no far-left dependency" as negotiating position. M reluctantly accepts EL because the alternative is worse. Adjustable via dashboard slider. |

---

## Parameter values and rationale

### Budget vote parameters

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| MC draws per coalition | 800 | Convergence testing showed stable P(passage) at this level |
| Bloc base rates (same/swing/opposite) | 0.65 / 0.35 / 0.05 | Bloc loyalty dominates Danish budget support |
| Sqrt softening on relationship modifiers | `sqrt(x)` | Prevents low values from completely killing support while preserving ordering |
| Policy violation multiplier | 0.88 per violation, max 4 | Bloc loyalty dominates, but 3+ violations create real friction |
| Against/abstain ratio (general) | 70:30 | Parties opposing a government are more likely to vote against than abstain |
| Against/abstain ratio (main opposition) | 30:70 | Historical norm: main opposition abstains rather than topples |
| EL forstaelsespapir base rate | 0.93 | Empirical: EL voted FOR on 92-95% of legislation under Frederiksen I |
| EL centrist penalty | -0.08 per non-red partner | Thorning-era pattern: EL support degraded with centrist RV |
| EL informal tier (red govt) | 0.45 | EL voted FOR under Thorning (2012, 2013, 2015) without forstaelsespapir |
| EL no-arrangement rate | 0.03 | Empirical: 2-5% baseline without any alignment |
| Cross-bloc rescue base | 0.10 (fixed) | ~2-3 pivots in ~50 budget cycles. Per-party independence inflates compound probability. |
| Cross-bloc rescue cap | 0.30 | Even high-tolerance parties face substantial costs in cross-bloc deals |

### Scoring parameters

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| passageWeight (w) | N(0.65, 0.08) | Structural uncertainty about formateur priorities. CI-varied, not user-facing. |
| distPenalty | 1.5 | Calibrated to differentiate coalitions without dominating passage |
| Parsimony values [1,2,3,4] | [1.15, 1.10, 0.95, 0.85] | Danish history: 1-party govts most common; 4-party rare and fragile |
| MWCC full bonus | 1.15 | Coalition theory: minimum winning connected coalitions preferred |
| govEase range | 0.5 + 1.0 * feasibility | Wider than initially implemented to counterbalance parsimony |
| Formateur noise | exp(0.15 * N(0,1)) | Small stochastic variation in formateur preferences |

### Formation protocol parameters

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Viability threshold (S) | 0.70, CI N(0.70, 0.06) | Formateur's minimum acceptable P(passage) |
| Blue viability threshold | 0.10 | Desperation: alternative is no government |
| Desperation threshold | 0.05 | Historical: government always forms eventually |
| Flex increment per round | 0.05 | Later rounds: parties become more pragmatic |
| Forstaelsespapir min acceptance | 0.20 | Minimum average tolerance to even begin negotiation |
| Confidence check threshold | 0.10 | asPM below this = counts as opposition for no-confidence |

### CI variation parameters

| Parameter | Sigma | Clamped range | Rationale |
|-----------|-------|---------------|-----------|
| SF->M inGov | 0.06 | [0, 1] | Genuine uncertainty about grassroots resistance |
| M->SF inGov | 0.06 | [0, 1] | Reciprocal |
| M->EL tolerateInGov | 0.10 | [0, 1] | Wide sigma: central unknown in formation |
| M-DF relaxation rate | 12% | binary | Low probability of pragmatic cooperation |
| Viability threshold | 0.06 | [0.50, 0.85] | Formateur risk appetite varies |
| passageWeight | 0.08 | [0.50, 0.90] | Structural uncertainty in formateur decision-making |

---

## Decision log

Key choices made during the March 2026 overhaul, with evidence and rationale:

| Decision | Rationale | Evidence |
|----------|-----------|----------|
| Scoring restructure: `passage^w * quality^(1-w)` | Old P(passage)^2 explained 107% of score variance; other terms were decorative. Two-factor form lets both dimensions contribute. | Scoring decomposition (Phase 2B) |
| CI-vary passageWeight N(0.65, 0.08) | Structural uncertainty about how formateurs weigh passage vs quality. No empirical calibration target. Varying expresses this honestly. | Spar session 1 |
| passageWeight NOT user-facing | Users lack intuition for "passage weight." Substantive sliders (M-EL tolerance) are where user judgment belongs. | Spar session 2 |
| Merge sizePenalty + flexBonus -> parsimony | Triple-counting smallness: flex (1.12), size (0.96), and ideoFit mechanically favored fewer parties. Combined 1.45x advantage for 2-party over 4-party. | Scoring decomposition: quality bundle analysis |
| Widen govEase: 0.5+1.0*feasibility (was 0.7+0.6) | Needed to counterbalance parsimony. 58-seat governments face real difficulty building legislative majorities; the score should reflect this. | Spar session 2 |
| Remove dead terms (precedent, crossBloc, leaderBonus) | precedent weight=0 always. crossBloc never fired for competitive coalitions. leaderBonus constant within formateur groups. | Scoring decomposition: zero variance contribution |
| Rescue base = 0.10 (fixed, not CI-varied) | Historical evidence: ~2-3 pivots in 50 years. Per-party independence inflates compound probability. CI-varying worsens S+SF via Jensen's inequality (convexity). | Historical grounding review + diagnostic |
| Opposition abstention: 30:70 for main opposition | Strong historical norm. S abstained on KVR FL 1989. AJ voting against in 1983 was "a break with tradition." | Historical formations report |
| EL informal tier: 45% FOR without forstaelsespapir | EL voted for Thorning budgets (2012, 2013, 2015) without formal agreement. 3% was too low. | Historical formations report, EL voting record |
| EL centrist penalty: -0.08 per non-red partner | 93% calibrated on Frederiksen I (pure S). Under Thorning (with RV), EL support was unreliable. | Historical formations report |
| Desperation fallback: threshold 0.05 | Historical record: government always forms. 1975: four rounds. Hartling: 22 seats. | Historical formations report |
| Flexibility wired into dyad acceptance | Was unused parameter (refactor oversight). Later rounds should genuinely increase willingness to compromise. | Code inspection |

---

# Part III: Dashboard Parameters

All user-facing controls, their engine defaults, and what they do.

---

## Main scenario controls

| Control | Parameter | Default | Description |
|---------|-----------|---------|-------------|
| M-EL forstaelsespapir | `mElTolerate` | 0.35 | M's tolerance for EL as external support. At 0: M vetoes any EL forstaelsespapir. At 0.50+: deal likely. Central unknown in formation. Overrides CI when changed. |
| Fleksibilitet | `flexibility` | 0 | Global negotiation pressure. Negative = parties hold fast. Positive = parties stretch (increases effective tolerance in dyad acceptance). |
| Frederiksens praference | `redPreference` | 0.5 | Frederiksen's preference for red vs. broad coalitions. Higher = red; lower = broad centre. |
| Viabilitetsterskel | `viabilityThreshold` | 0.70 | S formateur's minimum P(passage). Blue fallback always uses 0.10. Overrides CI when changed. |
| Forhandlingsforsog | `maxFormationRounds` | 1 | Attempts within S formateur's mandate. Each: fresh dyad draw, +0.05 flexibility. |
| Forste formateur | `formateurOverride` | "red" | "Red" = S first (standard). "Blue" = counterfactual where blue goes first. |
| Iterationer | `N` | 500 | Monte Carlo iterations for the simulation run. |

## Party-level controls

| Control | Parameter | Description |
|---------|-----------|-------------|
| M kraever regering | `mDemandGov` | M votes against any government excluding M. Default: true. |
| S kraever regering | `sDemandGov` | S votes against any government excluding S. Default: true. |
| M kraever statsminister | `mDemandPM` | M votes against any government where Lokke isn't PM. Default: false. |
| Parti-hardhed sliders | `globalHarshness` | Per-party negotiation rigidity (affects platform negotiation). |
| Position sliders | per-dimension ideals | Adjust each party's ideal position on each policy dimension. |

## Advanced controls

| Control | Parameter | Default | Description |
|---------|-----------|---------|-------------|
| Afstandsstraf | `distPenalty` | 1.5 | Ideological distance penalty multiplier in scoring. |
| Fleksibilitetstilvaekst | `flexIncrement` | 0.05 | How much flexibility increases per formation round. |
| Formateurtiltraekning | `formateurPull` | 0.3 | Extra weight formateur gets in platform negotiation. |

Note: the dashboard still shows some advanced controls (`passageExponent`, `precedentWeight`, `elMPenalty`, `elMBoost`) that no longer have corresponding parameters in the engine after the Phase 2C restructure. These are vestigial UI elements.

## Presets

| Preset | Settings | Scenario |
|--------|----------|----------|
| Baseline | all defaults | Standard post-election prediction |
| Bred midte | redPreference: 0.3, flexibility: 0.1 | Frederiksen prefers broad centre coalition |
| Rod blok | redPreference: 0.8 | Frederiksen prioritizes pure red government |
| Lokke -> bla | mPmPref: "V", mDemandGov: false | M aligns blue, doesn't demand government |
| Maksimalt pres | flexibility: 0.3, maxFormationRounds: 3 | Maximum negotiation pressure, multiple attempts |
| SF blokerer M | flexibility: -0.2 | SF refuses to compromise on M |
