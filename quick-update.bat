@echo off
echo Quick update: building frontend only...

cd admin-ui
npm run build
if errorlevel 1 (
    echo Frontend build failed
    cd ..
    exit /b 1
)
cd ..

echo Frontend built successfully
echo Restarting service...

REM Kill existing kiro-rs processes
for /f "tokens=2" %%a in ('tasklist ^| findstr /i "kiro-rs.exe"') do (
    echo Stopping existing kiro-rs process %%a...
    taskkill /F /PID %%a >nul 2>&1
)

REM Wait for port to be released
timeout /t 1 /nobreak >nul 2>&1

REM Start service (skip build)
.\run.bat -s
