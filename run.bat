@echo off
setlocal enabledelayedexpansion

set CONFIG_FILE=config.json
set CREDENTIALS_FILE=credentials.json
set BUILD_MODE=debug

if "%1"=="-h" goto help
if "%1"=="--help" goto help
if "%1"=="-b" set BUILD_MODE=release
if "%1"=="--release" set BUILD_MODE=release

if not exist %CONFIG_FILE% (
    echo Error: config.json not found
    exit /b 1
)

if not exist %CREDENTIALS_FILE% (
    echo Error: credentials.json not found
    exit /b 1
)

echo Building Rust project in %BUILD_MODE% mode...
if "%BUILD_MODE%"=="release" (
    cargo build --release
    set BINARY=target\release\kiro-rs.exe
) else (
    cargo build
    set BINARY=target\debug\kiro-rs.exe
)

if errorlevel 1 (
    echo Build failed
    exit /b 1
)

echo Starting kiro-rs...
echo Config: %CONFIG_FILE%
echo Credentials: %CREDENTIALS_FILE%
echo.

!BINARY! -c %CONFIG_FILE% --credentials %CREDENTIALS_FILE%
goto end

:help
echo Usage: run.bat [options]
echo.
echo Options:
echo   -b, --release    Build in release mode
echo   -h, --help       Show this help
echo.
echo Examples:
echo   run.bat          Build and run in debug mode
echo   run.bat -b       Build and run in release mode
exit /b 0

:end
