# Danish Coalition Formation Simulator

Monte Carlo sensitivity analysis for the 2026 Danish general election: which parameters are most decisive for PM identity and government composition?

## Quick start

```bash
git clone https://github.com/chdausgaard/coalition-simulator.git
cd coalition-simulator
node sim3.js '{}' 1000          # baseline, 1000 iterations
./sweep.sh 6 5000               # full 245-config sweep, 6 workers
```

Requires Node.js (no external dependencies).

## What this does

The simulator models government formation after a Danish general election. It draws correlated mandate distributions via Box-Muller sampling, evaluates 11 enumerated government packages (9 S-led, 2 blue-led), and scores each on legislative viability. The binding constraint is whether a government can pass a budget (finanslov), computed analytically via dynamic programming over all 175 seats. Confidence survival is retained as a permissive pre-filter.

The model sweeps behavioral and structural parameters -- M's directional orientation, blue bloc mandate levels, polling bias, policy flexibility, Frederiksen's coalition preferences -- across 245 configurations. The goal is not prediction but understanding: identifying which factors actually move the needle on PM identity versus those that merely reshape coalition composition.

The formateur protocol gives Frederiksen (sitting PM) structural first-mover advantage: she evaluates all S-led packages before any blue candidate gets a turn. This mirrors Danish constitutional convention, where the sitting PM has the first attempt at forming a government.

## Key findings

1. **Baseline dominance.** Frederiksen's PM probability is approximately 97% under current polling. S-led governments form in the vast majority of iterations.

2. **Two parameters crack the baseline.** Lokke demanding the PM post (mDemandPM) drops Frederiksen to ~83%. A blue mandate surge (V=22, LA=22, KF=14) drops her to ~87%. No other single parameter moves her below 90%.

3. **Multiplicative interaction.** These factors interact: mDemandPM + blue mandate surge + contested formateur (pBlueFormateur=0.2) together drop Frederiksen to ~54%, far below any single effect.

4. **M's direction reshapes coalitions, not PM identity.** Whether M leans red, blue, or demands the PM post for itself barely affects who becomes PM -- but it dramatically changes which coalition forms (S+SF vs. S+M vs. S+SF+M).

5. **The prediction market price.** Polymarket's ~80% Frederiksen price is consistent with the interaction space, specifically scenarios where Lokke demands PM and blue parties outperform polls. The baseline model alone cannot produce this price.

## Interactive dashboard

A self-contained HTML dashboard is available at:

```
https://chdausgaard.github.io/coalition-simulator/results/
```

The dashboard visualizes sweep results, phase transitions, and interaction effects.

## Project structure

```
sim3.js              Main simulator
sim3-parties.js      Party definitions, mandate parameters, budget-vote functions
sim3-packages.js     Government packages, platform grid, coherence constraints
sim3-spec.md         Full specification (~1400 lines)
sweep.sh             Parallel parameter sweep (245 configurations)
analyze.js           Sweep result analysis
results/             Output: JSONL sweep data, HTML dashboards
research/            Background documents (constitutional handbook,
                     expert analysis, calibration notes, transition matrices)
```

## Configuration

The simulator accepts a JSON configuration object as its first argument. The second argument is the number of Monte Carlo iterations.

```bash
# Baseline (all defaults)
node sim3.js '{}' 5000

# M demands the PM post
node sim3.js '{"cfg":{"mDemandPM":true}}' 5000

# Blue mandate surge
node sim3.js '{"mandates":{"V":22,"LA":22,"KF":14}}' 5000

# Combined: M demands PM + blue surge
node sim3.js '{"cfg":{"mDemandPM":true},"mandates":{"V":22,"LA":22,"KF":14}}' 5000
```

### Key configuration parameters

The JSON object supports three top-level keys:

| Key | Description |
|---|---|
| `cfg` | Behavioral and scoring parameters |
| `mandates` | Override baseline mandate means for specific parties |
| `sweep` | Sweepable ranges for stochastic parameters |

Selected `cfg` options:

| Parameter | Default | Description |
|---|---|---|
| `mPmPref` | `"S"` | M's preferred PM (`"S"`, `"V"`, or `"M"`) |
| `mDemandPM` | `false` | M refuses coalitions where it is not the PM party |
| `redPreference` | `0.5` | Frederiksen's preference weight for red vs. broad coalitions (0-1) |
| `flexibility` | `0.0` | Shifts party budget-vote draws toward flexibility (+) or rigidity (-) |
| `viabilityThreshold` | `0.5` | Minimum P(budget passage) for a package to be viable |
| `blocBiasBlue` | `0.0` | Systematic polling bias added to blue bloc mandates |
| `blocBiasRed` | `0.0` | Systematic polling bias added to red bloc mandates |
| `pBlueFormateur` | `0.0` | Probability that a blue leader gets formateur rights directly |
| `distPenalty` | `1.5` | Ideology distance penalty in package scoring |
| `sizePenalty` | `0.08` | Penalty per excess seat beyond minimum winning |

See `sim3-spec.md` for the full parameter list and behavioral model.

## Running the sweep

```bash
./sweep.sh [WORKERS] [N]
```

- `WORKERS`: number of parallel processes (default: 6)
- `N`: iterations per configuration (default: 5000)

The sweep runs 245 configurations covering main effects, two-way interactions, three-way interactions, and phase transition probes. Output is a single JSONL file in `results/`.

Analyze results with:

```bash
node analyze.js results/sweep-TIMESTAMP.jsonl
```

This produces a summary table, flags configurations where Frederiksen's PM probability drops below threshold, detects interaction effects, and reports coalition composition shifts.

## Research

The `research/` directory contains background documents used during model calibration:

- Danish government formation constitutional handbook
- Expert commentary and analysis
- Calibration notes against historical transitions
- Transition probability matrices

## License

MIT
