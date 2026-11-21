@echo off
title ZONAHACK PANEL - CONTROL CENTER
cd /d "%~dp0"
python panel_menu.py
if errorlevel 1 pause