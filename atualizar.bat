@echo off
setlocal EnableExtensions

cd /d "%~dp0"

where git >nul 2>nul
if errorlevel 1 (
  echo Git nao encontrado.
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm nao encontrado. Execute start.cmd para preparar o ambiente.
  exit /b 1
)

echo Atualizando repositorio...
git pull --ff-only
if errorlevel 1 exit /b 1

echo Atualizando dependencias estaveis...
npm install csv-parse@latest dotenv@latest puppeteer-core@latest qrcode-terminal@latest whatsapp-web.js@latest
if errorlevel 1 exit /b 1

echo Verificando navegador compativel...
node scripts\ensure-browser.js
if errorlevel 1 exit /b 1

echo Atualizacao concluida.
