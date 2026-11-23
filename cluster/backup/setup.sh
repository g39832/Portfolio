#!/usr/bin/env bash
# Sets up (or updates) the nightly off-site backups of the D&D app and the blog to Backblaze B2.
# Run on the Pi 5:   bash ~/Portfolio/cluster/backup/setup.sh
# Safe to run again: press Enter at the key questions to keep what's saved, and it never
# changes the backup password once made (a new password would lock you out of old backups).
#
# First time it asks for the B2 bucket name and application key (typing of the key is hidden),
# makes a random backup password, stores it all in the "offsite-backup" secret in the ledger and
# graysoncodes namespaces (never in git), puts the scripts in place, applies
# k8s/90-offsite-backup.yaml, and runs both backups once so you see them work.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
K8S="$HERE/../k8s"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

secret_val() { kubectl -n ledger get secret offsite-backup -o jsonpath="{.data.$1}" 2>/dev/null | base64 -d 2>/dev/null || true; }
OLD_ID="$(secret_val B2_ACCOUNT_ID)"
OLD_KEY="$(secret_val B2_ACCOUNT_KEY)"
OLD_REPO="$(secret_val RESTIC_REPOSITORY)"     # b2:<bucket>:ledger
OLD_BUCKET=""; case "$OLD_REPO" in b2:*) OLD_BUCKET="$(printf '%s' "$OLD_REPO" | cut -d: -f2)" ;; esac
PASSWORD="$(secret_val RESTIC_PASSWORD)"

ask() {  # ask "question" "current value" -> answer (Enter keeps the current value)
  local a; read -rp "$1${2:+ [Enter keeps $2]}: " a; a="$(printf '%s' "$a" | tr -d '[:space:]')"; printf '%s' "${a:-$2}"
}
BUCKET="$(ask "B2 bucket name" "$OLD_BUCKET")"
KEY_ID="$(ask "B2 keyID" "$OLD_ID")"
read -rsp "B2 applicationKey (it won't show)${OLD_KEY:+ [Enter keeps the saved one]}: " APP_KEY; echo
APP_KEY="$(printf '%s' "$APP_KEY" | tr -d '[:space:]')"; APP_KEY="${APP_KEY:-$OLD_KEY}"
[ -n "$BUCKET" ] && [ -n "$KEY_ID" ] && [ -n "$APP_KEY" ] || { echo "Bucket, keyID and applicationKey are all needed. Nothing changed."; exit 1; }

NEW_PASSWORD=0
if [ -z "$PASSWORD" ]; then PASSWORD="$(openssl rand -base64 33 | tr -d '\n/+=' | cut -c1-40)"; NEW_PASSWORD=1; fi

# Failures go to the same Discord channel as the CrowdSec alerts, if that's set up.
DISCORD="$(kubectl -n crowdsec get secret crowdsec-discord -o jsonpath='{.data.url}' 2>/dev/null | base64 -d 2>/dev/null || true)"

for pair in ledger:ledger graysoncodes:blog; do
  ns="${pair%%:*}"; app="${pair##*:}"
  printf '%s' "$KEY_ID"                 > "$TMP/B2_ACCOUNT_ID"
  printf '%s' "$APP_KEY"                > "$TMP/B2_ACCOUNT_KEY"
  printf '%s' "b2:$BUCKET:$app"         > "$TMP/RESTIC_REPOSITORY"
  printf '%s' "$PASSWORD"               > "$TMP/RESTIC_PASSWORD"
  printf '%s' "$DISCORD"                > "$TMP/DISCORD_WEBHOOK_URL"
  kubectl -n "$ns" create secret generic offsite-backup \
    --from-file="$TMP/B2_ACCOUNT_ID" --from-file="$TMP/B2_ACCOUNT_KEY" --from-file="$TMP/RESTIC_REPOSITORY" \
    --from-file="$TMP/RESTIC_PASSWORD" --from-file="$TMP/DISCORD_WEBHOOK_URL" \
    --dry-run=client -o yaml | kubectl apply -f - >/dev/null
  kubectl -n "$ns" create configmap offsite-backup-scripts \
    --from-file="$HERE/snapshot.py" --from-file="$HERE/backup.sh" \
    --dry-run=client -o yaml | kubectl apply -f - >/dev/null
done
rm -f "$TMP"/*
echo "Saved the offsite-backup secret and scripts in ledger and graysoncodes."
kubectl apply -f "$K8S/90-offsite-backup.yaml"

if [ "$NEW_PASSWORD" = 1 ]; then
  cat <<EOF

=====================================================================
 YOUR BACKUP PASSWORD (save it now, somewhere that is NOT this Pi):

     $PASSWORD

 The backups in B2 are encrypted with it. If the Pi dies and this
 password is lost, nobody can read the backups, not even you.
 Put it in a password manager or your phone's notes.
=====================================================================
EOF
  read -rp "Type  saved  once you've saved it: " ok
  while [ "$ok" != "saved" ]; do read -rp "Please save it first, then type  saved : " ok; done
fi

echo
echo "Running both backups now to check they work (about a minute)..."
STAMP="$(date +%Y%m%d-%H%M%S)"
RESULT=0
for pair in ledger:ledger graysoncodes:blog; do
  ns="${pair%%:*}"; app="${pair##*:}"; job="first-run-$STAMP"
  kubectl -n "$ns" create job --from=cronjob/offsite-backup "$job" >/dev/null
  for _ in $(seq 1 120); do
    c="$(kubectl -n "$ns" get job "$job" -o jsonpath='{.status.conditions[*].type}')"
    case "$c" in *Complete*|*Failed*) break ;; esac
    sleep 5
  done
  echo "----- $app -----"
  kubectl -n "$ns" logs "job/$job" --all-containers --tail=40 || true
  if [ "$(kubectl -n "$ns" get job "$job" -o jsonpath='{.status.succeeded}')" = "1" ]; then
    echo ">>> $app: backed up to B2."
  else
    echo ">>> $app: FAILED (see above)."; RESULT=1
  fi
done
echo
if [ "$RESULT" = 0 ]; then
  echo "All good. From now on it runs every night (ledger 4:30am, blog 4:40am)."
  echo "Test getting a copy back any time:  bash $HERE/restore.sh ledger   (or blog)"
else
  echo "Something failed. Paste the output above to Claude."
fi
exit "$RESULT"
