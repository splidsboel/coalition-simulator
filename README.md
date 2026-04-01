# Danish Coalition Formation Simulator

Interactive post-election coalition explorer for the 2026 Danish general election. Given the actual mandate distribution (where no bloc has a majority), which coalition governments are viable, what would it take to form them, and how likely is each?

**Live dashboard:** [https://chdausgaard.github.io/coalition-simulator/](https://chdausgaard.github.io/coalition-simulator/)

## What this does

The simulator models government formation after the 24 March 2026 election. Users can adjust parties' negotiation positions, policy stances, and behavioral parameters to explore how different assumptions affect coalition probabilities.

Key features:
- **Interactive coalition explorer** — adjust parameters and see results in real time
- **12-dimensional policy model** — parties have positions on wealth tax, climate, immigration, pensions, and 8 other policy areas
- **Directed party relationships** — asymmetric acceptance probabilities between party pairs (e.g., SF accepts M at 65%, but SF→V is near-zero)
- **Two-round formateur protocol** — Round 1: S formateur (certain post-election), Round 2: blue formateur (desperation fallback with lower viability threshold)
- **Bloc voting model** — parties vote as single units (party discipline), representing negotiation outcomes not random per-mandate coin flips
- **Strategic opposition** — blue parties oppose harder when M is excluded from government, to support M's inclusion leverage
- **Governability profiles** — shows which policy areas each coalition can legislate on
- **Daily parameter updates** during government formation, based on public reporting

## Mandate distribution (2026 result)

Red bloc: S(38) + SF(20) + EL(11) + ALT(5) + RV(10) = 84 seats
Blue bloc: V(18) + LA(16) + KF(13) + DD(10) + DF(16) + BP(4) = 77 seats
Swing: M(14)
Neither bloc reaches 88 (majority of 175). M is the kingmaker.

## Quick start

```bash
git clone https://github.com/chdausgaard/coalition-simulator.git
cd coalition-simulator

# Serve locally (needed for Web Worker)
python3 -m http.server 8765
# Open http://localhost:8765/coalition-builder.html

# Or run from command line
node sim5-engine.js    # not directly — use:
node -e "const e = require('./sim5-engine.js'); console.log(JSON.stringify(e.simulate({}, 500)))"
```

Requires Node.js (no external dependencies). The dashboard is a self-contained HTML file with no build step.

## Project structure

```
coalition-builder.html   Interactive dashboard (self-contained HTML)
sim5-parties.js          Party data: positions, relationships, participation prefs
sim5-coalitions.js       Coalition enumeration, platform negotiation
sim5-engine.js           Simulation engine: DP budget passage, scoring, formateur
sim5-sweep.js            Parameter sweep script for sensitivity analysis
sweep-results.json       Pre-computed sweep data (397 simulation points)

daily-update/            Daily calibration pipeline
  research-prompt.md     Prompt template for research agent
  apply-update.js        Script to apply parameter changes from research briefs
  run-daily.sh           Full daily update orchestrator
  historical/            Time series of daily simulation results

research/                Background documents
  party_briefs/          Per-party research briefs (13 parties + NA seats)
  election_2026.md       Election context and mandate arithmetic
  formation_rules.md     Constitutional framework, kongerunde procedure
  calibration.md         Voting records, P(FOR) ranges

sim4-*.js, sim3-*.js     Previous model generations (pre-election)
index.html               Pre-election dashboard (sim3, still live)
post-election.html       Election-night dashboard (sim4)
```

## Model architecture

### Data layer (sim5-parties.js)

Each of the 12 Danish parties has:
- **12 policy positions** with ideal point, floor (minimum acceptable), and weight (0-1 importance)
- **Directed relationships** with every other party: acceptance for governing together, tolerating from outside, accepting as PM
- **Participation preferences**: probability of preferring government, støtteparti (with/without forståelsespapir), or opposition
- **Negotiation harshness** (0-1): overall rigidity in stochastic acceptance draws

### Coalition enumeration (sim5-coalitions.js)

All viable government subsets (1-4 parties, must include PM-eligible member) are enumerated via bitmask. For each, a **negotiated platform** is computed as a weighted centroid of members' ideal positions (mandate share × issue weight), with the formateur getting extra pull. Coalitions where no platform satisfies all members' floors are filtered out.

### Simulation engine (sim5-engine.js)

Per Monte Carlo iteration:
1. **Per-iteration CI variation**: key uncertain parameters (SF↔M relationship, M↔DF relaxation, M's PM preference, viability threshold) are drawn from confidence intervals
2. **Two-round formateur protocol**: Round 1 is S formateur (certain); if S-led formation fails, Round 2 is blue formateur with lower viability threshold (Hartling precedent: governments can form and function via changing majorities even with marginal budget passage odds)
3. **For each candidate coalition**: confidence check → per-party-minimum dyad acceptance → determine support structure (forståelsespapir) → compute P(passage) via bloc voting Monte Carlo → score
4. **Bloc voting**: each non-government party makes a single bloc decision (all mandates FOR, ABSTAIN, or AGAINST) based on bloc alignment, PM acceptance, toleration of government members, participation demand, and strategic opposition
5. **Strategic opposition**: when M demands government but is excluded, blue parties actively oppose to support M's inclusion leverage (they prefer a government WITH M to one without)

### Key parameters

| Parameter | Default | Description |
|---|---|---|
| `mElTolerate` | 0.35 | M's tolerance for EL as external support via forståelsespapir. At 0: M vetoes. The central unknown. |
| `flexibility` | 0 | Global negotiation pressure (-0.3 to +0.5) |
| `redPreference` | 0.5 | Frederiksen's preference for red vs. broad coalitions |
| `mDemandGov` | `true` | M insists on government participation |
| `viabilityThreshold` | 0.70 | Minimum P(negotiation success) for S formateur |

Most parameters are adjustable in the dashboard. Per-iteration CI variation on SF↔M relationship strength, M→EL tolerance, M↔DF relaxation, and viability threshold runs automatically — but is disabled for any parameter the user explicitly sets via slider. See `research/model-spec.md` for full documentation.

## Daily updates

During government formation, parameters are updated daily. Two-step workflow:

1. **Research brief** — run `daily-update/research-prompt.md` through a deep research agent. It produces a narrative report with source citations and coalition impact analysis.

2. **Parameter calibration** — bring the report to Claude Code, which reads it alongside the current model state and proposes specific parameter changes. Review and apply.

Timeline data lives in `daily-update/historical/timeseries.json` (also embedded inline in `index.html` for the Tidslinje tab).

## Previous model generations

- **sim3** (pre-election): Swept over mandate uncertainty with stochastic seat draws. Dashboard at `index.html`.
- **sim4** (election night): Fixed mandates, swept behavioral parameters. Dashboard at `post-election.html`.
- **sim5** (current): Interactive explorer with rich party data, continuous platform negotiation, and live browser simulation.

## License

MIT
