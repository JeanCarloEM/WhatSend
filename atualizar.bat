@echo off
REM Autor: JeanCarloEM.com
REM Site do Autor: https://jeancarloem.com
REM Licenca: Mozilla Public License 2.0
REM Site da Licenca: https://www.mozilla.org/MPL/2.0/
REM Resumo da Licenca: uso, copia, modificacao e distribuicao permitidos conforme os termos da MPL-2.0.
REM Disclaimer: fornecido "AS IS", sem garantias de qualquer tipo.

setlocal EnableExtensions

cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo npm nao encontrado. Execute start.cmd para preparar o ambiente.
  exit /b 1
)

set /p "CONFIRM=Atualizar software e dependencias? Versoes novas podem quebrar o ambiente estavel. [s/N]: "
if /I not "%CONFIRM%"=="s" exit /b 0

echo Atualizando a partir do GitHub sem depender de git...
node scripts\update-project.js --action software --confirm
if errorlevel 1 exit /b 1
