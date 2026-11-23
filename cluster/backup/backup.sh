#!/bin/sh
# Step 2 of the nightly off-site backup: send /snapshot/data to Backblaze B2 with restic
# (encrypted on the Pi before upload; only the restic password can read it).
# Env (from the offsite-backup Secret): B2_ACCOUNT_ID, B2_ACCOUNT_KEY, RESTIC_REPOSITORY,
# RESTIC_PASSWORD, optional DISCORD_WEBHOOK_URL. APP is set in the CronJob.
# Keeps 7 daily, 4 weekly and 12 monthly copies. Any failure is posted to Discord.
set -u

notify() {
  [ -n "${DISCORD_WEBHOOK_URL:-}" ] || return 0
  msg=$(printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g')
  wget -q -O /dev/null --header 'Content-Type: application/json' \
    --post-data "{\"content\":\"$msg\"}" "$DISCORD_WEBHOOK_URL" || echo "(could not reach Discord)"
}
fail() {
  echo "FAILED: $1"
  notify ":x: Off-site backup of **$APP** failed: $1. Logs on the Pi 5: \`kubectl -n $NAMESPACE logs job/${JOB_NAME:-offsite-backup} --all-containers\`"
  exit 1
}

status=$(cat /snapshot/STATUS 2>/dev/null || echo "snapshot step did not run")
[ "$status" = "ok" ] || fail "$status"

if ! restic cat config >/dev/null 2>&1; then
  echo "No repository yet at $RESTIC_REPOSITORY, creating it"
  restic init || fail "could not open or create the B2 repository (key, bucket name or password wrong?)"
fi

restic backup /snapshot/data --host "$APP" --tag nightly || fail "upload to B2 did not finish"
restic forget --host "$APP" --keep-daily 7 --keep-weekly 4 --keep-monthly 12 --prune || fail "cleaning up old copies"
restic check || fail "repository check found a problem"
restic snapshots --host "$APP" --compact
echo "Off-site backup of $APP done."
