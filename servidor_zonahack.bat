@echo off
title ZONAHACK - SERVIDOR (igual que la web real)
chcp 65001 >nul
cd /d "%~dp0"

set "PUERTO=8080"

echo.
echo  ==================================================
echo    ZONAHACK - LA MISMA PAGINA, EN TU PC
echo    Usa la base de datos real de Supabase
echo    (los mismos videos y usuarios que la web)
echo  ==================================================
echo.

echo  [1/4] Verificando Python...
python --version >nul 2>&1
if errorlevel 1 (
  echo  [X] No se encontro Python. Instalalo desde https://www.python.org/downloads/
  echo      y marca "Add Python to PATH" durante la instalacion.
  pause
  exit /b
)
echo  [OK] Python encontrado.

echo  [2/4] Verificando librerias...
python -c "import requests" >nul 2>&1
if errorlevel 1 (
  echo  Instalando "requests"...
  python -m pip install requests
)
echo  [OK] Librerias listas.

echo  [3/4] Verificando que el puerto %PUERTO% este libre...
netstat -ano | findstr /r /c:":%PUERTO% .*LISTENING" >nul
if not errorlevel 1 (
  echo  [!] El puerto %PUERTO% ya esta en uso ^(quiza el servidor de pruebas esta abierto^).
  set "PUERTO=8090"
  echo      Se va a usar el puerto 8090.
)

set "IP="
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do if not defined IP set "IP=%%a"
if defined IP set "IP=%IP: =%"

echo.
echo  [4/4] Iniciando servidor...
echo       Esta PC:        http://localhost:%PUERTO%
if defined IP echo       Tu red (wifi):  http://%IP%:%PUERTO%
echo.
echo  Para detenerlo: cerra esta ventana o apreta Ctrl+C
echo.

start "" "http://localhost:%PUERTO%"

rem Sin --db: conecta a Supabase real. Sin --local-test: sin cartel de "modo prueba".
python local_server.py --port %PUERTO%

echo.
echo  El servidor se detuvo.
pause
