@echo off
title BUSCAR PELICULAS LIBRES (sin copyright)
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  ==================================================
echo    BUSCAR PELICULAS LIBRES / DOMINIO PUBLICO
echo    (sin copyright - fuente: archive.org)
echo  ==================================================
echo.
set /p BUSCAR="  Que pelicula queres buscar? (ej: nosferatu): "
if "%BUSCAR%"=="" set BUSCAR=nosferatu
echo.
python buscar_peliculas_libres.py "%BUSCAR%" --limite 15 --solo-verificar
echo.
set /p DESC="  Descargar alguna? numero (Enter para salir): "
if not "%DESC%"=="" python buscar_peliculas_libres.py "%BUSCAR%" --limite 15 --descargar %DESC%
echo.
pause