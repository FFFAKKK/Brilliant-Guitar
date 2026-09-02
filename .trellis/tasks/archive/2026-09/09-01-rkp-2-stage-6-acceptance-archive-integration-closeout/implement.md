# RKP-2 Stage 6 Acceptance, Archive and Integration Closeout — Implementation Plan

## L0 — planning candidate

1. Verify base, clean branch, exact manifests and ancestry.
2. Create this sibling closeout under RKP-2; keep planning/start/production flags false.
3. Write all artifacts/context.
4. Project only planning child/gate into RKP-2, Stage 6 and Rust parent.
5. Run Trellis/JSON/JSONL/path/fence/diff/protected/typecheck/build checks. The unmodified Workspace Law must fail closed at exact `11/7/4` on current Node and Node 20: three frozen historical failures plus only `Stage 6 semantic canonical evidence correction and E2 worker stay inside the accepted contracts` for this unaccepted planning tree. The dynamic full runner may contain only the same four Workspace Law failures.
6. Commit `docs(rkp-2): plan Stage 6 acceptance archive integration closeout`.
7. Dedicated independent planning audit; bounded repair until P0/P1/P2=`0/0/0`.

## L1 — activation

After planning PASS and user continuation authorization, run native `task.py start` for this closeout. Record accepted planning head and bounded authorization, clear planning child, keep Stage 6 as current implementation child, validate and commit `chore(rkp-2): activate Stage 6 closeout`.

## L2 — semantic child acceptance/archive

Verify accepted E1R2/E2 evidence and exact 12-file manifest; update only lifecycle/projection paths; run date/time preflight; execute:

```powershell
python ./.trellis/scripts/task.py archive 08-30-rkp-2-stage-6-semantic-canonical-authority-amendment
```

Verify exact move, active absence and archive presence. Repair only archived `task.json`/JSONLs if needed. Stage 6 remains active and S6.2 false.

## L3 — Stage 6 acceptance/archive candidate

Verify every Stage 6 descendant has a sole accepted archive. Record audited candidate and owner acceptance. Add exact Workspace Law final-state model. Run preflight and:

```powershell
python ./.trellis/scripts/task.py archive 08-26-rkp-2-stage-6-private-scale-evidence-seam-repair
```

Verify exact 13-file move, repair declared archive/projection paths, run all gates, freeze clean `READY FOR INDEPENDENT STAGE 6 ARCHIVE-CANDIDATE REVIEW`, and obtain dedicated P0/P1/P2=`0/0/0` audit.

## L4 — original RKP-2 fast-forward

Freeze source at audited candidate. Verify both worktrees clean and target head ancestor. In original RKP-2 worktree run `git merge --ff-only <candidate>`. Prove target/source equality; source receives no further edits.

## L5 — integration projection

In original RKP-2 only, project sole authority, preserve frozen provenance, set current child to this closeout and S6.2/S6.3 false, update Workspace Law, run all gates, commit `docs(rkp-2): integrate accepted Stage 6 closeout authority`, and obtain dedicated integration PASS.

## L6 — closeout archive and terminal projection

The independent integration review of `3799faf635482f0301e61a56f1faf83ea3fe0f5f` returned P0/P1/P2=`0/1/0`, `RETURN FOR ONE BOUNDED L6 CLOCK/DATE CONTRACT REPAIR`. The targeted rereview of the exact four-file date-contract repair `55ca574df1156bcda2ec26499d8fb717d9faff82` then returned P0/P1/P2=`0/1/0`, `RETURN FOR ONE BOUNDED POWERSHELL PREFLIGHT REPAIR`: on PowerShell 7.6.4, plain `ConvertFrom-Json` converts the ISO deadline into `System.DateTime`, so the fixed `DateTimeOffset.ParseExact` contract receives a culture-rendered value rather than the original JSON string. First obtain a targeted independent rereview PASS for the exact three-file PowerShell preflight repair. That PASS is evidence only and does not itself authorize L6.

After targeted rereview and separate explicit L6 authorization, load the closeout task metadata and preflight only the L6-owned clock fields:

```powershell
# L6_POWERSHELL_PREFLIGHT_V1_BEGIN
& {
    $ErrorActionPreference = 'Stop'
    $taskPath = '.trellis/tasks/09-01-rkp-2-stage-6-acceptance-archive-integration-closeout/task.json'
    $convertFromJson = Get-Command ConvertFrom-Json -CommandType Cmdlet -ErrorAction Stop
    if (-not $convertFromJson.Parameters.ContainsKey('DateKind')) {
        throw 'L6 requires PowerShell 7+ ConvertFrom-Json -DateKind String support'
    }

    $closeout = Get-Content -Raw -LiteralPath $taskPath | ConvertFrom-Json -DateKind String
    $archiveDate = $closeout.meta.closeout_archive_date
    $deadlineText = $closeout.meta.closeout_archive_deadline_local
    if ($archiveDate -isnot [System.String] -or $deadlineText -isnot [System.String]) {
        throw 'L6 closeout clock fields must remain System.String after JSON decode'
    }

    $format = "yyyy-MM-dd'T'HH:mm:sszzz"
    $deadline = [DateTimeOffset]::ParseExact(
        $deadlineText,
        $format,
        [Globalization.CultureInfo]::InvariantCulture,
        [Globalization.DateTimeStyles]::None
    )
    $now = [DateTimeOffset]::Now
    $expectedOffset = [TimeSpan]::FromHours(8)
    $dateMatches = $now.ToString('yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture) -ceq '2026-09-02' -and $archiveDate -ceq '2026-09-02'
    $offsetMatches = $now.Offset -eq $expectedOffset -and $deadline.Offset -eq $expectedOffset
    $beforeDeadline = $now -lt $deadline
    if (-not $dateMatches) { throw 'L6 local or metadata date mismatch' }
    if (-not $offsetMatches) { throw 'L6 requires +08:00 local and deadline offsets' }
    if (-not $beforeDeadline) { throw 'L6 closeout archive deadline reached' }
    if ($deadline.ToString('yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture) -cne $archiveDate) { throw 'L6 deadline date contract drift' }
    if ($closeout.meta.archive_month -cne '2026-09' -or $closeout.meta.closeout_archive_root -cne '.trellis/tasks/archive/2026-09/09-01-rkp-2-stage-6-acceptance-archive-integration-closeout') { throw 'L6 archive month or root drift' }
    if ($closeout.meta.archive_date -cne '2026-09-01' -or $closeout.meta.archive_deadline_local -cne '23:50:00+08:00' -or $closeout.meta.archive_clock_scope -cne 'historical_semantic_child_and_stage6_native_archive_window_only_not_l6') { throw 'historical archive clock drift' }
    if ($closeout.meta.closeout_archive_clock_owner -cne 'L6_closeout_only') { throw 'L6 closeout clock owner drift' }

    [pscustomobject]@{
        schemaVersion = 1
        pwshVersion = $PSVersionTable.PSVersion.ToString()
        currentCulture = [Threading.Thread]::CurrentThread.CurrentCulture.Name
        archiveDateType = $archiveDate.GetType().FullName
        deadlineType = $deadlineText.GetType().FullName
        parseExactSucceeded = $true
        dateMatches = $dateMatches
        offsetMatches = $offsetMatches
        beforeDeadline = $beforeDeadline
    } | ConvertTo-Json -Compress
}
# L6_POWERSHELL_PREFLIGHT_V1_END
```

This is the complete copy-paste preflight. It requires PowerShell 7+ `ConvertFrom-Json -DateKind String`; unsupported `-DateKind`, automatic date conversion, non-string clock fields, fixed-format parse failure, local-date/offset/deadline mismatch, archive-month/root drift or historical-clock drift all throw before acceptance/archive mutation and before `task.py archive`. It does not depend on process culture or implicit date `ToString`. The generic `archive_date` and `archive_deadline_local` fields remain L2/L3 historical evidence only and must not drive L6. On a passing preflight, preserve archive month/root, record closeout archive authorization and run:

```powershell
python ./.trellis/scripts/task.py archive 09-01-rkp-2-stage-6-acceptance-archive-integration-closeout
```

Verify the exact move and native `completedAt=2026-09-02`; create one terminal projection updating archived self paths, RKP-2/Rust state and Workspace Law. Semantic child and Stage 6 remain historical at `completedAt=2026-09-01`. Set the exact later S6.2 gate without starting it. Obtain targeted terminal rereview P0/P1/P2=`0/0/0`.

## Validation

At L3/L5/L6 run all:

```powershell
python ./.trellis/scripts/task.py validate <closeout-or-archive-path>
python ./.trellis/scripts/task.py validate <stage6-or-archive-path>
python ./.trellis/scripts/task.py validate 08-24-rkp-2-indexed-live-score-store-load-encode-parity
python ./.trellis/scripts/task.py validate 08-15-core-rust-runtime-performance-remediation
git diff --check
npm run typecheck
npm run build
node --test dist/test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.js
<Node20> --test dist/test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.js
npm test
```

Also validate JSON/JSONL uniqueness and existence, exact parent references/manifests/A-M-D sets, fences, clean/staged-empty and protected zero delta. Keep build/TEMP on E:. Do not push.
