# Installs or updates the shop server from this folder (T-080, ADR-0007); the same script for
# both, run again at will. Launched by "Installer.cmd" or "Mettre a jour.cmd", as administrator.
# Data stay outside the application folder, in C:\ProgramData\VenteWeb: database, issued
# files, backups, certificates, logs and the .env of secrets.
$ErrorActionPreference = 'Stop'

$principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Start-Process powershell.exe -Verb RunAs -ArgumentList @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"")
  exit
}

trap {
  Write-Host ''
  Write-Host "Échec : $_" -ForegroundColor Red
  Write-Host "Rien n'est perdu : corrigez la cause, puis relancez ce script." -ForegroundColor Red
  Read-Host 'Appuyez sur Entrée pour fermer'
  exit 1
}

$App = Split-Path -Parent $PSScriptRoot
$Data = Join-Path $env:ProgramData 'VenteWeb'
$Node = Join-Path $App 'node\node.exe'
$Pg = Join-Path $App 'pgsql\bin'
$EnvFile = Join-Path $Data '.env'
$Services = Join-Path $Data 'services'
$Utf8 = New-Object System.Text.UTF8Encoding $false
$AppName = (Get-Content (Join-Path $App 'nom.json') -Raw -Encoding UTF8 | ConvertFrom-Json).name
$Version = (Get-Content (Join-Path $App 'version.txt') -Raw).Trim()

function Step($text) { Write-Host ''; Write-Host "== $text" -ForegroundColor Cyan }

function Check($what) { if ($LASTEXITCODE -ne 0) { throw "$what (code $LASTEXITCODE)" } }

function Read-EnvFile($path) {
  $values = [ordered]@{}
  if (Test-Path $path) {
    foreach ($line in [IO.File]::ReadAllLines($path)) {
      if ($line -match '^\s*([A-Z0-9_]+)=(.*)$') { $values[$Matches[1]] = $Matches[2].Trim() }
    }
  }
  return $values
}

function Write-EnvFile($path, $values) {
  $lines = foreach ($key in $values.Keys) { "$key=$($values[$key])" }
  [IO.File]::WriteAllText($path, (($lines -join "`n") + "`n"), $Utf8)
}

# A Windows service run by WinSW: its XML is read at each start, so an update only rewrites it.
function Install-AppService($id, $title, $exe, $arguments, $depend) {
  $x = { param($text) [Security.SecurityElement]::Escape($text) }
  $dependLine = if ($depend) { "<depend>$depend</depend>" } else { '' }
  $xml = @"
<service>
  <id>$id</id>
  <name>$(& $x "$AppName - $title")</name>
  <description>$(& $x "$title ($AppName, version $Version)")</description>
  <executable>$(& $x $exe)</executable>
  <arguments>$(& $x $arguments)</arguments>
  <workingdirectory>$(& $x $App)</workingdirectory>
  <startmode>Automatic</startmode>
  $dependLine
  <onfailure action="restart" delay="10 sec"/>
  <resetfailure>1 hour</resetfailure>
  <logpath>$(& $x (Join-Path $Data 'journaux'))</logpath>
  <log mode="roll-by-size"><sizeThreshold>10240</sizeThreshold><keepFiles>8</keepFiles></log>
  <env name="VW_APP" value="$(& $x ($App -replace '\\', '/'))"/>
  <env name="VW_DATA" value="$(& $x ($Data -replace '\\', '/'))"/>
</service>
"@
  Copy-Item (Join-Path $App 'winsw.exe') (Join-Path $Services "$id.exe") -Force
  [IO.File]::WriteAllText((Join-Path $Services "$id.xml"), $xml, $Utf8)
  if (-not (Get-Service $id -ErrorAction SilentlyContinue)) {
    & (Join-Path $Services "$id.exe") install | Out-Null
    Check "Création du service $id"
  }
}

Write-Host "$AppName — installation ou mise à jour (version $Version)" -ForegroundColor Green
Write-Host "Application : $App"
Write-Host "Données     : $Data"

Step 'Dossier des données'
$first = -not (Test-Path (Join-Path $Data 'pgdata\PG_VERSION'))
foreach ($dir in 'pgdata', 'fichiers', 'sauvegardes', 'caddy', 'journaux', 'services') {
  New-Item -ItemType Directory -Force -Path (Join-Path $Data $dir) | Out-Null
}
# SYSTEM and Administrators only (SIDs: the names change with the Windows language);
# PostgreSQL runs as NetworkService and must also reach its binaries.
& icacls $Data /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' /Q | Out-Null
Check 'Droits du dossier des données'
& icacls (Join-Path $Data 'pgdata') /grant '*S-1-5-20:(OI)(CI)M' /Q | Out-Null
Check 'Droits du dossier de la base'
& icacls (Join-Path $App 'pgsql') /grant '*S-1-5-20:(OI)(CI)RX' /Q | Out-Null
Check 'Droits des programmes PostgreSQL'

Step 'Paramètres (.env)'
$values = Read-EnvFile $EnvFile
$client = Join-Path $App 'installation.env'
foreach ($pair in (Read-EnvFile $client).GetEnumerator()) { $values[$pair.Key] = $pair.Value }
if (-not $values['POSTGRES_PASSWORD']) {
  foreach ($line in (& $Node (Join-Path $PSScriptRoot 'secrets.mjs'))) {
    $key, $value = $line -split '=', 2
    $values[$key] = $value
  }
  Check 'Création des secrets'
}
foreach ($required in 'APP_DOMAIN', 'LAN_IP', 'OVH_APPLICATION_KEY', 'OVH_APPLICATION_SECRET', 'OVH_CONSUMER_KEY') {
  if (-not $values[$required]) { throw "Paramètre $required manquant : reconstruire le dossier avec pnpm dist --client <fichier>." }
}
if (-not $values['OVH_ENDPOINT']) { $values['OVH_ENDPOINT'] = 'ovh-eu' }
if (-not $values['VAPID_SUBJECT']) { $values['VAPID_SUBJECT'] = "https://$($values['APP_DOMAIN'])" }
$values['NODE_ENV'] = 'production'
$values['APP_NAME'] = "`"$AppName`""
$values['API_HOST'] = '127.0.0.1'
$values['API_PORT'] = '3000'
$values['TZ'] = 'Indian/Antananarivo'
$values['LOG_LEVEL'] = 'info'
$values['FILES_DIR'] = Join-Path $Data 'fichiers'
$values['BACKUP_STATUS_FILE'] = Join-Path $Data 'derniere-sauvegarde.txt'
$values['DATABASE_URL'] = "postgresql://vente_web_api:$($values['API_PASSWORD'])@127.0.0.1:5432/vente_web"
$values['MIGRATION_DATABASE_URL'] = "postgresql://vente_web:$($values['OWNER_PASSWORD'])@127.0.0.1:5432/vente_web"
# The key of the OVH vault (rclone crypt, T-081): kept on a sealed envelope out of the shop,
# the only way to read the backups once this server is lost. Hex: copied by hand.
$newVaultKey = -not $values['BACKUP_PASSPHRASE']
if ($newVaultKey) {
  $bytes = New-Object byte[] 16
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $values['BACKUP_PASSPHRASE'] = (($bytes | ForEach-Object { $_.ToString('x2') }) -join '') -replace '(.{4})(?!$)', '$1-'
}
Write-EnvFile $EnvFile $values
if (Test-Path $client) { Remove-Item $client -Force }
if ($newVaultKey) {
  Write-Host "Mot de passe des sauvegardes chiffrées : $($values['BACKUP_PASSPHRASE'])" -ForegroundColor Yellow
  Write-Host "Notez-le sur l'enveloppe scellée gardée hors du magasin : sans lui, le coffre OVH est illisible." -ForegroundColor Yellow
  Read-Host 'Une fois noté, appuyez sur Entrée' | Out-Null
}
$remote = [bool]$values['WG_PRIVATE_KEY']

Step 'Arrêt des services'
foreach ($id in 'VenteWeb-Distant', 'VenteWeb-Caddy', 'VenteWeb-DNS', 'VenteWeb-API') {
  if (Get-Service $id -ErrorAction SilentlyContinue) { Stop-Service $id -Force }
}

$env:PGPASSWORD = $values['POSTGRES_PASSWORD']
$pgdata = Join-Path $Data 'pgdata'
$psql = Join-Path $Pg 'psql.exe'
if ($first) {
  Step 'Création de la base PostgreSQL'
  $pwfile = Join-Path $Data 'pw.tmp'
  [IO.File]::WriteAllText($pwfile, $values['POSTGRES_PASSWORD'], $Utf8)
  & (Join-Path $Pg 'initdb.exe') -D $pgdata -U postgres "--pwfile=$pwfile" -E UTF8 --locale=C `
    --locale-provider=icu --icu-locale=fr -A scram-sha-256
  $code = $LASTEXITCODE
  Remove-Item $pwfile -Force
  if ($code -ne 0) { throw "initdb (code $code)" }
  Add-Content -Path (Join-Path $pgdata 'postgresql.conf') -Encoding Ascii -Value @(
    "listen_addresses = '127.0.0.1'", 'port = 5432', 'logging_collector = on')
}

# Registered again at each run: the application folder of a new version may sit elsewhere.
Step 'Service PostgreSQL'
if (Get-Service 'VenteWeb-PostgreSQL' -ErrorAction SilentlyContinue) {
  Stop-Service 'VenteWeb-PostgreSQL' -Force
  & (Join-Path $Pg 'pg_ctl.exe') unregister -N VenteWeb-PostgreSQL
  Check "Retrait de l'ancien service PostgreSQL"
}
& (Join-Path $Pg 'pg_ctl.exe') register -N VenteWeb-PostgreSQL -U 'NT AUTHORITY\NetworkService' `
  -D $pgdata -S auto -w
Check 'Création du service PostgreSQL'
Start-Service 'VenteWeb-PostgreSQL'

$exists = & $psql -h 127.0.0.1 -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = 'vente_web'"
Check 'Connexion à PostgreSQL'
if ($exists -eq '1') {
  Step 'Sauvegarde avant mise à jour'
  $dump = Join-Path $Data ("sauvegardes\avant-mise-a-jour-{0:yyyyMMdd-HHmmss}.dump" -f (Get-Date))
  & (Join-Path $Pg 'pg_dump.exe') -h 127.0.0.1 -U postgres -Fc -f $dump vente_web
  Check 'Sauvegarde (pg_dump)'
  Write-Host "Sauvegarde : $dump"
}

Step 'Rôles et base'
$owner = $values['OWNER_PASSWORD']
$api = $values['API_PASSWORD']
@"
SELECT 'CREATE ROLE vente_web LOGIN' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'vente_web') \gexec
SELECT 'CREATE ROLE vente_web_api LOGIN' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'vente_web_api') \gexec
ALTER ROLE vente_web PASSWORD '$owner';
ALTER ROLE vente_web_api PASSWORD '$api';
SELECT 'CREATE DATABASE vente_web OWNER vente_web' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'vente_web') \gexec
REVOKE ALL ON DATABASE vente_web FROM PUBLIC;
GRANT CONNECT ON DATABASE vente_web TO vente_web_api;
"@ | & $psql -h 127.0.0.1 -U postgres -d postgres -q -v ON_ERROR_STOP=1
Check 'Rôles et base'
Remove-Item Env:\PGPASSWORD

Step 'Migrations de la base'
& $Node "--env-file=$EnvFile" (Join-Path $App 'api\dist\cli\migrate.js')
Check 'Migrations'

Step "Services de l'application"
$envArg = "--env-file=`"$EnvFile`""
Install-AppService 'VenteWeb-API' 'API' $Node "$envArg `"$(Join-Path $App 'api\dist\index.js')`"" 'VenteWeb-PostgreSQL'
Install-AppService 'VenteWeb-DNS' 'DNS local' $Node "$envArg `"$(Join-Path $PSScriptRoot 'dns-local.mjs')`"" $null
$caddy = Join-Path $App 'caddy\caddy.exe'
$caddyArgs = { param($file) "run --adapter caddyfile --config `"$(Join-Path $App "caddy\$file")`" --envfile `"$EnvFile`"" }
Install-AppService 'VenteWeb-Caddy' 'HTTPS' $caddy (& $caddyArgs 'Caddyfile') $null

if ($remote) {
  Step 'Accès distant (WireGuard)'
  $wg = Join-Path $env:ProgramFiles 'WireGuard\wireguard.exe'
  if (-not (Test-Path $wg)) {
    $msi = Join-Path $App 'wireguard.msi'
    $setup = Start-Process msiexec.exe -Wait -PassThru -ArgumentList @('/i', "`"$msi`"", '/qn', 'DO_NOT_LAUNCH=1')
    if ($setup.ExitCode -ne 0) { throw "Installation de WireGuard (code $($setup.ExitCode))" }
  }
  $conf = Join-Path $Data 'VenteWeb.conf'
  $tunnel = @(
    '[Interface]', "PrivateKey = $($values['WG_PRIVATE_KEY'])", "Address = $($values['WG_ADDRESS'])/32", '',
    '[Peer]', "PublicKey = $($values['RELAY_PUBLIC_KEY'])", "Endpoint = $($values['RELAY_ENDPOINT'])",
    "AllowedIPs = $($values['RELAY_WG_IP'])/32", 'PersistentKeepalive = 25')
  [IO.File]::WriteAllText($conf, (($tunnel -join "`n") + "`n"), $Utf8)
  if (Get-Service 'WireGuardTunnel$VenteWeb' -ErrorAction SilentlyContinue) {
    Restart-Service 'WireGuardTunnel$VenteWeb' -Force
  } else {
    & $wg /installtunnelservice $conf
    Check 'Tunnel WireGuard'
  }
  Install-AppService 'VenteWeb-Distant' 'accès distant' $caddy (& $caddyArgs 'Caddyfile-distant') $null
}

Step 'Pare-feu'
foreach ($rule in @(
    @{ Name = 'VenteWeb HTTPS'; Protocol = 'TCP'; Port = @('80', '443'); From = 'Any' },
    @{ Name = 'VenteWeb DNS'; Protocol = 'UDP'; Port = @('53'); From = 'LocalSubnet' })) {
  Remove-NetFirewallRule -DisplayName $rule.Name -ErrorAction SilentlyContinue
  New-NetFirewallRule -DisplayName $rule.Name -Direction Inbound -Action Allow -Profile Any `
    -Protocol $rule.Protocol -LocalPort $rule.Port -RemoteAddress $rule.From | Out-Null
}

Step 'Démarrage'
$started = @('VenteWeb-API', 'VenteWeb-DNS', 'VenteWeb-Caddy')
if ($remote) { $started += 'VenteWeb-Distant' }
foreach ($id in $started) { Start-Service $id }
$healthy = $false
foreach ($attempt in 1..30) {
  try {
    $health = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 'http://127.0.0.1:3000/healthz'
    if ($health.StatusCode -eq 200) { $healthy = $true; break }
  } catch { Start-Sleep -Seconds 2 }
}
if (-not $healthy) { throw "L'API ne répond pas : voir $Data\journaux\VenteWeb-API.err.log" }
Write-Host 'API : en marche.'

# Every 15 minutes as SYSTEM (SID: the name changes with the Windows language); a run due while
# one still goes is skipped, never doubled. Run once now.
Step 'Sauvegardes automatiques'
$backupTask = 'VenteWeb-Sauvegarde'
$action = New-ScheduledTaskAction -Execute $Node -WorkingDirectory $App `
  -Argument "$envArg `"$(Join-Path $PSScriptRoot 'sauvegarde.mjs')`""
$trigger = New-ScheduledTaskTrigger -Daily -At '00:00'
$trigger.Repetition = (New-ScheduledTaskTrigger -Once -At '00:00' `
    -RepetitionInterval (New-TimeSpan -Minutes 15) -RepetitionDuration (New-TimeSpan -Days 1)).Repetition
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Hours 2)
$system = New-ScheduledTaskPrincipal -UserId 'S-1-5-18' -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName $backupTask -Action $action -Trigger $trigger -Settings $settings `
  -Principal $system -Force | Out-Null
Start-ScheduledTask -TaskName $backupTask
Write-Host "Toutes les 15 minutes ; journal : $Data\journaux\sauvegarde.log"
if (-not $values['BACKUP_S3_BUCKET']) {
  Write-Host 'Coffre OVH non configuré (BACKUP_S3_*) : sauvegardes sur ce PC et le disque externe seulement.' -ForegroundColor Yellow
}

$adminDone = Join-Path $Services 'premier-admin.ok'
if (-not (Test-Path $adminDone)) {
  Step 'Premier compte admin'
  $username = Read-Host 'Identifiant (sans espace, ex. admin)'
  $fullName = Read-Host 'Nom complet'
  & $Node "--env-file=$EnvFile" (Join-Path $App 'api\dist\cli\admin-bootstrap.js') `
    --identifiant $username --nom $fullName
  Check 'Création du premier admin'
  New-Item -ItemType File -Path $adminDone -Force | Out-Null
  Write-Host 'Notez ce mot de passe provisoire maintenant : il ne sera plus affiché.' -ForegroundColor Yellow
}

Write-Host ''
Write-Host "Terminé : $AppName $Version est en service." -ForegroundColor Green
Write-Host "Tablettes et PC : https://$($values['APP_DOMAIN'])"
Write-Host "La box doit donner $($values['LAN_IP']) comme DNS (DHCP) et cette adresse fixe au serveur."
Read-Host 'Appuyez sur Entrée pour fermer'
