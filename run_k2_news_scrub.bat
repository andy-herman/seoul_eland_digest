@echo off
REM ============================================================
REM Seoul E-Land FC - K League 2 Club News Scrub
REM ============================================================
REM Private scouting job. Refreshes official K League snapshot and
REM Naver/Daum club-news notes for every 2026 K League 2 club.
REM ============================================================

set PROJECT_DIR=C:\Andy Herman\Coding Projects (Local)\seoul_eland_digest
set LOG_DIR=%PROJECT_DIR%\logs
set LOG_FILE=%LOG_DIR%\k2_news_scrub.log

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

cd /d "%PROJECT_DIR%"

if exist "venv\Scripts\activate.bat" (
    call venv\Scripts\activate.bat
)

echo [%date% %time%] Starting K League 2 club-news scrub... >> "%LOG_FILE%"

echo [%date% %time%] Refreshing official K League snapshot... >> "%LOG_FILE%"
python scripts\fetch_kleague_official_snapshot.py >> "%LOG_FILE%" 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [%date% %time%] ERROR: official snapshot refresh failed. >> "%LOG_FILE%"
    exit /b %ERRORLEVEL%
)

echo [%date% %time%] Refreshing Naver/Daum club news... >> "%LOG_FILE%"
python scripts\update_k2_club_news.py --days-lookback 7 --max-results-per-query 4 --max-queries-per-team 2 --max-articles-per-team 10 --delay 1.25 --sources naver daum >> "%LOG_FILE%" 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [%date% %time%] ERROR: club-news scrub failed. >> "%LOG_FILE%"
    exit /b %ERRORLEVEL%
)

echo [%date% %time%] K League 2 club-news scrub complete. >> "%LOG_FILE%"
exit /b 0
