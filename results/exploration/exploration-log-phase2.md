# Exploration Phase 2 Log
Started: 2026-03-27T06:09:45.705Z
Focus: policy positions, un-swept bilaterals, cross-interactions, participation prefs

[06:09:45] === Module A: Policy position sweeps (never swept before) ===
[06:10:02]   S wealth tax position               Δ=5.6pp ★ (33%→27%)
[06:10:18]   SF wealth tax position              Δ=0.2pp  (29%→29%)
[06:10:34]   S wealth tax floor (red line)       Δ=3.0pp  (35%→32%)
[06:10:50]   EL immigration position             Δ=3.2pp  (33%→30%)
[06:11:07]   EL immigration floor (red line)     Δ=2.6pp  (35%→33%)
[06:11:23]   M climate target position           Δ=0.6pp  (31%→30%)
[06:11:40]   S climate target position           Δ=7.8pp ★ (27%→35%)
[06:12:00]   M pension position                  Δ=2.0pp  (30%→28%)
[06:12:19]   S pension position                  Δ=1.6pp  (33%→32%)
[06:12:35]   EL EU conventions position          Δ=4.8pp  (33%→29%)
[06:12:51]   M nuclear power position            Δ=1.2pp  (29%→31%)
[06:13:07]   SF nuclear power position           Δ=1.8pp  (32%→33%)
[06:13:23]   S pesticide ban position            Δ=0.2pp  (31%→31%)
[06:13:23] Saved to policy-position-sweeps.jsonl

[06:13:23] === Module B: Un-swept bilateral 1D sweeps ===
[06:13:43]   ALT tolerates M in govt                Δ=1.4pp 
[06:14:03]   M tolerates ALT as support             Δ=1.4pp 
[06:14:23]   DD tolerates M in govt                 Δ=1.0pp 
[06:14:43]   DD accepts M in govt                   Δ=2.8pp 
[06:15:03]   LA accepts M in govt                   Δ=0.6pp 
[06:15:23]   V accepts RV in govt (soft veto)       Δ=0.2pp 
[06:15:44]   RV accepts S as PM                     Δ=2.6pp 
[06:16:04]   EL tolerates SF in govt                Δ=2.2pp 
[06:16:24]   SF accepts RV in govt                  Δ=13.4pp ★
[06:16:43]   S accepts M in govt                    Δ=12.8pp ★
[06:16:43] Saved to unsweept-bilaterals.jsonl

[06:16:43] === Module C: Policy × bilateral cross-interaction heatmaps ===
[06:16:43]   M climate position × SF→M acceptance
[06:18:33]     S+M+RV+SF: (0,0.23)=10% → (4,0.95)=33%
[06:18:33]   EL immigration floor × M→EL tolerance
[06:20:24]     S+M+RV+SF: (0.08,0.03)=34% → (1.92,0.77)=31%
[06:20:24]   SF wealth tax position × SF→M acceptance
[06:22:12]     S+M+RV+SF: (0,0.23)=9% → (3,0.95)=35%
[06:22:12]   M pension position × M→SF acceptance
