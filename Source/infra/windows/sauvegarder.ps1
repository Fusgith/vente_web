# Runs a backup now (T-081): the scheduled task "VenteWeb-Sauvegarde" itself, so two backups
# never run at once; then shows the end of its log. Launched by "Sauvegarder.cmd", as administrator.
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
  Read-Host 'Appuyez sur Entrée pour fermer'
  exit 1
}

$Task = 'VenteWeb-Sauvegarde'
$Log = Join-Path $env:ProgramData 'VenteWeb\journaux\sauvegarde.log'
if (-not (Get-ScheduledTask -TaskName $Task -ErrorAction SilentlyContinue)) {
  throw "Sauvegarde automatique absente : lancez d'abord « Installer ou mettre a jour.cmd »."
}

Write-Host 'Sauvegarde en cours…' -ForegroundColor Cyan
Start-ScheduledTask -TaskName $Task
do { Start-Sleep -Seconds 2 } while ((Get-ScheduledTask -TaskName $Task).State -eq 'Running')
Get-Content $Log -Tail 5 -Encoding UTF8
$result = (Get-ScheduledTaskInfo -TaskName $Task).LastTaskResult
if ($result -eq 0) {
  Write-Host 'Sauvegarde terminée.' -ForegroundColor Green
} else {
  Write-Host "Sauvegarde incomplète (code $result) : voir $Log" -ForegroundColor Red
}
Read-Host 'Appuyez sur Entrée pour fermer'
