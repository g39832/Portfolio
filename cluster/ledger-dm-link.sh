#!/usr/bin/env bash
# Prints a new Campaign Ledger DM link (and cancels the old one).
#   ssh grayson@raspberrypi.local "bash ~/Portfolio/cluster/ledger-dm-link.sh"
# Open the link on your own devices only: whoever opens it is the DM.
set -euo pipefail
kubectl -n ledger exec -i deploy/ledger -- python - <<'PY'
import json, urllib.request as u
req = u.Request("http://127.0.0.1:5050/api/dm-key", data=b"{}",
                headers={"Content-Type": "application/json"}, method="POST")
key = json.load(u.urlopen(req))["key"]
print()
print("Your DM link (keep it private, it works like a password):")
print("https://dnd.graysoncodes.org/dm-login?key=" + key)
print()
PY
