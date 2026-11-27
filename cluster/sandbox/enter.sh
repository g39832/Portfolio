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
"$SANDBOX/prep.sh" "$lab" || exit 1
cd "$HOME" || exit 1
exec tmux -L "$lab" -f "$SANDBOX/tmux.conf" new-session -A -s "$lab" "bash --rcfile $SANDBOX/bashrc -i"
