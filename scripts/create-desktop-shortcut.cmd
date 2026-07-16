@echo off
REM Doppelklick: legt einmalig eine Desktop-Verknuepfung zum Test-Launcher an.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0create-desktop-shortcut.ps1"
pause
