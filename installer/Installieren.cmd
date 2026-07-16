@echo off
REM ============================================================
REM  CendovaPlan - USB-Installer (Doppelklick)
REM  Startet install.ps1 mit umgangener PowerShell-Sperre (nur fuer
REM  diesen Lauf). Gemeinsam mit der Klinik-IT ausfuehren.
REM ============================================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
echo.
pause
