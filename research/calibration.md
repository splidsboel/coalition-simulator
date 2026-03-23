# Coalition simulator calibration: parameters and evidence

This document is the technical appendix for the Danish coalition formation simulator. It contains distributional parameters, base rates, voting records, and historical frequency corrections. Written for someone reimplementing the model.

---

## 1. Support-party voting records and P(FOR) calibration

### SF: perfect loyalty record

SF's voting record as an external support party is perfectly loyal. After leaving the Thorning government in February 2014 over the DONG Energy sale, SF voted with the government in 260 of 275 Folketing votes (95%) through June 2014. On every subsequent finanslov -- FL15 through FL25 -- SF voted FOR, regardless of whether it was an S-led or SVM government.

Complete record during the Frederiksen I period (forstaelsespapir era): FL20 FOR, FL21 FOR, FL22 FOR. After SVM formed, SF continued voting FOR all finanslove (FL23, FL24, FL25) from opposition.

On the B16 mistillidsvotum (2025), SF abstained -- a carefully calibrated middle position.

| Parameter | Value | Confidence |
|-----------|-------|------------|
| P(SF votes FOR \| SF is stoetteparti for S-led government) | 0.98-0.99 | HIGH |

The only realistic defection scenario is deliberate exclusion from negotiations, which is strategically irrational for the government to do.

### EL: conditional rule

Enhedslisten's voting pattern reveals a clean conditional rule: vote FOR when included in negotiations, vote AGAINST when excluded. Before 2012, EL had never voted FOR a finanslov in its history.

Complete record:
- **FL12: FOR** (first-ever; passed with 109 for, only LA's 5 abstaining)
- **FL13: FOR** (despite declaring itself "no longer stoetteparti" over the June 2012 tax reform; hovedbestyrelse approved 15-9)
- **FL14: AGAINST** (Thorning government cut EL out and made a deal with V+KF instead)
- **FL15: FOR** (jointly with SF after reconciliation)
- **FL20, FL21, FL22: all FOR** (Frederiksen I era)
- **FL23, FL25: both AGAINST** (SVM era, from opposition)

The FL14 episode is the single most informative data point. When the government chose bourgeois partners over EL, EL voted against -- but the government survived on V+KF votes. This demonstrates that EL's defection is a credible threat that can be absorbed if alternative partners exist.

Internal EL dynamics add noise: the hovedbestyrelse has approved deals with margins as thin as 15-9 (FL13), and roughly one-third voted against the FL15 deal internally.

| Parameter | Value | Confidence |
|-----------|-------|------------|
| P(EL votes FOR \| EL is forstaelsespapir partner and included) | 0.92-0.95 | HIGH |
| P(EL votes FOR \| EL is excluded from negotiations) | 0.02-0.05 | HIGH |

The approximately 5-8% defection probability captures internal party dynamics and potential exclusion scenarios.

### DF: 10-year perfect loyalty (FL02-FL11)

DF voted FOR every single finanslov from FL02 through FL11 -- a ten-year streak supporting VK governments without a written agreement. The arrangement was explicitly transactional: budget votes in exchange for immigration restrictions, the aeldrecheck, and law-and-order measures.

No source records a serious threat by DF to withhold support from any VK finanslov during this entire period. The only near-crisis involved a Venstre member, not DF.

| Parameter | Value | Confidence |
|-----------|-------|------------|
| P(DF votes FOR \| DF is stoetteparti for blue government with immigration concessions) | 0.97-0.99 | HIGH |

### KF: finanslovsnormen convention

Denmark has maintained a "finanslovsnormen" since 1921: the four old responsible parties (S, V, KF, RV) vote FOR the final finanslov at third reading even from opposition. KF broke this norm only three times (1925, 1929, 1976). This means KF routinely votes FOR S-led finanslove at third reading, but this carries zero policy content.

The meaningful question is whether KF joins a finanslovsaftale (budget agreement) with a pure S-led government. The answer is: never in the post-war period. KF's recent FL2024 and FL2026 agreements were with SVM, which includes Venstre.

| Parameter | Value | Confidence |
|-----------|-------|------------|
| P(KF votes FOR at 3rd reading \| any government) | ~0.95 | HIGH |
| P(KF joins finanslovsaftale with pure S-led government) | 0.05-0.15 | MEDIUM |

Under Mona Juul, KF has exhibited strategic ambiguity but stated she would "loebe vaek rimelig hurtigt" from a midterregering with Frederiksen.

### BP: limited record

Lars Boje Mathiesen's one-man Folketing operation has a limited but directionally clear voting record. On the June 2025 citizenship-stripping vote, BP voted with DD and DF but against V, LA, and KF -- positioned with the hardline immigration right, not the blue mainstream.

| Parameter | Value | Confidence |
|-----------|-------|------------|
| P(BP votes with blue bloc on PM designation) | ~0.98 | MEDIUM |
| P(BP votes FOR a blue finanslov) | 0.75-0.90 | MEDIUM |

Defection risk on insufficient immigration hardlining.

---

## 2. Historical government-type frequency corrections

The simulator's historical government-type frequencies contained critical errors. Verified against the complete list of 38 post-1945 Danish governments:

| Configuration | Model claimed | Verified count | Correction factor |
|--------------|--------------|----------------|-------------------|
| S+SF (without RV) | 3 | **0** | Model set to 0. SF has been in government exactly once (Thorning I), and that included RV. |
| S+RV+SF | 5 | **1** | Only Thorning-Schmidt I (Oct 2011-Feb 2014). Model overstated 5x. |
| S alone | 8 | **7** (by distinct PM tenures; 11 by distinct cabinets) | Roughly correct depending on counting methodology. |
| V+KF+LA (VLAK) | 3 | **1** | Only Loekke III (Nov 2016-June 2019). LA entered government for the first and only time in 2016. |

The S+SF-without-RV error is the most consequential: it may lead to overestimating the probability of an S+SF coalition forming. The configuration has zero historical precedent.

---

## 3. Kongerunde formateur probability (pBlueFormateur)

### Historical base rate

Since 1972, approximately eight major kongerunder have followed elections or PM resignations. The sitting PM loses the formateur mandate only when the parliamentary situation has unambiguously shifted against them.

Cases where the sitting PM did NOT receive the first formateur mandate: 1975 (Hartling; Speaker appointed as neutral forhandlingsleder), 1982 (Joergensen; majority pointed directly to Schlueter), 1988 (Schlueter; four rounds with three different forhandlingsledere), 1993 (Schlueter; resigned over Tamil affair), 2011 (Loekke; clear red majority), 2015 (Thorning-Schmidt; clear blue majority).

No post-war kongerunde has produced a PM from the side with fewer mandates pointing to them. The probability that the process itself flips the outcome is estimated at <5% conditional on the mandate distribution being ambiguous.

### Conditional probabilities by scenario

| Scenario | Recommended pBlueFormateur | Confidence |
|----------|---------------------------|------------|
| Red bloc >= 90 (M irrelevant) | 0.02 | High |
| Red 85-89, M points to Frederiksen | 0.05 | High |
| Red 85-89, M points to self/neutral | 0.15 | Medium |
| Red 85-89, M points to TLP | 0.35 | Medium |
| Neither bloc >= 90, M + blue >= 90 (excl. DF) | 0.55 | Medium-Low |
| Blue bloc >= 90 (M irrelevant) | 0.95 | High |

The historical base rate for "contested" kongerunder (where the first forhandlingsleder was not the obvious winner or the sitting PM) is approximately 2 out of 8 post-1972 formations (~25%), but both cases (1975, 1988) ultimately resolved in the direction the parliamentary arithmetic suggested.

---

## 4. SF demand survival probabilities

### Base rate calculation from campaign demands vs. outcomes

| Demand type | Cases examined | Substantially met | Base rate |
|-------------|---------------|-------------------|-----------|
| Structural/positional (government seats, specific portfolios, coalition partner veto) | ~7 | ~3 | **~43%** |
| Policy demands (legislative targets, specific reforms) | ~7 | ~5 | **~71%** |
| Combined | ~14 | ~8 | **~57%** |

Critical distinction: positional demands dissolve at roughly twice the rate of policy demands.

### Key precedents

**2011 -- The cautionary catastrophe.** SF obtained 6 ministerial posts in the SRSF coalition but abandoned its signature demands (millionaerskat, betalingsring, oeremaerket barsel). Suffered internal crisis leading to party exit from government (January 2014) and near-extinction at 4.2% in 2015.

**2019 -- The pragmatic retreat.** Olsen Dyhr demanded a multiparty government but kept an escape hatch open. Frederiksen formed a single-party S government. SF became a support party -- the exact role they had tried to prevent -- though the forstaelsespapir incorporated SF's core policy demands.

**Other party precedents.** RV's 2019 climate demands (70% CO2 reduction): kept. EL's 2022 "pege-paa" threats: walked back. DF's immigration demands: mixed (extracted concessions as stoetteparti but 2026 net-emigration demand has been rejected by TLP).

### 2026-specific calibration

| SF demand | Recommended survival probability | Confidence |
|-----------|--------------------------------|------------|
| Government membership (not support party) | 0.55-0.65 | Medium |
| Finance Ministry specifically | 0.20-0.30 | Medium-Low |
| A senior economic ministry (Finance or Economics) | 0.40-0.50 | Medium |
| Store Bededag restoration | 0.60-0.70 | Medium |
| Minimumsnormeringer, climate policy continuation | 0.80-0.90 | High |
| Rejection of SVM-style cross-bloc coalition | 0.70-0.80 | Medium-High |

The government-membership probability exceeds the historical ~43% base rate because SF's 2026 mandate strength is historically exceptional (approximately 23 mandater, second-largest party) and Olsen Dyhr has a credible commitment device -- the 2011 catastrophe. The Finance Ministry demand should be modeled as a negotiating anchor that might yield a senior economic portfolio rather than Finansministeriet itself.

---

## 5. M orientation modifiers

### Loekke's behavioral characterization

Loekke's career reveals a remarkably consistent behavioral signature: he optimizes for personal/institutional power within the constraints of the moment, with ideology as a distant consideration.

**Four pivots as evidence:**
- **2015:** Formed V-alone with 34 mandates rather than abandon the PM post when DF, LA, and K declined cabinet participation.
- **2016:** Proactively invited LA and K into government (VLAK) to break a deadlock with DF.
- **2019:** Floated a cross-bloc S-V government -- rejected, but planted the seed for Moderaterne.
- **2022:** Engineered the first S-V government in 40+ years. Called it "befrielsens oejeblik."

Expert characterizations converge on one word: pragmatist. Analysis drawing on publicly available expert commentary emphasizes that Loekke excels at prolonging negotiations and exploiting ambiguity -- this is his raison d'etre. His red lines against both DF and formueskat are not symmetric: rejecting DF mathematically eliminates the blue path in most scenarios, while rejecting formueskat is a policy demand that can be negotiated. This asymmetry strongly suggests the revealed-preference structure is: S-led center government with M > blue center government > S-led left government > opposition.

### Recommended modifier values

| Parameter | Current value | Recommended value | Rationale | Confidence |
|-----------|--------------|-------------------|-----------|------------|
| V-leaning, S-led government | 0.4x | **0.55-0.65x** | S-led midterregering is M's most likely destination; SVM precedent | Medium-High |
| V-leaning, blue-led government | 1.5x | **0.7-0.9x** | Mathematical barrier binding; DF exclusion eliminates most blue paths | Medium |
| Self (M-centered) | 0.6x | **0.55-0.70x** | Roughly correct; Loekke ambitious but faces institutional resistance | Medium |

**Additional recommended parameter:** Model a "Loekke PM bonus" of approximately 1.3-1.5x applied to any configuration where Loekke personally receives the PM post, regardless of bloc direction. This captures the evidence that his decisions are power-maximizing rather than ideologically driven.

**Critical missing variable:** Whether TLP and Loekke have conducted secret conversations about a PM deal. If they have, the blue lean could be substantially stronger than public signals suggest.

---

## 6. North Atlantic seat alignment priors

The traditional 3-red-1-blue prior should be weakened significantly for 2026. All four incumbent MFs are departing.

| Configuration | Recommended probability |
|--------------|------------------------|
| 3 red + 1 blue (traditional) | 0.35 |
| 2 red + 1 independent/flexible + 1 blue | 0.30 |
| 2 red + 2 blue | 0.15 |
| 4 red | 0.10 |
| Other configurations | 0.10 |

The Greenlandic Demokraatit seat is the swing variable. The "flexible/transactional" seats should be modeled as responsive to which bloc/PM offers the most on Greenland-specific demands (defense agreement renegotiation, social policy funding, sovereignty issues).

For Faroe Islands: 1 red + 1 blue is baseline/most likely. 0 red + 2 blue is elevated compared to historical baseline due to Skaale departure and Javnadarflokkurin weakness. 2 red is low probability (requires Tjodveldi upset).

---

## 7. Summary parameter table

| Parameter | Type | Central estimate | Range | Confidence |
|-----------|------|-----------------|-------|------------|
| Party vote shares | Continuous, ~normal | Altinget/KMH weighted average | +/-2-2.5pp per party | Medium |
| ALT threshold clearance | Binary stochastic | 60% clears | -- | Low |
| BP threshold clearance | Binary stochastic | 75% clears | -- | Low-Medium |
| NA seat alignment | Categorical distribution | See section 6 | -- | Medium |
| P(SF FOR \| stoetteparti) | Continuous | 0.985 | 0.98-0.99 | High |
| P(EL FOR \| included) | Continuous | 0.935 | 0.92-0.95 | High |
| P(EL FOR \| excluded) | Continuous | 0.035 | 0.02-0.05 | High |
| P(DF FOR \| stoetteparti with immigration) | Continuous | 0.98 | 0.97-0.99 | High |
| P(KF FOR at 3rd reading \| any govt) | Continuous | 0.95 | -- | High |
| P(KF joins S-led finanslovsaftale) | Continuous | 0.10 | 0.05-0.15 | Medium |
| P(BP FOR \| blue finanslov) | Continuous | 0.825 | 0.75-0.90 | Medium |
| pBlueFormateur (baseline) | See section 3 table | -- | -- | -- |
| SF govt membership demand survival | Continuous | 0.60 | 0.55-0.65 | Medium |
| SF Finance Ministry demand survival | Continuous | 0.25 | 0.20-0.30 | Medium-Low |
| M orientation: V-leaning, S-led | Multiplier | 0.60 | 0.55-0.65 | Medium-High |
| M orientation: V-leaning, blue-led | Multiplier | 0.80 | 0.70-0.90 | Medium |
| M orientation: self | Multiplier | 0.625 | 0.55-0.70 | Medium |
| Loekke PM bonus | Multiplier | 1.4 | 1.3-1.5 | Medium |
| Formueskat dropped in negotiations | Binary | High if midterregering; low if pure red | -- | Medium |
| V vs LA relative size | Continuous | LA leads by ~2pp | -- | Low-Medium |
| Polymarket: Frederiksen PM | Probability | 0.80 | -- | Market |
| Polymarket: TLP PM | Probability | 0.145 | -- | Market |
| ValgiDanmark: red majority | Probability | 0.24 | -- | Model |
| ValgiDanmark: blue majority | Probability | 0.01 | -- | Model |

---

## 8. Reference: transition_matrix.csv

The file `transition_matrix.csv` contains voter-flow proportions from the 2022 election to 2026 polling. Rows represent 2022 party of origin; columns represent 2026 party destination. Values are proportions (row sums to approximately 1.0). Party codes: A (S), B (RV), C (KF), F (SF), H (BP), I (LA), M (Moderaterne), O (DF), V (Venstre), AE (DD), OE (EL), AA (ALT), D (Nye Borgerlige, 2022 only), K (Kristendemokraterne, 2022 only), Q (Frie Groenne, 2022 only).

Key flows visible in the matrix:
- M retains only 43% of its 2022 voters; major outflows to S (10%), LA (10%), V (9%), KF (8%), RV (7%)
- DD retains 63% but loses 17% to DF and 6% to LA
- S retains 68% but loses 11% to SF -- the largest single outflow
- SF retains 73% of its own 2022 voters and absorbs 11% of S, 14% of RV, 18% of ALT
- DF retains 66% of 2022 voters and absorbs 8% of BP origin, 10% of DD
