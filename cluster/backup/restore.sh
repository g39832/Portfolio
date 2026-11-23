#!/usr/bin/env bash
# Gets a copy of a backup back from B2 and checks it. Does NOT touch the running app.
# Run on the Pi 5:   bash ~/Portfolio/cluster/backup/restore.sh ledger      (or: blog)
#                    bash ~/Portfolio/cluster/backup/restore.sh ledger <snapshot-id>
# Without an id it takes the newest. The files land in ~/restores/<app>-<date>/ on this Pi,
# and each database gets an integrity check. Copy them to your PC with (from the PC):
#   scp -r grayson@192.168.1.35:restores/<folder> .
set -euo pipefail
APP="${1:-}"; SNAP="${2:-latest}"
case "$APP" in
  ledger) NS=ledger ;;
  blog)   NS=graysoncodes ;;
  *) echo "Usage: bash $0 ledger|blog [snapshot-id]"; exit 1 ;;
esac
POD="restore-$APP-$(date +%H%M%S)"
OUT="$HOME/restores/$APP-$(date +%Y%m%d-%H%M%S)"

cleanup() { kubectl -n "$NS" delete pod "$POD" --wait=false >/dev/null 2>&1 || true; }
trap cleanup EXIT

kubectl -n "$NS" apply -f - >/dev/null <<EOF
apiVersion: v1
kind: Pod
metadata: {name: $POD, namespace: $NS}
spec:
  restartPolicy: Never
  containers:
    - name: restic
      image: restic/restic:0.19.1
      command: [sleep, "900"]
      envFrom: [{secretRef: {name: offsite-backup}}]
      env: [{name: HOME, value: /tmp}]
EOF
kubectl -n "$NS" wait --for=condition=Ready "pod/$POD" --timeout=180s >/dev/null

echo "Copies of $APP in B2:"
kubectl -n "$NS" exec "$POD" -- restic snapshots --host "$APP" --compact
echo
echo "Downloading $SNAP..."
kubectl -n "$NS" exec "$POD" -- restic restore "$SNAP" --host "$APP" --target /tmp/restore
mkdir -p "$OUT"
kubectl -n "$NS" cp "$POD:/tmp/restore/snapshot/data" "$OUT" >/dev/null

echo
echo "Checking it:"
files=$(find "$OUT" -type f | wc -l); size=$(du -sh "$OUT" | cut -f1)
echo "  $files files, $size, in $OUT"
ok=1
while IFS= read -r db; do
  r="$(python3 -c 'import sqlite3,sys; print(sqlite3.connect(sys.argv[1]).execute("PRAGMA integrity_check").fetchone()[0])' "$db" 2>&1)"
  t="$(python3 -c 'import sqlite3,sys; print(sqlite3.connect(sys.argv[1]).execute("select count(*) from sqlite_master where type=\"table\"").fetchone()[0])' "$db" 2>&1)"
  echo "  ${db#"$OUT"/}: integrity $r, $t tables"
  [ "$r" = "ok" ] || ok=0
done < <(find "$OUT" -type f \( -name '*.sqlite3' -o -name '*.sqlite' -o -name '*.db' \))
echo
if [ "$ok" = 1 ] && [ "$files" -gt 0 ]; then echo "Restore test PASSED."; else echo "Restore test FAILED. Paste this output to Claude."; exit 1; fi
