#!/usr/bin/env bash
# Puts the practice terminals on the cluster, or updates them to the newest image.
#   bash ~/Portfolio/cluster/sandbox/deploy.sh
# The first time it makes a login (user "grayson" + a random password) and prints it.
# Pick your own password:     bash ~/Portfolio/cluster/sandbox/deploy.sh --choose-password
# New random password:        bash ~/Portfolio/cluster/sandbox/deploy.sh --new-password
# Show the current password:  bash ~/Portfolio/cluster/sandbox/deploy.sh --show-password
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"

save_login() {
  kubectl -n sandbox create secret generic sandbox-login --from-literal=credential="grayson:$1" \
    --dry-run=client -o yaml | kubectl apply -f - >/dev/null
}

case "${1:-}" in
  --show-password)
    kubectl -n sandbox get secret sandbox-login -o jsonpath='{.data.credential}' | base64 -d | sed 's/^grayson:/user: grayson   password: /'
    echo
    exit 0 ;;
esac

kubectl apply -f "$here/../k8s/55-sandbox.yaml"
if [ "${1:-}" = "--choose-password" ]; then
  while true; do
    read -rsp "New password for the practice terminals (8+ characters, no colon): " pw; echo
    read -rsp "Type it again: " pw2; echo
    if [ "$pw" != "$pw2" ]; then echo "They don't match, try again."
    elif [ ${#pw} -lt 8 ]; then echo "Too short, use at least 8 characters."
    elif [[ "$pw" == *:* ]]; then echo "No colons (:) please, try again."
    else break; fi
  done
  save_login "$pw"
  echo "Saved. Log in as user grayson with your new password."
elif [ "${1:-}" = "--new-password" ] || ! kubectl -n sandbox get secret sandbox-login >/dev/null 2>&1; then
  pw="$(head -c 18 /dev/urandom | base64 | tr -d '/+=' | cut -c1-20)"
  save_login "$pw"
  echo
  echo "  Practice terminal login   user: grayson   password: $pw"
  echo "  Save it in your phone's password manager. (See it again with --show-password.)"
  echo
fi
kubectl -n sandbox rollout restart deployment sandbox
kubectl -n sandbox rollout status deployment sandbox --timeout=300s
echo "Practice terminals are up: http://100.120.223.33:30410   (or http://192.168.1.35:30410 at home)"
