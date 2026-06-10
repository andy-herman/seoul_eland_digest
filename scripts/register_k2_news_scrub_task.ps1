param(
    [string]$TaskName = "SeoulElandK2ClubNewsScrub",
    [int]$IntervalHours = 6,
    [switch]$RunNow
)

$ErrorActionPreference = "Stop"

$ProjectDir = Split-Path -Parent $PSScriptRoot
$BatchPath = Join-Path $ProjectDir "run_k2_news_scrub.bat"

if (-not (Test-Path $BatchPath)) {
    throw "Missing batch entrypoint: $BatchPath"
}

$start = (Get-Date).Date.AddHours(6).AddMinutes(15)
while ($start -le (Get-Date)) {
    $start = $start.AddHours($IntervalHours)
}

$action = New-ScheduledTaskAction -Execute $BatchPath -WorkingDirectory $ProjectDir
$trigger = New-ScheduledTaskTrigger `
    -Once `
    -At $start `
    -RepetitionInterval (New-TimeSpan -Hours $IntervalHours) `
    -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2)

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description "Private Seoul E-Land K League 2 club-news scrubber for Obsidian scouting reports." `
    -Force | Out-Null

if ($RunNow) {
    Start-ScheduledTask -TaskName $TaskName
}

Get-ScheduledTask -TaskName $TaskName | Select-Object TaskName, State
