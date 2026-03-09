@echo off
echo Starting NeuroMemeTrader...

echo.
echo [1/2] Installing backend deps...
cd backend
pip install -r requirements.txt --quiet

echo.
echo [2/2] Installing frontend deps...
cd ..\frontend
call npm install --silent

echo.
echo Launching backend (port 8000) and frontend (port 5173)...
start "NeuroMemeTrader Backend" cmd /k "cd /d %~dp0backend && python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"
timeout /t 2 /nobreak >nul
start "NeuroMemeTrader Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo Open: http://localhost:5173
pause
