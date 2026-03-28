# Daily Coalition Formation Research Brief

Date: {DATE}

## Task

You are monitoring the Danish government formation process following the
24 March 2026 election. Produce a research brief covering developments
in the last 24 hours that could affect which government forms.

This brief will be read by an AI agent that translates findings into
model parameter changes. You do NOT need to propose specific numeric
values — focus on what happened, who said what, and what it means for
coalition dynamics.

## Sources

Search for direct quotes and official statements from:
- DR (dr.dk) — live blog, Debatten, Genstart
- TV2 (nyheder.tv2.dk) — political analysis
- Altinget (altinget.dk) — insider reporting
- Information, Berlingske, Politiken — commentary
- Party press conferences and social media
- Ritzau wire service

## What to cover

For each significant development, report:

1. **What happened** — the event, statement, or meeting
2. **Direct quote** — verbatim quote with source attribution
3. **Coalition impact** — which coalitions become more or less likely, and why

Focus on:
- **Any statements by party leaders or members** relevant to
  negotiations — media interviews, social media posts, press
  scrums, TV appearances. Most days the signal is not a formal
  event but a party leader saying something slightly new to a
  journalist that reveals their negotiation posture.
- Bilateral meetings between party leaders and their tone/outcome
- Policy concessions or hardened red lines
- Signals about which parties are willing to govern together
- Shifts in negotiation posture (more/less flexible)
- Commentator analysis of what the signals mean
- Any formateur updates (mandate returned, new kongerunde, etc.)

## Party and coalition reference

**Parties (12 + 4 NA seats = 179 total, 90 for majority):**

| Party | ID | Seats | Bloc | Key person |
|-------|-----|-------|------|------------|
| Socialdemokratiet | S | 38 | Red | Mette Frederiksen (formateur) |
| SF | SF | 20 | Red | Pia Olsen Dyhr |
| Venstre | V | 18 | Blue | Troels Lund Poulsen |
| Dansk Folkeparti | DF | 16 | Blue | Morten Messerschmidt |
| Liberal Alliance | LA | 16 | Blue | Alex Vanopslagh |
| Moderaterne | M | 14 | Swing | Lars Løkke Rasmussen |
| Konservative | KF | 13 | Blue | Mona Juul |
| Enhedslisten | EL | 11 | Red | Pelle Dragsted |
| Danmarksdemokraterne | DD | 10 | Blue | Inger Støjberg |
| Radikale Venstre | RV | 10 | Red | Martin Lidegaard |
| Alternativet | ALT | 5 | Red | Franciska Rosenkilde |
| Borgernes Parti | BP | 4 | Blue | Lars Boje Mathiesen |

**Most likely coalitions (current model output):**

| Coalition | ~Pct | Seats | Key dependency |
|-----------|------|-------|----------------|
| S+RV+SF | ~35% | 68 | EL external support, M not blocking |
| S+M+RV+SF | ~27% | 82 | SF-M mutual acceptance |
| S+M+SF | ~15% | 72 | SF-M acceptance, EL support |
| S+M+RV | ~6% | 62 | EL support |
| V+KF+LA+M | ~6% | 61 | DF/DD abstention, M pursues blue |
| S+SF | ~2% | 58 | Cross-bloc budget rescue |

**Key model variables (what the analyst will be calibrating):**

- **Løkkes orientering** (0-100%): probability M pursues blue coalition
  vs. cooperating with S. Currently 30%. The single most consequential
  variable — when M pursues blue, M blocks S-led coalitions and supports
  blue.
- **SF↔M bilateral** (0-1): will SF and M accept each other in
  government? Currently SF→M=0.72, M→SF=0.68. Gates whether S+M+RV+SF
  can form.
- **Party harshness** (0-1): overall negotiation rigidity per party.
  Higher = harder to reach deals.
- **Policy positions**: each party has ideal/floor/weight on 11
  dimensions (wealth tax, climate, immigration, pension, EU conventions,
  etc.). Changes when parties signal concessions or hardened demands.
- **Bilateral relationships**: each party has acceptance values toward
  every other party for governing together, tolerating from outside,
  and accepting as PM.

## What NOT to do

- Do NOT invent developments. If nothing happened, say "no significant
  developments."
- Do NOT speculate beyond what sources report.
- Do NOT propose specific numeric parameter changes — that's the
  analyst's job.
- Focus on EVIDENCE: quotes, actions, meetings. Not vibes.

## Output structure

Use this structure:

```
# Research Brief: {DATE}

## Summary
One paragraph overview of the day.

## Developments

### 1. [Title of development]
**What:** ...
**Quote:** "..." — Source, date
**Coalition impact:** ...

### 2. [Title of development]
...

## Formation stage
Current stage: kongerunde / sættemøder / forhandlinger / aftaleudkast

## Key signals to watch
What should the analyst monitor next?
```
