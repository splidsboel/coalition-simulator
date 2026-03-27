# Coalition Simulator

Danish government formation model for the 2026 election. Bloc voting, two-round formateur protocol, Monte Carlo simulation.

## Key files

| File | What |
|------|------|
| `research/model-spec.md` | **Start here.** Full architecture, every design decision, all parameters. |
| `sim5-engine.js` | Simulation engine (bloc voting, scoring, formateur protocol) |
| `sim5-parties.js` | Party data (positions, relationships, harshness) |
| `sim5-coalitions.js` | Coalition enumeration and platform negotiation |
| `index.html` | Interactive dashboard (self-contained HTML) |
| `research/calibration.md` | Empirical voting records anchoring P(FOR) values |
| `research/party_briefs/*.md` | Per-party research briefs (13 parties + NA seats) |

## Running

```bash
node -e "const e = require('./sim5-engine.js'); console.log(JSON.stringify(e.simulate({}, 500), null, 2))"
```

## Current output (~N=5000, post 2026-03-26 update)

S+M+RV+SF ~34%, S+RV+SF ~24%, S+M+SF ~19%, S+M+RV ~14%, S+SF ~5%, V+KF+LA+M ~1%.

The SF-M bilateral relationship is the single most consequential parameter (28pp range).

## Daily update pipeline

`daily-update/` contains the parameter update pipeline: research prompt, apply script, timeseries.
See `daily-update/historical/timeseries.json` for the coalition probability timeline.

## Dashboard tabs

- **Resultater**: top 10 coalitions with forståelsespapir split, platform, governability
- **Koalitionsbygger**: click parties to test custom coalitions
- **Tidslinje**: coalition probabilities over time (from daily updates)
- **Hvad påvirker resultatet?**: Sobol sensitivity analysis, response curves
- **Sådan virker modellen**: methodology documentation
