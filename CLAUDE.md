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

## Current output (~N=2000)

S+M+RV+SF ~47%, S+M+SF ~20%, S+RV+SF ~17%, V+KF+LA+M ~8%, NoGov ~4%.

The M-EL forståelsespapir slider is the most consequential parameter.
