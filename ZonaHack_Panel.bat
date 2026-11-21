@echo off
title ZONAHACK PANEL
cd /d "%~dp0"
python panel_gui.py
if errorlevel 1 pause
