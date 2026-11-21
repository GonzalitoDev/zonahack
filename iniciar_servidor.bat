@echo off
title ZONAHACK - TU PROPIO SERVIDOR
chcp 65001 >nul
echo.
echo  ==================================================
echo    ZONAHACK - TU PROPIO SERVIDOR
echo    (corre en esta PC, sin VPS ni cloud)
echo  ==================================================
echo.
cd /d "%~dp0"

echo  [1/3] Verificando Python...
python --version >nul 2>&1
if errorlevel 1 (
  echo  [X] No se encontro Python. Instalalo en https://www.python.org/downloads/
  echo      (tild? "Add Python to PATH" durante la instalacion)
  pause
  exit /b
)
echo  [OK] Python encontrado.

echo  [2/3] Obteniendo tu IP local...
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do set "IP=%%a"
set "IP=%IP: =%"

echo  [OK] Tu servidor va a estar en:
echo       Esta PC:        http://localhost:8080
echo       Tu red (wifi):  http://%IP%:8080
echo.
echo  [3/3] Iniciando servidor...
echo  (Para detenerlo: cerr? esta ventana o apret? Ctrl+C)
echo.
start "" "http://localhost:8080"

python local_server.py --db sqlite --seed --port 8080 --local-test

echo.
echo  El servidor se detuvo.
pause
