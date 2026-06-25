@echo off
setlocal

call "%~dp0atualizar.bat" %*
exit /b %ERRORLEVEL%
