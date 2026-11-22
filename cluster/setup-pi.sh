#!/usr/bin/env bash
# Prepares a Raspberry Pi for the cluster and installs k3s.
#
#   Pi 5 (the boss):    bash setup-pi.sh server
#   Pi 4 (the worker):  bash setup-pi.sh agent PI5_IP TOKEN
#
# The first run turns on memory cgroups and reboots. Run the same command again
# after the reboot to install k3s.
set -euo pipefail

role="${1:-}"
if [[ "$role" != "server" && "$role" != "agent" ]]; then
  echo "Usage: bash setup-pi.sh server   |   bash setup-pi.sh agent PI5_IP TOKEN" >&2
  exit 1
fi
if [[ "$role" == "agent" && ( -z "${2:-}" || -z "${3:-}" ) ]]; then
  echo "The worker needs the Pi 5's IP and the token:  bash setup-pi.sh agent 192.168.1.50 K10abc..." >&2
  exit 1
fi

if [[ "$(uname -m)" != "aarch64" ]]; then
  echo "This Pi runs a 32-bit OS ($(uname -m)). Reflash it with Raspberry Pi OS Lite (64-bit)." >&2
  exit 1
fi

# Wi-Fi power saving makes the Pis drop off the network for a moment now and then,
# which the cluster sees as a Pi going down. Turn it off for every saved Wi-Fi network.
if command -v nmcli >/dev/null; then
  nmcli -t -f NAME,TYPE connection show | awk -F: '$2=="802-11-wireless"{print $1}' |
    while read -r name; do
      sudo nmcli connection modify "$name" 802-11-wireless.powersave 2 && echo "Wi-Fi power saving off for: $name"
    done
fi

# k3s needs memory cgroups. cmdline.txt must stay one single line.
cmdline=/boot/firmware/cmdline.txt
if ! grep -q "cgroup_enable=memory" "$cmdline"; then
  sudo cp "$cmdline" "$cmdline.before-k3s"
  sudo sed -i '1 s/$/ cgroup_memory=1 cgroup_enable=memory/' "$cmdline"
  echo
  echo "Memory cgroups turned on. Rebooting now - run this same command again afterwards."
  sleep 3
  sudo reboot
  exit 0
fi

if command -v k3s >/dev/null; then
  echo "k3s is already installed:"
  sudo k3s --version | head -1
  exit 0
fi

if [[ "$role" == "server" ]]; then
  # Traefik and the built-in load balancer stay off: cloudflared talks straight to the
  # website's service, and they would take over ports 80/443 on the Pi.
  curl -sfL https://get.k3s.io | sh -s - server \
    --write-kubeconfig-mode 644 \
    --disable traefik --disable servicelb
  echo
  echo "Done. Give this to the Pi 4:"
  echo "  IP:    $(hostname -I | awk '{print $1}')"
  echo "  Token: $(sudo cat /var/lib/rancher/k3s/server/node-token)"
else
  curl -sfL https://get.k3s.io | K3S_URL="https://$2:6443" K3S_TOKEN="$3" sh -s - agent
  echo
  echo "Done. On the Pi 5, 'kubectl get nodes' should show this Pi within a minute."
fi
