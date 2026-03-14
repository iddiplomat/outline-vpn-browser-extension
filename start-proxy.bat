@echo off
setlocal

if "%~1"=="" (
    echo.
    echo   Usage: start-proxy.bat "ss://YOUR_ACCESS_KEY" [LOCAL_PORT]
    echo.
    echo   Example:
    echo     start-proxy.bat "ss://Y2hhY2hhMjAtaWV0Zi1wb2x5MTMwNTpwYXNz@server.com:8388/?outline=1"
    echo     start-proxy.bat "ss://Y2hhY2hhMjAtaWV0Zi1wb2x5MTMwNTpwYXNz@server.com:8388/?outline=1" 1080
    echo.
    pause
    exit /b 1
)

set SS_KEY=%~1
set LOCAL_PORT=%~2
if "%LOCAL_PORT%"=="" set LOCAL_PORT=1080

powershell -ExecutionPolicy Bypass -File "%~dp0start-proxy.ps1" -SsKey "%SS_KEY%" -LocalPort %LOCAL_PORT%
pause
