#!/usr/bin/env bash
# Sends a Discord message every time CrowdSec bans someone.
# Run on the Pi 5:   bash ~/Portfolio/cluster/crowdsec-discord-setup.sh
# Safe to run again (for example to switch to another channel's webhook).
#
# It asks for a Discord webhook address (typing is hidden; Discord: channel >
# Edit Channel > Integrations > Webhooks > Copy Webhook URL), keeps it in the
# "crowdsec-discord" secret in the cluster (never in git), restarts CrowdSec so it
# picks it up, and sends a test message.
set -euo pipefail
NS=crowdsec
HERE="$(cd "$(dirname "$0")" && pwd)"

read -rsp "Paste the Discord webhook URL, then press Enter (it won't show): " URL
echo
URL="$(printf '%s' "$URL" | tr -d '[:space:]')"
case "$URL" in
  https://discord.com/api/webhooks/*|https://discordapp.com/api/webhooks/*|https://ptb.discord.com/api/webhooks/*|https://canary.discord.com/api/webhooks/*) ;;
  *) echo "That doesn't look like a Discord webhook URL (https://discord.com/api/webhooks/...). Nothing changed."; exit 1 ;;
esac

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
printf '%s' "$URL" > "$TMP/url"
kubectl -n "$NS" create secret generic crowdsec-discord --from-file=url="$TMP/url" \
  --dry-run=client -o yaml | kubectl apply -f - >/dev/null
echo "Saved the crowdsec-discord secret."

echo "Updating CrowdSec (takes a minute or two)..."
kubectl apply -f "$HERE/k8s/80-crowdsec.yaml" >/dev/null
for _ in $(seq 1 60); do
  kubectl -n "$NS" get deploy crowdsec-lapi -o jsonpath='{.spec.template.spec.containers[0].env[*].name}' 2>/dev/null \
    | grep -q DISCORD_WEBHOOK_URL && break
  sleep 5
done
kubectl -n "$NS" rollout restart deploy/crowdsec-lapi >/dev/null
kubectl -n "$NS" rollout status deploy/crowdsec-lapi --timeout=300s

echo "Sending a test message to Discord..."
kubectl -n "$NS" exec deploy/crowdsec-lapi -- cscli notifications test discord >/dev/null 2>&1 || true
echo "Done. Check the channel: you should see \"Blocked an attacker\" with IP 10.10.10.10 and reason \"test alert\"."
