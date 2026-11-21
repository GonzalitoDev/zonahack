@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title ZONAHACK - SUBIDOR DE PELICULAS (.bat)

rem =========================================================
rem  ZONAHACK - SUBIDOR DE PELICULAS
rem  Sube videos a la base de ZonaHack (tabla videos).
rem  - YouTube: link o ID
rem  - Lote: archivo .txt con un link por linea
rem  - Legal: Archive.org (dominio publico / Creative Commons)
rem  Ahora sube via /api/videos (servidor) con tu cuenta admin.
rem  Requiere: Windows 10/11 (usa PowerShell, ya viene instalado)
rem =========================================================

set "API=https://offlinevideoplayer.vercel.app"
set "SUPA=https://xfwolaurpeofysnymqle.supabase.co/rest/v1/videos"
set "KEY=sb_publishable_3VvBUD5Bdu3Uaq59fJ99MQ_XDCtujUU"

call :login
if "%ZH_TOKEN%"=="" (
  echo.
  echo  [X] No se pudo iniciar sesion. Revisa usuario/contrasena.
  pause
  exit /b
)

:menu
cls
echo.
echo  +=================================================+
echo  |  ZONAHACK - SUBIDOR DE PELICULAS (.bat)         |
echo  +=================================================+
echo.
echo   [1] Subir una pelicula por YouTube (link o ID)
echo   [2] Subir en lote desde un archivo .txt
echo   [3] Importar legal de Archive.org (dominio publico)
echo   [4] Contar peliculas en la base
echo   [0] Salir
echo.
set /p op=  Elige una opcion: 

if "%op%"=="1" goto yt
if "%op%"=="2" goto lote
if "%op%"=="3" goto archive
if "%op%"=="4" goto contar
if "%op%"=="0" exit /b
goto menu

rem ---------------------------------------------------------
:yt
cls
echo  -- SUBIR POR YOUTUBE --------------------------------
echo.
set /p ZH_URL=  Link o ID de YouTube: 
if not defined ZH_URL goto yt
set "ZH_T="
set "ZH_CA="
set /p ZH_T=  Titulo (Enter = auto): 
set /p ZH_CA=  Categoria (Enter = Pelicula): 
if not defined ZH_CA set "ZH_CA=Pelicula"
set "ZH_TP=youtube"
call :extraer_id
if "%ZH_VID%"=="" ( echo.
  echo  [X] No se pudo reconocer el ID de YouTube
  pause
  goto menu )
if not defined ZH_T call :obtener_titulo
if not defined ZH_T set "ZH_T=Video YouTube"
call :subir
pause
goto menu

rem ---------------------------------------------------------
:lote
cls
echo  -- SUBIR EN LOTE ------------------------------------
echo.
echo  El archivo debe tener un link o ID de YouTube por linea.
set /p ZH_FILE=  Ruta del .txt (ej: pelis.txt): 
if not exist "%ZH_FILE%" ( echo.
  echo  [X] Archivo no encontrado
  pause
  goto menu )
set "ZH_CA="
set /p ZH_CA=  Categoria para todas (Enter = Pelicula): 
if not defined ZH_CA set "ZH_CA=Pelicula"
set "ZH_TP=youtube"
set /a cnt=0
set /a ok=0
set /a err=0
for /f "usebackq delims=" %%L in ("%ZH_FILE%") do (
  set "ZH_URL=%%L"
  call :extraer_id
  if not "!ZH_VID!"=="" (
    set /a cnt+=1
    set "ZH_T="
    call :obtener_titulo
    call :subir_silencioso
    if "!RES!"=="OK" ( set /a ok+=1 ) else ( set /a err+=1 )
  )
)
echo.
echo  -- RESULTADO: %cnt% links validos, %ok% subidos, %err% errores --
pause
goto menu

rem ---------------------------------------------------------
:archive
cls
echo  -- IMPORTAR LEGAL (ARCHIVE.ORG - DOMINIO PUBLICO) ----
echo.
echo  Solo contenido de dominio publico o Creative Commons.
echo  Ejemplo: https://archive.org/details/nosferatu1922
set /p ZH_AURL=  Link de Archive.org: 
if not defined ZH_AURL goto archive
set "ZH_T="
set /p ZH_T=  Titulo (Enter = usar ID): 
set "ZH_TP=archive"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$u=$env:ZH_AURL; if($u -match 'archive\.org/details/([A-Za-z0-9_.-]+)'){Write-Output $Matches[1]} else {$u.Trim('/').Split('/')[-1]}" > "%TEMP%\zh_id.txt" 2>nul
set /p ZH_AID=<"%TEMP%\zh_id.txt"
set "ZH_AID=%ZH_AID: =%"
if "%ZH_AID%"=="" ( echo.
  echo  [X] Link invalido
  pause
  goto menu )
set "ZH_VID=ia_%ZH_AID%"
set "ZH_CA=Clasico"
if not defined ZH_T set "ZH_T=%ZH_AID%"
call :subir
pause
goto menu

rem ---------------------------------------------------------
:contar
cls
powershell -NoProfile -ExecutionPolicy Bypass -Command "try{$r=Invoke-WebRequest -UseBasicParsing -Uri ($env:SUPA+'?select=id') -Headers @{'apikey'=$env:KEY;'Authorization'='Bearer '+$env:KEY}; $j=$r.Content|ConvertFrom-Json; Write-Output ('Hay '+$j.Count+' peliculas/series en la base')}catch{Write-Output ('Error: '+$_.Exception.Message)}"
echo.
pause
goto menu

rem =========================================================
rem  SUBRUTINAS
rem =========================================================

:login
cls
echo  -- INICIAR SESION (cuenta admin de ZonaHack) ---------
echo.
set /p ZH_USER=  Usuario: 
set /p ZH_PASS=  Contrasena: 
set "ZH_TOKEN="
powershell -NoProfile -ExecutionPolicy Bypass -Command "try{$b=@{usuario=$env:ZH_USER;password=$env:ZH_PASS}|ConvertTo-Json; $r=Invoke-RestMethod -Uri ($env:API+'/api/auth?accion=login') -Method Post -Body $b -ContentType 'application/json' -TimeoutSec 20; Write-Output $r.token}catch{Write-Output ''}" > "%TEMP%\zh_tok.txt" 2>nul
set /p ZH_TOKEN=<"%TEMP%\zh_tok.txt"
set "ZH_TOKEN=%ZH_TOKEN: =%"
if "%ZH_TOKEN%"=="" (
  echo  [X] Usuario o contrasena incorrectos.
  exit /b 1
)
echo  [OK] Sesion iniciada.
exit /b

:extraer_id
set "ZH_VID="
powershell -NoProfile -ExecutionPolicy Bypass -Command "$u=$env:ZH_URL; if($u -match '[?&]v=([A-Za-z0-9_-]{11})'){Write-Output $Matches[1]} elseif($u -match 'youtu\.be/([A-Za-z0-9_-]{11})'){Write-Output $Matches[1]} elseif($u -match '/embed/([A-Za-z0-9_-]{11})'){Write-Output $Matches[1]} elseif($u -match '^[A-Za-z0-9_-]{11}$'){Write-Output $u} else{Write-Output ''}" > "%TEMP%\zh_id.txt" 2>nul
set /p ZH_VID=<"%TEMP%\zh_id.txt"
set "ZH_VID=%ZH_VID: =%"
exit /b

:subir
if "%ZH_TP%"=="youtube" set "ZH_TH=https://i.ytimg.com/vi/%ZH_VID%/hqdefault.jpg"
if "%ZH_TP%"=="archive" set "ZH_TH=https://archive.org/services/img/%ZH_VID:ia_=%"
echo.
echo  Subiendo: %ZH_T%
echo  ID: %ZH_VID%  |  Categoria: %ZH_CA%
powershell -NoProfile -ExecutionPolicy Bypass -Command "try{$b=@{videos=@(@{url=$env:ZH_VID;titulo=$env:ZH_T;thumbnail=$env:ZH_TH;tipo=$env:ZH_TP;categoria=$env:ZH_CA})}|ConvertTo-Json -Depth 5; $r=Invoke-WebRequest -UseBasicParsing -Uri ($env:API+'/api/videos') -Method Post -Headers @{'Authorization'='Bearer '+$env:ZH_TOKEN} -Body $b -ContentType 'application/json' -TimeoutSec 30; Write-Output $r.StatusCode}catch{Write-Output ('ERR:'+$_.Exception.Message)}" > "%TEMP%\zh_st.txt" 2>nul
set /p ZH_ST=<"%TEMP%\zh_st.txt"
echo !ZH_ST! | findstr /i "200 201" >nul && ( echo  [OK] Subida correctamente ) || ( echo  [X] Error: !ZH_ST! )
call :subir_firebase
exit /b

:subir_silencioso
if "%ZH_TP%"=="youtube" set "ZH_TH=https://i.ytimg.com/vi/%ZH_VID%/hqdefault.jpg"
if not defined ZH_T set "ZH_T=%ZH_VID%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "try{$b=@{videos=@(@{url=$env:ZH_VID;titulo=$env:ZH_T;thumbnail=$env:ZH_TH;tipo='youtube';categoria=$env:ZH_CA})}|ConvertTo-Json -Depth 5; Invoke-WebRequest -UseBasicParsing -Uri ($env:API+'/api/videos') -Method Post -Headers @{'Authorization'='Bearer '+$env:ZH_TOKEN} -Body $b -ContentType 'application/json' -TimeoutSec 30|Out-Null; Write-Output 'OK'}catch{Write-Output 'ERR'}" > "%TEMP%\zh_st.txt" 2>nul
set /p RES=<"%TEMP%\zh_st.txt"
echo  [%RES%] %ZH_T%
call :subir_firebase
exit /b

:obtener_titulo
rem Trae el titulo real del video desde la API publica oEmbed de YouTube (sin API key)
powershell -NoProfile -ExecutionPolicy Bypass -Command "try{$r=Invoke-RestMethod -Uri ('https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v='+$env:ZH_VID+'&format=json') -TimeoutSec 8; Write-Output $r.title}catch{Write-Output ''}" > "%TEMP%\zh_tit.txt" 2>nul
set /p ZH_T=<"%TEMP%\zh_tit.txt"
exit /b

:subir_firebase
rem Sube la pelicula tambien a Firebase (coleccion peliculas)
powershell -NoProfile -ExecutionPolicy Bypass -Command "try{$fb='https://firestore.googleapis.com/v1/projects/aaaaa-4938f/databases/(default)/documents/peliculas?key=AIzaSyDM6mf2zv1DqOar1jL0zw-hsdEQA8L4zcQ'; $f=[ordered]@{titulo=@{stringValue=$env:ZH_T};url=@{stringValue=$env:ZH_VID};thumbnail=@{stringValue=$env:ZH_TH};categoria=@{stringValue=$env:ZH_CA};ts=@{integerValue=[string]([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())}}; Invoke-WebRequest -UseBasicParsing -Uri $fb -Method Post -Body (@{fields=$f}|ConvertTo-Json -Depth 5) -ContentType 'application/json'|Out-Null}catch{}"
exit /b
