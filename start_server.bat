@echo off
title Gomoku Web Server
echo ===================================================
echo   Starting Gomoku Web Server...
echo   Once started, the game will open in your browser automatically.
echo ===================================================
echo.

npx http-server -p 8080 -o
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Failed to start server. Please ensure Node.js is installed.
    echo You can download it from https://nodejs.org/
    echo.
    pause
)
