#!/bin/bash
# ttyd runs this for every browser tab: enter.sh <lab>. Each lab has its own home folder under
# /work (kept on a volume) and its own tmux server, so closing the tab or losing signal on the
# phone doesn't lose your place: opening the lab again picks up where you were.
LABS="linux bash git k8s net containers docker security backups ci iac pi"
lab="${1:-}"
case " $LABS " in
  *" $lab "*) ;;
  *)
    echo "Pick a lab:"
    PS3="Number: "
    select lab in $LABS; do [ -n "$lab" ] && break; done
    [ -n "$lab" ] || exit 0 ;;
esac
export LAB="$lab" HOME="/work/$lab" SANDBOX=/opt/sandbox KUBECONFIG=/work/.kube/config
mkdir -p "$HOME" /work/.kube
# kubectl uses this pod's own account: read-only on the whole cluster (no Secrets),
# full control only in the "playground" namespace, which is where it starts.
if [ -n "${KUBERNETES_SERVICE_HOST:-}" ]; then
  cat > "$KUBECONFIG" <<KC
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
fi
cd "$HOME" || exit 1
if [ ! -f "$HOME/.seeded" ]; then
  echo "Setting up the $lab lab for the first time..."
  "$SANDBOX/envs/$lab/seed.sh" && touch "$HOME/.seeded"
fi
exec tmux -L "$lab" -f "$SANDBOX/tmux.conf" new-session -A -s "$lab" "bash --rcfile $SANDBOX/bashrc -i"
