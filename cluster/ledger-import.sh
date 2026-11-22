#!/usr/bin/env bash
# Loads Campaign Ledger data (made on the PC) into the copy running on the cluster.
#   bash ~/Portfolio/cluster/ledger-import.sh ~/ledger-data.tgz
# The archive holds dnd_tracker.sqlite3 and uploads/. The database is copied in with SQLite's
# safe backup copy, so it works while the app is running; the app is restarted afterwards.
# This REPLACES the campaign data on the cluster (the app's own daily backup in /data/backups
# keeps the version from before).
set -euo pipefail
archive="${1:?Give the archive, e.g. ~/ledger-data.tgz}"
ns=ledger

kubectl -n "$ns" rollout status deploy/ledger --timeout=300s
echo "Copying the archive in..."
kubectl -n "$ns" exec -i deploy/ledger -- sh -c 'rm -rf /data/incoming && mkdir -p /data/incoming && tar xzf - -C /data/incoming' < "$archive"
echo "Loading it..."
kubectl -n "$ns" exec -i deploy/ledger -- python - <<'EOF'
import os, shutil, sqlite3
inc = "/data/incoming"
src = sqlite3.connect(os.path.join(inc, "dnd_tracker.sqlite3"))
dst = sqlite3.connect("/data/dnd_tracker.sqlite3")
src.backup(dst)
camps = [r[0] for r in dst.execute("SELECT name FROM campaigns")]
dst.close(); src.close()
n = 0
if os.path.isdir(os.path.join(inc, "uploads")):
    os.makedirs("/data/uploads", exist_ok=True)
    for name in os.listdir(os.path.join(inc, "uploads")):
        shutil.copy2(os.path.join(inc, "uploads", name), "/data/uploads/")
        n += 1
shutil.rmtree(inc)
print("Loaded campaigns:", camps, "| pictures:", n)
EOF
kubectl -n "$ns" rollout restart deployment ledger
kubectl -n "$ns" rollout status deploy/ledger --timeout=300s
echo "Done."
