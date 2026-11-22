#!/usr/bin/env bash
# CrowdSec stage 2 setup: connects CrowdSec to Cloudflare so flagged IPs get stopped.
# Run on the Pi 5:   bash ~/Portfolio/cluster/crowdsec-cloudflare-setup.sh
# Safe to run again (for example with a new token): it keeps the existing key.
#
# It asks for a Cloudflare API token (typing is hidden), checks it, looks up the
# graysoncodes.org account and zone IDs itself, stores everything in the
# "cloudflare-bouncer" secret in the cluster (never in git), then starts the
# blocker (k8s/81-crowdsec-cloudflare.yaml).
set -euo pipefail

ZONE_NAME=graysoncodes.org
NS=crowdsec
HERE="$(cd "$(dirname "$0")" && pwd)"
API=https://api.cloudflare.com/client/v4

read -rsp "Paste the Cloudflare API token, then press Enter (it won't show): " CF_TOKEN
echo
CF_TOKEN="$(printf '%s' "$CF_TOKEN" | tr -d '[:space:]')"
[ -n "$CF_TOKEN" ] || { echo "No token entered. Nothing changed."; exit 1; }

# Ask Cloudflare about the token and the zone. The token goes in a header, read
# from a temp file, so it never shows up in the process list.
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
printf 'Authorization: Bearer %s\n' "$CF_TOKEN" > "$TMP/auth"
cf() { curl -fsS -H @"$TMP/auth" "$API$1"; }

echo "Checking the token..."
cf /user/tokens/verify | python3 -c 'import sys,json; d=json.load(sys.stdin); sys.exit(0 if d.get("success") and d["result"]["status"]=="active" else 1)' \
  || { echo "Cloudflare says this token isn't valid or active. Nothing changed."; exit 1; }

echo "Looking up $ZONE_NAME..."
read -r CF_ZONE_ID CF_ACCOUNT_ID < <(cf "/zones?name=$ZONE_NAME" | python3 -c '
import sys, json
d = json.load(sys.stdin)
r = d.get("result") or []
if not r: sys.exit(1)
print(r[0]["id"], r[0]["account"]["id"])') \
  || { echo "The token can't see $ZONE_NAME. Check it includes Zone > Zone > Read for that site."; exit 1; }
echo "  zone $CF_ZONE_ID, account $CF_ACCOUNT_ID"

# Keep the existing CrowdSec key if there is one (CrowdSec only registers it once).
LAPI_KEY="$(kubectl -n "$NS" get secret cloudflare-bouncer -o jsonpath='{.data.lapi-key}' 2>/dev/null | base64 -d || true)"
[ -n "$LAPI_KEY" ] || LAPI_KEY="$(openssl rand -hex 24)"

printf '%s' "$CF_TOKEN"      > "$TMP/cf-token"
printf '%s' "$LAPI_KEY"      > "$TMP/lapi-key"
printf '%s' "$CF_ACCOUNT_ID" > "$TMP/account-id"
printf '%s' "$CF_ZONE_ID"    > "$TMP/zone-id"
kubectl -n "$NS" create secret generic cloudflare-bouncer \
  --from-file=cf-token="$TMP/cf-token" --from-file=lapi-key="$TMP/lapi-key" \
  --from-file=account-id="$TMP/account-id" --from-file=zone-id="$TMP/zone-id" \
  --dry-run=client -o yaml | kubectl apply -f - >/dev/null
echo "Saved the cloudflare-bouncer secret."

echo "Updating CrowdSec so it knows the blocker's key (takes a minute or two)..."
kubectl apply -f "$HERE/k8s/80-crowdsec.yaml" >/dev/null
for _ in $(seq 1 60); do
  kubectl -n "$NS" get deploy crowdsec-lapi -o jsonpath='{.spec.template.spec.containers[0].env[*].name}' 2>/dev/null \
    | grep -q BOUNCER_KEY_cloudflare && break
  sleep 5
done
kubectl -n "$NS" rollout restart deploy/crowdsec-lapi >/dev/null
kubectl -n "$NS" rollout status deploy/crowdsec-lapi --timeout=300s

echo "Starting the Cloudflare blocker..."
kubectl apply -f "$HERE/k8s/81-crowdsec-cloudflare.yaml" >/dev/null
kubectl -n "$NS" rollout restart deploy/cloudflare-bouncer >/dev/null
kubectl -n "$NS" rollout status deploy/cloudflare-bouncer --timeout=300s

echo
echo "Done. Blocker log (look for errors):"
sleep 20
kubectl -n "$NS" logs deploy/cloudflare-bouncer --tail=15 || true
echo
echo "Registered with CrowdSec:"
kubectl -n "$NS" exec deploy/crowdsec-lapi -- cscli bouncers list
