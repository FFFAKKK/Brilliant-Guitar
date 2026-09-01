# Current state and branch topology

- Clean authority head: `65debd52d379004c966cefe59f54d72ac1136eb4`.
- Original RKP-2 head: `4a302bc9f9981940336fc97941b08e09bd0d1f67`.
- Stage 6 branch head: `d14d73117e03822a52fd19c55f3024cb2b73ef45`.
- Semantic/canonical branch head: `4ad23773e9c9e1081667a4eccb84cc464b85bc89`.
- Relevant ancestry is linear: original RKP-2 -> Stage 6 -> semantic/canonical -> E3/Q4 closeouts -> `65debd52`.
- A clean `--ff-only` handoff is therefore possible after candidate freeze; no cherry-pick or merge commit is needed.
- Root checkout contains unrelated user files and is excluded; only dedicated E: worktrees participate.
