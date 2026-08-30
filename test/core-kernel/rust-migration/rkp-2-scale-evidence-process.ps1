[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)] [string] $ExecutablePath,
  [Parameter(Mandatory = $true)] [string] $RequestPath,
  [string] $TestName = "indices::tests::rkp2_stage_6_private_scale_evidence_v1",
  [int] $TimeoutMs = 180000,
  [int] $PollIntervalMs = 25,
  [int] $MaxStdoutBytes = 1048576,
  [int] $MaxStderrBytes = 1048576
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$rustPrefix = "BRILLIANT_RKP2_SCALE_RUST_V1:"
$processPrefix = "BRILLIANT_RKP2_SCALE_PROCESS_V1:"
$requestEnv = "BRILLIANT_RKP2_SCALE_REQUEST_V1"
$reapTimeoutMs = 5000
$maxSafe = 9007199254740991
$expectedTestName = "indices::tests::rkp2_stage_6_private_scale_evidence_v1"

function New-ProcessState {
  return [ordered]@{
    exitCode = $null
    timedOut = $false
    peakWorkingSetBytes = $null
    stdoutBytes = 0
    stderrBytes = 0
    terminationStatus = "not-required"
    reapStatus = "not-required"
    cleanupStatus = "succeeded"
  }
}

function Set-FirstFailure([string] $Code, [System.Collections.IDictionary] $Details) {
  if ($null -eq $script:primaryFailure) {
    $script:primaryFailure = [ordered]@{ code = $Code; details = $Details }
  }
}

function Test-SafeInteger([object] $Value, [bool] $Positive = $false) {
  if ($Value -isnot [long] -and $Value -isnot [int] -and $Value -isnot [double]) { return $false }
  $number = [double] $Value
  if ([double]::IsNaN($number) -or [double]::IsInfinity($number) -or $number -lt 0 -or $number -gt $maxSafe -or [math]::Floor($number) -ne $number) { return $false }
  return (-not $Positive) -or $number -gt 0
}

function Invoke-TaskKill([Diagnostics.Process] $Child) {
  $script:processState.terminationStatus = "failed"
  try {
    $taskkill = Start-Process -FilePath (Join-Path $env:SystemRoot "System32\\taskkill.exe") -ArgumentList @("/PID", [string] $Child.Id, "/T", "/F") -PassThru -WindowStyle Hidden
    if (-not $taskkill.WaitForExit($reapTimeoutMs)) { return }
    if ($taskkill.ExitCode -ne 0) { return }
    $script:processState.terminationStatus = "succeeded"
  } catch {
    return
  }
}

function Invoke-BoundedReap([Diagnostics.Process] $Child) {
  $script:processState.reapStatus = "failed"
  try {
    if ($Child.WaitForExit($reapTimeoutMs)) {
      $script:processState.reapStatus = "succeeded"
    }
  } catch {
    return
  }
}

function Get-FileLength([string] $Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return [long] 0 }
  return [long] (Get-Item -LiteralPath $Path -Force).Length
}

function Remove-OwnedPath([string] $Path, [string] $Target) {
  for ($attempt = 1; $attempt -le 2; $attempt++) {
    if (-not (Test-Path -LiteralPath $Path)) { return }
    try {
      Remove-Item -LiteralPath $Path -Force -Recurse -ErrorAction Stop
    } catch {
      $script:processState.cleanupStatus = "failed"
    }
    if (-not (Test-Path -LiteralPath $Path)) { return }
    if ($attempt -eq 1) { Start-Sleep -Milliseconds $PollIntervalMs }
  }
  if (Test-Path -LiteralPath $Path) {
    $script:processState.cleanupStatus = "failed"
    if ($null -eq $script:cleanupTarget) { $script:cleanupTarget = $Target }
  }
}

function Get-RustEvidence([string] $Path) {
  $raw = [IO.File]::ReadAllText($Path, [Text.Encoding]::UTF8)
  $prefixCount = $raw.Split($rustPrefix, [StringSplitOptions]::None).Count - 1
  if ($prefixCount -ne 1) {
    Set-FirstFailure "process.sentinel-count-invalid" ([ordered]@{ expected = 1; actual = [int] $prefixCount })
    return $null
  }
  $match = [regex]::Match($raw, [regex]::Escape($rustPrefix) + "([^`r`n]+)")
  if (-not $match.Success) {
    Set-FirstFailure "process.sentinel-malformed" ([ordered]@{ stage = "json" })
    return $null
  }
  try {
    return $match.Groups[1].Value | ConvertFrom-Json -AsHashtable -Depth 32
  } catch {
    Set-FirstFailure "process.sentinel-malformed" ([ordered]@{ stage = "json" })
    return $null
  }
}

function Get-PreflightFailure {
  if ($TestName -ne $expectedTestName -or $TimeoutMs -ne 180000 -or $PollIntervalMs -ne 25 -or $MaxStdoutBytes -ne 1048576 -or $MaxStderrBytes -ne 1048576) {
    return [ordered]@{ stage = "arguments"; reason = "identity" }
  }
  if (-not [IO.Path]::IsPathFullyQualified($ExecutablePath) -or -not [IO.Path]::IsPathFullyQualified($RequestPath) -or -not (Test-Path -LiteralPath $ExecutablePath -PathType Leaf) -or -not (Test-Path -LiteralPath $RequestPath -PathType Leaf) -or -not $ExecutablePath.EndsWith(".exe", [StringComparison]::OrdinalIgnoreCase)) {
    return [ordered]@{ stage = "arguments"; reason = "identity" }
  }
  try {
    $exe = Get-Item -LiteralPath $ExecutablePath -Force -ErrorAction Stop
    $request = Get-Item -LiteralPath $RequestPath -Force -ErrorAction Stop
    $rootPath = [IO.Path]::GetDirectoryName($RequestPath)
    if ([string]::IsNullOrWhiteSpace($rootPath) -or [IO.Path]::GetFileName($RequestPath) -ne "request.json" -or -not (Test-Path -LiteralPath $rootPath -PathType Container)) {
      return [ordered]@{ stage = "arguments"; reason = "identity" }
    }
    $rootItem = Get-Item -LiteralPath $rootPath -Force -ErrorAction Stop
    if (($exe.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or ($request.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or ($rootItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or $exe.PSIsContainer -or $request.PSIsContainer) {
      return [ordered]@{ stage = "arguments"; reason = "identity" }
    }
    return $null
  } catch {
    return [ordered]@{ stage = "arguments"; reason = "identity" }
  }
}

$primaryFailure = $null
$processState = New-ProcessState
$child = $null
$stdoutPath = $null
$stderrPath = $null
$root = $null
$hadRequestEnv = Test-Path "Env:$requestEnv"
$priorRequestEnv = [Environment]::GetEnvironmentVariable($requestEnv, "Process")
$cleanupTarget = $null
$evidence = $null

try {
  $preflightFailure = Get-PreflightFailure
  if ($null -ne $preflightFailure) {
    Set-FirstFailure "process.protocol-invalid" $preflightFailure
    # No request/root ownership was accepted, so no recursive cleanup may run.
    $processState.cleanupStatus = "failed"
  } else {
    $root = [IO.Path]::GetDirectoryName($RequestPath)
    $stdoutPath = Join-Path $root "libtest.stdout"
    $stderrPath = Join-Path $root "libtest.stderr"
    [Environment]::SetEnvironmentVariable($requestEnv, $RequestPath, "Process")
    try {
      $child = Start-Process -FilePath $ExecutablePath -ArgumentList @("--exact", $TestName, "--ignored", "--nocapture", "--test-threads=1") -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
    } catch {
      Set-FirstFailure "process.start-failed" ([ordered]@{ stage = "start" })
    }
  }

  if ($null -ne $child) {
    $clock = [Diagnostics.Stopwatch]::StartNew()
    while (-not $child.HasExited) {
      try {
        $child.Refresh()
        $rss = [long] $child.PeakWorkingSet64
        if ($rss -le 0) { Set-FirstFailure "process.rss-invalid" ([ordered]@{ reason = "zero" }) }
        elseif ($rss -gt $maxSafe) { Set-FirstFailure "process.rss-invalid" ([ordered]@{ reason = "unsafe-integer" }) }
        elseif ($null -eq $processState.peakWorkingSetBytes -or $rss -gt $processState.peakWorkingSetBytes) { $processState.peakWorkingSetBytes = $rss }
        $processState.stdoutBytes = Get-FileLength $stdoutPath
        $processState.stderrBytes = Get-FileLength $stderrPath
      } catch {
        Set-FirstFailure "process.rss-unavailable" ([ordered]@{ stage = "poll" })
      }
      if ($processState.stdoutBytes -gt $MaxStdoutBytes) { Set-FirstFailure "process.output-limit-exceeded" ([ordered]@{ stream = "stdout"; limitBytes = 1048576 }) }
      if ($processState.stderrBytes -gt $MaxStderrBytes) { Set-FirstFailure "process.output-limit-exceeded" ([ordered]@{ stream = "stderr"; limitBytes = 1048576 }) }
      if ($clock.ElapsedMilliseconds -ge $TimeoutMs) { $processState.timedOut = $true; Set-FirstFailure "process.timeout" ([ordered]@{ timeoutMs = 180000 }) }
      if ($null -ne $primaryFailure) { Invoke-TaskKill $child; Invoke-BoundedReap $child; break }
      Start-Sleep -Milliseconds $PollIntervalMs
    }

    if ($processState.reapStatus -eq "not-required") { Invoke-BoundedReap $child }
    if ($processState.reapStatus -eq "succeeded") {
      try {
        $child.Refresh()
        $rss = [long] $child.PeakWorkingSet64
        if ($rss -le 0 -and $null -eq $processState.peakWorkingSetBytes) { Set-FirstFailure "process.rss-invalid" ([ordered]@{ reason = "zero" }) }
        elseif ($rss -gt $maxSafe) { Set-FirstFailure "process.rss-invalid" ([ordered]@{ reason = "unsafe-integer" }) }
        elseif ($rss -gt 0) { $processState.peakWorkingSetBytes = $rss }
      } catch { Set-FirstFailure "process.rss-unavailable" ([ordered]@{ stage = "final-refresh" }) }
      $processState.stdoutBytes = Get-FileLength $stdoutPath
      $processState.stderrBytes = Get-FileLength $stderrPath
      if ($processState.stdoutBytes -gt $MaxStdoutBytes) { Set-FirstFailure "process.output-limit-exceeded" ([ordered]@{ stream = "stdout"; limitBytes = 1048576 }) }
      if ($processState.stderrBytes -gt $MaxStderrBytes) { Set-FirstFailure "process.output-limit-exceeded" ([ordered]@{ stream = "stderr"; limitBytes = 1048576 }) }
      $processState.exitCode = [int] $child.ExitCode
      if ($processState.exitCode -ne 0) { Set-FirstFailure "process.nonzero-exit" ([ordered]@{ exitCode = $processState.exitCode }) }
      if ($null -eq $primaryFailure) { $evidence = Get-RustEvidence $stdoutPath }
    } elseif ($null -eq $primaryFailure) {
      Set-FirstFailure "process.protocol-invalid" ([ordered]@{ stage = "process"; reason = "identity" })
    }
  }
} finally {
  if ($null -ne $child) { try { $child.Dispose() } catch {} }
  if ($hadRequestEnv) { [Environment]::SetEnvironmentVariable($requestEnv, $priorRequestEnv, "Process") } else { [Environment]::SetEnvironmentVariable($requestEnv, $null, "Process") }
  if ($null -ne $root) {
    Remove-OwnedPath $RequestPath "request"
    if ($null -ne $stdoutPath) { Remove-OwnedPath $stdoutPath "stdout" }
    if ($null -ne $stderrPath) { Remove-OwnedPath $stderrPath "stderr" }
    Remove-OwnedPath $root "temp-directory"
  }
  if ($processState.cleanupStatus -eq "failed" -and $null -eq $primaryFailure) {
    Set-FirstFailure "process.cleanup-failed" ([ordered]@{ target = ($cleanupTarget ?? "temp-directory") })
  }
}

if ($null -eq $primaryFailure -and $null -ne $evidence -and $processState.exitCode -eq 0 -and $processState.timedOut -eq $false -and $processState.peakWorkingSetBytes -ne $null -and $processState.reapStatus -eq "succeeded" -and $processState.cleanupStatus -eq "succeeded") {
  $envelope = [ordered]@{ schemaVersion = 1; status = "ok"; evidence = $evidence; process = $processState; partialEvidence = $false }
} else {
  if ($null -eq $primaryFailure) { Set-FirstFailure "process.protocol-invalid" ([ordered]@{ stage = "process"; reason = "identity" }) }
  $envelope = [ordered]@{ schemaVersion = 1; status = "rejected"; failure = $primaryFailure; process = $processState; partialEvidence = $false }
}

[Console]::Out.WriteLine($processPrefix + ($envelope | ConvertTo-Json -Compress -Depth 32))
exit 0
