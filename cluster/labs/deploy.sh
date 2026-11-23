#!/usr/bin/env bash
# Puts the network labs guide (cluster/labs/index.html) on the cluster, or updates it.
#   bash ~/Portfolio/cluster/labs/deploy.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
kubectl apply -f "$here/../k8s/49-labs.yaml"
kubectl -n labs create configmap labs-page --from-file=index.html="$here/index.html" \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl -n labs rollout restart deployment labs
kubectl -n labs rollout status deployment labs --timeout=180s
echo "Labs guide is up: http://100.120.223.33:30403"
