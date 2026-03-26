# Overnight Sweep Analysis

Generated: 2026-03-25T21:48:42.387Z

## Phase 1: 1D Sweeps

### flexibility (-0.3 to 0.5)
- PM(S) range: 82.8% to 95.6%
- No-government range: 0.0% to 0.0%
- Distinct top coalitions: S+RV+SF

### redPreference (0 to 1)
- PM(S) range: 85.2% to 93.2%
- No-government range: 0.0% to 0.0%
- Distinct top coalitions: S+M+RV, S+RV+SF

### viabilityThreshold (0.3 to 0.95)
- PM(S) range: 40.0% to 97.6%
- No-government range: 0.0% to 22.4%
- Distinct top coalitions: V+KF, S+RV+SF, S+M+SF, S+M+RV+SF

### passageExponent (0.5 to 4)
- PM(S) range: 86.0% to 92.0%
- No-government range: 0.0% to 0.0%
- Distinct top coalitions: S+RV+SF

### voteSensitivity (0.5 to 10)
- PM(S) range: 87.2% to 100.0%
- No-government range: 0.0% to 0.0%
- Distinct top coalitions: S+RV+SF

### distPenalty (0.3 to 4)
- PM(S) range: 85.2% to 92.4%
- No-government range: 0.0% to 0.0%
- Distinct top coalitions: S+RV+SF

### formateurPull (0 to 1.5)
- PM(S) range: 85.6% to 94.0%
- No-government range: 0.0% to 0.0%
- Distinct top coalitions: S+RV+SF

### floorThreshold (0.2 to 1)
- PM(S) range: 2.4% to 92.8%
- No-government range: 0.0% to 96.0%
- Distinct top coalitions: S+KF+V, V+SF, V+DD+SF, V+RV, S+RV+SF


## Phase 2: 2D Heatmaps

### flexibility_x_redPreference
- Grid: 15 x 15 = 225 points
- Distinct top coalitions: 2 (S+RV+SF, S+M+RV)
- Max no-government: 0.0%

### flexibility_x_viabilityThreshold
- Grid: 15 x 15 = 225 points
- Distinct top coalitions: 4 (V+KF, S+RV+SF, S+M+SF, S+M+RV+SF)
- Max no-government: 50.0%

### flexibility_x_passageExponent
- Grid: 15 x 15 = 225 points
- Distinct top coalitions: 1 (S+RV+SF)
- Max no-government: 0.0%

### redPreference_x_mPmPref
- Grid: 15 x 4 = 60 points
- Distinct top coalitions: 2 (S+M+RV, S+RV+SF)
- Max no-government: 0.0%

### distPenalty_x_passageExponent
- Grid: 15 x 15 = 225 points
- Distinct top coalitions: 1 (S+RV+SF)
- Max no-government: 0.7%

### voteSensitivity_x_flexibility
- Grid: 15 x 15 = 225 points
- Distinct top coalitions: 1 (S+RV+SF)
- Max no-government: 0.0%

### formateurPull_x_redPreference
- Grid: 15 x 15 = 225 points
- Distinct top coalitions: 2 (S+M+RV, S+RV+SF)
- Max no-government: 0.0%

### viabilityThreshold_x_maxFormationRounds
- Grid: 15 x 5 = 75 points
- Distinct top coalitions: 7 (V+KF, V+SF, S+RV+SF, none, S+M+SF, V+RV+SF, S+M+RV+SF)
- Max no-government: 100.0%

### flexibility_x_formateurOverride
- Grid: 15 x 3 = 45 points
- Distinct top coalitions: 1 (S+RV+SF)
- Max no-government: 0.0%


## Phase 3: Named Scenarios

| Scenario | PM(S) | PM(V) | PM(M) | Top Coalition | Top% | NoGov% |
|---|---|---|---|---|---|---|
| Løkke kingmaker hard | 87.6% | 12.4% | 0% | S+RV+SF | 87.2% | 0% |
| Løkke yields | 88.2% | 11.8% | 0% | S+RV+SF | 83.4% | 0% |
| Maximum gridlock | 0% | 0% | 0% | none | 0% | 100% |
| SF blocks | 92.6% | 7.4% | 0% | S+RV+SF | 87.8% | 0% |
| Blue surprise | 62.6% | 37.4% | 0% | S+RV+SF | 50.6% | 0% |
| Grand compromise | 88.2% | 11.8% | 0% | S+RV+SF | 51.8% | 0% |
| Historical precedent | 90.8% | 9.2% | 0% | S+RV+SF | 78.8% | 0% |
| Pure position-driven | 86.6% | 13.4% | 0% | S+RV+SF | 53% | 0% |
| Pure power-driven | 100% | 0% | 0% | S+RV+SF | 61% | 0% |
| Frederiksen full red | 90.6% | 9.4% | 0% | S+RV+SF | 86.4% | 0% |
| M doesn't demand gov | 86.8% | 13.2% | 0% | S+RV+SF | 81.8% | 0% |
| mPmPref=S_formateurOverride=endogenous | 91% | 9% | 0% | S+RV+SF | 77.8% | 0% |
| mPmPref=S_formateurOverride=red | 92.4% | 7.6% | 0% | S+RV+SF | 79.6% | 0% |
| mPmPref=S_formateurOverride=blue | 65.2% | 34.8% | 0% | S+RV+SF | 54.2% | 0% |
| mPmPref=neutral_formateurOverride=endogenous | 90.4% | 9.6% | 0% | S+RV+SF | 74.6% | 0% |
| mPmPref=neutral_formateurOverride=red | 92.6% | 7.4% | 0% | S+RV+SF | 78.4% | 0% |
| mPmPref=neutral_formateurOverride=blue | 66% | 34% | 0% | S+RV+SF | 55.4% | 0% |
| mPmPref=V_formateurOverride=endogenous | 80.2% | 19.8% | 0% | S+RV+SF | 67.6% | 0% |
| mPmPref=V_formateurOverride=red | 93% | 7% | 0% | S+RV+SF | 78.8% | 0% |
| mPmPref=V_formateurOverride=blue | 62.6% | 37.4% | 0% | S+RV+SF | 55% | 0% |
| mPmPref=M_formateurOverride=endogenous | 85.6% | 14.4% | 0% | S+RV+SF | 72% | 0% |
| mPmPref=M_formateurOverride=red | 94.4% | 5.6% | 0% | S+RV+SF | 78% | 0% |
| mPmPref=M_formateurOverride=blue | 66.6% | 33.4% | 0% | S+RV+SF | 57.2% | 0% |


## Phase 4: Discovery

### Phase Transitions
| Parameter | From Value | From Coalition | To Value | To Coalition |
|---|---|---|---|---|
| redPreference | 0.068966 | S+M+RV (41.2%) | 0.103448 | S+RV+SF (38%) |
| viabilityThreshold | 0.3 | V+KF (50.4%) | 0.322414 | S+RV+SF (62.4%) |
| viabilityThreshold | 0.860345 | S+RV+SF (52%) | 0.882759 | S+M+SF (59.6%) |
| viabilityThreshold | 0.927586 | S+M+SF (39.2%) | 0.95 | S+M+RV+SF (53.2%) |
| floorThreshold | 0.2 | S+KF+V (2%) | 0.227586 | V+SF (10.8%) |
| floorThreshold | 0.282759 | V+SF (12.4%) | 0.310345 | V+DD+SF (9.6%) |
| floorThreshold | 0.310345 | V+DD+SF (9.6%) | 0.337931 | V+SF (10.8%) |
| floorThreshold | 0.42069 | V+SF (12.4%) | 0.448276 | V+RV (8.8%) |
| floorThreshold | 0.448276 | V+RV (8.8%) | 0.475862 | S+RV+SF (88.4%) |

### Tipping Points
| Parameter | Between | Delta PM(S) | Delta NoGov | Delta TopPct |
|---|---|---|---|---|
| viabilityThreshold | 0.3 - 0.322414 | 38.8pp | 0pp | 12pp |
| viabilityThreshold | 0.837931 - 0.860345 | 0.8pp | 0.8pp | 30.8pp |
| viabilityThreshold | 0.905172 - 0.927586 | 5.6pp | 7.6pp | 26.4pp |
| viabilityThreshold | 0.927586 - 0.95 | 11.6pp | 11.2pp | 14pp |
| distPenalty | 1.703448 - 1.831034 | 3.2pp | 0pp | 20pp |
| floorThreshold | 0.2 - 0.227586 | 1.2pp | 14pp | 8.8pp |
| floorThreshold | 0.393103 - 0.42069 | 2.4pp | 12pp | 0.4pp |
| floorThreshold | 0.42069 - 0.448276 | 9.6pp | 13.2pp | 3.6pp |
| floorThreshold | 0.448276 - 0.475862 | 74pp | 42.8pp | 79.6pp |
| floorThreshold | 0.531034 - 0.558621 | 0.8pp | 0pp | 14pp |

### Unusual Coalitions (>10%)
| Coalition | Pct | Context |
|---|---|---|
| S+RV+SF | 75.2% | 1D sweep: flexibility |
| S+M+SF | 12% | 1D sweep: flexibility |
| S+M+RV | 52.4% | 1D sweep: redPreference |
| S+RV+SF | 28% | 1D sweep: redPreference |
| S+M+SF | 14% | 1D sweep: redPreference |
| V+KF | 50.4% | 1D sweep: viabilityThreshold |
| S+RV+SF | 34.4% | 1D sweep: viabilityThreshold |
| S+M+SF | 12.4% | 1D sweep: viabilityThreshold |
| S+M+RV+SF | 24.4% | 1D sweep: viabilityThreshold |
| S+KF+M+RV | 11.6% | 1D sweep: viabilityThreshold |
| S+RV+SF | 76.4% | 1D sweep: passageExponent |
| S+M+SF | 12% | 1D sweep: passageExponent |
| S+RV+SF | 82.8% | 1D sweep: voteSensitivity |
| S+M+SF | 14.4% | 1D sweep: voteSensitivity |
| S+RV+SF | 60.4% | 1D sweep: distPenalty |
| S+M+SF | 28% | 1D sweep: distPenalty |
| S+RV+SF | 73.6% | 1D sweep: formateurPull |
| S+M+SF | 12.8% | 1D sweep: formateurPull |
| V+SF | 10.8% | 1D sweep: floorThreshold |
| S+RV+SF | 88.4% | 1D sweep: floorThreshold |
| S+M+SF | 11.2% | 1D sweep: floorThreshold |
| S+RV+SF | 42.67% | 2D heatmap: flexibility_x_redPreference |
| S+M+RV | 40% | 2D heatmap: flexibility_x_redPreference |
| S+M+SF | 10.67% | 2D heatmap: flexibility_x_redPreference |
| V+RV | 11.33% | 2D heatmap: flexibility_x_redPreference |
| V+KF | 60% | 2D heatmap: flexibility_x_viabilityThreshold |
| S+RV+SF | 23.33% | 2D heatmap: flexibility_x_viabilityThreshold |
| S+M+SF | 10.67% | 2D heatmap: flexibility_x_viabilityThreshold |
| S+M+RV+SF | 13.33% | 2D heatmap: flexibility_x_viabilityThreshold |
| S+KF+M+RV | 16% | 2D heatmap: flexibility_x_viabilityThreshold |
| V+SF | 10.67% | 2D heatmap: flexibility_x_viabilityThreshold |
| S+RV+SF | 83.33% | 2D heatmap: flexibility_x_passageExponent |
| S+M+SF | 10.67% | 2D heatmap: flexibility_x_passageExponent |
| V+SF | 10.67% | 2D heatmap: flexibility_x_passageExponent |
| S+M+RV | 52.67% | 2D heatmap: redPreference_x_mPmPref |
| S+RV+SF | 27.33% | 2D heatmap: redPreference_x_mPmPref |
| S+M+SF | 13.33% | 2D heatmap: redPreference_x_mPmPref |
| S+RV+SF | 62% | 2D heatmap: distPenalty_x_passageExponent |
| S+M+SF | 30% | 2D heatmap: distPenalty_x_passageExponent |
| S+RV+SF | 80.67% | 2D heatmap: voteSensitivity_x_flexibility |
| S+M+SF | 15.33% | 2D heatmap: voteSensitivity_x_flexibility |
| V+SF | 10.67% | 2D heatmap: voteSensitivity_x_flexibility |
| S+M+RV | 54.67% | 2D heatmap: formateurPull_x_redPreference |
| S+RV+SF | 24% | 2D heatmap: formateurPull_x_redPreference |
| S+M+SF | 11.33% | 2D heatmap: formateurPull_x_redPreference |
| V+KF | 50.67% | 2D heatmap: viabilityThreshold_x_maxFormationRounds |
| S+RV+SF | 27.33% | 2D heatmap: viabilityThreshold_x_maxFormationRounds |
| S+M+SF | 13.33% | 2D heatmap: viabilityThreshold_x_maxFormationRounds |
| S+M+RV+SF | 15.33% | 2D heatmap: viabilityThreshold_x_maxFormationRounds |
| S+KF+M+RV | 15.33% | 2D heatmap: viabilityThreshold_x_maxFormationRounds |
| S+RV+SF | 78% | 2D heatmap: flexibility_x_formateurOverride |
| S+M+SF | 12.67% | 2D heatmap: flexibility_x_formateurOverride |
| V+SF | 10.67% | 2D heatmap: flexibility_x_formateurOverride |
| V+RV | 13.33% | 2D heatmap: flexibility_x_formateurOverride |

### Follow-up Sweeps
**redPreference_transition_1** (phase_transition): 20 points, coalitions: S+M+RV, S+RV+SF
**viabilityThreshold_transition_1** (phase_transition): 20 points, coalitions: V+KF, S+RV+SF
**viabilityThreshold_transition_2** (phase_transition): 20 points, coalitions: S+RV+SF, S+M+SF
**viabilityThreshold_transition_3** (phase_transition): 20 points, coalitions: S+M+SF, S+M+RV+SF
**floorThreshold_transition_1** (phase_transition): 20 points, coalitions: S+KF+V, V+SF
**floorThreshold_transition_2** (phase_transition): 20 points, coalitions: V+SF
**floorThreshold_transition_3** (phase_transition): 20 points, coalitions: V+SF, V+DD+SF
**distPenalty_tipping_1** (tipping_point): 20 points, coalitions: S+RV+SF


---
Total runtime: 1832.8s | Total simulations: 1953

