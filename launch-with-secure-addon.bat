@echo off
REM Windows batch file to launch the app with secure addon URL
REM This demonstrates how to pass parameters via Windows shortcut

REM Example usage with a real secure addon URL format:
REM "Stremio Debridio Emby Resolver.exe" --secure-addons-url="https://your-secure-addon-url.com/manifest.json"

echo Starting Stremio Debridio Emby Resolver with secure addon...
echo.

REM Check if parameter was provided
if "%1"=="" (
    echo Usage: launch-with-secure-addon.bat "https://your-secure-addon-url.com/manifest.json"
    echo.
    echo Example:
    echo launch-with-secure-addon.bat "https://debridio-secure.example.com/manifest.json"
    pause
    exit /b 1
)

REM Launch the application with the secure addon URL
"Stremio Debridio Emby Resolver.exe" --secure-addons-url=%1

echo.
echo Application launched with secure addon URL: %1
pause