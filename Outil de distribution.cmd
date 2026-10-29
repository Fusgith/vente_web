@echo off
rem Opens the distribution tool in the browser with a double-click (Source/scripts/outil.mjs, T-102).
chcp 65001 >nul
title Outil de distribution
cd /d "%~dp0Source"
where pnpm >nul 2>nul || (
  echo pnpm est introuvable : installez Node.js 22 ou plus, puis relancez.
  pause
  exit /b 1
)
node scripts\outil.mjs
if errorlevel 1 pause
