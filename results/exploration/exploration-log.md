# Exploration Log
Started: 2026-03-27T00:10:08.642Z
Focus: party-specific bilateral relationships and negotiations

[00:10:08] Waiting for Sobol sweep to complete...
[00:33:08] Sobol indices found. Starting party-focused exploration.

[00:33:08] === Module 1: High-resolution bilateral 1D sweeps ===
[00:33:08]   SF accepts M in govt [0.2, 0.98]
[00:33:29]     S+M+RV+SF: 8.6% → 37.0% (Δ28.4pp) ★
[00:33:29]   M accepts SF in govt [0.2, 0.95]
[00:33:49]     S+M+RV+SF: 11.0% → 38.2% (Δ27.2pp) ★
[00:33:49]   SF tolerates M from outside [0.1, 0.95]
[00:34:10]     S+M+RV+SF: 29.4% → 32.6% (Δ3.2pp)
[00:34:10]   M tolerates SF from outside [0.2, 0.98]
[00:34:30]     S+M+RV+SF: 29.2% → 30.4% (Δ1.2pp)
[00:34:30]   M tolerates EL as support [0, 0.8]
[00:34:51]     S+M+RV+SF: 35.4% → 33.0% (Δ2.4pp)
[00:34:51]   EL tolerates M in govt [0.1, 0.9]
[00:35:12]     S+M+RV+SF: 36.2% → 33.2% (Δ3.0pp)
[00:35:12]   S tolerates EL as support [0.3, 0.95]
[00:35:34]     S+M+RV+SF: 32.8% → 28.2% (Δ4.6pp)
[00:35:34]   RV tolerates EL as support [0.3, 0.98]
[00:35:54]     S+M+RV+SF: 34.8% → 33.4% (Δ1.4pp)
[00:35:54]   SF tolerates EL as support [0.3, 0.98]
[00:36:14]     S+M+RV+SF: 34.2% → 32.2% (Δ2.0pp)
[00:36:14]   RV accepts M in govt [0.3, 0.98]
[00:36:34]     S+M+RV+SF: 14.2% → 27.6% (Δ13.4pp) ★
[00:36:34]   M accepts RV in govt [0.4, 0.98]
[00:36:53]     S+M+RV+SF: 21.4% → 33.6% (Δ12.2pp) ★
[00:36:53]   S accepts RV in govt [0.4, 1]
[00:37:13]     S+M+RV+SF: 23.8% → 31.2% (Δ7.4pp)
[00:37:13]   S accepts V in govt [0, 0.6]
[00:37:33]     S+M+RV+SF: 33.8% → 31.0% (Δ2.8pp)
[00:37:33]   KF accepts S in govt [0.05, 0.7]
[00:37:53]     S+M+RV+SF: 31.6% → 31.6% (Δ0.0pp)
[00:37:53]   KF tolerates S in govt [0.2, 0.95]
[00:38:13]     S+M+RV+SF: 31.8% → 30.6% (Δ1.2pp)
[00:38:13]   DF tolerates M [0, 0.5]
[00:38:33]     S+M+RV+SF: 30.8% → 36.0% (Δ5.2pp)
[00:38:33]   DF supports V-led govt [0.3, 0.98]
[00:38:53]     S+M+RV+SF: 29.0% → 32.4% (Δ3.4pp)
[00:38:53]   V accepts KF in govt [0.4, 0.98]
[00:39:13]     S+M+RV+SF: 29.2% → 30.8% (Δ1.6pp)
[00:39:13]   V accepts M in govt [0.4, 1]
[00:39:32]     S+M+RV+SF: 32.4% → 33.6% (Δ1.2pp)
[00:39:32]   EL accepts M in govt [0, 0.4]
[00:39:52]     S+M+RV+SF: 31.0% → 29.2% (Δ1.8pp)
[00:39:52]   EL tolerates RV in govt [0.1, 0.85]
[00:40:12]     S+M+RV+SF: 32.4% → 28.6% (Δ3.8pp)
[00:40:12]   S negotiation harshness [0.15, 0.8]
[00:40:32]     S+M+RV+SF: 32.6% → 28.8% (Δ3.8pp)
[00:40:32]   SF negotiation harshness [0.2, 0.85]
[00:40:52]     S+M+RV+SF: 32.0% → 30.8% (Δ1.2pp)
[00:40:52]   M negotiation harshness [0.05, 0.65]
[00:41:14]     S+M+RV+SF: 34.8% → 28.4% (Δ6.4pp)
[00:41:14]   RV negotiation harshness [0.15, 0.75]
[00:41:37]     S+M+RV+SF: 33.2% → 36.0% (Δ2.8pp)
[00:41:37]   EL negotiation harshness [0.3, 0.95]
[00:41:58]     S+M+RV+SF: 26.6% → 31.2% (Δ4.6pp)
[00:41:58]   V negotiation harshness [0.15, 0.75]
[00:42:18]     S+M+RV+SF: 30.6% → 32.8% (Δ2.2pp)
[00:42:18]   KF negotiation harshness [0.1, 0.7]
[00:42:39]     S+M+RV+SF: 33.0% → 29.4% (Δ3.6pp)
[00:42:39]   DF negotiation harshness [0.4, 0.98]
[00:42:59]     S+M+RV+SF: 32.6% → 26.8% (Δ5.8pp)
[00:42:59] Saved to /Users/christoffer/Documents/GitHub/coalition-simulator/results/exploration/bilateral-1d-sweeps.jsonl (29 parameters × 25 points)
[00:42:59] 
=== Module 2: Dyadic interaction heatmaps ===
[00:42:59]   SF→M inGov × M→EL tolerance
[00:45:22]     S+M+RV+SF: (low,low)=9% → (high,high)=33%
[00:45:22]   SF→M inGov × M→SF inGov
[00:47:50]     S+M+RV+SF: (low,low)=6% → (high,high)=38%
[00:47:50]   M→EL tolerance × EL→M tolerance
[00:50:19]     S+M+RV+SF: (low,low)=35% → (high,high)=34%
[00:50:19]   SF→M inGov × RV→M inGov
[00:52:38]     S+M+RV+SF: (low,low)=4% → (high,high)=34%
[00:52:38]   SF→M inGov × SF harshness
[00:55:08]     S+M+RV+SF: (low,low)=10% → (high,high)=32%
[00:55:08]   DF→M tolerance × DF→V support
[00:57:31]     S+M+RV+SF: (low,low)=29% → (high,high)=30%
[00:57:31]   S→V inGov × KF→S inGov
[00:59:58]     S+M+RV+SF: (low,low)=35% → (high,high)=29%
[00:59:58]   EL→M tolerance × EL harshness
[01:02:29]     S+M+RV+SF: (low,low)=31% → (high,high)=33%
[01:02:29]   M→EL tolerance × S→EL tolerance
[01:04:54]     S+M+RV+SF: (low,low)=35% → (high,high)=32%
[01:04:54]   RV→M inGov × M→EL tolerance
[01:07:24]     S+M+RV+SF: (low,low)=16% → (high,high)=28%
[01:07:24] Saved to /Users/christoffer/Documents/GitHub/coalition-simulator/results/exploration/dyadic-interactions.jsonl (10 pairs × 15×15 grid)
[01:07:24] 
=== Module 3: High-resolution 1D sweeps (top Sobol params) ===
[01:07:24] Top 6 Sobol params: viabilityThreshold(ST=2.31), redPreference(ST=2.01), flexibility(ST=1.28), oppositionAbstention(ST=0.90), passageWeight(ST=0.73), mDemandGov(ST=0.71)
[01:07:24]   viabilityThreshold [0.4, 0.85]
[01:07:49]   redPreference [0, 1]
[01:08:13]   flexibility [-0.3, 0.5]
[01:08:41]   oppositionAbstention [0.1, 0.7]
[01:09:06]   passageWeight [0.3, 0.9]
[01:09:30]   Skipping mDemandGov (party-specific, handled in Module 1)
[01:09:30] Saved to /Users/christoffer/Documents/GitHub/coalition-simulator/results/exploration/highres-1d-sweeps.jsonl
[01:09:30] 
=== Module 4: Three-way probes (Sobol × bilateral) ===
[01:09:30] Top 3 interacting: viabilityThreshold, redPreference, oppositionAbstention
[01:09:30]   viabilityThreshold × SF→M
[01:09:53]   viabilityThreshold × M→EL
[01:10:17]   viabilityThreshold × EL→M
[01:10:40]   redPreference × SF→M
[01:11:04]   redPreference × M→EL
[01:11:27]   redPreference × EL→M
[01:11:51]   oppositionAbstention × SF→M
[01:12:19]   oppositionAbstention × M→EL
[01:12:48]   oppositionAbstention × EL→M
[01:13:12] Saved to /Users/christoffer/Documents/GitHub/coalition-simulator/results/exploration/three-way-probes.jsonl
[01:13:12] 
=== Module 5: Extreme scenario hunting ===
[01:38:39] Unusual outcomes in 3000 random draws:
[01:38:39]   high_blue: 56 (1.9%)
[01:38:39]   high_SSF: 266 (8.9%)
[01:38:39]   dominant_SMRVSF: 0 (0.0%)
[01:38:39]   high_entropy: 204 (6.8%)
[01:38:39]   low_entropy: 1 (0.0%)
[01:38:39] Saved to /Users/christoffer/Documents/GitHub/coalition-simulator/results/exploration/extreme-scenarios.jsonl
[01:38:39] 
Exploration complete at 2026-03-27T01:38:39.447Z
