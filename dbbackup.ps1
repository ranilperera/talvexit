# PostgreSQL Backup Script for onsys_dev

# --- Configuration ---
$dbName      = "onys_dev"
$userName    = "postgres"
$backupPath  = "C:\DEV2026\talvex-v1"

# Create backup folder if it doesn't exist
if (!(Test-Path $backupPath)) {
    New-Item -ItemType Directory -Path $backupPath | Out-Null
}

# Timestamp for unique filename
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"

# Backup file name
$backupFile = "$backupPath\$dbName`_$timestamp.backup"

# Set password securely (or use .pgpass file instead)
$env:PGPASSWORD = "Me1b0urne"

Write-Host "Backup started : $backupFile"
# Run pg_dump
& "pg_dump " `
    -U $userName `
    -F c `
    -b `
    -v `
    -f $backupFile `
    $dbName

# Clear password from session
Remove-Item Env:PGPASSWORD

# pg_restore -U postgres -d onsys_dev -v "C:\PostgresBackups\onsys_dev_20260416_103000.backup"

Write-Host "Backup completed: $backupFile"