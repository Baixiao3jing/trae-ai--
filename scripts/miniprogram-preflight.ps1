[CmdletBinding()]
param(
  [switch]$CleanDevtoolsCache,
  [switch]$GeneratePreview,
  [string]$DevToolsCli = '',
  [int]$DevToolsPort = 0,
  [string]$OutputDirectory = ''
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$projectPath = Join-Path $repoRoot '程序'
if (-not $OutputDirectory) {
  $OutputDirectory = Join-Path $repoRoot 'artifacts\miniprogram-preflight'
}

function Resolve-DevToolsCli {
  param([string]$ExplicitPath)
  if ($ExplicitPath -and (Test-Path -LiteralPath $ExplicitPath)) {
    return (Resolve-Path -LiteralPath $ExplicitPath).Path
  }
  $candidates = @(
    'D:\tools\wx——kfz\微信web开发者工具\cli.bat',
    'C:\Program Files (x86)\Tencent\微信开发者工具\cli.bat',
    'C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat',
    'C:\Program Files\Tencent\微信开发者工具\cli.bat'
  )
  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) { return $candidate }
  }
  throw 'WeChat DevTools cli.bat was not found. Pass -DevToolsCli explicitly.'
}

function Invoke-Checked {
  param([string]$FilePath, [string[]]$Arguments)
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed ($LASTEXITCODE): $FilePath $($Arguments -join ' ')"
  }
}

function Test-WxmlBindings {
  $issues = @()
  Get-ChildItem (Join-Path $projectPath 'pages') -Recurse -Filter *.wxml | ForEach-Object {
    $wxml = Get-Content -Raw -LiteralPath $_.FullName
    $jsPath = [IO.Path]::ChangeExtension($_.FullName, '.js')
    if (-not (Test-Path -LiteralPath $jsPath)) { return }
    $js = Get-Content -Raw -LiteralPath $jsPath
    $matches = [regex]::Matches($wxml, '(?:bindtap|catchtap|bindinput|bindchange|bindsubmit)="([A-Za-z0-9_]+)"')
    foreach ($match in $matches) {
      $handler = $match.Groups[1].Value
      if ($handler -and $js -notmatch "(?m)^\s*$([regex]::Escape($handler))\s*\(") {
        $issues += "$($_.FullName): missing handler $handler"
      }
    }
  }
  if ($issues.Count) { throw ($issues -join [Environment]::NewLine) }
}

function Get-PackageFiles {
  $excludedFolders = @('cloudfunctions', 'tests', 'node_modules')
  $excludedFiles = @('.eslintrc.js', 'project.private.config.json', 'project.config.json')
  $excludedSuffixes = @('.log', '.tmp', '.zip', '.test.js')
  return Get-ChildItem -LiteralPath $projectPath -Recurse -Force -File | Where-Object {
    $relative = $_.FullName.Substring($projectPath.Length).TrimStart('\')
    $segments = $relative -split '\\'
    $folderBlocked = $segments | Where-Object { $excludedFolders -contains $_ }
    $suffixBlocked = $false
    foreach ($suffix in $excludedSuffixes) {
      if ($_.Name.EndsWith($suffix, [StringComparison]::OrdinalIgnoreCase)) { $suffixBlocked = $true; break }
    }
    -not $folderBlocked -and -not ($excludedFiles -contains $_.Name) -and -not $suffixBlocked
  }
}

Write-Host '[1/6] Checking suspicious files...'
$suspicious = Get-ChildItem -LiteralPath $projectPath -Recurse -Force | Where-Object {
  $_.Name -match '(^|\.)((tmp|temp|cache|coverage))($|\.)' -or
  $_.Name -match '\.(log|tmp|zip|bak)$' -or
  $_.Name -match '\.(test|spec)\.js$' -or
  ($_.PSIsContainer -and $_.Name -in @('node_modules', 'dist', 'build', 'coverage'))
}
if ($suspicious) {
  throw "Unexpected upload artifacts found:`n$($suspicious.FullName -join "`n")"
}

Write-Host '[2/6] Checking JavaScript and JSON...'
Get-ChildItem -LiteralPath $projectPath -Recurse -Filter *.js | ForEach-Object {
  Invoke-Checked -FilePath 'node' -Arguments @('--check', $_.FullName)
}
Get-ChildItem -LiteralPath $projectPath -Recurse -Filter *.json | ForEach-Object {
  Get-Content -Raw -LiteralPath $_.FullName | ConvertFrom-Json | Out-Null
}

Write-Host '[3/6] Checking WXML event bindings...'
Test-WxmlBindings

Write-Host '[4/6] Running regression tests...'
$testFiles = Get-ChildItem (Join-Path $repoRoot 'tests') -Filter *.test.js -File | Select-Object -ExpandProperty FullName
if ($testFiles.Count) {
  Invoke-Checked -FilePath 'node' -Arguments (@('--test') + $testFiles)
}

New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$packageFiles = @(Get-PackageFiles)
$manifestPath = Join-Path $OutputDirectory 'package-manifest.txt'
$packageFiles | ForEach-Object {
  $_.FullName.Substring($projectPath.Length).TrimStart('\')
} | Sort-Object | Set-Content -LiteralPath $manifestPath -Encoding UTF8

$summary = [ordered]@{
  checkedAt = (Get-Date).ToString('s')
  projectPath = $projectPath
  fileCount = $packageFiles.Count
  sourceBytes = ($packageFiles | Measure-Object Length -Sum).Sum
  gitCommit = (& git -C $repoRoot rev-parse --short HEAD 2>$null)
  cacheCleaned = [bool]$CleanDevtoolsCache
  previewGenerated = [bool]$GeneratePreview
}

if ($CleanDevtoolsCache -or $GeneratePreview) {
  $cli = Resolve-DevToolsCli -ExplicitPath $DevToolsCli
}

Write-Host '[5/6] Cleaning safe DevTools caches...'
if ($CleanDevtoolsCache) {
  foreach ($cacheType in @('storage', 'file', 'compile')) {
    $cacheArgs = @('cache', '--clean', $cacheType, '--project', $projectPath)
    if ($DevToolsPort -gt 0) { $cacheArgs += @('--port', "$DevToolsPort") }
    Invoke-Checked -FilePath $cli -Arguments $cacheArgs
  }
} else {
  Write-Host 'Skipped. Use -CleanDevtoolsCache to clean storage/file/compile.'
}

Write-Host '[6/6] Generating preview package information...'
if ($GeneratePreview) {
  $qrPath = Join-Path $OutputDirectory 'preview-qr.png'
  $infoPath = Join-Path $OutputDirectory 'preview-info.json'
  $previewArgs = @(
    'preview', '--project', $projectPath,
    '--qr-format', 'image', '--qr-output', $qrPath,
    '--info-output', $infoPath
  )
  if ($DevToolsPort -gt 0) { $previewArgs += @('--port', "$DevToolsPort") }
  Invoke-Checked -FilePath $cli -Arguments $previewArgs
} else {
  Write-Host 'Skipped. Use -GeneratePreview to compile and create preview info.'
}

$summaryPath = Join-Path $OutputDirectory 'preflight-summary.json'
$summary | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $summaryPath -Encoding UTF8
Write-Host "Preflight passed. Manifest: $manifestPath"
Write-Host "Summary: $summaryPath"
