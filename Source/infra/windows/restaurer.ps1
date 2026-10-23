# Restores the database from a backup (T-081, CDC technique §2.3): a dump of this server or of
# the external disk, or the newest one of the OVH vault; then the issued files missing here.
# Launched by "Restaurer.cmd", as administrator; on a new server, right after
# "Installer ou mettre a jour.cmd". The base replaced is dumped first (avant-restauration-*).
$ErrorActionPreference = 'Stop'

$principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Start-Process powershell.exe -Verb RunAs -ArgumentList @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"")
  exit
}

$Task = 'VenteWeb-Sauvegarde'
trap {
  Write-Host ''
  Write-Host "Échec : $_" -ForegroundColor Red
  Write-Host 'Corrigez la cause, puis relancez ce script.' -ForegroundColor Red
  Enable-ScheduledTask -TaskName $Task -ErrorAction SilentlyContinue | Out-Null
  Read-Host 'Appuyez sur Entrée pour fermer'
  exit 1
}

$App = Split-Path -Parent $PSScriptRoot
$Data = Join-Path $env:ProgramData 'VenteWeb'
$Node = Join-Path $App 'node\node.exe'
$Pg = Join-Path $App 'pgsql\bin'
$EnvFile = Join-Path $Data '.env'
$Backup = Join-Path $PSScriptRoot 'sauvegarde.mjs'
$Utf8 = New-Object System.Text.UTF8Encoding $false

function Step($text) { Write-Host ''; Write-Host "== $text" -ForegroundColor Cyan }

function Check($what) { if ($LASTEXITCODE -ne 0) { throw "$what (code $LASTEXITCODE)" } }

function Read-EnvFile($path) {
  $values = [ordered]@{}
  foreach ($line in [IO.File]::ReadAllLines($path)) {
    if ($line -match '^\s*([A-Z0-9_]+)=(.*)$') { $values[$Matches[1]] = $Matches[2].Trim() }
  }
  return $values
}

if (-not (Test-Path $EnvFile)) {
  throw "Serveur non installé : lancez d'abord « Installer ou mettre a jour.cmd »."
}
$values = Read-EnvFile $EnvFile

Write-Host 'Restauration de la base' -ForegroundColor Green
Write-Host 'Tout ce qui a été enregistré après la sauvegarde choisie sera perdu.' -ForegroundColor Yellow
Write-Host ''
$folders = @(Join-Path $Data 'sauvegardes')
if ($values['BACKUP_DISK']) { $folders += Join-Path $values['BACKUP_DISK'] 'sauvegardes' }
$dumps = @(@(foreach ($folder in $folders) {
      if (Test-Path $folder) { Get-ChildItem $folder -Recurse -File -Filter '*.dump' }
    }) | Sort-Object LastWriteTime -Descending | Select-Object -First 15)
for ($i = 0; $i -lt $dumps.Count; $i++) {
  Write-Host ('{0,3}. {1:dd/MM/yyyy HH:mm}  {2}' -f ($i + 1), $dumps[$i].LastWriteTime, $dumps[$i].FullName)
}
$vault = [bool]$values['BACKUP_S3_BUCKET']
if ($vault) { Write-Host '  O. la plus récente du coffre OVH (serveur neuf ou disques perdus)' }
$choice = (Read-Host 'Numéro, O, ou chemin complet du fichier .dump').Trim().Trim('"')
$fetched = $null
if ($vault -and $choice -eq 'O') {
  $typed = (Read-Host "Mot de passe de l'enveloppe scellée (Entrée : celui de ce serveur)").Trim()
  # Tried first through the environment, which wins over the .env; kept once it opened the vault.
  if ($typed) { $env:BACKUP_PASSPHRASE = $typed }
  $incoming = Join-Path $Data 'restauration'
  New-Item -ItemType Directory -Force -Path $incoming | Out-Null
  $fetched = & $Node "--env-file=$EnvFile" $Backup ovh-dernier $incoming | Select-Object -Last 1
  Check 'Récupération depuis le coffre OVH'
  if ($typed) {
    $lines = [IO.File]::ReadAllLines($EnvFile) | Where-Object { $_ -notmatch '^\s*BACKUP_PASSPHRASE=' }
    [IO.File]::WriteAllText($EnvFile, ((@($lines) + "BACKUP_PASSPHRASE=$typed") -join "`n") + "`n", $Utf8)
  }
  $file = $fetched
} elseif ($choice -match '^\d+$' -and [int]$choice -ge 1 -and [int]$choice -le $dumps.Count) {
  $file = $dumps[[int]$choice - 1].FullName
} else {
  $file = $choice
}
if (-not $file -or -not (Test-Path $file -PathType Leaf)) { throw "Fichier introuvable : $file" }
Write-Host "Sauvegarde choisie : $file"
if ((Read-Host 'Tapez RESTAURER pour remplacer la base actuelle') -cne 'RESTAURER') {
  Write-Host "Abandon : rien n'a changé."
  Read-Host 'Appuyez sur Entrée pour fermer'
  exit
}

Step "Arrêt de l'API et des sauvegardes automatiques"
Disable-ScheduledTask -TaskName $Task -ErrorAction SilentlyContinue | Out-Null
if (Get-Service 'VenteWeb-API' -ErrorAction SilentlyContinue) { Stop-Service 'VenteWeb-API' -Force }

$env:PGPASSWORD = $values['POSTGRES_PASSWORD']
$psql = Join-Path $Pg 'psql.exe'
$exists = & $psql -h 127.0.0.1 -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = 'vente_web'"
Check 'Connexion à PostgreSQL'
if ($exists -eq '1') {
  Step 'Sauvegarde de la base actuelle'
  $before = Join-Path $Data ("sauvegardes\avant-restauration-{0:yyyyMMdd-HHmmss}.dump" -f (Get-Date))
  & (Join-Path $Pg 'pg_dump.exe') -h 127.0.0.1 -U postgres -Fc -f $before vente_web
  Check 'Sauvegarde (pg_dump)'
  Write-Host "Sauvegarde : $before"
}

Step 'Restauration'
@"
DROP DATABASE IF EXISTS vente_web WITH (FORCE);
CREATE DATABASE vente_web OWNER vente_web;
REVOKE ALL ON DATABASE vente_web FROM PUBLIC;
GRANT CONNECT ON DATABASE vente_web TO vente_web_api;
"@ | & $psql -h 127.0.0.1 -U postgres -d postgres -q -v ON_ERROR_STOP=1
Check 'Nouvelle base'
& (Join-Path $Pg 'pg_restore.exe') -h 127.0.0.1 -U postgres -d vente_web --exit-on-error $file
Check 'Restauration (pg_restore)'
Remove-Item Env:\PGPASSWORD
if ($fetched) { Remove-Item $fetched -Force }

Step 'Fichiers émis manquants (disque externe, coffre OVH)'
& $Node "--env-file=$EnvFile" $Backup fichiers
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Fichiers non récupérés : relancez ce script plus tard, la base est déjà restaurée.' -ForegroundColor Yellow
}

Step 'Migrations de la base'
& $Node "--env-file=$EnvFile" (Join-Path $App 'api\dist\cli\migrate.js')
Check 'Migrations'

Step 'Redémarrage'
Start-Service 'VenteWeb-API'
$healthy = $false
foreach ($attempt in 1..30) {
  try {
    $health = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 'http://127.0.0.1:3000/healthz'
    if ($health.StatusCode -eq 200) { $healthy = $true; break }
  } catch { Start-Sleep -Seconds 2 }
}
if (-not $healthy) { throw "L'API ne répond pas : voir $Data\journaux\VenteWeb-API.err.log" }
Enable-ScheduledTask -TaskName $Task -ErrorAction SilentlyContinue | Out-Null

Write-Host ''
Write-Host 'Terminé : la base est restaurée et l''application en service.' -ForegroundColor Green
Read-Host 'Appuyez sur Entrée pour fermer'
