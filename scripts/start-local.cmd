@echo off
REM Doppelklick-Starter fuer den lokalen Test: ruft den PowerShell-Launcher mit
REM ExecutionPolicy-Bypass auf (umgeht die Skript-Sperre beim Doppelklick).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-local.ps1"
pause
