@echo off
setlocal
chcp 65001 >nul
set "SITE_ROOT=%~dp0"

where pwsh.exe >nul 2>&1
if errorlevel 1 (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SITE_ROOT%tools\site-server.ps1" -Action Start %*
) else (
  pwsh.exe -NoProfile -ExecutionPolicy Bypass -File "%SITE_ROOT%tools\site-server.ps1" -Action Start %*
)
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo Site launcher failed. Review the message above.
  pause
)

exit /b %EXIT_CODE%
