@echo off
title ZONAHACK - SERVIDOR + INTERNET (tunel gratis)
chcp 65001 >nul
echo.
echo  ==================================================
echo   ZONAHACK - TU SERVIDOR EN INTERNET (gratis)
echo   (tunel de Cloudflare, sin pagar nada)
echo  ==================================================
echo.
cd /d "%~dp0"

echo  [1/4] Arrancando el servidor en localhost:8080...
start "" /min cmd /c "python local_server.py --db sqlite --seed --port 8080 --local-test"
timeout /t 2 /nobreak >nul

echo  [2/4] Buscando cloudflared...
where cloudflared >nul 2>&1
if errorlevel 1 (
  echo  [X] No se encontro cloudflared.
  echo      Descargalo GRATIS: https://github.com/cloudflare/cloudflared/releases
  echo      (Windows -> cloudflared-windows-amd64.exe, renombralo a cloudflared.exe
  echo       y colocarlo en esta carpeta o en PATH)
  echo.
  echo  Mientras tanto, tu servidor ya corre en:  http://localhost:8080
  pause
  exit /b
)

echo  [3/4] Abriendo tunel publico de Cloudflare...
echo  (Deja esta ventana abierta; la URL publica aparece abajo como
echo   "Your quick Tunnel has been created" -> https://xxxx.trycloudflare.com)
echo.
cloudflared tunnel --url http://localhost:8080

echo  [4/4] El tunel se cerro.
pause
