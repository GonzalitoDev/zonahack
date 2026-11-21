@echo off
title AGENTEPC - Control de tu PC desde el asistente
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  Arrancando AgentePC...
python agente_pc.py
pause