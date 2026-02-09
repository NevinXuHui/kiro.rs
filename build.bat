@echo off
setlocal enabledelayedexpansion

set BUILD_MODE=debug
set VERBOSE=0

:parse_args
if "%1"=="" goto build
if "%1"=="-h" goto help
if "%1"=="--help" goto help
if "%1"=="-r" (
    set BUILD_MODE=release
    shift
    goto parse_args
)
if "%1"=="--release" (
    set BUILD_MODE=release
    shift
    goto parse_args
)
if "%1"=="-v" (
    set VERBOSE=1
    shift
    goto parse_args
)
if "%1"=="--verbose" (
    set VERBOSE=1
    shift
    goto parse_args
)
if "%1"=="--clean" (
    echo Cleaning build artifacts...
    cargo clean
    if errorlevel 1 (
        echo Clean failed
        exit /b 1
    )
    echo Clean completed successfully
    shift
    goto parse_args
)
echo Unknown option: %1
goto help

:build
echo Building kiro-rs in %BUILD_MODE% mode...
echo.

if "%BUILD_MODE%"=="release" (
    if "%VERBOSE%"=="1" (
        cargo build --release --verbose
    ) else (
        cargo build --release
    )
    set BINARY=target\release\kiro-rs.exe
) else (
    if "%VERBOSE%"=="1" (
        cargo build --verbose
    ) else (
        cargo build
    )
    set BINARY=target\debug\kiro-rs.exe
)

if errorlevel 1 (
    echo.
    echo Build failed
    exit /b 1
)

echo.
echo Build completed successfully
echo Binary: !BINARY!
echo.

if exist "!BINARY!" (
    for %%A in ("!BINARY!") do (
        echo File size: %%~zA bytes
    )
)

exit /b 0

:help
echo Usage: build.bat [options]
echo.
echo Options:
echo   -r, --release    Build in release mode (optimized)
echo   -v, --verbose    Enable verbose output
echo   --clean          Clean build artifacts before building
echo   -h, --help       Show this help
echo.
echo Examples:
echo   build.bat              Build in debug mode
echo   build.bat -r           Build in release mode
echo   build.bat --clean -r   Clean and build in release mode
echo   build.bat -v           Build with verbose output
exit /b 0
