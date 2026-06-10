#!/bin/bash
PYTHON=venv/Scripts/python.exe
echo "=== $(date '+%H:%M:%S') Starting round backfill ==="
for r in 1 2 3 4 5 6 7 9 10; do
  echo "=== $(date '+%H:%M:%S') Round $r ==="
  $PYTHON seoul_eland_digest.py --round $r > "logs/backfill_r${r}.log" 2>&1
  rc=$?
  if [ $rc -ne 0 ]; then
    echo "  -> ERROR rc=$rc"
  else
    echo "  -> OK"
  fi
done
echo "=== $(date '+%H:%M:%S') Round backfill complete ==="
