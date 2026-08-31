# Implementation Plan — E3 Workspace Law Acceptance and Archive Closure

## 0. Planning-only precondition

No implementation action begins until all are true:

1. this exact planning commit receives dedicated independent planning PASS with P0/P1/P2=`0/0/0`;
2. the accepted planning head is recorded without amend;
3. the user separately authorizes implementation;
4. `task.py start` is run for this task only;
5. base ancestry, clean source state and target 323-byte audit record revalidate;
6. archive clock still permits the literal `2026-08` path;
7. S6.2/S6.3 remain false and TypeScript remains default.

Task creation consent does not satisfy items 1–4.

## 1. Phase Q1 — Activate only

Allowed files:

- this task `task.json`, `operator-handoff.md`, `review-candidate.md`;
- Stage 6 `task.json`, `operator-handoff.md`, `review-candidate.md`.

Actions:

1. run `python .\.trellis\scripts\task.py start 08-31-rkp-2-e3-workspace-law-acceptance-archive-closure`;
2. record accepted planning head and separate implementation authorization;
3. set this task `in_progress`, `task_start_run=true`;
4. set Stage 6 current planning child null and implementation child to this task;
5. leave target active, unaccepted and unarchived;
6. commit docs-only activation.

Gate: JSON/Trellis/child uniqueness/diff check pass; technical and production deltas are zero.

Rollback: revert the activation commit.

## 2. Phase Q1T — Extend the existing Workspace Law

Modify only:

```text
test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts
```

Actions:

1. add exact active/archive roots and 12/11 manifests;
2. add `resolveExactlyOneTaskLocation()` and pure fixture inputs;
3. encode Q0–Q4 lifecycle matrices;
4. encode planning/Q2/Q3/Q4 no-rename path contracts;
5. preserve and revalidate the existing 323-byte target audit record;
6. add the new Q3 review-record owner/digest contract;
7. add clock, JSONL, Stage 6 terminal and later-gate exclusions;
8. add all negative cases from `design.md`;
9. keep the three historical failing test names exact and executed.

Gate:

```text
Node supported: 11 tests / 8 pass / 3 exact historical fail
Node 20.20.2:   11 tests / 8 pass / 3 exact historical fail
additional unexpected failures: 0
```

Suggested commit:

```text
test(rkp-2): make E3 Workspace Law archive-aware
```

Rollback: revert this one technical commit. Do not edit the E3 evidence.

## 3. Phase Q2 — Target owner acceptance

Only after Q1T gates pass, update the eleven lifecycle/context allowlist files as needed.

Required target state:

- status still `in_progress`;
- implementation review remains bound to `0c561d1419...`;
- owner acceptance explicitly recorded;
- `archive_authorized=true`;
- next gate `native_e3_workspace_law_archive_clock_preflight_required`;
- no completedAt until native archive.
- `implement.jsonl` and `check.jsonl` delete exactly their six active-target self-reference rows;
- the remaining JSONL rows parse, exist and are unique in both active and pure archive-successor projections;
- `task.json` updates only the two JSONL authority digests plus a bounded archive-stability repair record; the existing 323-byte audit structure is byte-for-byte unchanged.

The successor tuple is literal: `implement.jsonl` becomes `9 rows / 1492 bytes / 54c6912c5829a69d6d92a3f12825537e8489b30a906463bd9c41724a39174ca9`; `check.jsonl` becomes `6 rows / 1117 bytes / 83aaf6771c56066982f718cbe39b66fa7399f8ec116800eec2b9efbd1fe2aa52`. Source tuples and the six exact paths are defined in `design.md` and `task.json`; any other row mutation stops the phase.

Required closure state:

- active/in progress;
- target owner record stored;
- Q3 audit pending;
- closure acceptance/archive false.

Required Stage 6 state:

- implementation child=this task;
- target acceptance projection referenced, not duplicated;
- S6.2/S6.3 false and later gates false.

Gate: exact Q2 `A11/M9/D0=20`, all JSONL successor paths exist, no target active-prefix remains in either JSONL, worktree clean after commit.

Rollback: revert owner acceptance before reverting Q1T or Q1.

## 4. Phase Q3 — Native target archive

In one PowerShell sequence:

```powershell
$now = Get-Date
if ($now.ToString('yyyy-MM') -ne '2026-08' -or
    $now.ToString('yyyy-MM-dd') -ne '2026-08-31' -or
    $now.TimeOfDay -ge [TimeSpan]::Parse('23:50:00')) {
  throw 'archive-clock-contract-mismatch'
}
python .\.trellis\scripts\task.py archive 08-31-rkp-2-stage-6-e3-workspace-law-final-state-projection-repair
```

Then verify:

1. active target root absent;
2. archive target root exact 12 files;
3. target completed on `2026-08-31`;
4. existing audit record exact 323 bytes and digest;
5. closure remains active/review-pending;
6. Stage 6 implementation child remains closure;
7. exact Q3 `A23/M4/D12=39`;
8. focused dual-Node, full, Trellis, JSONL and protected-zero-delta gates pass;
9. worktree is clean and staged empty.

The native target archive commit must leave Stage 6 pointing to the active closure task. No technical edit occurs after Q1T. Any unrelated staged path or pending projection stops before the Q3 freeze.

Candidate marker:

```text
READY FOR DEDICATED INDEPENDENT E3 WORKSPACE LAW ACCEPTANCE-ARCHIVE CLOSURE IMPLEMENTATION REVIEW
```

Stop and hand the exact Q3 HEAD to a separate dedicated audit task.

Rollback: revert Stage 6 projection if present, then revert the native target archive commit, then owner acceptance.

## 5. Phase Q3R — Dedicated independent implementation review

The reviewer receives:

- exact Q3 HEAD and Q1T technical commit;
- `c73e213...` base;
- exact Q3 39-path list and A/M/D counts;
- target and closure manifests;
- 323-byte record bytes/digest;
- dual-Node focused and full results;
- protected-zero-delta report;
- clean/staged-empty evidence.

Required verdict is P0/P1/P2=`0/0/0`. The review task and turn IDs are populated only from the real external review result. PASS does not itself authorize Q4.

## 6. Phase Q4 — Owner closeout and native closure archive

Only after Q3 review PASS and a separate owner closeout authorization, execute one atomic pre-stage/archive sequence:

1. write the exact Q3 review structure into this task only;
2. write only the resolved closure owner path and digest into Stage 6;
3. set closure acceptance/archive authorization true;
4. set Stage 6 current planning/implementation child null and next gate to `explicit_owner_decision_for_stage6_parent_acceptance_archive`;
5. require the whole worktree to have no unrelated dirty or untracked path, then stage exactly the allowed closure and Stage 6 lifecycle paths;
6. without creating a pre-archive commit, run one PowerShell sequence that parses NUL-delimited all-untracked status, revalidates the six staged entries and blank worktree columns, checks the local clock, invokes native archive, then verifies the archive commit parent and exact commit-local membership:

```powershell
# Exact status contract: git status --porcelain=v1 -z --untracked-files=all
function Get-GitStatusPorcelainZ {
  $psi = [System.Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = 'git'
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  foreach ($argument in @('status', '--porcelain=v1', '-z', '--untracked-files=all')) {
    [void]$psi.ArgumentList.Add($argument)
  }
  $process = [System.Diagnostics.Process]::Start($psi)
  $stdout = $process.StandardOutput.ReadToEnd()
  $stderr = $process.StandardError.ReadToEnd()
  $process.WaitForExit()
  if ($process.ExitCode -ne 0) {
    throw "q4-status-preflight-failed: $stderr"
  }
  return $stdout
}

$expectedStaged = @(
  '.trellis/tasks/08-31-rkp-2-e3-workspace-law-acceptance-archive-closure/task.json',
  '.trellis/tasks/08-31-rkp-2-e3-workspace-law-acceptance-archive-closure/operator-handoff.md',
  '.trellis/tasks/08-31-rkp-2-e3-workspace-law-acceptance-archive-closure/review-candidate.md',
  '.trellis/tasks/08-26-rkp-2-stage-6-private-scale-evidence-seam-repair/task.json',
  '.trellis/tasks/08-26-rkp-2-stage-6-private-scale-evidence-seam-repair/operator-handoff.md',
  '.trellis/tasks/08-26-rkp-2-stage-6-private-scale-evidence-seam-repair/review-candidate.md'
) | Sort-Object
$statusRaw = Get-GitStatusPorcelainZ
$statusEntries = @($statusRaw.Split([char]0, [System.StringSplitOptions]::RemoveEmptyEntries))
if ($statusEntries.Count -ne 6) {
  throw 'q4-whole-worktree-entry-count-mismatch'
}
$actualStatusPaths = @(
  foreach ($entry in $statusEntries) {
    if ($entry.StartsWith('??')) {
      throw 'q4-untracked-path-present'
    }
    if ($entry.Length -lt 4 -or $entry.Substring(0, 2) -ne 'M ') {
      throw "q4-index-or-worktree-column-mismatch: $entry"
    }
    $entry.Substring(3)
  }
) | Sort-Object
if (@(Compare-Object $expectedStaged $actualStatusPaths).Count -ne 0) {
  throw 'q4-whole-worktree-path-mismatch'
}
$actualStaged = @(git diff --cached --name-only) | Sort-Object
if (@(Compare-Object $expectedStaged $actualStaged).Count -ne 0) {
  throw 'q4-staged-allowlist-mismatch'
}
$now = Get-Date
if ($now.ToString('yyyy-MM') -ne '2026-08' -or
    $now.ToString('yyyy-MM-dd') -ne '2026-08-31' -or
    $now.TimeOfDay -ge [TimeSpan]::Parse('23:50:00')) {
  throw 'archive-clock-contract-mismatch'
}
$q3Head = (git rev-parse HEAD).Trim()
python .\.trellis\scripts\task.py archive 08-31-rkp-2-e3-workspace-law-acceptance-archive-closure
if ($LASTEXITCODE -ne 0) {
  throw 'native-closure-archive-failed'
}
$archiveHead = (git rev-parse HEAD).Trim()
try {
  $parents = @((git show -s --format=%P $archiveHead).Trim() -split '\s+' | Where-Object { $_ })
  if ($parents.Count -ne 1 -or $parents[0] -ne $q3Head) {
    throw 'q4-archive-parent-mismatch'
  }

  $closureArtifacts = @(
    'check.jsonl',
    'design.md',
    'implement.jsonl',
    'implement.md',
    'operator-handoff.md',
    'prd.md',
    'review-candidate.md',
    'task.json',
    'research/current-state-and-archive-gap-audit.md',
    'research/file-state-and-test-matrix.md',
    'research/planning-self-audit.md'
  )
  $closureActive = '.trellis/tasks/08-31-rkp-2-e3-workspace-law-acceptance-archive-closure'
  $closureArchive = '.trellis/tasks/archive/2026-08/08-31-rkp-2-e3-workspace-law-acceptance-archive-closure'
  $stage6 = '.trellis/tasks/08-26-rkp-2-stage-6-private-scale-evidence-seam-repair'
  $expectedCommitRows = @(
    foreach ($artifact in $closureArtifacts) {
      "D`t$closureActive/$artifact"
      "A`t$closureArchive/$artifact"
    }
    "M`t$stage6/task.json"
    "M`t$stage6/operator-handoff.md"
    "M`t$stage6/review-candidate.md"
  ) | Sort-Object
  $actualCommitRows = @(git diff-tree --no-commit-id --name-status --no-renames -r $archiveHead) | Sort-Object
  if (@(Compare-Object $expectedCommitRows $actualCommitRows).Count -ne 0) {
    throw 'q4-archive-commit-membership-mismatch'
  }
  if ((Get-GitStatusPorcelainZ).Length -ne 0) {
    throw 'q4-post-archive-worktree-not-clean'
  }
} catch {
  git revert --no-edit $archiveHead
  if ($LASTEXITCODE -ne 0) {
    throw "q4-archive-verification-and-revert-failed: $($_.Exception.Message)"
  }
  throw
}
```

7. require the native archive auto-commit to contain only closure `A11/D11` plus the already-staged Stage 6 `M3`, with exact Q3 as its sole parent;
8. only after that commit-membership check completes, run the real Q4 Workspace Law using the existing technical commit and verify exact `A23/M4/D12=39`;
9. rerun Trellis, JSON/JSONL, focused, full, path and clean gates.

There is no legal committed state with closure active and Stage 6 child null, and no legal committed state with closure archived while Stage 6 still points to it. The NUL-delimited porcelain preflight rejects every untracked, unstaged or extra path before native archive can stage the archive root. A parent, commit-membership or later Q4 failure reverts the single native archive commit to the exact Q3 reviewed HEAD.

Final state does not accept/archive Stage 6 and does not start S6.2.

Rollback: revert the closure native archive commit to the exact Q3 reviewed state.

## 7. Validation commands

```powershell
python .\.trellis\scripts\task.py validate 08-31-rkp-2-e3-workspace-law-acceptance-archive-closure
python .\.trellis\scripts\task.py validate 08-31-rkp-2-stage-6-e3-workspace-law-final-state-projection-repair
python .\.trellis\scripts\task.py validate 08-26-rkp-2-stage-6-private-scale-evidence-seam-repair
python .\.trellis\scripts\task.py validate 08-24-rkp-2-indexed-live-score-store-load-encode-parity
python .\.trellis\scripts\task.py validate 08-15-core-rust-runtime-performance-remediation

npm run typecheck
npm run build
node --test dist/test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.js
npm test

git diff --check
git status --short --branch
```

Additional mechanical checks:

- every task JSON parses;
- every JSONL line parses, path exists, and path is unique per file;
- parent contains each child exactly once;
- Markdown fences balance;
- exact artifact manifests and A/M/D projections;
- immutable planning hashes exact;
- target existing and new Q3 audit record canonical bytes/digests;
- `src/**`, `crates/**`, Cargo/package/tsconfig/spec/evidence zero delta;
- no E3 stress process or new TEMP evidence.

## 8. Stop conditions

Return to planning review if:

- a second technical file is needed;
- either manifest changes;
- the literal archive time contract is no longer satisfiable;
- target JSONL repair needs anything beyond deleting the six enumerated self-reference rows and updating their two registered digests;
- path totals differ;
- one historical failure changes outside this task;
- E3 evidence or performance inputs need modification;
- S6.2/S6.3 or any later lifecycle gate must advance.

## 9. Expected commits

```text
docs(rkp-2): activate E3 Workspace Law archive closure
test(rkp-2): make E3 Workspace Law archive-aware
docs(rkp-2): record E3 Workspace Law owner acceptance
chore(task): archive 08-31-rkp-2-stage-6-e3-workspace-law-final-state-projection-repair
docs(rkp-2): freeze E3 Workspace Law archive review candidate
<dedicated read-only audit>
chore(task): archive 08-31-rkp-2-e3-workspace-law-acceptance-archive-closure
```

No amend, merge, push, stress rerun, qualification, cutover or RKP-3 action occurs.
