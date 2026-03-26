# sim3 — Coalition Formation Simulator Specification

**Date:** 2026-03-23 (revised)
**Replaces:** sim2.js (confidence-viability model)
**Core change:** Legislative viability (finanslov passage) replaces confidence
viability as the binding constraint. Confidence retained as a permissive
pre-filter.

---

## 1. Objective

Sensitivity analysis: which parameters are most decisive for PM identity and
government composition? Not prediction — understanding.

The simulator runs Monte Carlo draws over mandate distributions and uncertain
behavioral parameters, then resolves government formation for each draw.
Outputs are distributional: P(PM = Frederiksen), P(govType = red), etc.,
as functions of swept parameters.

### 1.1 What this model can and cannot answer

**Can answer:**
- Who becomes PM under different mandate scenarios?
- Which factors are most decisive for PM identity vs. government type?
- Is S+SF viable without M? Under what conditions?
- Does Loekke's direction actually matter, or is it irrelevant when
  one bloc is large enough?
- What mandate thresholds tip the balance between red, midter, and
  blue governments?
- How much does the formueskat question shape government composition?
- Are the North Atlantic seats genuinely decisive at the margins?

**Cannot answer:**
- Will the government last a full term? (Durability is out of scope.
  The 1978 SV government lasted 14 months; SVM lasted 3 years. This
  model says whether a government *can form*, not whether it
  *survives*.)
- Will junior coalition partners be electorally punished? (Requires
  a voter-behavior model, not a formation model.)
- What will Loekke actually decide? (The model sweeps his possible
  choices and shows which ones matter. It cannot predict his
  strategic reasoning.)
- How will geopolitical shocks (Trump/Greenland, Iran/Hormuz) shift
  voters? (These affect polls, which feed into the model as inputs.
  The model takes mandate distributions as given.)
- Will personal relationships (Messerschmidt-Loekke antagonism,
  Frederiksen-Stoejberg enmity) hold or break? (Modeled as fixed
  vetoes and probability ranges, not as dynamic trust.)

---

## 2. Architecture

```
Layer 1: Mandate draws
  Box-Muller normal draws for Danish parties, normalize to 175.
  Stochastic NA seat alignment (categorical draw per seat).
  Threshold parties (ALT, BP) modeled as stochastic clearance.

Layer 2: Government formation (parallel evaluation + scoring)
  For each mandate draw:
  a. Frederiksen (sitting PM) evaluates ALL S-led packages
     simultaneously — structural advantage (see §9.1).
  b. For each S-led package:
     i.   Confidence check (permissive): would active opposition
          on a no-confidence motion reach 90? If yes, skip.
     ii.  V acceptance check for S+V packages (stochastic).
     iii. Legislative viability: can the government pass a finanslov?
          - Formateur selects best platform (policy dimensions).
          - Compute P(passage) analytically via DP (see §9.5).
          - Score = P(passage) × prefWeight × frederiksenBonus
                    × ideologyFit × sizeBonus × mwccBonus
          - Package must exceed viability_threshold on P(passage).
  c. Highest-scoring viable S-led package wins.
  d. Only if ALL S-led packages fail: blue candidates evaluate
     blue-led packages with analogous parallel scoring.
  e. If all candidates fail: no government formed.

Layer 3: Aggregation
  Collect PM, government type, coalition composition, support coalition,
  legislative viability metrics across N iterations. Report distributions.
```

---

## 2b. Mandate draw correlation

Independent normal draws per party are unrealistic. The transition
matrix (research/transition_matrix.csv) shows strong voter flows:
when S loses, SF gains (10.89% of S 2022 voters → SF 2026). Independent
draws would produce scenarios where both collapse simultaneously, or
both surge — empirically unlikely.

**Implementation: bloc-shock + within-bloc substitution + noise.**

1. Draw a **red-bloc shift** δ_red ~ N(0, σ_bloc) and a **blue-bloc
   shift** δ_blue ~ N(0, σ_bloc). These represent national mood swings.
   Default σ_bloc = 4.0 (roughly the SD of bloc vote-share totals
   across recent elections).

2. **Allocate bloc shift with within-bloc substitution.** The
   transition matrix shows S and SF are substitutes (10.89% S→SF
   flow), not complements. Pure proportional allocation would make S
   absorb most of any red-bloc shift, missing this substitution.
   Instead:
   - Draw a within-red substitution shock δ_sub ~ N(0, σ_sub).
     When δ_sub > 0, S gains at SF's expense within the red bloc;
     when < 0, SF gains at S's expense.
   - Apply: S_shift = share_S × δ_red + δ_sub;
     SF_shift = share_SF × δ_red - δ_sub × (share_SF/share_S).
   - EL, ALT: proportional to their share × δ_red, plus independent
     party noise.
   - Within-blue substitution: V-LA substitution shock (V and LA
     compete for the same blue-anchor voters). DF-DD substitution
     shock (competing for nationalist-right voters).
   Default σ_sub = 1.5 (calibrated so within-bloc variation is
   roughly half of between-bloc variation).

3. **Swing party weights:**
   | Party | Red-shock weight | Blue-shock weight | Rationale |
   |-------|-----------------|-------------------|-----------|
   | M | 0.40 | 0.40 | Genuinely swing, draws from both |
   | RV | 0.70 | 0.15 | Functionally red; V has blocked blue path |
   | KF | 0.15 | 0.70 | Blue-leaning with centrist hedging |
   Remaining weight (to 1.0) is independent party-level noise.

4. **Party-level noise:** Each party gets an additional independent
   shock ε_i ~ N(0, σ_party). Default σ_party = 1.5. This captures
   party-specific events (scandals, gaffes, surges) not explained
   by bloc dynamics.

5. **Normalize** to 175 Danish seats. Enforce non-negativity.

**Variance decomposition:** Total party-level variance ≈ σ_bloc² ×
weight² + σ_sub² × sub_weight² + σ_party². With defaults, this gives
~2.5pp SD per party — matching typical polling error bounds (±2-3pp).

**Polling bias parameter:** The draw model is symmetric around polling
means by default. But commentators (Hjorth, Serup) warn about
systematic polling error — the polls could be wrong in the same
direction. The `bloc_bias` parameter shifts the mean of the bloc-
shock distribution:

```
delta_red ~ N(bloc_bias_red, sigma_bloc)
delta_blue ~ N(bloc_bias_blue, sigma_bloc)
```

Default: `bloc_bias_red = 0, bloc_bias_blue = 0` (symmetric).
Sweep: [-2.0, +2.0] pp. At `bloc_bias_red = +1.5`, all red parties
are systematically underestimated by ~1.5pp — a "Trump-style polling
miss" scenario. This is cheap (just shifts means) and directly
answers: "what if the polls are wrong?"

**For targeted sensitivity analysis** (e.g., "what if S = 46 but SF =
15?"), mandate overrides bypass the draw entirely — the user specifies
exact mandates. Correlated draws are for realistic-scenario sweeps and
the scenario archetypes (§10.3).

---

## 3. Finanslov passage rule

The finanslov is an ordinary bill. Under Grundloven §52:
- Quorum: at least 90 members physically **present** (half of 179).
- Passage: simple majority of those **present and voting**.
- Abstentions count toward presence but not toward the voting tally.

The model assumes all 179 members are always present (no party boycotts
the Folketing). Given this assumption, quorum is trivially satisfied and
the passage rule simplifies to:

```
passage = (sum of FOR mandates) > (sum of AGAINST mandates)
```

Abstentions genuinely help the government relative to AGAINST votes.
This is load-bearing: tolerance coalitions — the quintessential Danish
formation pattern — work precisely because abstention != opposition.

### 3.1 Political viability floor (optional parameter)

A government that passes a budget 25-24 with 130 abstentions is
constitutionally valid but politically untenable. The `minForVotes`
parameter (default: 70) sets a floor on FOR votes below which a
passage is treated as a political failure even if FOR > AGAINST.
The Hartling government (22 mandates) is the historical lower bound
for government size, but even Hartling needed 88+ votes for budget
passage. A government needs visible active support to function.

```
passage = (FOR > AGAINST) AND (FOR >= minForVotes)
```

Can be swept (0 / 60 / 70 / 80) to test sensitivity.

---

## 4. Confidence check (permissive pre-filter)

Before assessing legislative viability, apply a boolean confidence
check: would active opposition on a no-confidence motion reach 90?

This is conceptually distinct from the finanslov check:
- Confidence: how many would vote FOR a mistillidsvotum?
- Legislative: how many would vote FOR the budget?

A party might abstain on confidence (letting the government survive)
while voting AGAINST the budget (blocking legislation). The confidence
check uses party-specific confidence behavior:

| Party | Confidence behavior toward S-led govts |
|-------|---------------------------------------|
| SF | **Abstains** (B16 precedent, 2025) |
| EL | **Abstains** (structural: won't hand power to blue) |
| ALT | **Abstains** (same logic as EL) |
| RV | **Abstains** (would not join blue in toppling S) |
| M | **Abstains** unless S-led govt is deeply left-dependent |
| Blue parties | **Vote FOR mistillidsvotum** against S-led govts |

For blue-led governments, the mirror applies: red parties vote FOR
mistillidsvotum, swing parties abstain.

Under baseline 2026 parameters, the confidence check almost never
binds for S-led governments: blue bloc (~68-80 mandates) is well
below 90, and SF/EL/RV/ALT all abstain. The check exists to:
1. Make the assumption explicit and testable.
2. Catch edge cases under extreme parameter sweeps (e.g., if SF is
   swept to hostile and joins blue on a confidence vote).
3. Rule out structurally impossible blue governments where S+SF+EL
   would all actively oppose.

**Implementation:** For each potential government, sum mandates of
parties that would vote FOR a mistillidsvotum. If >= 90, the
government fails the confidence check and is skipped. Computationally
trivial — no stochastic element needed here.

---

## 5. Policy dimensions

Five named dimensions replace the old 4-axis continuous ideology space.
These are the actual decision variables in finanslov negotiations.

### 5.1 Progressive taxation
**Levels:** `formueskat` | `substitute` | `none`

The central policy cleavage between red and midter paths. SF/EL want
formueskat; M rejects it; Frederiksen has signaled substitutability.
`substitute` represents a creative technical solution (targeted
kapitalindkomstskat, higher aktieskat) that SF can frame as progressive
and M can accept as "not a wealth tax."

**Important:** `substitute` is a modeling construct, not an observed
policy option. No party has proposed a specific substitute instrument.
Frederiksen's JP interview ("other parties can have good ideas") opens
the space, but the actual policy doesn't exist yet. S+SF+M viability
results are conditional on substitute being a real option — if it
isn't, the formation landscape simplifies to a binary: S+SF (with
formueskat) or S+M (without). Readers should treat S+SF+M results as
"what if a creative compromise exists?" not "S+SF+M is X% likely."

**Affects:** SF, EL (support increases with progressivity),
M (support decreases), RV (mildly negative but "not a stopklods").

### 5.2 Forstaelsespapir
**Levels:** `yes` | `no`

Whether the government offers EL a written political understanding on
inequality (the 2019 model). EL demands this as their price for budget
support.

**Composition signal:** A forstaelsespapir signals left-dependency.
M's support probability is penalized when the platform includes a
forstaelsespapir, because M reads this as the government relying on
EL (see §6).

**Affects:** EL (primary), M (negative — signals left dependency).

### 5.3 Green ambition
**Levels:** `high` | `medium` | `low`

Covers pesticide bans, CO2 targets, drinking water protection, green
investment. RV's core demand. SF also cares. KF has partial alignment
(supports sproejtteforbud on vulnerable areas).

**Affects:** RV (strong), SF (moderate), KF (mild positive for
medium+), blue parties (mild negative for high).

### 5.4 Immigration stance
**Levels:** `restrictive` | `moderate` | `status_quo`

DF's price for budget support is immigration-related concessions (net
Muslim emigration commitment, deportation funding). These concessions
make the budget toxic to EL, RV, and potentially Greenlandic NA seats
(forsoningsfond, sovereignty concerns). Immigration can enter the
finanslov through allocations: deportation facilities, border control
funding, integration program cuts.

`status_quo` reflects Frederiksen's existing stram line — no further
tightening but no liberalization. `restrictive` reflects DF/DD demands
for net emigration commitments. `moderate` is the middle ground. Note:
"liberal" immigration is off the table for any government Frederiksen
leads — the Overton window has shifted.

**Composition signal:** `restrictive` immigration signals DF/DD
accommodation, which triggers penalties for EL, RV, and Greenlandic
NA seats (see §6).

**Affects:** DF, DD (support increases with restrictiveness),
EL (support drops sharply with restrictive), RV (negative with
restrictive), NA seats (Greenlandic seats negative with restrictive).

### 5.5 Fiscal profile
**Levels:** `expansive` | `moderate` | `tight`

Overall spending ambition. Partly implied by other dimensions
(formueskat + high green = expansive), but captures the residual
tension: SF wants welfare expansion (class sizes, Arne-pension);
M and RV want fiscal discipline. A tight fiscal profile with high
green ambition means green prioritized over welfare — distinguishing
RV's preferences from SF's.

**Affects:** SF, EL (want expansive), M, RV (want moderate),
blue parties (want tight), KF (moderate-to-tight).

### 5.6 Global parameter: `flexibility`

**Range:** `flexibility` ∈ [-0.5, +0.5], default 0.

Controls how pragmatic or rigid parties are in budget-vote draws.
Positive values shift P(FOR) draws toward the top of their ranges
(parties compromise more — reflecting post-election deal-making
pressure); negative values shift toward the bottom (campaign rhetoric
holds — parties dig in on stated demands).

**Implementation:** `flexDraw(lo, hi, flexibility)` replaces uniform
draws for P(FOR) bases. When flexibility ≠ 0, two uniform draws are
averaged (producing a triangular distribution on [0, 1] centered at
0.5), then the peak is shifted to `0.5 + flexibility`. The shifted
value is clamped to [0, 1] and mapped into the [lo, hi] range. When
flexibility = 0, falls back to a standard uniform draw (baseline).

Penalty multipliers (e.g., `el_imm_penalty`, `m_forst_penalty`) are
NOT shifted by flexibility — they are drawn uniformly regardless,
since they represent structural constraints rather than negotiation
willingness.

This parameter is sweepable and interacts with all party P(FOR)
ranges simultaneously. At flexibility = +0.3, draws cluster near the
optimistic end of every range; at -0.3, near the pessimistic end.

---

## 6. Composition externalities via platform signals

In Danish formation politics, parties observe the platform and infer
who else the government depends on. The platform dimensions already
encode these dependency signals — no separate "target support
coalition" declaration is needed.

**Signal mapping:**
- `forstaelsespapir = yes` → signals EL dependency → M penalty
- `immigration = restrictive` → signals DF/DD accommodation →
  EL penalty, RV penalty, Greenlandic NA penalty
- `taxation = formueskat` → signals left-tilted budget → M penalty
- `taxation = none` + `fiscal = tight` → signals right-tilted budget
  → SF/EL penalty (beyond what the direct effect captures)

These are implemented as multiplicative modifiers on top of the
direct platform effects in each party's budget-vote function (§7).

This is more realistic than an explicit "target support coalition"
declaration: governments don't announce who they're courting. Parties
read the platform and draw their own conclusions.

---

## 7. Support probability specification

For each non-government party, the `budgetVote` function returns
{P(FOR), P(ABSTAIN), P(AGAINST)} conditional on two inputs:
1. Government composition (who has ministerial seats)
2. Platform (the 5 policy dimensions)

### 7.1 Probability table structure

Each party has a base P(FOR) for each scenario, expressed as a
sweepable range `[lo, hi]`. Per iteration, the simulator draws a
value uniformly from this range (representing negotiation uncertainty
and the availability of creative technical solutions). P(ABSTAIN) and
P(AGAINST) are derived from the remaining probability via party-
specific split ratios (§7.3).

### 7.2 Party-by-party specification

#### SF (23 seats, red)
| Scenario | P(FOR) range | Key driver |
|----------|-------------|------------|
| In government (formueskat platform) | [0.92, 0.99] | Near-certain |
| In government (substitute platform) | [0.70, 0.95] | **Substitute acceptance sweep** |
| Excluded; S-led, formueskat/substitute, green >= medium | [0.15, 0.55] | **Key sweep param** |
| Excluded; S-led, taxation = none or green = low | [0.05, 0.30] | Less to show for it |
| Excluded; midterregering (M in govt) | [0.03, 0.20] | Would feel betrayed |
| Blue-led | [0.00, 0.03] | Near-zero |

**SF's acceptance of substitute taxation** is a critical sweep
parameter. SF's rhetoric ("aldrig igen borgerlig oekonomisk politik")
might extend to rejecting substitute as insufficient, especially in
a government where M is also present. If SF rejects substitute, the
S+SF+M package (§8.1, #5) becomes infeasible, and the formation
landscape simplifies to a binary: S+SF (with formueskat) or S+M
(without). The [0.70, 0.95] range for in-government-with-substitute
captures this: at the low end, SF is uncomfortable enough that the
package sometimes fails from within.

SF in government → taxation != `none` (hard constraint on platform).
SF in government → green >= `medium` (hard constraint on platform).

#### EL (12 seats, red)
| Scenario | P(FOR) range | Key driver |
|----------|-------------|------------|
| Forstaelsespapir offered, progressive taxation | [0.40, 0.75] | This is their price |
| Forstaelsespapir offered, taxation = none | [0.25, 0.55] | Partial satisfaction |
| No forstaelsespapir, S-led red platform | [0.10, 0.35] | Grudging tolerance |
| No forstaelsespapir, midterregering | [0.02, 0.12] | Very reluctant |
| Blue-led | [0.00, 0.03] | Near-zero |

**Immigration modifier:** If immigration = `restrictive`, multiply
P(FOR) by [0.15, 0.40] (sweepable penalty). Restrictive immigration
in the finanslov is a near-dealbreaker for EL regardless of other
dimensions.

**2026 formation price is higher than 2019.** Expert commentary
indicates a "stigende erkendelse" among support parties that the
formation moment is where real power lies. EL specifically has
learned from 2019: Rosa Lund said the forstaelsespapir wasn't
enough. EL now demands negative constraints (things the government
must NOT do — e.g., no convention breaches) alongside positive
commitments. Baseline calibration should lean toward the lower end
of the P(FOR) ranges above, not the midpoint.

#### RV (9 seats, red — functionally blocked from blue side)
| Scenario | P(FOR) range | Key driver |
|----------|-------------|------------|
| In government | [0.92, 0.99] | Near-certain |
| Excluded; S-led, green = high | [0.45, 0.75] | Green is their price |
| Excluded; S-led, green = medium | [0.30, 0.55] | Partial |
| Excluded; S-led, green = low | [0.10, 0.30] | Disappointed |
| Blue-led (without DF signals) | [0.02, 0.15] | V has rejected RV — structurally blocked |
| Blue-led (with DF signals) | [0.00, 0.05] | Near-zero |

**Immigration modifier:** If immigration = `restrictive`, multiply
P(FOR) by [0.10, 0.30]. Signals DF accommodation — RV's only hard
exclusion.

**Note on blue-side:** V has explicitly rejected governing with RV
(trust deficit from 2022 walkout). RV's blue-led P(FOR) is near-zero
not from policy distance but from V's veto. Only in extremis (e.g.,
blue needs exactly RV's mandates and V relents) would RV support a
blue budget.

#### M (9 seats, swing)
| Scenario | P(FOR) range | Key driver |
|----------|-------------|------------|
| In government | [0.92, 0.99] | Near-certain |
| Excluded; centrist platform (no formueskat, no forstaelsespapir) | [0.30, 0.60] | Possible but uncertain |
| Excluded; taxation = formueskat | [0.03, 0.15] | Red line (but soft) |
| Excluded; taxation = substitute | [0.15, 0.45] | **Substitutability sweep** |
| Blue-led, centrist platform | [0.35, 0.65] | Open to blue side |

**Composition signal modifiers:**
- If forstaelsespapir = yes: multiply P(FOR) by [0.20, 0.50].
  Signals EL dependency — M's stated veto on far-left reliance.
- If immigration = restrictive: multiply P(FOR) by [0.05, 0.15].
  Signals DF accommodation — M's stated veto on DF.

These are multiplicative, stacking on top of the base probability.
A centrist platform with forstaelsespapir = yes gives M a base of
[0.30, 0.60] × [0.20, 0.50] = effective [0.06, 0.30].

**M orientation modifiers (`mPmPref`):** M's `mPmPref` parameter
(sweepable: "S" / "M" / "V") affects not only kongerunde pointing
(§9.1) but also M's budget-vote P(FOR):

| mPmPref | S-led P(FOR) modifier | Blue-led P(FOR) modifier |
|---------|----------------------|-------------------------|
| "S" (default) | ×1.0 (baseline) | ×1.0 (baseline) |
| "V" (March 21 signal) | ×0.4 (much less willing) | ×1.5 (capped 0.95) |
| "M" (self-serving) | ×0.6 (less willing) | ×0.6 (less willing) |

When mPmPref = "V", M is actively pivoting toward blue — sharply
reducing willingness to support S-led budgets while boosting
willingness to support blue-led ones. When mPmPref = "M", Loekke
wants to be PM himself — less willing to support anyone else's
government from either side. These modifiers apply multiplicatively
on top of the scenario-specific base P(FOR) and composition signal
modifiers.

**`mDemandPM` parameter** (boolean, default false): When true, M
votes AGAINST any budget where M is not PM — whether as excluded
party or as government member under a non-M PM. If M is in
government but PM is S, M's mandates go to AGAINST in the DP
(treated as "rebelling government member"). S always demands PM
(hard-coded: Frederiksen will not serve under anyone). This
parameter tests whether Loekke's PM ambition is a binding
constraint or merely a preference.

#### KF (12 seats, blue)
| Scenario | P(FOR) range | Key driver |
|----------|-------------|------------|
| In government | [0.92, 0.99] | Near-certain |
| Excluded; S-led, green >= medium, fiscal = moderate | [0.08, 0.35] | **Key swing param** |
| Excluded; S-led, left platform | [0.02, 0.10] | Too far left |
| Blue-led | [0.85, 0.97] | Standard |

KF's willingness to cross the bloc line on a centrist budget is a key
uncertainty. Mona Juul's "door ajar" signal makes this nonzero. KF's
partial alignment on green (sproejtteforbud) creates a bridge.

#### DF (14 seats, blue)
| Scenario | P(FOR) range | Key driver |
|----------|-------------|------------|
| Blue-led, immigration = restrictive | [0.45, 0.80] | Net emigration gap — see note below |
| Blue-led, immigration = moderate | [0.20, 0.50] | **DF's real price** |
| Blue-led, immigration = status_quo | [0.05, 0.25] | Deeply disappointed |
| Blue-led, M in govt | P(FOR) × [0.10, 0.30] | Veto on Loekke |
| Any S-led govt | [0.00, 0.05] | Near-zero |

**Net emigration gap / platform-space truncation:** DF's ultimative
krav is net Muslim emigration written into the regeringsgrundlag —
more extreme than anything the model's `restrictive` level represents.
No other party has accepted this condition. The `restrictive` level
captures tighter immigration policy (deportation funding, border
control, convention withdrawal), but NOT the full net-emigration
commitment. Because the model's policy space cannot represent what DF
actually demands, DF's P(FOR) is structurally overstated for every
platform. The ranges above are set conservatively to compensate:
even at `restrictive`, DF's ceiling is 0.80, not 0.95, and the
floor is 0.45 — reflecting that DF may view any achievable platform
as falling short of their ultimatum.

This platform-space truncation is arguably more consequential for
blue-government viability than the independence assumption (§13.5).
If DF's real demand can't be met, no blue budget passes without DF
accepting less than their stated price — and Messerschmidt has
explicitly said "ikke saa meget pjat" about enforcement.

**DF-M mutual exclusion:** DF and M veto each other. Any configuration
that needs both DF and M support is structurally infeasible.

#### DD (13 seats, blue)
| Scenario | P(FOR) range | Key driver |
|----------|-------------|------------|
| Blue-led, blaa statsminister | [0.75, 0.95] | Their demand |
| Blue-led, M in govt | [0.10, 0.30] | Anti-Loekke |
| Any S-led govt | [0.00, 0.05] | Near-zero |

#### V (17 seats, blue), LA (19 seats, blue), BP (5 seats, blue)
| Scenario | P(FOR) range |
|----------|-------------|
| In government (coalition partner) | [0.90, 0.99] |
| Blue-led, excluded | [0.70, 0.90] |
| S-led, in government (SVM-type) | [0.85, 0.97] |
| S-led, excluded | [0.00, 0.05] |

Note: V "in government" with S is possible (SVM precedent). When V
is a coalition partner, V votes FOR regardless of who leads.

#### ALT (4 seats, red)
| Scenario | P(FOR) range |
|----------|-------------|
| S-led, red platform | [0.45, 0.75] |
| S-led, midter platform | [0.10, 0.35] |
| Blue-led | [0.00, 0.05] |

#### NA seats (4 seats, stochastic alignment)
Each NA seat draws an alignment per iteration: `red`, `blue`, or
`flexible`. Alignment affects both pmPref and budget vote.

Budget vote by alignment:
- `red`: P(FOR) for S-led = [0.70, 0.90]; P(FOR) for blue-led = [0.02, 0.10]
- `blue`: P(FOR) for blue-led = [0.70, 0.90]; P(FOR) for S-led = [0.02, 0.10]
- `flexible`: P(FOR) = [0.30, 0.70] for either, modifiable by
  government's Greenland/Faroe-specific policy offers.

**Immigration modifier for Greenlandic flexible seats:** If
immigration = `restrictive`, multiply P(FOR) by [0.30, 0.60].
Greenlandic parties have specific sovereignty and forsoningsfond
concerns that conflict with restrictive immigration postures.

Alignment distributions per seat (sweepable):

| Seat | P(red) | P(flexible) | P(blue) | Notes |
|------|--------|-------------|---------|-------|
| GL1 (likely IA) | 0.60 | 0.30 | 0.10 | IA leans red, hedging |
| GL2 (Siumut/Naleraq/Demokraatit) | 0.25 | 0.45 | 0.30 | Genuinely open |
| FO1 (Javnadharflokkurin) | 0.55 | 0.20 | 0.25 | Skaale running again (confirmed) |
| FO2 (Sambandsflokkurin) | 0.10 | 0.15 | 0.75 | Traditionally blue |

### 7.3 Deriving the three-way split (party-specific)

Given P(FOR), the remaining probability `r = 1 - P(FOR)` splits
between ABSTAIN and AGAINST. The split is **party-specific** for the
key parties where it matters, reflecting historical behavior and
structural incentives.

**Critical distinction: confidence votes vs. budget votes.**
The B16 confidence vote (2025) showed SF abstaining. But confidence
and budget votes are structurally different instruments. On a
confidence vote, SF abstaining merely lets S survive — SF retains
future leverage. On a budget vote, SF abstaining lets S **govern
without SF**: Frederiksen can form S+M, pass budgets with M+KF
tolerance, and SF is sidelined for 4 years. SF's leadership
understands this — the "government or nothing" strategy depends on
being a credible budget blocker, not just a confidence abstainer.

Therefore, SF's budget abstain ratio is **lower** than its confidence
abstain ratio, and it is a **sweep parameter** — the single most
load-bearing behavioral assumption in the model.

**Party-specific abstain ratios** (fraction of `r` allocated to
ABSTAIN, remainder to AGAINST):

When the government is on the party's "side" (S-led for red/swing,
blue-led for blue):

| Party | Abstain share | Against share | Swept? | Rationale |
|-------|--------------|---------------|--------|-----------|
| SF (confidence) | 0.95 | 0.05 | No | B16 precedent. Applies to §4 confidence check only. |
| SF (budget, S+SF platform) | [0.60, 0.90] | [0.10, 0.40] | **Yes** | SF might tolerate an S budget with SF-friendly policies, or might block to force inclusion. Key sweep. |
| SF (budget, S+M midterregering) | [0.30, 0.70] | [0.30, 0.70] | **Yes** | SF has strongest incentive to block here — S+M sidelines SF entirely. But bloc loyalty constrains. |
| EL | 0.85 | 0.15 | No | Reluctant to topple S — "sat i saksen" (Per Clausen). |
| M | 0.50 | 0.50 | No | Genuinely could go either way. Strategic actor. |
| KF | 0.60 | 0.40 | No | More open to abstaining on centrist S-led budget. "Door ajar." |

When the government is on the opposing side (blue-led for red parties,
S-led for blue parties):

| Party | Abstain share | Against share | Rationale |
|-------|--------------|---------------|-----------|
| SF | 0.30 | 0.70 | Would more actively oppose blue than tolerate |
| EL | 0.25 | 0.75 | Standard opposition |
| M | 0.50 | 0.50 | Same as above — M is genuinely swing |
| KF | 0.20 | 0.80 | Standard blue opposition to S-led govt (when not crossing) |

**Default ratios** for parties without specific calibration:
- Same-side: ABSTAIN 0.75, AGAINST 0.25
- Opposing side: ABSTAIN 0.02, AGAINST 0.98

The opposing-side default is very low (0.02) because parties with
near-zero P(FOR) on the opposing side effectively vote AGAINST —
abstention on an opposing-side budget provides no strategic value.

**Why SF's budget abstain ratio matters so much:** With SF's 23
mandates, the abstain/against split directly determines S+M viability.
If SF budget abstain = 0.90 (paper tiger), SF's mandates mostly
evaporate into abstention and S+M passes easily. If SF budget
abstain = 0.30 (credible blocker), SF's AGAINST votes often sink
S+M budgets, forcing Frederiksen to include SF. This parameter
is arguably more decisive for government type than any P(FOR) value.

---

## 8. Government packages

### 8.1 Enumerated packages (primary analysis)

All S-led packages are evaluated simultaneously, scored, and the
highest-scoring viable package wins (see §9.2). Blue-led packages
are evaluated only if all S-led packages fail.

**S-led packages:**

| # | Package | Members | Mandates | Natural platform | Notes |
|---|---------|---------|----------|-----------------|-------|
| 1 | S-alone | S | 38 | Red, high green | Needs broad outside support. Fragile but possible (Hartling precedent). |
| 2 | S+SF | S, SF | 61 | Formueskat/substitute, high green, expansive | The modal outcome if red bloc >= 88. SF gets ministerial seats. |
| 3 | S+SF+RV | S, SF, RV | 70 | High green, moderate fiscal | Strong on green. Needs ~20 more from EL/ALT/NA. |
| 4 | S+RV | S, RV | 47 | High green, moderate fiscal, no formueskat | Green-focused. Same size as S+M but different support base. |
| 5 | S+M | S, M | 47 | No formueskat, moderate green, moderate fiscal | The midterregering. Needs KF or broad tolerance. |
| 6 | S+SF+M | S, SF, M | 70 | Substitute taxation, medium+ green, moderate fiscal | **The hard one.** SF-M policy tension on formueskat. |
| 7 | S+SF+RV+M | S, SF, RV, M | 79 | Substitute, high green, moderate fiscal | Broadest center-left. Only needs ~11 more. |
| 8 | S+V | S, V | 55 | Centrist | Arithmetically weak. TLP hasn't ruled out. See V acceptance note. |
| 9 | S+V+M | S, V, M | 64 | No formueskat, moderate, moderate | SVM-lite. Still short of 90. See V acceptance note. |

**V's acceptance of S-led invitation:** V joining an S-led government
is not automatic — TLP's first priority is blue. V would only accept
after blue-led alternatives have failed. Modeled as a stochastic
acceptance probability: P(V accepts) = [0.10, 0.40], reflecting TLP's
"vaccinated against Ellemann's mistake" (won't categorically refuse)
but strong blue preference. The sequential formateur protocol handles
the ordering: Frederiksen tries S+V/S+V+M only after S+SF variants,
and only after V has tried and failed to form a blue government (if V
got a formateur turn). If blue alternatives haven't been exhausted,
P(V accepts) = 0.

**Blue-led packages:**

| # | Package | Members | Mandates | Natural platform | Notes |
|---|---------|---------|----------|-----------------|-------|
| 10 | V-led | V, LA, KF (+DD?) | 48-61 | None taxation, moderate-restrictive immigration | Standard blue. Needs DF. |
| 11 | LA-led | LA, V, KF (+DD?) | 48-61 | None taxation, restrictive immigration, tight fiscal | If LA > V. |

### 8.2 Structurally infeasible: blaa midterregering (documented)

Troels Lund Poulsen proposed V+LA+KF+M on March 21-22. LA endorsed it.
This configuration is **arithmetically dead**:

```
V(17) + LA(19) + KF(12) + M(9) = 57 mandates FOR
Add DD(13) + BP(5) = 75 FOR (assuming all blue support)
Red bloc: S(38) + SF(23) + EL(12) + RV(9) + ALT(4) = 86 AGAINST
75 FOR < 86 AGAINST → fails

The only route to passage needs DF(14): 75 + 14 = 89 FOR vs 86 AGAINST
But DF vetoes M and M vetoes DF → structurally infeasible
```

Even with favorable NA seats (4 flexible/blue → 79 FOR), this falls
short of 86 AGAINST unless multiple red parties abstain — which the
research strongly suggests they would not. The blaa midterregering
is a campaign signal, not a formation path.

The discovery mode (§8.3) will confirm this, but the arithmetic should
be documented upfront.

### 8.3 Discovery mode (secondary)

Enumerate all government subsets of size 1-4 from gov-eligible parties.
Apply quick viability filters:
1. At least one PM-eligible member
2. No hard vetoes within government
3. Cross-bloc only with swing bridge party
4. Passes confidence check

For survivors, run the full legislative viability assessment with
default parameters. Flag any coalition that achieves P(passage) > 0.3
but isn't in the enumerated packages. This catches configurations we
haven't thought of.

---

## 9. Formateur protocol

### 9.1 Formateur order — Frederiksen's structural advantage

**The sitting PM controls the process.** The constitutional handbook
(research/formation_rules.md) establishes: "the entire
process is on the outgoing PM's responsibility." Frederiksen doesn't
just get a tiebreaker — she decides whether and when to call a
kongerunde. She would resign only after determining she cannot form
a government.

**Implementation:** Frederiksen (as sitting PM) always gets first
shot as formateur, regardless of the plurality calculation. She
explores her preferred packages (S+SF, S+SF+RV, S+M, S+SF+M, etc.)
before any blue candidate gets a chance. The kongerunde and its
plurality-based ordering only activates if Frederiksen exhausts her
options without finding a viable government.

The constitutional minimum: Frederiksen cannot continue if she would
face an immediate majority against her (90+ votes for a
mistillidsvotum). Under baseline parameters, blue bloc (~68-80) is
well below 90, so this constraint doesn't bind.

**Kongerunde pointing** (used only when Frederiksen fails):
Each party with >= 1 mandate points to a PM candidate. **Pointing is
conditional** — reflecting actual kongerunde behavior where parties
give conditional recommendations:

| Party | Points to | Condition |
|-------|----------|-----------|
| S | S (self) | Always |
| SF | S | Only if Frederiksen commits to including SF in govt. If not, SF still points to S but with a weaker mandate. |
| EL | S | Only if red government is being formed. If S pursues midterregering, EL may decline to point. |
| RV | S | Default. Theoretically open to blue, but blocked by V's rejection. |
| ALT | S | Always |
| M | Conditional | Sweepable: S (default baseline), M (self-serving), or V (March 21 signal) |
| KF | V | Default. Might point to S in midterregering scenario. |
| V | V (self) | Always |
| LA | LA (self, if LA > V) / V | Conditional on relative size |
| DF | V | Not Loekke, not Frederiksen. Points to largest blue excluding M. |
| DD | Largest blue party | Whichever blue is biggest |
| BP | V | Default blue |

NA seats' pmPref depends on drawn alignment:
- `red` → points to S
- `blue` → points to V or LA (whichever has more mandates)
- `flexible` → stochastic draw, slight red lean (0.6 S / 0.4 blue
  candidate) to reflect historical baseline

Sum mandates per PM candidate. Candidates try in order of support.
Ties broken by incumbent advantage (Frederiksen, as sitting PM, goes
first if tied).

### 9.2 Parallel evaluation with `redPreference` scoring

The old sequential formateur protocol (red_first / pragmatist /
centrist / cheapest types) has been replaced with parallel evaluation
of all S-led packages, scored and ranked by a composite formula.
Frederiksen's coalition preference is encoded via a single continuous
parameter rather than discrete formateur types.

**`redPreference` ∈ [0, 1], default 0.5** (genuinely uncertain, not
encoding a red lean).

Controls how much Frederiksen favors "pure red" packages (S-alone,
S+SF, S+SF+RV, S+RV) vs. "midter" packages (those including M, V,
or KF).

**Implementation — `frederiksenBonus(pkg, redPreference)`:**

A package is classified as "pure red" if it contains no swing/blue
partners (M, V, KF). The bonus multiplier is:

```
Pure red:   (1.0 + redPreference × 0.3) × noise
Midter:     (1.0 + (1 - redPreference) × 0.3) × noise
noise = exp(0.1 × N(0, 1))   [per-iteration stochastic jitter]
```

At redPreference = 1.0, pure red packages get a 1.30× bonus (midter
get 1.0×). At redPreference = 0.0, midter packages get 1.30× (pure
red get 1.0×). At 0.5, both get 1.15× — nearly neutral, with the
stochastic noise determining which wins on any given iteration.

The noise term (lognormal, σ = 0.1) ensures that even a strong
preference doesn't produce deterministic outcomes — on some
iterations, the non-preferred type scores higher.

**Blue-led scoring:** When Frederiksen fails and blue candidates
evaluate packages, a simpler bonus applies: the package led by the
larger blue party (V or LA, whichever has more mandates) gets a
1.15× leader bonus, plus per-iteration lognormal noise.

### 9.3 Platform optimization and coalition-theory scoring

For each package, the formateur selects the platform that maximizes
a composite score incorporating legislative viability, policy
preferences, and coalition-theory structural factors. The formateur
is not a pure viability-maximizer — the PM has political costs for
retreating from flagship proposals, and coalition theory predicts
systematic preferences for ideologically compact, minimum-winning
coalitions.

**Full scoring formula:**

```
score = P(passage) × prefWeight × frederiksenBonus
        × ideologyFit × sizeBonus × mwccBonus
```

Where:
- `P(passage)` — from the DP computation (§9.5)
- `prefWeight` — formateur's policy preference weight (below)
- `frederiksenBonus` — red/midter preference (§9.2)
- `ideologyFit` — penalizes ideologically distant coalitions
- `sizeBonus` — penalizes broad coalitions (many parties)
- `mwccBonus` — bonus for connected, minimum-winning coalitions

The first three components (`P(passage) × prefWeight ×
frederiksenBonus`) are platform-dependent. The last three
(`ideologyFit × sizeBonus × mwccBonus`) are package-dependent
(same value for all platforms within a package).

**Coalition-theory scoring components (DI-based):**

These replace the old `negotiationDiscount` parameter with
theory-grounded structural scoring.

1. **Ideology fit:** `ideologyFit = max(0.3, 1 - avgPairwiseLRDist ×
   distPenalty)`. Penalizes coalitions whose members are far apart on
   the LR axis. Uses party LR positions from party data (1-9 scale,
   normalized to 0-1 for distance). `distPenalty` default 1.5,
   sweepable. S-alone (no distance) gets 1.0; S+V (LR distance
   3→7, normalized 0.44) gets ~0.34; S+SF (3→2, normalized 0.11)
   gets ~0.83.

2. **Size bonus:** `sizeBonus = max(0.5, 1 - (numParties - 1) ×
   sizePenalty)`. Penalizes coalitions with many parties. `sizePenalty`
   default 0.08, sweepable. S-alone: 1.0; S+SF: 0.92; S+SF+RV: 0.84;
   S+SF+RV+M: 0.76. Replaces the old `negotiationDiscount` parameter.

3. **MWCC bonus:** Bonus for coalitions that are connected on the LR
   axis AND minimum-winning (no member can be removed while keeping
   government mandates >= 90):
   - Connected + MWC: 1.15×
   - Connected only: 1.08×
   - MWC only: 1.05×
   - Neither: 1.0×
   Connectedness allows at most 1 gov-eligible party within the LR
   range to be missing from the coalition (tolerating a single gap).

**Policy preference function:** When Frederiksen is formateur:
```
prefWeight = preference_weight_S(platform, taxWeight)
```

Preference weights for S (Frederiksen):
| Dimension | Preferred | Weight | Neutral | Weight | Dispreferred | Weight |
|-----------|----------|--------|---------|--------|-------------|--------|
| Taxation | formueskat | **sweepable** | substitute | 1.00 | none | 1/tax_weight |
| Green | high | 1.03 | medium | 1.00 | low | 0.97 |
| Immigration | status_quo | 1.00 | moderate | 1.00 | restrictive | 0.97 |
| Fiscal | moderate | 1.00 | expansive | 1.03 | tight | 0.97 |

**The taxation preference weight is sweepable:** `tax_weight`
∈ [1.00, 1.15]. At 1.00, Frederiksen is a pure viability-maximizer
who drops formueskat the moment substitute or none improves P(passage)
by any amount. At 1.15, Frederiksen would accept a 15% lower
P(passage) to keep formueskat — reflecting the political cost of
retreating from a campaign centerpiece in the first week of formation.

This matters for government type: a conviction-driven formateur
(tax_weight = 1.15) is more likely to form S+SF (where formueskat is
natural) than S+M (where she'd drop it). A pragmatic formateur
(tax_weight = 1.00) picks whichever package passes the budget most
easily.

Other dimension weights are fixed at small values — they serve as
tiebreakers only.

Blue formateurs (V/LA) have analogous preferences (taxation = none,
immigration = moderate/restrictive, fiscal = tight/moderate) with
fixed small weights.

Full grid: 3 × 2 × 3 × 3 × 3 = 162 combinations. After pruning
incoherent combinations (§9.4), each package has ~10-25 options.
If <= 8 coherent platforms, all are evaluated with full DP. If more,
a fast expected-FOR heuristic pre-filters to the top 8 candidates
before running the full DP — a performance optimization that avoids
unnecessary DP calls on clearly inferior platforms.

### 9.4 Platform coherence constraints

Not all dimension combinations are valid:

**Structural incoherence:**
- `formueskat` + `tight` fiscal = incoherent (progressive tax
  requires spending commitments)
- `none` taxation + `expansive` fiscal = incoherent (no revenue
  source for expansion — unless funded by other means, but this
  model doesn't have that granularity)

**Government-member constraints:**
- M in government → taxation != `formueskat` (M's stated red line)
- SF in government → taxation != `none` (SF demands progressive tax)
- SF in government → green >= `medium` (SF demands green ambition)
- V in government → taxation = `none` (V opposes progressive tax)
- V in government → immigration != `status_quo` (V wants tightening)

**Soft constraints** (implemented as penalties on P(passage), not
hard exclusions — reflecting that negotiation can soften positions):
- M in government + fiscal = `expansive` → penalty on M's P(FOR)
  for own government budget (M values fiscal discipline)
- SF in government + fiscal = `tight` → penalty on SF's P(FOR)
  (SF demands welfare expansion)

### 9.5 P(passage) computation via dynamic programming

Since party votes are modeled as independent (given the platform),
P(passage) can be computed analytically. This eliminates inner MC
noise and makes results deterministic given parameters.

**Algorithm:** Process parties one at a time. Maintain a probability
distribution over (FOR_total, AGAINST_total) pairs.

```
State: dp[f][a] = probability that, after processing parties 1..k,
       FOR total = f and AGAINST total = a

Initialize: dp[0][0] = 1.0

For each non-government party with m mandates and probs (pF, pAg, pAb):
  For each state dp[f][a] with nonzero probability:
    dp'[f + m][a]     += dp[f][a] * pF      // party votes FOR
    dp'[f][a + m]     += dp[f][a] * pAg     // party votes AGAINST
    dp'[f][a]         += dp[f][a] * pAb     // party abstains

Government mandates are added to FOR total before starting.

P(passage) = sum of dp[f][a] for all (f, a) where f > a
```

State space: ~175 × 175 = 30,625 states per step. With ~12-14
non-government parties, total operations ≈ 400,000. Trivial.

This runs in < 1ms per (package, platform) evaluation. No inner MC
loop needed.

### 9.5b EL-M sequential conditioning

The independence assumption (§9.5) overestimates P(passage) for
configurations that need both EL and M support — most importantly
the S+SF+M package (#5), which is the key "compromise" coalition.
When EL votes FOR the budget (even without a forstaelsespapir), M
observes this as left-dependency and penalizes. The DP doesn't
capture this because it treats EL and M as independent draws.

**Implementation:** Branch on EL's vote outcome before running the
DP for remaining parties. Adjust M's probability conditional on
EL's action:

```
P(passage) =
    P(EL=FOR)     × DP(remaining parties, M_pFor × el_m_penalty)
  + P(EL=ABSTAIN) × DP(remaining parties, M_pFor_baseline)
  + P(EL=AGAINST) × DP(remaining parties, M_pFor × el_m_boost)
```

New parameters:
- `el_m_penalty`: M's P(FOR) multiplier when EL votes FOR without
  forstaelsespapir signal. Range: [0.50, 0.85]. When the platform
  already includes forstaelsespapir = yes, the platform-signal
  penalty (§6) already applies and this additional penalty is
  reduced (half strength) to avoid double-counting.
- `el_m_boost`: M's P(FOR) multiplier when EL votes AGAINST.
  Range: [1.05, 1.20]. M is reassured by EL's absence.

Cost: 3× DP evaluations per (package, platform). Still < 3ms.

**Note:** If the EL-M conditioning produces >5pp shifts on S+SF+M
P(passage), extend the same approach to the M-KF pair (KF crossing
the bloc line is more palatable when M also crosses). This would
increase to 9× DPs — still trivial.

### 9.6 Viability threshold (sweep parameter)

The formateur proposes a government if P(passage) exceeds a
`viability_threshold`. This captures formateur risk tolerance.

| Value | Interpretation | Historical analogue |
|-------|---------------|---------------------|
| 0.30 | Risk-tolerant: will try marginal coalitions | Hartling (22 seats, 1973) |
| 0.50 | Default: reasonable confidence | Frederiksen I (2019) |
| 0.70 | Risk-averse: demands strong basis | SVM (majority, 2022) |

Sweeping this reveals whether risk tolerance affects government type:
does a cautious formateur choose broader coalitions?

**Interaction with scoring:** The viability threshold acts as a gate
on P(passage) — a package must clear it to enter the scoring
competition. Once past the gate, the composite score (§9.3)
determines which package wins. A low threshold (0.30) lets more
packages compete on score; a high threshold (0.70) eliminates
marginal packages before they can compete.

---

## 10. Sweep parameters

### 10.1 High-priority sweeps

| Parameter | Range | What it reveals |
|-----------|-------|-----------------|
| Mandate draws (bloc totals) | Correlated draws, baseline ± sigma | PM identity threshold |
| ALT threshold clearance | P(clear) = 0.4–0.8 | Red bloc viability |
| BP threshold clearance | P(clear) = 0.5–0.9 | Blue bloc size |
| NA seat alignment distributions | Per-seat distributions (§7.2) | Marginal seat impact |
| **SF budget abstain ratio (S+M scenario)** | **[0.30, 0.70]** | **Most load-bearing param: is SF a credible budget blocker?** |
| SF budget abstain ratio (S-only scenario) | [0.60, 0.90] | SF tolerance of S-without-SF |
| SF P(FOR) when excluded from S-led govt | [0.05, 0.55] | Pivotal for red vs midter |
| SF substitute acceptance (in govt with M) | [0.70, 0.95] | Is S+SF+M feasible? |
| EL P(FOR) without forstaelsespapir | [0.05, 0.45] | EL's real price |
| M P(FOR) with substitute taxation | [0.15, 0.45] | **Formueskat substitutability** |
| M forstaelsespapir penalty | [0.20, 0.50] | How much does EL dependency repel M? |
| KF P(FOR) for centrist S-led budget | [0.05, 0.35] | KF crossing bloc line |
| EL-M penalty (no forstaelsespapir signal) | [0.50, 0.85] | How much does M penalize EL support? |
| **M orientation (mPmPref)** | **S / M / V** | **Loekke's direction — #1 commentator uncertainty** |
| **mDemandPM** | **true / false** | **Does M demand PM or just prefer it?** |
| **redPreference** | **[0.0, 1.0]** | **Frederiksen's red-vs-midter preference (replaces formateur types)** |
| **flexibility** | **[-0.5, +0.5]** | **Global negotiation pragmatism/rigidity** |
| Formateur taxation conviction (tax_weight) | [1.00, 1.15] | Does Frederiksen stick to formueskat? |
| Viability threshold | [0.30, 0.70] | Formateur risk tolerance |

### 10.2 Secondary sweeps

| Parameter | Range | What it reveals |
|-----------|-------|-----------------|
| **distPenalty** | **[0.5, 3.0]** | **How much does ideological distance penalize coalitions?** |
| **sizePenalty** | **[0.0, 0.20]** | **How much does coalition breadth penalize? (Replaces negotiationDiscount)** |
| V acceptance of S-led invitation | [0.10, 0.40] | SVM-lite viability |
| Polling bias (bloc_bias_red / bloc_bias_blue) | [-2.0, +2.0] pp | Systematic polling error — "what if polls are wrong?" |
| DF P(FOR) for blue w/o immigration concessions | [0.10, 0.60] | DF's real price (net emigration gap) |
| EL immigration penalty | [0.15, 0.40] | Immigration as EL dealbreaker |
| RV green threshold (P(FOR) at green = medium) | [0.35, 0.70] | RV's flexibility |
| Fiscal profile: M penalty for expansive | [0.3, 0.7] modifier | Fiscal discipline demand |
| minForVotes (political viability floor) | 0 / 60 / 70 / 80 | Does nominal support matter? |

### 10.3 Scenario archetypes

One-at-a-time parameter sweeps miss interaction effects. Design
coherent political scenarios that set multiple parameters
simultaneously, reflecting recognizable political configurations.

| Archetype | Key parameter settings | Tests |
|-----------|----------------------|-------|
| **"Red tide"** | S=42, SF=25, ALT clears, NA=3 red, EL forstaelsespapir=yes, SF budget abstain=0.90, redPreference=0.8 | Can S+SF govern without M? How large must red bloc be? |
| **"SF has leverage"** | S=36, SF=24, SF budget abstain (S+M)=0.35, SF substitute acceptance=0.75 | SF as credible blocker forces inclusion. S+SF+M viability? |
| **"Midterregering forced"** | S=38, mPmPref=S, SF budget abstain=0.70, M substitute pFor=0.40, KF pFor=0.25, redPreference=0.2 | When SF blocks and M cooperates. Is S+M legislatively viable? |
| **"M goes blue"** | mPmPref=V, M blue-led pFor=0.55, DF immigration moderate pFor=0.50 | March 21 signal. Is blaa midterregering actually dead? |
| **"Knife-edge"** | S=35, SF=22, red bloc=82, ALT at 2.1%, NA=2 flexible | Maximum uncertainty. Which single factor flips the outcome? |
| **"Broad compromise"** | S=38, SF substitute=0.90, M substitute pFor=0.40, viability threshold=0.70, flexibility=+0.2 | Pragmatic environment + substitutability → S+SF+RV+M? |
| **"Blue surge"** | V=22, LA=22, KF=14, blue bloc=88, DF immigration=restrictive | Can blue-led pass a budget? DF as decisive constraint. |
| **"Historical: 2019"** | S=48, SF=14, RV=16, EL=13, redPreference=0.9 | Calibration: does model produce S-alone + forstaelsespapir? |

These archetypes are run at N=10,000 each and compared. The
comparison reveals: (a) which parameters dominate across scenarios,
(b) which scenarios produce qualitatively different government types,
(c) where interactions matter (SF leverage × M orientation).

#### Loekke scenario matrix

Every commentator names Loekke's direction as the central uncertainty.
Cross M orientation with mandate scenarios to answer: "under what
conditions does Loekke's direction actually matter?"

|  | Red bloc near 90 (86+) | Neither bloc close (82-84) | Blue bloc strong (84+) |
|--|------------------------|---------------------------|----------------------|
| **M → S** | M irrelevant (red can govern without M). Does M still get ministerial seats? | M enables S-led govt. S+M vs S+SF+M? | M splits from blue, enables S despite blue strength |
| **M → V** | Red governs anyway. M in opposition. | Deadlock? Neither side viable? | Blue + M still needs DF — blocked by mutual veto |
| **M → self** | Red governs, M irrelevant | Maximum Loekke leverage — neither side viable without M | Blue still can't use M (DF veto) |

Each cell is a scenario archetype run at N=10,000. The matrix reveals
whether Loekke's direction is genuinely decisive (changes PM identity
or government type) or merely affects the margin (changes coalition
composition within S-led governments). Commentator hypothesis: Loekke
matters most when neither bloc is close to 90.

### 10.4 Fixed parameters (not swept)

- Blue parties oppose S-led governments when not in coalition (near-certain)
- Red parties oppose blue-led governments (near-certain)
- Government parties vote FOR their own budget (near-certain)
- S always demands PM (hard-coded: Frederiksen will not serve under anyone)
- Abstain/against split ratios for EL, M, KF (calibrated — see §7.3)
- Quorum is always satisfied (no party boycotts Folketinget)
- Platform coherence constraints (structural, not behavioral)
- Frederiksen as sitting PM evaluates first (constitutional)
- MWCC bonus values (1.15×/1.08×/1.05×/1.0×) are fixed
- LR positions per party (used for ideologyFit) are fixed

Note: SF's budget abstain ratios are **swept**, not fixed — see §7.3
and §10.1. The old `formateur type` and `negotiationDiscount`
parameters have been replaced by `redPreference`, `distPenalty`, and
`sizePenalty`.

---

## 11. Output format

### 11.1 Per-sweep-point output

```json
{
  "params": { "sf_excluded_pFor": 0.35, "m_substitute_pFor": 0.30, ... },
  "N": 10000,
  "pm": { "S": 82.3, "V": 11.2, "LA": 5.1, "M": 1.4 },
  "govType": {
    "S-alone": 5.2, "red": 38.1, "center-left": 22.4,
    "midter": 18.7, "blue": 12.3, "broad": 3.1, "none": 0.2
  },
  "topCoalitions": [
    { "govt": "S+SF", "support": "EL+RV+ALT", "platform": "formueskat/yes/high/status_quo/expansive", "pct": 28.4 },
    { "govt": "S+SF+RV", "support": "EL+ALT", "platform": "substitute/yes/high/status_quo/moderate", "pct": 14.1 }
  ],
  "packageViability": {
    "S+SF": { "pPassage_best": 0.72, "bestPlatform": "formueskat/yes/high/status_quo/expansive" },
    "S+M":  { "pPassage_best": 0.41, "bestPlatform": "none/no/medium/moderate/moderate" },
    "S+SF+M": { "pPassage_best": 0.55, "bestPlatform": "substitute/no/medium/status_quo/moderate" }
  },
  "confidenceCheck": {
    "S-led_opposition": 72,
    "blue-led_opposition": 98,
    "note": "Confidence binds for blue-led (98 >= 90), not for S-led (72 < 90)"
  }
}
```

### 11.2 Sensitivity analysis output

For each swept parameter: marginal effect on PM probabilities and
govType probabilities, holding other parameters at baseline. Report
as a table suitable for tornado charts.

### 11.3 Package comparison output

For each mandate draw, report P(passage) for all packages under
their best platform. This reveals which packages are close competitors
vs. clearly dominated, and how mandate draws shift the ranking.

---

## 12. Implementation notes

### 12.1 Performance budget

- Outer loop: N = 10,000 mandate draws per sweep point.
  Correlated draws (§2b) add ~10% overhead vs independent.
- Inner loop (DP): ~10-25 platforms per package × ~10 packages ×
  ~30K DP states = ~3-8M state updates per outer iteration.
  Each is trivial arithmetic (multiply, add). Target: < 1ms per
  (package, platform). Total per sweep point: ~15-30 seconds.
- Full sweep (~200 parameter combinations): ~60-100 minutes.
- Scenario archetypes (§10.3): 8 scenarios × N=10,000 × ~30s =
  ~4 minutes. Run first as a quick diagnostic.

### 12.2 File structure

```
coalition-simulator/
  sim3.js            <- main simulator
  sim3-spec.md       <- this document
  sweep.sh           <- batch runner for parameter sweeps
  sim3-parties.js    <- party definitions and budget-vote functions
  sim3-packages.js   <- enumerated government packages and platforms
```

### 12.3 Backward compatibility

sim3.js accepts a JSON config as first argument and iteration count
as second:
```bash
node sim3.js '{"mandates":{"S":46}}' 10000
node sim3.js '{"sweep":{"sf_budget_abstain_sm":[0.3,0.4,0.5,0.6,0.7]}}' 10000
node sim3.js '{"cfg":{"redPreference":0.8,"flexibility":0.2,"mPmPref":"V"}}' 5000
```

The JSON config has three top-level keys:
- `mandates`: override baseline mandate numbers per party
- `sweep`: parameter name → array of values (one sweep dimension)
- `cfg`: configuration parameters including `redPreference`,
  `flexibility`, `viabilityThreshold`, `minForVotes`, `taxWeight`,
  `mPmPref`, `mDemandPM`, `distPenalty`, `sizePenalty`,
  `sigmaBloc`, `sigmaSub`, `sigmaParty`, `blocBiasRed`,
  `blocBiasBlue`, `elMPenalty`, `elMBoost`

Sweepable keys that route to `cfg` (rather than `params`):
`redPreference`, `viabilityThreshold`, `minForVotes`, `taxWeight`,
`elMPenalty`, `mPmPref`, `blocBiasRed`, `blocBiasBlue`,
`distPenalty`, `sizePenalty`, `flexibility`.

### 12.4 Validation checks (forward-looking)

- At baseline parameters, P(PM = Frederiksen) should be ~75-85%
  (Polymarket: 81%)
- Notable calibration finding: `mDemandPM=true` (Loekke insists on PM)
  produces P(Frederiksen) ≈ 81% and 14-15% no-government — closely
  matching the Polymarket price. This suggests the market may be pricing
  in some probability of Loekke insistence / formation gridlock.
- S+SF should be the modal government type at baseline
- Blue-led government should be possible but minority outcome
- S+M (midterregering) should be producible under configurations
  where M leans centrist and SF's excluded-support is low
- The blaa midterregering (V+LA+KF+M) should be confirmed as
  infeasible by the discovery mode
- Discovery mode should not find viable coalitions outside the
  enumerated packages (if it does, add them)

### 12.5 Historical backtesting

The model should be tested against three recent formations to verify
structural assumptions and calibrate probability ranges.

**2015: V-alone (34 mandates).** Loekke formed a pure Venstre minority
government. DF (37), LA (13), KF (6) provided external support. Test:
with 2015 mandate numbers and blue-bloc support probabilities, does
the model produce V-alone as viable? Key check: does DF provide budget
support despite not being in government (they did historically)?

**2019: S-alone + forstaelsespapir.** Frederiksen formed S minority
with forstaelsespapir from RV, SF, EL. Test: with 2019 mandates
(S=48, SF=14, RV=16, EL=13), does the model produce S-alone with
forstaelsespapir = yes as the optimal outcome? Key check: is S-alone
preferred over S+SF when S is large enough?

**2022: SVM (oversized cross-bloc).** The hardest test. SVM was
politically motivated (Ukraine, mink scandal) and not structurally
predictable. Test: under what parameter configurations does the model
produce S+V+M? Expected answer: only under low redPreference (≈0.0)
with very high viability threshold (Frederiksen seeking maximum
stability). The model should be able to produce this but not as the
default outcome.

Success criterion: the model produces the correct PM for all three
and the correct government type for at least 2019 and 2015. SVM (2022)
is a stretch goal — it tests whether the model can capture
idiosyncratic political motivations through its parameter space.

---

## 13. Known limitations

The following are deliberate simplifications, not oversights.

1. **The finanslov is modeled as a single vote, not a negotiation.**
   In reality, the budget is assembled through weeks of bilateral
   negotiations where different parties extract concessions on
   different items. The model abstracts this: P(support) represents
   the expected outcome of the negotiation, not a prediction of a
   single roll-call vote.

2. **The forlig system is not modeled.** Danish governments govern
   through broad legislative agreements (forlig) that cross bloc
   lines — ~80% of pre-2022 agreements were cross-bloc (Christiansen
   2025). The model captures only finanslov viability, not the full
   domain-specific coalition structure. A government that can pass a
   budget can govern; the forlig structure is second-order for the
   question of government formation.

3. **Strategic actors are reduced to probability distributions.**
   Loekke, in particular, is deeply strategic — his whole party was
   built to occupy the pivot position. Treating him as a probabilistic
   voter understates the intentionality. The sweep over M's parameters
   captures the range of possible Loekke behaviors but not the game-
   theoretic structure of his decision-making. This is a fundamental
   limitation of the MC sensitivity approach.

4. **Party vote independence understates composition effects.**
   The DP computation (§9.5) assumes party votes are independent
   given the platform. This misses a real causal dependency: M reads
   the support coalition, not just the platform. An S+M budget that
   passes with KF support (centrist signal) is different from one
   that passes with EL support (left signal) — even with identical
   platforms. M would strongly prefer the first. The composition
   signals (§6) partially capture this through platform dimensions
   (forstaelsespapir → EL dependency → M penalty), but the deeper
   "who else is at the table" effect is only approximated. This
   systematically overestimates P(passage) for configurations that
   need support from both sides of a mutually-repelling pair (EL+M).
   Estimated bias: 2-5pp on P(passage) — second-order relative to
   swept parameters (SF budget abstain ratio: 15-25pp impact).

   **Mitigation:** EL-M sequential conditioning (§9.5b) addresses the
   primary correlated pair by branching on EL's vote and adjusting
   M's probability. Cost: 3× DP evaluations, still <3ms. The
   residual independence assumption applies to other pairs (M-KF,
   DF-RV). If EL-M conditioning produces >5pp shifts on S+SF+M
   P(passage), extend the same approach to M-KF (9× DPs, still
   trivial).

5. **Independence bites harder for large coalitions.** The DP treats
   each party's vote as independent given the platform. For red-led
   governments needing 3-4 parties' support, this is a reasonable
   approximation (and the EL-M sequential conditioning in §9.5b
   addresses the primary correlated pair). For blue-led governments
   needing 5-6 parties, the independence assumption is stronger:
   blue-side parties have more correlated bilateral tensions (DF-M,
   DF-KF, LA-KF on green, V-LA on PM candidacy), and the DP's
   geometric compounding of individual P(FOR) values doesn't capture
   that the reasons party X is reluctant are correlated with the
   reasons party Y is reluctant.

   However, the platform optimization partially mitigates this: the
   formateur selects the platform that best navigates contradictory
   demands simultaneously, so the conditional probabilities already
   reflect some tradeoffs. And the geometric compounding is already
   aggressive — a 6-party coalition at P(FOR) = 0.7 each yields
   0.7^6 ≈ 0.12 before composition signals. The residual
   overestimation shifts marginal blue viability by perhaps 3-5pp
   but does not flip qualitative conclusions about blue formation
   difficulty. Two additions were considered and rejected after
   evaluation: (a) a blue-side coordination penalty (multiplier on
   P(passage) scaling with number of support parties needed), and
   (b) an asymmetric viability threshold (blue formateurs requiring
   higher P(passage) than red). Both were rejected because they are
   free parameters with no independent variation to identify — they
   would turn an explanatory model into a calibration exercise. The
   correct response to blue overestimation is checking whether the
   per-party P(FOR) values are too generous (especially DF's
   platform-space truncation problem), not layering correction
   factors on top of structural primitives.

6. **No nyvalg (snap re-election) threat.** If formation fails, the
   sitting PM can call a new election. This threat disciplines all
   parties — nobody wants another election immediately. The model
   does not explicitly model this, but the effect is implicitly
   captured by the `flexibility` parameter (§5.6) and the support
   probability ranges (wider ranges = more willingness to compromise,
   partly driven by the alternative of nyvalg).

7. **Kongerunde recommendations are simplified.** Real kongerunde
   recommendations are highly conditional ("we point to Frederiksen
   if she commits to X"). The model captures the main conditionalities
   (§9.1) but not the full tree of conditional logic that parties
   actually deploy.

8. **Parallel evaluation elides real-time sequencing.** In practice,
   Frederiksen would explore packages sequentially, and early
   failures would signal information to later candidates. The parallel
   evaluation model (§9.2) scores all packages simultaneously with
   stochastic noise, which captures preference uncertainty but not
   the informational dynamics of sequential bargaining.
