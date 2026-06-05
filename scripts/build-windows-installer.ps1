<#
.SYNOPSIS
  Build the full Windows classic NSIS installer for agodesk (setup.exe).
  Chains frontend build + sidecar worker + tauri build targeting nsis + computer-use-sidecar feature.
  Intended for local Windows dev/CI. Produces the "klassischer Installer".

.EXAMPLE
  .\scripts\build-windows-installer.ps1
  # or with clean
  .\scripts\build-windows-installer.ps1 -Clean
#>
param(
  [switch]$Clean
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root

try {
  if ($Clean) {
    Write-Host "Cleaning target..."
    if (Test-Path "src-tauri/target") { Remove-Item -Recurse -Force "src-tauri/target" }
  }

  Write-Host "Running full Windows classic installer build via npm run build:win ..."
  npm run build:win

  $nsisOut = "src-tauri/target/release/bundle/nsis"
  if (Test-Path $nsisOut) {
    Write-Host "SUCCESS: Classic installer ready in $nsisOut"
    Get-ChildItem $nsisOut -Filter "*.exe" | Select-Object Name, Length
  } else {
    Write-Warning "nsis output dir not found; check build logs."
  }
}
finally {
  Pop-Location
}
