@echo off
setlocal
title Quest Map - Moscow Polytech

cd /d "%~dp0"

if exist "be\server.js" (
    cd /d "%~dp0be"
) else if exist "kvest-map-version-1.1\be\server.js" (
    cd /d "%~dp0kvest-map-version-1.1\be"
) else if exist "..\be\server.js" (
    cd /d "%~dp0..\be"
)

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ========================================================
    echo  Node.js was not found on your system!
    echo  Please install Node.js LTS from: https://nodejs.org
    echo ========================================================
    start https://nodejs.org
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo [1/3] Installing dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] npm install failed. Please check your internet connection.
        pause
        exit /b 1
    )
)

echo [2/3] Opening browser at http://localhost:3000 ...
start "" "http://localhost:3000"

echo [3/3] Starting server...
echo Press Ctrl+C or close this window to stop the server.
echo ========================================================
call node server.js
pause
