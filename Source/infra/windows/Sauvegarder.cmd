@echo off
rem Runs a backup now (T-081), as administrator; the backups also run every 15 minutes.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0app\scripts\sauvegarder.ps1"
