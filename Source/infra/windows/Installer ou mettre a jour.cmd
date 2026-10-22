@echo off
rem Installs or updates the shop server (T-080): the same script for both, run as administrator.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0app\scripts\installer.ps1"
