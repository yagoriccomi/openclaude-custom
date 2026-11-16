@echo off
REM Atalho do Menu Iniciar "Gemma 4": abre o openclaude com o Gemma do servidor (sem proxy).
title Gemma 4
cd /d "E:\User Files"
call "%~dp0openclaude-gemma.cmd"
REM Se o Gemma estiver desligado ou o token falhar, mantem a janela aberta para ler o aviso.
if errorlevel 1 pause