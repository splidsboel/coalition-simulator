# What drives the results? — Sensitivity findings for the dashboard

*Based on: 31-parameter Sobol analysis (33,792 runs), 29 bilateral 1D sweeps (725 runs), 10 dyadic interaction heatmaps (2,250 runs), 13 policy position sweeps (260 runs)*

---

## Headline finding

The coalition distribution is driven by **three layers** of parameters, each operating at a different level:

1. **Formateur behavior** — how risk-averse is Frederiksen, and how much does she prefer red coalitions? (viabilityThreshold, redPreference, flexibility)
2. **Model structure** — how much does budget passage dominate vs coalition quality, and how willing is the opposition to topple a government? (passageWeight, oppositionAbstention)
3. **Party relationships** — will SF accept M? Will M accept SF? Will RV accept M? (SF↔M inGov, RV→M inGov)

The first layer is the strongest. The second sets the rules of the game. The third determines which specific coalition wins within those rules.

---

## Top 10 parameters by total sensitivity

| Rank | Parameter | Category | Total-order ST | First-order S1 | Interaction Δ | Interpretation |
|------|-----------|----------|---------------|----------------|---------------|----------------|
| 1 | Viabilitetstærskel | Scenario | 2.31 | 1.15 | 1.16 | How risk-averse is the formateur? Dominant parameter — both directly and through interactions. |
| 2 | Rød præference | Scenario | 2.01 | 1.29 | 0.72 | Does Frederiksen prefer red or broad? Strongest first-order effect. Drives S+RV+SF (S1=0.54). |
| 3 | Fleksibilitet | Scenario | 1.28 | 0.73 | 0.54 | Negotiation pressure. Opens more coalitions at higher values. |
| 4 | Oppositionens tilbageholdenhed | Model | 0.90 | 0.24 | 0.65 | Low S1 but high interactions — amplifies other parameters. The opposition norm is a background condition. |
| 5 | Budgetpassage vs kvalitet (w) | Model | 0.73 | 0.28 | 0.46 | How much does arithmetic dominate? Moderate direct effect, significant interactions. |
| 6 | M kræver regering | Scenario | 0.71 | 0.18 | 0.53 | Binary switch with massive interaction effects. Flipping it reshapes which coalitions are viable. |
| 7 | Forhandlingsforsøg | Scenario | 0.68 | 0.45 | 0.23 | More rounds = more chances. Clean, mostly first-order. |
| 8 | Finanslovsredning (rescue) | Model | 0.66 | 0.48 | 0.18 | How easy is cross-bloc pivoting? Mostly first-order — it either works or doesn't. |
| 9 | Formatørtiltrækning | Model | 0.58 | 0.09 | 0.50 | Almost pure interaction — platform negotiation cascades into everything. |
| 10 | M→SF inGov | Party | 0.50 | 0.14 | 0.36 | Will M accept SF as a coalition partner? Gates S+M+RV+SF. |

---

## Party relationships: what matters most

From the bilateral 1D sweeps (Phase 1 exploration, 25 points each at N=500):

| Relationship | Effect on S+M+RV+SF | Range swept | Verdict |
|-------------|---------------------|-------------|---------|
| **SF→M inGov** | **28.4pp** (8.6%→37.0%) | 0.20-0.98 | **Most consequential bilateral in the model** |
| **M→SF inGov** | **27.2pp** (11.0%→38.2%) | 0.20-0.95 | Reciprocal — nearly as strong |
| **RV→M inGov** | **13.4pp** (14.2%→27.6%) | 0.30-0.98 | RV's acceptance of M is the third gate |
| **M→RV inGov** | **12.2pp** (21.4%→33.6%) | 0.40-0.98 | Reciprocal |
| S→RV inGov | 7.4pp | 0.40-1.00 | Moderate — S-RV is mostly settled |
| M harshness | 6.4pp | 0.05-0.65 | Higher M harshness → harder to form S+M+RV+SF |
| DF harshness | 5.8pp | 0.40-0.98 | Surprisingly influential on red-bloc outcomes |
| DF→M tolerance | 5.2pp | 0.00-0.50 | Opens blue-bloc alternatives, indirectly affecting red |
| S→EL tolerance | 4.6pp | 0.30-0.95 | Gates the forståelsespapir channel |
| EL harshness | 4.6pp | 0.30-0.95 | Harder EL → more budget friction |

**The SF↔M bilateral is the single most consequential variable in the entire model.** More than any structural parameter, more than the viability threshold when compared on comparable ranges. This is because it directly gates whether the consensus coalition (S+M+RV+SF) can form at all.

---

## Interaction findings

The Sobol interaction contribution (ST - S1) reveals which parameters operate mainly through interactions with other parameters rather than independently:

**Highest interaction ratios (Δ/ST):**
- formateurPull: 86% interaction (almost no direct effect, but cascades through platform)
- oppositionAbstention: 72% interaction (background condition, not direct driver)
- mDemandGov: 75% interaction (binary switch that reshapes the entire landscape)
- M→SF inGov: 72% interaction (gates coalition formation in concert with SF→M)

**Key interaction pairs** (from dyadic heatmaps):
- SF→M × M→SF: 6%→38% corner-to-corner — these compound multiplicatively
- SF→M × RV→M: 4%→34% — all three centrist-acceptance relationships gate S+M+RV+SF together
- M→EL × EL→M: flat (35%→34%) — forståelsespapir channel is surprisingly insensitive to bilateral tolerance changes once above the veto threshold

---

## Policy positions: what matters

From Phase 2 exploration (13 policy dimensions swept, 20 points each at N=500):

| Policy position | Effect on S+M+RV+SF | Interpretation |
|----------------|---------------------|----------------|
| **S climate target** | **7.8pp** | S moving toward M on climate significantly helps the broad coalition |
| **S wealth tax** | **5.6pp** | Dropping the wealth tax demand helps M-containing coalitions |
| **EL EU conventions** | **4.8pp** | EL softening on ECHR makes S+M+RV+SF more viable |
| **EL immigration** | **3.2pp** | EL flexibility on immigration opens negotiation space |
| S wealth tax floor | 3.0pp | How hard S holds the line on wealth tax |
| EL immigration floor | 2.6pp | EL's actual red line position |
| M pension | 2.0pp | M flexibility on pension helps bridge to S |
| SF nuclear | 1.8pp | Minor tension point with M |
| S pension | 1.6pp | Moderate |
| M climate | 0.6pp | M's climate position barely matters directly |

**Key finding:** Policy positions matter less than bilateral relationships for determining which coalition forms. The biggest policy effect (S climate, 7.8pp) is less than a third of the biggest bilateral effect (SF→M, 28.4pp). This suggests that coalition formation is primarily about willingness to cooperate, not about policy distance.

---

## What this means for the dashboard "Hvad påvirker resultatet?" tab

The tab should present three sections:

### 1. "De vigtigste knapper" (The most important controls)
- Ranked bar chart showing the top 10 parameters by total sensitivity
- Each bar labeled in Danish with a one-sentence interpretation
- Highlight that the top 3 (viabilitetstærskel, rød præference, fleksibilitet) are all in the Scenario tier — users have direct control over the most consequential assumptions

### 2. "Partirelationer der afgør det" (Party relationships that decide it)
- Response curves for SF→M, M→SF, RV→M showing how S+M+RV+SF probability changes
- The SF→M curve is the hero visualization — from 9% to 37% across its range
- Brief note: "SF og Ms villighed til at regere sammen er den enkeltfaktor, der påvirker resultatet mest"

### 3. "Samspil mellem parametre" (Parameter interactions)
- The SF→M × M→SF heatmap — showing how the two reciprocal relationships compound
- Brief explanation: many parameters interact, meaning their effect depends on other settings
- Note the opposition abstention norm as a "background condition" with high interaction but low direct effect

### 4. "Politiske positioner" (Policy positions — if space allows)
- Simple table showing which policy concessions have the biggest effect
- Lead with S climate and S wealth tax as the most consequential negotiating chips
