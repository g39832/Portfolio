#!/bin/bash
# prep.sh <lab>: get a lab ready to use: its home folder under /work, the kubeconfig, and the
# lab's starting files the first time. Used by enter.sh (opening a terminal) and by the course
# (before it runs a check), so a check works even if you never opened that lab's terminal.
LABS="linux bash git k8s net containers docker security backups ci iac pi"
lab="${1:-}"
case " $LABS " in *" $lab "*) ;; *) echo "prep.sh: unknown lab '$lab'" >&2; exit 2 ;; esac
export LAB="$lab" HOME="/work/$lab" SANDBOX="${SANDBOX:-/opt/sandbox}" KUBECONFIG=/work/.kube/config
mkdir -p "$HOME" /work/.kube
# kubectl uses this pod's own account: read-only on the whole cluster (no Secrets),
# full control only in the "playground" namespace, which is where it starts.
if [ -n "${KUBERNETES_SERVICE_HOST:-}" ]; then
  cat > "$KUBECONFIG.$$" <<KC
apiVersion: v1
kind: Config
clusters:
- name: pi
  cluster:
    server: https://${KUBERNETES_SERVICE_HOST}:${KUBERNETES_SERVICE_PORT}
    certificate-authority: /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
users:
- name: learner
  user:
    tokenFile: /var/run/secrets/kubernetes.io/serviceaccount/token
contexts:
- name: playground
  context: {cluster: pi, user: learner, namespace: playground}
current-context: playground
KC
  mv "$KUBECONFIG.$$" "$KUBECONFIG"
fi
cd "$HOME" || exit 1
# mkdir as a lock, so the course and a terminal opening at the same moment don't both seed.
if [ ! -f "$HOME/.seeded" ] && mkdir "$HOME/.seeding" 2>/dev/null; then
  echo "Setting up the $lab lab for the first time..."
  "$SANDBOX/envs/$lab/seed.sh" && touch "$HOME/.seeded"
  rmdir "$HOME/.seeding"
fi
