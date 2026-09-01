@echo off
title Superhero Live 3D - Launcher
cd /d "%~dp0"
echo ========================================================
echo   INICIALIZANDO SUPERHERO LIVE EXPERIENCE 3D
echo ========================================================

echo 1. Iniciando Vision Engine e Servidor 3D...
start "Superhero Vision Engine" cmd /k "run_vision.bat"

echo Aguardando inicializacao do servidor local...
timeout /t 2 /nobreak >nul

echo 2. Abrindo Central de Apresentacao 3D...

echo ========================================================
echo   SISTEMA PRONTO PARA APRESENTACAO!
echo.
echo   [1] Tela de Apresentacao Limpa (TV/Telao):
echo       http://127.0.0.1:8000/presentation.html
echo.
echo   [2] Painel de Configuracao e Troca de Modelos:
echo       http://127.0.0.1:8000/config.html
echo.
echo   Pressione [F] na tela de apresentacao para Tela Cheia.
echo ========================================================
