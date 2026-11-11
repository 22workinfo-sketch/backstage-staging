# ==============================================================================
# Botdesk Staging Database Migration & Admin Setup (Interactive & Secure)
# ==============================================================================
# This script applies Prisma migrations to your NEW Neon staging database
# and provisions your initial Super-Admin user.
#
# Credentials are entered as masked input, never printed to console,
# never written to local .env, and wiped from memory upon completion.
# ==============================================================================

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host " Botdesk Staging Database Migration & Provisioning Tool" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Secure Input for Neon Direct Connection String
Write-Host "[Step 1/5] Enter your Neon DIRECT Connection String" -ForegroundColor Yellow
Write-Host "In Neon Console: Connection Details -> Select 'Direct connection' (not Pooled)." -ForegroundColor Gray
Write-Host "Input is masked and will not appear in command history." -ForegroundColor Gray
$secureUrl = Read-Host "Neon Direct URL" -AsSecureString
$bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureUrl)
$dbUrl = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr).Trim()
[System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)

if ([string]::IsNullOrWhiteSpace($dbUrl)) {
    Write-Host "[ERROR] Connection string cannot be empty. Aborted." -ForegroundColor Red
    exit 1
}

# Target Database Safety Checks
if ($dbUrl -match "127\.0\.0\.1" -or $dbUrl -match "localhost") {
    Write-Host "[SAFETY ERROR] Localhost database detected! Aborted to protect local database." -ForegroundColor Red
    exit 1
}

if ($dbUrl -notmatch "neon\.tech" -and $dbUrl -notmatch "postgresql://") {
    Write-Host "[WARNING] Connection string does not appear to be a Neon PostgreSQL URL." -ForegroundColor Yellow
    $confirm = Read-Host "Are you sure you want to proceed against this database? (yes/no)"
    if ($confirm -ne "yes") {
        Write-Host "Aborted by user." -ForegroundColor Red
        exit 1
    }
}

if ($dbUrl -match "-pooler\.") {
    Write-Host ""
    Write-Host "[WARNING] You entered a POOLED connection string (contains '-pooler')." -ForegroundColor Yellow
    Write-Host "Prisma migrations require session advisory locks that may fail on connection poolers." -ForegroundColor Yellow
    Write-Host "Please use the DIRECT connection string from the Neon Console if possible." -ForegroundColor Yellow
    $poolConfirm = Read-Host "Proceed anyway? (yes/no)"
    if ($poolConfirm -ne "yes") {
        Write-Host "Aborted. Please re-run with Neon Direct Connection." -ForegroundColor Red
        exit 1
    }
}

# Ensure sslmode=require is present
if ($dbUrl -notmatch "sslmode=") {
    if ($dbUrl -match "\?") {
        $dbUrl = "$dbUrl&sslmode=require"
    } else {
        $dbUrl = "$dbUrl?sslmode=require"
    }
}

Write-Host "[OK] Target verified as remote PostgreSQL database." -ForegroundColor Green
Write-Host ""

# 2. Secure Input for Staging Admin Account
Write-Host "[Step 2/5] Staging Admin Account Configuration" -ForegroundColor Yellow
$adminEmail = Read-Host "Enter Staging Super-Admin Email (e.g. admin@yourdomain.com)"
if ([string]::IsNullOrWhiteSpace($adminEmail) -or $adminEmail -notmatch "@") {
    Write-Host "[ERROR] Invalid email address format. Aborted." -ForegroundColor Red
    exit 1
}

$securePass = Read-Host "Enter Staging Super-Admin Password (min 10 characters, masked)" -AsSecureString
$bstrPass = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePass)
$adminPass = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstrPass).Trim()
[System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstrPass)

if ($adminPass.Length -lt 10) {
    Write-Host "[ERROR] Password must be at least 10 characters long. Aborted." -ForegroundColor Red
    exit 1
}

if ($adminPass -match "change_me" -or $adminPass -match "password123") {
    Write-Host "[ERROR] Insecure or default password detected. Please choose a strong password. Aborted." -ForegroundColor Red
    exit 1
}

Write-Host "[OK] Admin credentials validated." -ForegroundColor Green
Write-Host ""

# 3. Choose Seeding Mode
Write-Host "[Step 3/5] Select Database Seeding Mode" -ForegroundColor Yellow
Write-Host "  1) Admin-Only (Recommended): Provisions Super-Admin. Bot tables remain clean." -ForegroundColor White
Write-Host "  2) Full Seed: Provisions Super-Admin + Demo placeholder bot + default welcome text + 2 demo buttons." -ForegroundColor White
$seedChoice = Read-Host "Select option (1 or 2, default is 1)"
if ([string]::IsNullOrWhiteSpace($seedChoice)) {
    $seedChoice = "1"
}

Write-Host ""
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host " Beginning Staging Database Operations" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan

# Set temporary process-level environment variable (does NOT touch .env on disk)
$env:DATABASE_URL = $dbUrl
$env:NODE_ENV = "production"
$env:ADMIN_DEFAULT_EMAIL = $adminEmail
$env:ADMIN_DEFAULT_PASSWORD = $adminPass

try {
    # 4. Apply Prisma Migrations
    Write-Host ""
    Write-Host "[Step 4/5] Deploying Prisma Migrations (16 migrations)..." -ForegroundColor Yellow
    & npx.cmd prisma migrate deploy
    if ($LASTEXITCODE -ne 0) {
        throw "Prisma migration deploy failed with exit code $LASTEXITCODE."
    }
    Write-Host "[SUCCESS] All 16 database migrations deployed successfully." -ForegroundColor Green

    # 5. Provision Admin Account
    Write-Host ""
    Write-Host "[Step 5/5] Provisioning Staging Administrator..." -ForegroundColor Yellow
    if ($seedChoice -eq "2") {
        Write-Host "Running full seed (Admin + placeholder bot + demo configuration)..." -ForegroundColor Gray
        & npx.cmd tsx prisma/seed.ts
    } else {
        Write-Host "Running admin-only provisioning..." -ForegroundColor Gray
        & npx.cmd tsx scripts/create-admin-only.ts
    }

    if ($LASTEXITCODE -ne 0) {
        throw "Admin provisioning failed with exit code $LASTEXITCODE."
    }

    # 6. Verification Query (No secrets exposed)
    Write-Host ""
    Write-Host "------------------------------------------------------------------" -ForegroundColor Cyan
    Write-Host " Automated Staging Database Verification" -ForegroundColor Cyan
    Write-Host "------------------------------------------------------------------" -ForegroundColor Cyan

    & npx.cmd tsx scripts/verify-staging-db.ts
    if ($LASTEXITCODE -ne 0) {
        throw "Verification query failed with exit code $LASTEXITCODE."
    }

    Write-Host ""
    Write-Host "==================================================================" -ForegroundColor Green
    Write-Host " STAGING DATABASE SETUP COMPLETE: PASS" -ForegroundColor Green
    Write-Host "==================================================================" -ForegroundColor Green

} catch {
    Write-Host ""
    Write-Host "==================================================================" -ForegroundColor Red
    Write-Host " STAGING DATABASE SETUP FAILED: FAIL" -ForegroundColor Red
    Write-Host " Error: $_" -ForegroundColor Red
    Write-Host "==================================================================" -ForegroundColor Red
} finally {
    # Wipe credentials from memory
    $dbUrl = $null
    $adminPass = $null
    $adminEmail = $null
    Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
    Remove-Item Env:NODE_ENV -ErrorAction SilentlyContinue
    Remove-Item Env:ADMIN_DEFAULT_EMAIL -ErrorAction SilentlyContinue
    Remove-Item Env:ADMIN_DEFAULT_PASSWORD -ErrorAction SilentlyContinue
    Write-Host "[Security Cleanup] All temporary credentials wiped from memory." -ForegroundColor Gray
}
