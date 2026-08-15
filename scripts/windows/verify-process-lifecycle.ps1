param(
  [Parameter(Mandatory = $true)]
  [string]$BeamExecutable,
  [ValidateSet('Close', 'Crash')]
  [string]$ExitMode = 'Close',
  [ValidateRange(1, 50)]
  [int]$Iterations = 3,
  [ValidateRange(1, 600)]
  [int]$ObservationSeconds = 15,
  [ValidateRange(1, 60)]
  [int]$ExitDeadlineSeconds = 12
)

$ErrorActionPreference = 'Stop'
$beamPath = [System.IO.Path]::GetFullPath($BeamExecutable)
if (-not (Test-Path -LiteralPath $beamPath -PathType Leaf)) {
  throw "Beam executable not found: $beamPath"
}

function Get-ProcessSnapshot {
  @(Get-CimInstance Win32_Process | ForEach-Object {
    [pscustomobject]@{
      Id = [uint32]$_.ProcessId
      ParentId = [uint32]$_.ParentProcessId
      Path = $_.ExecutablePath
      Name = $_.Name
    }
  })
}

function Get-Descendants([uint32]$RootId, [object[]]$Snapshot) {
  $known = [System.Collections.Generic.HashSet[uint32]]::new()
  [void]$known.Add($RootId)
  $changed = $true
  while ($changed) {
    $changed = $false
    foreach ($entry in $Snapshot) {
      if ($known.Contains($entry.ParentId) -and $known.Add($entry.Id)) {
        $changed = $true
      }
    }
  }
  @($Snapshot | Where-Object { $known.Contains($_.Id) })
}

for ($iteration = 1; $iteration -le $Iterations; $iteration += 1) {
  $root = Start-Process -FilePath $beamPath -PassThru
  Write-Host "[$iteration/$Iterations] Beam root PID $($root.Id) started from $beamPath"
  Start-Sleep -Seconds $ObservationSeconds

  $owned = Get-Descendants -RootId $root.Id -Snapshot (Get-ProcessSnapshot)
  if (-not ($owned | Where-Object { $_.Id -eq $root.Id -and $_.Path -eq $beamPath })) {
    throw "PID $($root.Id) no longer maps to the exact Beam path; refusing to inspect or stop it."
  }
  $owned | Sort-Object Id | Format-Table Id, ParentId, Name, Path -AutoSize

  if ($ExitMode -eq 'Crash') {
    Stop-Process -Id $root.Id -Force
  } elseif (-not $root.CloseMainWindow()) {
    throw "Beam PID $($root.Id) has no closable main window. Close it manually, then rerun the check."
  }

  $deadline = [DateTime]::UtcNow.AddSeconds($ExitDeadlineSeconds)
  do {
    $liveById = @{}
    foreach ($entry in Get-ProcessSnapshot) { $liveById[$entry.Id] = $entry }
    $survivors = @($owned | Where-Object {
      $live = $liveById[$_.Id]
      $null -ne $live -and $live.Path -eq $_.Path
    })
    if ($survivors.Count -eq 0) { break }
    Start-Sleep -Milliseconds 200
  } while ([DateTime]::UtcNow -lt $deadline)

  if ($survivors.Count -gt 0) {
    $details = $survivors | Format-Table Id, ParentId, Name, Path -AutoSize | Out-String
    throw "Owned Beam processes survived $ExitMode beyond the deadline:`n$details"
  }
  Write-Host "[$iteration/$Iterations] PASS: every observed exact PID/path exited."
}
