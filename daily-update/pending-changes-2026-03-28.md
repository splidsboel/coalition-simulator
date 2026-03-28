# Pending Parameter Changes — 2026-03-28

These 15 changes were approved in the "Update-coalition-simulator" session
(conversation 7593d57f) after a blind calibration process. Apply all to
`sim5-parties.js`. Each edit adds a dated inline comment.

## Target file: `sim5-parties.js`

---

### 1. M globalHarshness: 0.24 → 0.32

Find in the M party block:
```
globalHarshness: 0.24,
```
Replace with:
```
// UPDATE 2026-03-28: raised to 0.32. Blind calibration reveals Løkke's specific vetoes create effective rigidity despite general flexibility.
globalHarshness: 0.32,
```

### 2. M→SF inGov: 0.68 → 0.52

In M's `acceptability` object, under `SF`:
```
inGov: 0.68,
```
Replace with:
```
inGov: 0.52,  // UPDATE 2026-03-28: blind calibration — highest policy distance among potential partners
```

### 3. M→V inGov: 0.75 → 0.62

In M's `acceptability` object, under `V`:
```
inGov: 0.75,
```
Replace with:
```
inGov: 0.62,  // UPDATE 2026-03-28: blind calibration — personal rivalry from V-M split
```

### 4. M→EL asSupport: 0.42 → 0.18

In M's `acceptability` object, under `EL`:
```
asSupport: 0.42,
```
Replace with:
```
asSupport: 0.18,  // UPDATE 2026-03-28: blind calibration — Løkke's "vippe EL ud" strategy; formal EL support significantly harder than informal tolerance
```

### 5. M→LA inGov: 0.74 → 0.45

In M's `acceptability` object, under `LA`:
```
inGov: 0.74,
```
Replace with:
```
inGov: 0.45,  // UPDATE 2026-03-28: blind calibration — significant ideological gap (LA's libertarian economics vs M's pragmatic centrism)
```

### 6. M→EL tolerateInGov: 0.35 → 0.30

In M's `acceptability` object, under `EL`:
```
tolerateInGov: 0.35,
```
Replace with:
```
tolerateInGov: 0.30,  // UPDATE 2026-03-28: lowered — M clearly doesn't want EL involvement
```

### 7. RV→M inGov: 0.84 → 0.72

In RV's `acceptability` object, under `M`:
```
inGov: 0.84,
```
Replace with:
```
inGov: 0.72,  // UPDATE 2026-03-28: blind calibration
```

### 8. RV→KF inGov: 0.18 → 0.42

In RV's `acceptability` object, under `KF`:
```
inGov: 0.18,
```
Replace with:
```
inGov: 0.42,  // UPDATE 2026-03-28: blind calibration
```

### 9. SF globalHarshness: 0.64 → 0.55

In the SF party block:
```
globalHarshness: 0.64,
```
Replace with:
```
globalHarshness: 0.55,  // UPDATE 2026-03-28: blind calibration
```

### 10. SF demandGov: false → true

In the SF party block:
```
demandGov: false,
```
Replace with:
```
demandGov: true,  // UPDATE 2026-03-28: SF's explicit no-confidence threat
```

### 11. RV participationPref

In RV's `participationPref` object, change three values. Add a comment before the object:
```
// UPDATE 2026-03-28: blind calibration — RV strongly prefers government
```

- `government: 0.78` → `government: 0.88`
- `opposition: 0.12` → `opposition: 0.04`
- `loose: 0.08` → `loose: 0.06`

### 12. KF participationPref

In KF's `participationPref` object, change two values. Add a comment before the object:
```
// UPDATE 2026-03-28: blind calibration — KF more opposition-leaning
```

- `government: 0.70` → `government: 0.55`
- `opposition: 0.10` → `opposition: 0.25`

### 13. KF→S inGov: 0.43 → 0.35

In KF's `acceptability` object, under `S`:
```
inGov: 0.43,
```
Replace with:
```
inGov: 0.35,  // UPDATE 2026-03-28: blind calibration
```

### 14. EL globalHarshness: 0.64 → 0.56

In the EL party block:
```
globalHarshness: 0.64,
```
Replace with:
```
globalHarshness: 0.56,  // UPDATE 2026-03-28: blind calibration
```

### 15. ALT globalHarshness: 0.53 → 0.48

In the ALT party block:
```
globalHarshness: 0.53,
```
Replace with:
```
globalHarshness: 0.48,  // UPDATE 2026-03-28: blind calibration
```

---

## Open question (NOT yet approved)

M→EL `tolerateInGov` at 0.30 — user questioned whether this is still too high given M's clear opposition to EL involvement. Consider lowering further if instructed.

## Post-edit workflow

After applying all 15 changes:
1. Re-run the simulation
2. Generate a new timeline data point
3. Update the inline `TIMELINE_DATA` in `index.html`
4. Commit and push
