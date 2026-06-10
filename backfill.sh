#!/bin/bash
PYTHON=venv/Scripts/python.exe
for n in 2 3 4 5 6 7 8 9 10 11; do
  echo "=== $(date '+%H:%M:%S') Starting weeks_back=$n ==="
  $PYTHON seoul_eland_digest.py --weeks-back $n > "logs/backfill_w${n}.log" 2>&1
  rc=$?
  if grep -q "No articles found" "logs/backfill_w${n}.log"; then
    echo "  -> EMPTY week at weeks_back=$n; stopping backfill"
    break
  elif [ $rc -ne 0 ]; then
    echo "  -> ERROR rc=$rc at weeks_back=$n; continuing"
  else
    digest=$(grep "Digest complete:" "logs/backfill_w${n}.log" | tail -1)
    echo "  -> OK: $digest"
  fi
done
echo "=== $(date '+%H:%M:%S') Backfill complete ==="
