# Windows Task Scheduler Setup

This walks through scheduling the digest to run every Monday at 8 AM PT.

## Steps

### 1. Open Task Scheduler

Press `Windows + R`, type `taskschd.msc`, press Enter.

### 2. Create a new task

In the right panel, click **Create Task** (not "Create Basic Task" - we need the more advanced options).

### 3. General tab

- **Name:** `Seoul E-Land Weekly Digest`
- **Description:** `Generates weekly Korean sports digest into Obsidian vault`
- **Security options:**
  - Select **Run whether user is logged on or not** (so it runs even when you are away from the laptop)
  - Check **Run with highest privileges**
- **Configure for:** Windows 10 (or your version)

### 4. Triggers tab

Click **New** and configure:

- **Begin the task:** On a schedule
- **Settings:** Weekly
- **Start:** Pick the next upcoming Monday at `08:00:00 AM`
- **Recur every:** 1 week on **Monday**
- **Advanced settings:**
  - Check **Enabled**
  - Optionally check **Stop task if it runs longer than:** 30 minutes (sanity timeout)

Click **OK**.

### 5. Actions tab

Click **New** and configure:

- **Action:** Start a program
- **Program/script:** Browse to `run_weekly.bat` in your project folder
  Example: `C:\Andy Herman\Coding Projects (Local)\seoul_eland_digest\run_weekly.bat`
- **Start in (optional):** The project folder path itself, without quotes
  Example: `C:\Andy Herman\Coding Projects (Local)\seoul_eland_digest`

Click **OK**.

### 6. Conditions tab

- Uncheck **Start the task only if the computer is on AC power** (so it runs on battery too)
- Check **Wake the computer to run this task** (optional but useful if your laptop sleeps overnight)
- Check **Start only if the following network connection is available** and select **Any connection**

### 7. Settings tab

- Check **Allow task to be run on demand**
- Check **Run task as soon as possible after a scheduled start is missed** (this is the key setting if your laptop is off when 8 AM hits)
- Check **If the running task does not end when requested, force it to stop**
- **If the task is already running:** Do not start a new instance

### 8. Save

Click **OK**. Windows will prompt for your password. Enter it.

## Verifying it works

In Task Scheduler, find your task in the list. Right-click and select **Run**. This triggers it immediately.

Watch the logs folder in your project (`logs/digest_YYYYMMDD_HHMMSS.log`) for output. If it runs successfully, you should see a new digest in your Obsidian vault within 2-5 minutes.

If the task shows "Last Run Result: 0x1" or similar non-zero error code, open the latest log file to see what failed.

## Common issues

**Task runs but nothing happens in the vault**
The most common cause is that the venv path in `run_weekly.bat` does not match your actual venv location. Open the .bat file and verify the `PROJECT_DIR` line.

**Task fails with "0x1"**
Almost always a Python or path issue. Open `run_weekly.bat` in PowerShell manually first to see the actual error.

**Task does not run on schedule even when laptop is on**
Check the Triggers tab. The "Synchronize across time zones" option occasionally causes confusion. Also verify your Windows account has logon credentials saved (the task will silently fail if it cannot authenticate).
