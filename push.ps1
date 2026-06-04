# ── Quick Git Push Script ──────────────────────────
# Usage: Right-click -> "Run with PowerShell"  or  .\push.ps1 "your commit message"

param(
    [string]$Message = ""
)

$ErrorActionPreference = "Stop"

# If no message provided, prompt for one
if (-not $Message) {
    $Message = Read-Host "Commit message"
    if (-not $Message) {
        $Message = "save progress $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
    }
}

Write-Host ""
Write-Host "=== Git Push ===" -ForegroundColor Cyan
Write-Host ""

# Show what changed
Write-Host "[1/4] Changes:" -ForegroundColor Yellow
git status --short
Write-Host ""

# Stage everything
Write-Host "[2/4] Staging all changes..." -ForegroundColor Yellow
git add -A

# Commit
Write-Host "[3/4] Committing: $Message" -ForegroundColor Yellow
git commit -m $Message

# Push
Write-Host "[4/4] Pushing to origin..." -ForegroundColor Yellow
git push origin

Write-Host ""
Write-Host "Done!" -ForegroundColor Green
Write-Host ""
pause
