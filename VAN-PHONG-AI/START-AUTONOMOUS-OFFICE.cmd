@echo off
echo ========================================
echo   Van Phong AI Tu Dong
echo   Autonomous AI Office
echo ========================================
echo.

cd /d "%~dp0"

echo [1/3] Checking dependencies...
call npm install --silent

echo.
echo [2/3] Starting autonomous office...
node -e "const office = require('./autonomous-office-api'); office.init().then(() => console.log('Office is running autonomously!')).catch(err => console.error('Failed to start:', err));"

echo.
echo [3/3] Office started successfully!
echo.
echo API Endpoints:
echo   - POST /api/autonomous-office/request     Submit new request
echo   - GET  /api/autonomous-office/status      Get office status
echo   - GET  /api/autonomous-office/agents      Get agents status
echo   - GET  /api/autonomous-office/metrics     Get metrics
echo.
echo Dashboard: http://localhost:3000/van-phong-ai
echo.
echo Press Ctrl+C to stop the office
pause
