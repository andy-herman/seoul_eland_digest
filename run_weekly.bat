@echo off
REM ============================================================
REM Seoul E-Land FC Weekly Digest - Windows Task Scheduler Entry
REM ============================================================
REM Runs every Monday at 8 AM PT. Pulls fresh fixture results from
REM kleague.com, fetches the latest kleagueunited.com round preview,
REM re-compiles the research brief, and regenerates the most recent
REM played round's digest in the Obsidian vault.
REM
REM Edit PROJECT_DIR below if you move the project folder.
REM ============================================================

set PROJECT_DIR=C:\Andy Herman\Coding Projects (Local)\seoul_eland_digest

cd /d "%PROJECT_DIR%"

if exist "venv\Scripts\activate.bat" (
    call venv\Scripts\activate.bat
)

echo [%date% %time%] Updating fixtures from kleague.com...
python scripts\fetch_kleague_fixtures.py
if %ERRORLEVEL% NEQ 0 echo WARNING: kleague fixture fetch failed, continuing with existing fixtures.yaml

echo [%date% %time%] Fetching latest kleagueunited.com previews...
python scripts\fetch_kleagueunited_preview.py
if %ERRORLEVEL% NEQ 0 echo WARNING: kleagueunited fetch failed, continuing with existing dump.

echo [%date% %time%] Compiling research brief...
python scripts\compile_brief.py
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: brief compilation failed.
    exit /b %ERRORLEVEL%
)

echo [%date% %time%] Regenerating most recent round digest...
python scripts\regenerate_from_brief.py
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: digest regen failed.
    exit /b %ERRORLEVEL%
)

echo [%date% %time%] Sweeping em dashes and UK spellings...
python scripts\sweep_us_english.py

echo [%date% %time%] Creating Portuguese companion digest...
python scripts\translate_digest_pt.py
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Portuguese digest translation failed.
    exit /b %ERRORLEVEL%
)

echo [%date% %time%] Deduplicating player notes...
python scripts\dedupe_player_notes.py

echo [%date% %time%] Auditing vault...
python scripts\vault_audit.py
if %ERRORLEVEL% NEQ 0 echo NOTE: vault audit found issues, see output above

echo [%date% %time%] Publishing website updates...
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\publish_site_vercel.ps1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: website publish failed.
    exit /b %ERRORLEVEL%
)

echo [%date% %time%] Weekly run complete.
exit /b 0
