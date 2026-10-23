@echo off
rem Restores the database from a backup (T-081), as administrator.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0app\scripts\restaurer.ps1"
