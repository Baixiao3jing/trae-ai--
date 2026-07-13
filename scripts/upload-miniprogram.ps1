[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^\d+\.\d+\.\d+$')]
  [string]$Version,

  [Parameter(Mandatory = $true)]
  [ValidateLength(4, 80)]
  [string]$Description,

  [string]$DevToolsCli = '',
  [int]$DevToolsPort = 0
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$projectPath = Join-Path $repoRoot '程序'
$outputDirectory = Join-Path $repoRoot "artifacts\uploads\$Version"
$preflight = Join-Path $PSScriptRoot 'miniprogram-preflight.ps1'

& $preflight -CleanDevtoolsCache -GeneratePreview -DevToolsCli $DevToolsCli -DevToolsPort $DevToolsPort -OutputDirectory $outputDirectory
if ($LASTEXITCODE -ne 0) { throw 'Preflight failed. Upload cancelled.' }

function Resolve-DevToolsCli {
  param([string]$ExplicitPath)
  if ($ExplicitPath -and (Test-Path -LiteralPath $ExplicitPath)) { return (Resolve-Path -LiteralPath $ExplicitPath).Path }
  $known = 'D:\tools\wx——kfz\微信web开发者工具\cli.bat'
  if (Test-Path -LiteralPath $known) { return $known }
  throw 'WeChat DevTools cli.bat was not found. Pass -DevToolsCli explicitly.'
}

$cli = Resolve-DevToolsCli -ExplicitPath $DevToolsCli
$uploadInfo = Join-Path $outputDirectory 'upload-info.json'
$uploadArgs = @('upload', '--project', $projectPath, '--version', $Version, '--desc', $Description, '--info-output', $uploadInfo)
if ($DevToolsPort -gt 0) { $uploadArgs += @('--port', "$DevToolsPort") }
& $cli @uploadArgs
if ($LASTEXITCODE -ne 0) { throw 'Mini program upload failed.' }

Write-Host "Upload completed: version $Version"
Write-Host "Upload info: $uploadInfo"
Write-Host 'Next: set this version as the experience version in mp.weixin.qq.com before A/B testing.'
