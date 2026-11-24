#!/usr/bin/env bash
# Puts the practice terminals on the cluster, or updates them to the newest image.
#   bash ~/Portfolio/cluster/sandbox/deploy.sh
# The first time it makes a login (user "grayson" + a random password) and prints it.
# Change the password later:  bash ~/Portfolio/cluster/sandbox/deploy.sh --new-password
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
kubectl apply -f "$here/../k8s/55-sandbox.yaml"
if [ "${1:-}" = "--new-password" ] || ! kubectl -n sandbox get secret sandbox-login >/dev/null 2>&1; then
  pw="$(head -c 18 /dev/urandom | base64 | tr -d '/+=' | cut -c1-20)"
  kubectl -n sandbox create secret generic sandbox-login --from-literal=credential="grayson:$pw" \
    --dry-run=client -o yaml | kubectl apply -f -
  echo
  echo "  Practice terminal login   user: grayson   password: $pw"
  echo "  Save it in your phone's password manager. (This is only shown now.)"
  echo
fi
kubectl -n sandbox rollout restart deployment sandbox
kubectl -n sandbox rollout status deployment sandbox --timeout=300s
echo "Practice terminals are up: http://100.120.223.33:30410   (or http://192.168.1.35:30410 at home)"
