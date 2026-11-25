#!/usr/bin/env bash
# Puts the start page (cluster/start/index.html) on the cluster, or updates it.
#   bash ~/Portfolio/cluster/start/deploy.sh
# The first time, this also moves Homepage from :30300 to :30301 so the new page can take :30300.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
kubectl apply -f "$here/../k8s/45-homepage.yaml"      # Homepage on :30301 (frees :30300)
kubectl -n homepage rollout restart deployment homepage
kubectl create namespace start --dry-run=client -o yaml | kubectl apply -f -
kubectl -n start create configmap start-page --from-file=index.html="$here/index.html" \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl -n start create configmap start-icons --from-file="$here/icon.svg"   --from-file="$here/apple-touch-icon.png" --from-file="$here/icon-512.png"   --from-file="$here/manifest.webmanifest" --from-file="$here/lessons.js" --from-file="$here/tank.js" --dry-run=client -o yaml > /tmp/start-icons.yaml
# replace, not apply: apply keeps a full copy of the files in an annotation, and that is capped at 256 KB
kubectl -n start replace -f /tmp/start-icons.yaml 2>/dev/null || kubectl -n start create -f /tmp/start-icons.yaml
rm -f /tmp/start-icons.yaml
kubectl apply -f "$here/../k8s/47-start.yaml"
kubectl -n start rollout restart deployment start
kubectl -n start rollout status deployment start --timeout=180s
kubectl -n homepage rollout status deployment homepage --timeout=180s
echo "Start page is up: http://100.120.223.33:30300   (classic Homepage: http://100.120.223.33:30301)"
