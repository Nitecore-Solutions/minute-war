<#
  Starts the whole dev stack in one command.

    npm start          (from the repo root)

  Launches, all from here:
    backend  Next.js API + admin  :3000
    backend  WebSocket server     :3002
    mobile   Expo                 :8081  (stays in the foreground)

  Ctrl+C stops everything it started. Logs land in .logs/ if you need them.

  Prerequisites:
    - MySQL 8 running and the minute_war database migrated
        node backend/scripts/migrate.mjs
    - backend/node_modules and mobile/node_modules installed
    - backend/.env exists
#>

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$logs = Join-Path $root ".logs"
$children = @()

function Kill-Tree([int]$pidToKill) {
    if ($pidToKill) { taskkill /PID $pidToKill /T /F 2>$null | Out-Null }
}

function Start-Node([string]$label, [string]$workDir, [string[]]$nodeArgs) {
    $out = Join-Path $logs "$label.out.log"
    $err = Join-Path $logs "$label.err.log"
    Write-Host "  starting $label"
    $p = Start-Process -FilePath "node" -ArgumentList $nodeArgs -WorkingDirectory $workDir `
        -RedirectStandardOutput $out -RedirectStandardError $err -PassThru -WindowStyle Hidden
    $script:children += $p.Id
    return $p
}

try {
    New-Item -ItemType Directory -Force -Path $logs | Out-Null

    # --- preflight ---------------------------------------------------------
    if (-not (Test-Path (Join-Path $root "backend\node_modules"))) {
        throw "backend dependencies missing - run: cd backend; npm install"
    }
    if (-not (Test-Path (Join-Path $root "mobile\node_modules"))) {
        throw "mobile dependencies missing - run: cd mobile; npm install"
    }
    if (-not (Test-Path (Join-Path $root "backend\.env"))) {
        throw "backend\.env is missing - copy .env.example and fill it in"
    }

    Write-Host "`nMINUTE WAR - dev stack" -ForegroundColor Cyan
    Write-Host "------------------------------------------------"

    # --- database ----------------------------------------------------------
    Write-Host "  checking the database"
    $check = & node (Join-Path $root "backend\scripts\db-query.mjs") "SELECT 1 AS ok" 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "cannot reach MySQL. Is the service running, and is DATABASE_URL correct in backend\.env`n$check"
    }
    Write-Host "  database reachable" -ForegroundColor Green

    # --- phone address -----------------------------------------------------
    # A phone cannot use localhost, and the LAN address changes whenever the
    # DHCP lease renews. A stale one produces a bare "Failed to fetch" with no
    # hint about the cause, so it is corrected on every start rather than left
    # for the user to debug.
    Write-Host "  checking the phone-facing API address"
    & node (Join-Path $root "backend\scripts\set-api-url.mjs") 2>&1 |
        Where-Object { $_ -match "EXPO_PUBLIC" } |
        ForEach-Object { Write-Host "  $_" }

    # --- backend -----------------------------------------------------------
    Start-Node "api" (Join-Path $root "backend") @("node_modules\next\dist\bin\next", "dev", "-p", "3000") | Out-Null
    Start-Node "ws"  (Join-Path $root "backend") @("src\ws-server\index.mjs") | Out-Null

    Write-Host "  waiting for the API"
    $ready = $false
    for ($i = 0; $i - 60; $i++) {
        Start-Sleep -Milliseconds 500
        try {
            $null = Invoke-WebRequest "http://localhost:3000/api/health" -UseBasicParsing -TimeoutSec 2
            $ready = $true
            break
        } catch {}
    }

    if (-not $ready) {
        throw "the API did not answer on :3000 within 30s. Check .logs\api.err.log"
    }
    Write-Host "  api ready on :3000" -ForegroundColor Green
    Write-Host "  admin dashboard: http://localhost:3000/admin" -ForegroundColor Green
    Write-Host "  websocket ready on :3002" -ForegroundColor Green

    # --- expo, in the foreground -----------------------------------------
    Write-Host "`n  Starting Expo. Scan the QR." -ForegroundColor Yellow
    Write-Host "  A physical phone needs EXPO_PUBLIC_API_URL set to this PC's LAN IP." -ForegroundColor Yellow
    Write-Host "  Ctrl+C here stops the whole stack.`n" -ForegroundColor Yellow

    Push-Location (Join-Path $root "mobile")
    try {
        & npx expo start
    } finally {
        Pop-Location
    }
}
catch {
    Write-Host "`n$($_.Exception.Message)`n" -ForegroundColor Red
}
finally {
    Write-Host "`nStopping the dev stack..." -ForegroundColor Cyan
    foreach ($id in $children) { Kill-Tree $id }
    Write-Host "  done.`n" -ForegroundColor Cyan
}