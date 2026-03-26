# Model Calibration Audit — Agent Prompt

You are auditing the calibration and face validity of a Danish coalition formation simulator. Your job is to *orchestrate* an audit process to identify miscalibrations, implausible outputs, and structural issues by cross-referencing the model's predictions against its own research materials and Danish political reality.

## Context

The simulator is at `/Users/christoffer/Documents/GitHub/coalition-simulator/`. After the 24 March 2026 Danish election, it models which governments could form given:
- Fixed mandates: S(38), SF(20), EL(11), ALT(5), RV(10), M(14), KF(13), V(18), LA(16), DD(10), DF(16), BP(4)
- Red bloc: 84 seats. Blue bloc: 77 seats. M (swing): 14. Majority: 90 of 179.
- Party positions, relationships, and negotiation harshness from post-election research briefs

The political consensus is that the most likely government is **S+SF+M+RV** (82 seats, minority) with EL as external support via forståelsespapir. The simulator currently produces **S+RV+SF** (without M) at ~76% as the dominant outcome, with S+M+SF at ~10% and V+SF (!) at ~5%.

## Files to read

**Party data and model:**
- `sim5-parties.js` — all party positions, relationships, participation preferences, harshness
- `sim5-coalitions.js` — coalition enumeration, platform negotiation
- `sim5-engine.js` — simulation engine (budget votes, scoring, formateur protocol)

**Research briefs (the empirical basis):**
- `research/party_briefs/S.md` through `research/party_briefs/BP.md` + `NA.md`
- `research/calibration.md` — voting records and P(FOR) calibration data
- `research/formation_rules.md` — Danish constitutional framework

**Overnight sweep results:**
- `sweep-results/summary.md` — analysis of 1,953 simulation points
- `sweep-results/1d-sweeps.json`, `sweep-results/2d-heatmaps.json`, `sweep-results/scenarios.json`, `sweep-results/discoveries.json`

## Specific concerns to investigate

### 1. The S+RV+SF dominance problem

The model says S+RV+SF at 76% is the most likely government. But commentators overwhelmingly predict S+SF+M+RV. Why the discrepancy?

Investigate:
- Is the 4-party coalition penalty (size penalty × minority flexibility penalty = 0.78 × 0.88 = ~0.69) too harsh? These are unobserved parameters with no empirical calibration. What would reasonable values be?
- Is P(passage) for S+RV+SF (without M) realistic at ~0.86? This requires blue-party abstention on S-led budgets. Check `research/calibration.md` for actual blue-party voting records. Do blue parties really abstain on red-led budgets, or do they vote against?
- Is the "participation demand gate" (SF's pFor penalty when excluded) correctly calibrated? SF's brief says "government or nothing" — should this be even harsher?
- Is M's mDemandGov gate functioning as intended? When M demands government, M votes against any budget for a government excluding M. But does the model correctly capture that M's opposition would destabilize the entire government formation, not just lower P(passage)?

### 2. V+SF appearing as a viable coalition

V+SF shows up at ~5% — this is SF in a Venstre-led government. SF's brief says "aldrig igen" about governing with bourgeois parties. SF→V inGov is coded at 0.02. How does this pass the dyad acceptance gate 5% of the time?

Investigate:
- The stochastic dyad acceptance draws: with acceptance=0.02 and spread=max(0.05, 0.02*0.4)=0.05, the threshold is drawn from [0.02, 0.07]. Math.random() > 0.07 is true 93% of the time (blocks). But 7% of the time it passes. Over 500 iterations, that's ~35 passes. Is this too generous for what should be a near-categorical veto?
- Should the dyad acceptance model have a "hard floor" below which the gate always blocks? E.g., if acceptance < 0.05, always block?

### 3. Coalition ranking implausibility

The model ranks S+M+RV below V+SF. S+M+RV is a perfectly plausible centre-left coalition; V+SF is politically absurd. What scoring mechanics produce this inversion?

Investigate:
- Compare the full scoring breakdown for S+M+RV vs V+SF: P(passage), ideological fit, size penalty, MWCC, minority flexibility, cross-bloc penalty
- Are there relationship gates that disproportionately block S+M+RV? (M→S, S→M acceptance)
- Is the formateur protocol giving V-led coalitions too many chances?

### 4. The abstainShare mechanic

The model's budget-vote evaluation splits non-FOR probability into abstain and against. The abstainShare determines how many mandates go to "against" (which count against passage) vs "abstain" (which count for nothing). This is the key mechanic that makes S+RV+SF viable without M — blue parties abstain rather than vote against.

Investigate:
- Is the abstainShare formula (`clamp01(0.85 - avgDist * 0.8)`) correctly calibrated?
- Check `research/calibration.md` for actual abstention rates on Danish budgets
- Danish parliamentary practice: do opposition parties typically abstain on budgets, or vote against? Is there a difference between "loyal opposition" abstention and "we won't rock the boat" abstention?
- If abstainShares are too high, S+RV+SF's P(passage) would be inflated, explaining its dominance

### 5. The passageExponent and size penalties

These are the most consequential unobserved parameters:
- `passageExponent=2.0`: P(passage) enters scoring as P^2. This determines how much the formateur values budget stability.
- `SIZE_PENALTIES=[1.0, 0.96, 0.88, 0.72]`: 4-party coalitions get a 0.72 multiplier.
- `minorityFlexBonus`: 1-2 parties get 1.12, 3 get 1.00, 4 get 0.82.
- Combined 4-party penalty: 0.72 × 0.82 = 0.59 — a 41% penalty vs single-party.

Investigate:
- Are there any empirical grounds for the specific size penalty values?
- What do the coalition theory literature and Danish political history suggest?
- If the 4-party penalty were softened to 0.82 instead of 0.72, how would the results change? (Run a simulation with modified scoring)
- The passageExponent creates a huge advantage for high-P(passage) coalitions. Is 2.0 the right value? What happens at 1.5 vs 2.5?

### 6. Party position accuracy

Cross-check a sample of party positions against their briefs:
- Is S's immigration=3 (strict) correct? The brief says "ultimativt" — is the weight (0.90) high enough?
- Is M's wealthTax=4 (no wealth tax, weight 0.85) correct? The brief says "red line."
- Is SF→M inGov=0.65 correct? The brief says "surprisingly open" to M. Is 0.65 too low given Dyhr's explicit signals?
- Is EL→M tolerateInGov=0.62 correct? The consensus scenario requires exactly this. Should it be higher?
- Are the globalHarshness values reasonable? M at 0.24 (most flexible) and DF at 0.86 (most rigid)?

### 7. Formateur protocol

The gradual search (round 1: ≤2 parties, round 2: ≤3, round 3: ≤4) means the consensus 4-party S+SF+M+RV is only considered in round 3. But in reality, this coalition is the FIRST thing commentators discuss.

Investigate:
- Should the party-count limits per round be different? E.g., [3, 4, 4] instead of [2, 3, 4]?
- Does the gradual broadening create an artificial bias toward lean coalitions?
- The formateur protocol's `tryGroup` function selects the BEST coalition by score within each group. But a real formateur doesn't optimize — they try their preferred coalition first. Is the "best by score" approach appropriate?

### 8. The model is too certain

The top coalition consistently gets >70% probability, with everything else at tiny single-digit percentages. This seems poorly calibrated to reality where commentators describe several coalitions as genuinely viable (S+SF+M+RV, S+SF+RV, S+M, various configurations). The model is "overselling" whichever coalition it currently favors.

Investigate:
- What structural features cause winner-take-all dynamics? Is it the scoring multiplication (P(passage) × ideoFit × size × mwcc × flex × crossBloc × precedent) where small advantages compound multiplicatively?
- Would additive scoring or softer multiplicative scaling produce more spread?
- Is the `tryGroup` "best by score" selection too deterministic? A real formateur faces uncertainty — they don't always pick the objectively highest-scoring option.
- Should there be more stochastic noise in the scoring? The Frederiksen bonus already includes `exp(0.1 * normDraw(0,1))` noise — but is 0.1 too small?
- What would it take to produce a distribution like 40% / 25% / 15% / 10% / 5% / 5% for the top 6 — which seems more realistic?

### 9. Robustness of recommended changes

When testing parameter changes, don't just check if the target metric improves — check that nothing else breaks. For every recommended change:
- Run baseline simulation with ONLY that change
- Report the FULL top-5 coalition distribution, PM probabilities, and noGov%
- Flag if any implausible coalition enters the top 5 (V+SF, S+DF, etc.)
- Flag if any plausible coalition drops out of the top 5

The goal is changes that improve face validity holistically, not changes that fix one problem by creating another.

### 10. Open-ended discovery

The concerns above come from the developer's observations during building. They may miss issues that are only visible from a fresh read of the briefs and model code. After investigating concerns 1-9:
- Read the model with fresh eyes. What else looks wrong, suspicious, or unjustified?
- Are there party positions that seem miscoded relative to their briefs?
- Are there missing relationships that should have friction but don't?
- Are there structural model assumptions that don't match Danish political practice?
- Generate your OWN top-3 concerns that aren't covered by 1-9.

## What to produce

Write a detailed audit report as `audit-report.md` with:

1. **Executive summary**: What are the 3-5 most important calibration issues?
2. **Per-concern analysis**: For each of the 10 concerns above, provide:
   - What you found in the code/data
   - Cross-reference with the party briefs and calibration data
   - Your assessment: is the current calibration defensible, too high, too low, or structurally wrong?
   - Specific recommended changes (parameter values, code changes, or structural fixes)
3. **Proposed parameter changes**: A concrete table of recommended parameter adjustments with justifications
4. **Simulation experiments**: For EVERY recommended change, run the simulation with ONLY that change and report the full top-5 distribution. Then run a "combined recommended changes" simulation and report the full distribution. Flag any regressions.
5. **Priority ranking**: Which fixes would have the biggest impact on face validity?
6. **Open-ended findings**: Your own concerns from reading the model fresh.

Be rigorous and skeptical. Delegate what you need. The current model produces results that disagree with expert consensus — either the model is wrong or the experts are. Your job is to figure out which and where.
