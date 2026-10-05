@echo off
rem Starts Vente Web for development with a double-click (Source/scripts/demarrer.mjs).
chcp 65001 >nul
title Vente Web
cd /d "%~dp0Source"
where pnpm >nul 2>nul || (
  echo pnpm est introuvable : installez Node.js 22 ou plus, puis relancez.
  pause
  exit /b 1
)
call pnpm demarrer
if errorlevel 1 pause
