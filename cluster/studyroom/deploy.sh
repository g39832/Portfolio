#!/usr/bin/env bash
# Puts the Study Room (cluster/studyroom/index.html) on the cluster, or updates it,
# and adds its tile to the start page.
#   bash ~/Portfolio/cluster/studyroom/deploy.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
kubectl apply -f "$here/../k8s/56-studyroom.yaml"
kubectl -n studyroom create configmap studyroom-page --from-file=index.html="$here/index.html" \
  --from-file=icon.svg="$here/icon.svg" --dry-run=client -o yaml | kubectl apply -f -
kubectl -n studyroom rollout restart deployment studyroom
# The start page gets its tiles from Homepage, so reload Homepage to pick up the Study Room tile.
kubectl apply -f "$here/../k8s/45-homepage.yaml"
kubectl -n homepage rollout restart deployment homepage
kubectl -n studyroom rollout status deployment studyroom --timeout=180s
kubectl -n homepage rollout status deployment homepage --timeout=180s
echo "Study Room is up: http://100.120.223.33:30420"
