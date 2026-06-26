@echo off
setlocal EnableExtensions

cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo npm nao encontrado. Execute start.cmd para preparar o ambiente.
  exit /b 1
)

echo Atualizando a partir do GitHub sem depender de git...
node scripts\update-project.js
if errorlevel 1 exit /b 1
