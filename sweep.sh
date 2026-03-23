#!/bin/bash
# Consolidated parameter sweep — all configurations at uniform N
# Supersedes: run-sweep-pass1.sh, run-sweep-pass2.sh,
#   run-sweep-phase-transitions.sh, run-sweep-resume.sh,
#   run-full-sweep.sh, run-full-sweep-v2.sh
#
# Usage: ./sweep.sh [WORKERS] [N]
#   WORKERS: parallel workers (default: 6)
#   N:       iterations per config (default: 5000)
#
# Output: results/sweep-TIMESTAMP.jsonl
set -e
cd "$(dirname "$0")"

WORKERS=${1:-6}
N=${2:-5000}
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
TMPDIR="results/sweep-tmp-${TIMESTAMP}"
OUT="results/sweep-${TIMESTAMP}.jsonl"
mkdir -p "$TMPDIR"

echo "Sweep: N=$N, workers=$WORKERS, $(date)"
echo "Temp dir: $TMPDIR"

# =====================================================================
# All configurations: "label|configJSON" pairs
# 245 total = 191 main effects & interactions + 54 phase transition probes
# =====================================================================
generate_configs() {
  # =================================================================
  # MAIN EFFECTS (Phases 1-13): single-parameter variations
  # =================================================================

  # Phase 1: Baseline + M orientation (4 runs)
  echo 'baseline|{}'
  echo 'M->V|{"cfg":{"mPmPref":"V"}}'
  echo 'M->self|{"cfg":{"mPmPref":"M"}}'
  echo 'M-demands-PM|{"cfg":{"mDemandPM":true}}'

  # Phase 2: Red preference sweep (7 runs)
  for rp in 0.0 0.2 0.35 0.5 0.65 0.8 1.0; do
    echo "redPref=$rp|{\"cfg\":{\"redPreference\":$rp}}"
  done

  # Phase 3: Flexibility sweep (5 runs)
  for fl in -0.4 -0.2 0.0 0.2 0.4; do
    echo "flex=$fl|{\"cfg\":{\"flexibility\":$fl}}"
  done

  # Phase 4: SF budget abstain sweep (5 runs)
  for val in 0.3 0.4 0.5 0.6 0.7; do
    echo "sf-abstain-sm=$val|{\"sweep\":{\"sf_budget_abstain_sm\":[$val]}}"
  done

  # Phase 5: Viability threshold sweep (4 runs)
  for vt in 0.3 0.4 0.5 0.7; do
    echo "viab-threshold=$vt|{\"cfg\":{\"viabilityThreshold\":$vt}}"
  done

  # Phase 6: M substitute P(FOR) sweep (5 runs)
  echo 'm-substitute=[0.05,0.35]|{"sweep":{"m_substitute_pfor_lo":[0.05],"m_substitute_pfor_hi":[0.35]}}'
  echo 'm-substitute=[0.15,0.45]|{"sweep":{"m_substitute_pfor_lo":[0.15],"m_substitute_pfor_hi":[0.45]}}'
  echo 'm-substitute=[0.25,0.55]|{"sweep":{"m_substitute_pfor_lo":[0.25],"m_substitute_pfor_hi":[0.55]}}'
  echo 'm-substitute=[0.35,0.65]|{"sweep":{"m_substitute_pfor_lo":[0.35],"m_substitute_pfor_hi":[0.65]}}'
  echo 'm-substitute=[0.45,0.75]|{"sweep":{"m_substitute_pfor_lo":[0.45],"m_substitute_pfor_hi":[0.75]}}'

  # Phase 7: Scoring parameter sweeps (12 runs)
  for dp in 0.5 1.0 1.5 2.5 3.0; do
    echo "distPenalty=$dp|{\"cfg\":{\"distPenalty\":$dp}}"
  done
  for sp in 0.03 0.08 0.12 0.18; do
    echo "sizePenalty=$sp|{\"cfg\":{\"sizePenalty\":$sp}}"
  done
  for pw in 0.0 0.02 0.05 0.08; do
    echo "precedentWeight=$pw|{\"cfg\":{\"precedentWeight\":$pw}}"
  done

  # Phase 8: Tax weight (3 runs)
  for tw in 1.0 1.08 1.15; do
    echo "tax-weight=$tw|{\"cfg\":{\"taxWeight\":$tw}}"
  done

  # Phase 9: Loekke scenario matrix (9 runs)
  for pref in S V M; do
    echo "baseline+M->$pref|{\"cfg\":{\"mPmPref\":\"$pref\"}}"
  done
  for pref in S V M; do
    echo "red-strong+M->$pref|{\"mandates\":{\"S\":42,\"SF\":25},\"cfg\":{\"mPmPref\":\"$pref\"}}"
  done
  for pref in S V M; do
    echo "blue-strong+M->$pref|{\"mandates\":{\"V\":22,\"LA\":22,\"KF\":14},\"cfg\":{\"mPmPref\":\"$pref\"}}"
  done

  # Phase 10: Scenario archetypes (8 runs)
  echo 'archetype:red-tide|{"mandates":{"S":42,"SF":25},"cfg":{"redPreference":0.8}}'
  echo 'archetype:sf-leverage|{"mandates":{"S":36,"SF":24},"sweep":{"sf_budget_abstain_sm":[0.35]}}'
  echo 'archetype:midter-forced|{"cfg":{"redPreference":0.3,"flexibility":0.2},"sweep":{"m_substitute_pfor_lo":[0.35],"m_substitute_pfor_hi":[0.55]}}'
  echo 'archetype:m-goes-blue|{"cfg":{"mPmPref":"V","redPreference":0.6}}'
  echo 'archetype:knife-edge|{"mandates":{"S":35,"SF":22}}'
  echo 'archetype:broad-compromise|{"cfg":{"redPreference":0.3,"viabilityThreshold":0.7,"flexibility":0.2}}'
  echo 'archetype:blue-surge|{"mandates":{"V":22,"LA":22,"KF":14}}'
  echo 'archetype:historical-2019|{"mandates":{"S":48,"SF":14,"RV":16,"EL":13},"cfg":{"redPreference":0.7}}'

  # Phase 11: Polling bias sweeps (10 runs)
  for bias in -2.0 -1.0 0.0 1.0 2.0; do
    echo "blocBiasBlue=$bias|{\"cfg\":{\"blocBiasBlue\":$bias}}"
  done
  for bias in -2.0 -1.0 0.0 1.0 2.0; do
    echo "blocBiasRed=$bias|{\"cfg\":{\"blocBiasRed\":$bias}}"
  done

  # Phase 12: New sweepable parameter main effects (28 runs)
  for val in 0.25 0.35 0.55 0.75; do
    echo "mPrefV-Sled=$val|{\"cfg\":{\"mPrefV_Sled_modifier\":$val}}"
  done
  for val in 0.9 1.1 1.25 1.5 1.8; do
    echo "mPrefV-blue=$val|{\"cfg\":{\"mPrefV_blue_modifier\":$val}}"
  done
  for val in 0.45 0.6 0.75; do
    echo "mPrefSelf=$val|{\"cfg\":{\"mPrefSelf_modifier\":$val}}"
  done
  for val in 0.65 0.75 0.85 0.90; do
    echo "elAbstain=$val|{\"cfg\":{\"elAbstainShare\":$val}}"
  done
  for val in 0.30 0.45 0.50 0.65; do
    echo "mAbstain=$val|{\"cfg\":{\"mAbstainShare\":$val}}"
  done
  for val in -0.10 0 0.10; do
    echo "naRedShift=$val|{\"cfg\":{\"naRedShift\":$val}}"
  done
  for val in 1.05 1.10 1.15 1.25; do
    echo "mwccFullBonus=$val|{\"cfg\":{\"mwccFullBonus\":$val}}"
  done
  for val in 0.50 0.65 0.70 0.85; do
    echo "elMPenalty=$val|{\"cfg\":{\"elMPenalty\":$val}}"
  done
  for val in 60 70 80; do
    echo "minForVotes=$val|{\"cfg\":{\"minForVotes\":$val}}"
  done

  # Phase 13: Blue formateur sweep (5 runs)
  for val in 0.0 0.10 0.20 0.30 0.40; do
    echo "pBlueFormateur=$val|{\"cfg\":{\"pBlueFormateur\":$val}}"
  done

  # =================================================================
  # INTERACTIONS (Phases 14-27): multi-parameter combinations
  # =================================================================

  # Phase 14: mPmPref x mDemandPM (3 runs)
  echo 'M->V+demandPM|{"cfg":{"mPmPref":"V","mDemandPM":true}}'
  echo 'M->self+demandPM|{"cfg":{"mPmPref":"M","mDemandPM":true}}'
  echo 'M->S+demandPM|{"cfg":{"mPmPref":"S","mDemandPM":true}}'

  # Phase 15: mPmPref x redPreference (9 runs)
  for pref in S V M; do
    for rp in 0.2 0.5 0.8; do
      echo "M->$pref+redPref=$rp|{\"cfg\":{\"mPmPref\":\"$pref\",\"redPreference\":$rp}}"
    done
  done

  # Phase 16: mPmPref x flexibility (6 runs)
  for pref in S V M; do
    for fl in -0.3 0.3; do
      echo "M->$pref+flex=$fl|{\"cfg\":{\"mPmPref\":\"$pref\",\"flexibility\":$fl}}"
    done
  done

  # Phase 17: pBlueFormateur x mandates (8 runs)
  for pbf in 0.2 0.3; do
    echo "pBF=$pbf+baseline|{\"cfg\":{\"pBlueFormateur\":$pbf}}"
    echo "pBF=$pbf+knife-edge|{\"mandates\":{\"S\":35,\"SF\":22},\"cfg\":{\"pBlueFormateur\":$pbf}}"
    echo "pBF=$pbf+blue-strong|{\"mandates\":{\"V\":22,\"LA\":22,\"KF\":14},\"cfg\":{\"pBlueFormateur\":$pbf}}"
    echo "pBF=$pbf+red-strong|{\"mandates\":{\"S\":42,\"SF\":25},\"cfg\":{\"pBlueFormateur\":$pbf}}"
  done

  # Phase 18: pBlueFormateur x mPmPref (6 runs)
  for pref in S V M; do
    echo "pBF=0.2+M->$pref|{\"cfg\":{\"pBlueFormateur\":0.2,\"mPmPref\":\"$pref\"}}"
  done
  for pref in S V M; do
    echo "pBF=0.3+M->$pref|{\"cfg\":{\"pBlueFormateur\":0.3,\"mPmPref\":\"$pref\"}}"
  done

  # Phase 19: pBlueFormateur x mDemandPM (4 runs)
  for pbf in 0.2 0.3; do
    echo "pBF=$pbf+demandPM=false|{\"cfg\":{\"pBlueFormateur\":$pbf,\"mDemandPM\":false}}"
    echo "pBF=$pbf+demandPM=true|{\"cfg\":{\"pBlueFormateur\":$pbf,\"mDemandPM\":true}}"
  done

  # Phase 20: sf_abstain x redPreference (4 runs)
  for sa in 0.3 0.7; do
    for rp in 0.3 0.7; do
      echo "sf-abstain=$sa+redPref=$rp|{\"cfg\":{\"redPreference\":$rp},\"sweep\":{\"sf_budget_abstain_sm\":[$sa]}}"
    done
  done

  # Phase 21: elAbstainShare x mPmPref (4 runs)
  for ea in 0.65 0.90; do
    for pref in S V; do
      echo "elAbstain=$ea+M->$pref|{\"cfg\":{\"elAbstainShare\":$ea,\"mPmPref\":\"$pref\"}}"
    done
  done

  # Phase 22: elMPenalty x mPmPref (4 runs)
  for ep in 0.50 0.85; do
    for pref in S V; do
      echo "elMPenalty=$ep+M->$pref|{\"cfg\":{\"elMPenalty\":$ep,\"mPmPref\":\"$pref\"}}"
    done
  done

  # Phase 23: flexibility x viabilityThreshold (4 runs)
  for fl in -0.3 0.3; do
    for vt in 0.3 0.7; do
      echo "flex=$fl+viab=$vt|{\"cfg\":{\"flexibility\":$fl,\"viabilityThreshold\":$vt}}"
    done
  done

  # Phase 24: M modifier sensitivity under V-lean (5 runs)
  # Note: sled=0.55+blue=1.25 appears in both loops; emit it once only.
  for sled in 0.35 0.55 0.75; do
    echo "V-lean:Sled=$sled+blue=1.25|{\"cfg\":{\"mPmPref\":\"V\",\"mPrefV_Sled_modifier\":$sled,\"mPrefV_blue_modifier\":1.25}}"
  done
  for blue in 0.9 1.6; do
    echo "V-lean:Sled=0.55+blue=$blue|{\"cfg\":{\"mPmPref\":\"V\",\"mPrefV_Sled_modifier\":0.55,\"mPrefV_blue_modifier\":$blue}}"
  done

  # Phase 25: redPreference x flexibility (4 runs)
  for rp in 0.2 0.8; do
    for fl in -0.3 0.3; do
      echo "redPref=$rp+flex=$fl|{\"cfg\":{\"redPreference\":$rp,\"flexibility\":$fl}}"
    done
  done

  # Phase 26: 3-WAY mPmPref x pBlueFormateur x mandates (12 runs)
  for pref in S V; do
    for pbf in 0 0.2; do
      echo "TRIANGLE:M->$pref+pBF=$pbf+baseline|{\"cfg\":{\"mPmPref\":\"$pref\",\"pBlueFormateur\":$pbf}}"
      echo "TRIANGLE:M->$pref+pBF=$pbf+knife-edge|{\"mandates\":{\"S\":35,\"SF\":22},\"cfg\":{\"mPmPref\":\"$pref\",\"pBlueFormateur\":$pbf}}"
      echo "TRIANGLE:M->$pref+pBF=$pbf+blue-strong|{\"mandates\":{\"V\":22,\"LA\":22,\"KF\":14},\"cfg\":{\"mPmPref\":\"$pref\",\"pBlueFormateur\":$pbf}}"
    done
  done

  # Phase 27: 3-WAY mDemandPM x pBlueFormateur x mandates (6 runs)
  for pbf in 0 0.2; do
    echo "GRIDLOCK:demandPM+pBF=$pbf+baseline|{\"cfg\":{\"mDemandPM\":true,\"pBlueFormateur\":$pbf}}"
    echo "GRIDLOCK:demandPM+pBF=$pbf+knife-edge|{\"mandates\":{\"S\":35,\"SF\":22},\"cfg\":{\"mDemandPM\":true,\"pBlueFormateur\":$pbf}}"
    echo "GRIDLOCK:demandPM+pBF=$pbf+blue-strong|{\"mandates\":{\"V\":22,\"LA\":22,\"KF\":14},\"cfg\":{\"mDemandPM\":true,\"pBlueFormateur\":$pbf}}"
  done

  # =================================================================
  # PHASE TRANSITION PROBES (Probes 1-7)
  # =================================================================

  # Probe 1: Fine-grained blue mandate sweep (10 runs)
  echo 'blue-step-1|{"mandates":{"V":18,"LA":20,"KF":12}}'
  echo 'blue-step-2|{"mandates":{"V":19,"LA":20,"KF":13}}'
  echo 'blue-step-3|{"mandates":{"V":20,"LA":20,"KF":13}}'
  echo 'blue-step-4|{"mandates":{"V":20,"LA":21,"KF":13}}'
  echo 'blue-step-5|{"mandates":{"V":21,"LA":21,"KF":13}}'
  echo 'blue-step-6|{"mandates":{"V":21,"LA":21,"KF":14}}'
  echo 'blue-step-7|{"mandates":{"V":22,"LA":21,"KF":14}}'
  echo 'blue-step-8|{"mandates":{"V":22,"LA":22,"KF":14}}'
  echo 'blue-step-9|{"mandates":{"V":23,"LA":23,"KF":14}}'
  echo 'blue-step-10|{"mandates":{"V":24,"LA":24,"KF":15}}'

  # Probe 2: Blue mandate sweep x mDemandPM (10 runs)
  echo 'blue-step-1+demandPM|{"mandates":{"V":18,"LA":20,"KF":12},"cfg":{"mDemandPM":true}}'
  echo 'blue-step-2+demandPM|{"mandates":{"V":19,"LA":20,"KF":13},"cfg":{"mDemandPM":true}}'
  echo 'blue-step-3+demandPM|{"mandates":{"V":20,"LA":20,"KF":13},"cfg":{"mDemandPM":true}}'
  echo 'blue-step-4+demandPM|{"mandates":{"V":20,"LA":21,"KF":13},"cfg":{"mDemandPM":true}}'
  echo 'blue-step-5+demandPM|{"mandates":{"V":21,"LA":21,"KF":13},"cfg":{"mDemandPM":true}}'
  echo 'blue-step-6+demandPM|{"mandates":{"V":21,"LA":21,"KF":14},"cfg":{"mDemandPM":true}}'
  echo 'blue-step-7+demandPM|{"mandates":{"V":22,"LA":21,"KF":14},"cfg":{"mDemandPM":true}}'
  echo 'blue-step-8+demandPM|{"mandates":{"V":22,"LA":22,"KF":14},"cfg":{"mDemandPM":true}}'
  echo 'blue-step-9+demandPM|{"mandates":{"V":23,"LA":23,"KF":14},"cfg":{"mDemandPM":true}}'
  echo 'blue-step-10+demandPM|{"mandates":{"V":24,"LA":24,"KF":15},"cfg":{"mDemandPM":true}}'

  # Probe 3: EL forstaelsespapir x M forst penalty (6 runs)
  echo 'forst-tradeoff:ELhigh+Mharsh|{"cfg":{"flexibility":0.3,"mPrefV_Sled_modifier":0.35}}'
  echo 'forst-tradeoff:ELhigh+Mmild|{"cfg":{"flexibility":0.3,"mPrefV_Sled_modifier":0.75}}'
  echo 'forst-tradeoff:ELbase+Mharsh|{"cfg":{"flexibility":0.0,"mPrefV_Sled_modifier":0.35}}'
  echo 'forst-tradeoff:ELbase+Mmild|{"cfg":{"flexibility":0.0,"mPrefV_Sled_modifier":0.75}}'
  echo 'forst-tradeoff:ELlow+Mharsh|{"cfg":{"flexibility":-0.3,"mPrefV_Sled_modifier":0.35}}'
  echo 'forst-tradeoff:ELlow+Mmild|{"cfg":{"flexibility":-0.3,"mPrefV_Sled_modifier":0.75}}'

  # Probe 4: redPreference x mDemandPM (4 runs)
  echo 'demandPM+redPref=0.2|{"cfg":{"mDemandPM":true,"redPreference":0.2}}'
  echo 'demandPM+redPref=0.5|{"cfg":{"mDemandPM":true,"redPreference":0.5}}'
  echo 'demandPM+redPref=0.8|{"cfg":{"mDemandPM":true,"redPreference":0.8}}'
  echo 'demandPM+redPref=1.0|{"cfg":{"mDemandPM":true,"redPreference":1.0}}'

  # Probe 5: SF mandate surge (6 runs)
  echo 'SF-surge:SF=23|{"mandates":{"SF":23}}'
  echo 'SF-surge:SF=25|{"mandates":{"SF":25}}'
  echo 'SF-surge:SF=27|{"mandates":{"SF":27}}'
  echo 'SF-surge:SF=30|{"mandates":{"SF":30}}'
  echo 'SF-surge:S=34+SF=27|{"mandates":{"S":34,"SF":27}}'
  echo 'SF-surge:S=32+SF=30|{"mandates":{"S":32,"SF":30}}'

  # Probe 6: S-alone viability (4 runs)
  echo 'S-alone:S=42+flex=0.2|{"mandates":{"S":42},"cfg":{"flexibility":0.2}}'
  echo 'S-alone:S=45+flex=0.2|{"mandates":{"S":45},"cfg":{"flexibility":0.2}}'
  echo 'S-alone:S=48+flex=0.2|{"mandates":{"S":48},"cfg":{"flexibility":0.2}}'
  echo 'S-alone:S=42+flex=0.4|{"mandates":{"S":42},"cfg":{"flexibility":0.4}}'

  # Probe 7: Fine-grained polling error (14 runs)
  for bias in 0.0 0.5 1.0 1.5 2.0 2.5 3.0; do
    echo "pollError:blue+$bias|{\"cfg\":{\"blocBiasBlue\":$bias}}"
  done
  for bias in 0.0 0.5 1.0 1.5 2.0 2.5 3.0; do
    echo "pollError:blue+${bias}+demandPM|{\"cfg\":{\"blocBiasBlue\":$bias,\"mDemandPM\":true}}"
  done
}

# Write configs to file and count
CONFIGFILE="$TMPDIR/configs.txt"
generate_configs > "$CONFIGFILE"
TOTAL=$(wc -l < "$CONFIGFILE" | tr -d ' ')

echo "Total configurations: $TOTAL"
echo "Estimated time: ~$(( TOTAL * 27 / WORKERS / 60 )) minutes (at N=$N, $WORKERS workers)"
echo ""

# Node.js runner: reads config by line number from file
# (avoids shell JSON mangling that xargs-with-bash causes)
cat > "$TMPDIR/_runner.js" << 'RUNNER_EOF'
const { execSync } = require("child_process");
const fs = require("fs");
const lineNum = parseInt(process.argv[2]);
const configFile = process.argv[3];
const tmpdir = process.argv[4];
const N = process.argv[5];
const allLines = fs.readFileSync(configFile, "utf8").trim().split("\n");
const line = allLines[lineNum - 1];
if (!line) { process.stderr.write(`  SKIP: line ${lineNum} not found\n`); process.exit(0); }
const sep = line.indexOf("|");
const label = line.substring(0, sep);
const config = line.substring(sep + 1);
const safeLabel = label.replace(/[/:+= ]/g, "_");
const outfile = `${tmpdir}/${safeLabel}.json`;
try {
  const result = execSync(`node sim3.js '${config}' ${N}`, { encoding: "utf8", timeout: 600000 });
  const parsed = JSON.parse(result);
  fs.writeFileSync(outfile, JSON.stringify({ label, config: JSON.parse(config), output: parsed }) + "\n");
  process.stderr.write(`  Done: ${label}\n`);
} catch (e) {
  fs.writeFileSync(outfile, JSON.stringify({ label, config: JSON.parse(config), output: null, error: e.message }) + "\n");
  process.stderr.write(`  FAILED: ${label}: ${e.message}\n`);
}
RUNNER_EOF

# Run all configs in parallel
echo "Starting $TOTAL runs with $WORKERS parallel workers..."
START=$(date +%s)

seq 1 "$TOTAL" | xargs -P "$WORKERS" -I {} node "$TMPDIR/_runner.js" {} "$CONFIGFILE" "$TMPDIR" "$N"

END=$(date +%s)
ELAPSED=$(( END - START ))
echo ""
echo "All runs complete in ${ELAPSED}s ($(( ELAPSED / 60 ))m $(( ELAPSED % 60 ))s)"

# Merge results into single JSONL file
echo "Merging results..."
cat "$TMPDIR"/*.json > "$OUT"
LINES=$(wc -l < "$OUT" | tr -d ' ')
echo "Output: $OUT ($LINES runs, $(du -h "$OUT" | cut -f1))"

# Clean up tmp
rm -rf "$TMPDIR"

echo ""
echo "=== SWEEP COMPLETE ==="
echo "Analyze with: node analyze.js $OUT"
