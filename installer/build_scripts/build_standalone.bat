@echo off
title Superhero Live 3D - Standalone Build Script
echo ========================================================
echo   GERANDO EXECUTAVEL STANDALONE COM PYINSTALLER
echo ========================================================

cd /d "%~dp0\..\..\vision-engine"

pip install pyinstaller

pyinstaller --noconfirm --onedir --windowed --name "SuperheroVisionEngine" ^
    --add-data "config;config" ^
    main.py

echo ========================================================
echo   BUILD CONCLUIDO COM SUCESSO EM dist/SuperheroVisionEngine
echo ========================================================
pause
