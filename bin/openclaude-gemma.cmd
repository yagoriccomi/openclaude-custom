@ECHO off
REM Abre o openclaude com o Gemma 4 do servidor (ver openclaude-gemma.ps1).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0openclaude-gemma.ps1" %*
