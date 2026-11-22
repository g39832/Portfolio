#!/usr/bin/env bash
# Puts the learning guide (cluster/study/index.html) on the cluster, or updates it.
#   bash ~/Portfolio/cluster/study/deploy.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
kubectl apply -f "$here/../k8s/46-study.yaml"
kubectl -n study create configmap study-page --from-file=index.html="$here/index.html" \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl -n study rollout restart deployment study
kubectl -n study rollout status deployment study --timeout=180s
echo "Guide is up: http://100.120.223.33:30402"
