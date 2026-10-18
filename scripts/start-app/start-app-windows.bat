@echo off
REM Raqeem - run the store app on your phone with Expo Go (Windows 10/11)
REM Double-click this file. It installs Node.js and Git if missing, downloads the project,
REM installs packages, and shows a QR code to scan with Expo Go.
setlocal
title Raqeem - Expo Go
set "REPO=https://github.com/makhzani2027/makhzani.git"
set "BRANCH=claude/happy-rubin-s67gcc"
set "DIR=%USERPROFILE%\raqeem"
set "PATH=%PATH%;%ProgramFiles%\nodejs;%ProgramFiles%\Git\cmd;%APPDATA%\npm"

echo.
echo ===== Raqeem / Expo Go =====
echo.

where winget >nul 2>nul || (
  echo winget is missing. Install "App Installer" from Microsoft Store, or install Node.js LTS from https://nodejs.org and Git from https://git-scm.com then run this file again.
  goto :fail
)

where node >nul 2>nul || (
  echo [1/5] Installing Node.js LTS...
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements || goto :fail
)
node -e "process.exit(+process.versions.node.split('.')[0] < 20 ? 1 : 0)" || (
  echo [1/5] Node.js is too old, upgrading...
  winget upgrade -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements || goto :fail
)

where git >nul 2>nul || (
  echo [2/5] Installing Git...
  winget install -e --id Git.Git --accept-source-agreements --accept-package-agreements || goto :fail
)

echo [3/5] Downloading the project to %DIR% ...
echo       (the repository is private: if a GitHub sign-in window opens, sign in with the account that owns it)
if exist "%DIR%\.git" goto :update
git clone --branch %BRANCH% %REPO% "%DIR%" || goto :fail
goto :install
:update
cd /d "%DIR%"
git fetch origin %BRANCH% || goto :fail
git checkout %BRANCH% || goto :fail
git pull --ff-only origin %BRANCH% || goto :fail

:install
cd /d "%DIR%"
echo [4/5] Installing packages (first time takes a few minutes)...
call npm install --no-audit --no-fund || goto :fail

echo.
echo [5/5] How is your phone connected?
echo    1 = Same Wi-Fi as this computer (recommended)
echo    2 = Different network (needs a free account from expo.dev)
choice /c 12 /n /t 15 /d 1 /m "Choose 1 or 2 (default 1 in 15s): "
set "MODE=%errorlevel%"
cd /d "%DIR%\apps\mobile"
echo.
echo  - Open Expo Go on your phone and scan the QR code below.
echo  - If Windows Firewall asks about Node.js, click "Allow".
echo  - Keep this window open while testing. Ctrl+C to stop.
echo.
if "%MODE%"=="2" goto :tunnel
call npx expo start --lan
goto :end
:tunnel
call npx expo login
call npx expo start --tunnel
goto :end

:fail
echo.
echo Something failed. Take a screenshot of this window and send it.
:end
pause
