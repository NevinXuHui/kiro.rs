@echo off
setlocal enabledelayedexpansion

set CONFIG_FILE=config.json
set CREDENTIALS_FILE=credentials.json
set BUILD_MODE=debug
set BUILD_FRONTEND=0
set SKIP_BUILD=0

:parse_args
if "%~1"=="" goto end_parse
if /i "%~1"=="-h" goto help
if /i "%~1"=="--help" goto help
if /i "%~1"=="-b" (
    set BUILD_MODE=release
    shift
    goto parse_args
)
if /i "%~1"=="--release" (
    set BUILD_MODE=release
    shift
    goto parse_args
)
if /i "%~1"=="-f" (
    set BUILD_FRONTEND=1
    shift
    goto parse_args
)
if /i "%~1"=="--frontend" (
    set BUILD_FRONTEND=1
    shift
    goto parse_args
)
if /i "%~1"=="-s" (
    set SKIP_BUILD=1
    shift
    goto parse_args
)
if /i "%~1"=="--skip-build" (
    set SKIP_BUILD=1
    shift
    goto parse_args
)
if /i "%~1"=="-c" (
    set CONFIG_FILE=%~2
    shift
    shift
    goto parse_args
)
if /i "%~1"=="--config" (
    set CONFIG_FILE=%~2
    shift
    shift
    goto parse_args
)
if /i "%~1"=="-r" (
    set CREDENTIALS_FILE=%~2
    shift
    shift
    goto parse_args
)
if /i "%~1"=="--credentials" (
    set CREDENTIALS_FILE=%~2
    shift
    shift
    goto parse_args
)
echo Unknown option: %~1
goto help

:end_parse

if not exist %CONFIG_FILE% (
    echo Error: config.json not found
    exit /b 1
)

if not exist %CREDENTIALS_FILE% (
    echo Error: credentials.json not found
    exit /b 1
)

REM Clear proxy environment variables to avoid using proxy for internal network
set HTTP_PROXY=
set HTTPS_PROXY=
set http_proxy=
set https_proxy=
echo Proxy environment variables cleared

REM Kill existing kiro-rs processes
for /f "tokens=2" %%a in ('tasklist ^| findstr /i "kiro-rs.exe"') do (
    echo Stopping existing kiro-rs process %%a...
    taskkill /F /PID %%a >nul 2>&1
)

REM Wait for port to be released
timeout /t 2 /nobreak >nul 2>&1

REM Build frontend if requested
if %BUILD_FRONTEND%==1 (
    echo Building frontend...
    cd admin-ui
    if exist "pnpm-lock.yaml" (
        pnpm install
        pnpm run build
    ) else if exist "yarn.lock" (
        yarn install
        yarn build
    ) else (
        npm install
        npm run build
    )
    if errorlevel 1 (
        echo Frontend build failed
        cd ..
        exit /b 1
    )
    cd ..
    echo Frontend build completed
)

REM Check if frontend is built
if not exist "admin-ui\dist" (
    if %SKIP_BUILD%==0 (
        echo Warning: admin-ui\dist not found, building frontend...
        cd admin-ui
        if exist "pnpm-lock.yaml" (
            pnpm install
            pnpm run build
        ) else if exist "yarn.lock" (
            yarn install
            yarn build
        ) else (
            npm install
            npm run build
        )
        cd ..
        echo Frontend build completed
    )
)

REM Build Rust project
if %SKIP_BUILD%==0 (
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
) else (
    if "%BUILD_MODE%"=="release" (
        set BINARY=target\release\kiro-rs.exe
    ) else (
        set BINARY=target\debug\kiro-rs.exe
    )
    if not exist "!BINARY!" (
        echo Error: Binary !BINARY! not found
        echo Please build first or remove -s option
        exit /b 1
    )
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
echo   -c, --config FILE          Specify config file (default: config.json)
echo   -r, --credentials FILE     Specify credentials file (default: credentials.json)
echo   -f, --frontend             Force rebuild frontend
echo   -b, --release              Build in release mode
echo   -s, --skip-build           Skip build, run directly
echo   -h, --help                 Show this help
echo.
echo Examples:
echo   run.bat                    Build and run in debug mode
echo   run.bat -b                 Build and run in release mode
echo   run.bat -f                 Rebuild frontend and run
echo   run.bat -f -b              Rebuild frontend and build in release mode
echo   run.bat -s                 Skip build and run directly
exit /b 0

:end
