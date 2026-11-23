#!/usr/bin/env bash
# Makes this Pi look up names with Cloudflare/Quad9 directly instead of asking the router.
# Why: once the router sends everyone to Pi-hole, a Pi that asks the router would be asking
# Pi-hole, which runs on the cluster, which needs that Pi to work. That's a loop: after a power cut
# nothing could start. With this, the Pis (and the cluster) never depend on Pi-hole.
# Run it ONCE on EACH Pi:
#   ssh grayson@192.168.1.35   then   sudo bash ~/Portfolio/cluster/pi-own-dns.sh
#   ssh grayson@192.168.1.36   then   sudo bash ~/Portfolio/cluster/pi-own-dns.sh   (needs git pull there too)
# Undo (NetworkManager): sudo nmcli con mod "<name>" ipv4.dns "" ipv4.ignore-auto-dns no && sudo nmcli con up "<name>"
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Run with sudo: sudo bash $0"; exit 1; }
DNS="1.1.1.1 9.9.9.9"

if command -v nmcli >/dev/null && nmcli -t -f RUNNING general 2>/dev/null | grep -q running; then
  con="$(nmcli -t -f NAME,DEVICE con show --active | grep -v ':lo$' | grep -v ':tailscale' | grep -v ':cni\|:flannel\|:veth\|:docker\|:br-' | head -1 | cut -d: -f1)"
  [ -n "$con" ] || { echo "Couldn't find the active Wi-Fi/Ethernet connection. Send me: nmcli con show --active"; exit 1; }
  echo "Connection: $con"
  nmcli con mod "$con" ipv4.dns "$DNS" ipv4.ignore-auto-dns yes
  nmcli con up "$con" >/dev/null   # re-applies; Wi-Fi blips for a second
elif [ -f /etc/dhcpcd.conf ]; then
  grep -q '^static domain_name_servers=' /etc/dhcpcd.conf \
    || printf '\n# pi-own-dns.sh: look up names directly, never via Pi-hole\nstatic domain_name_servers=%s\n' "$DNS" >> /etc/dhcpcd.conf
  systemctl restart dhcpcd
else
  echo "Neither NetworkManager nor dhcpcd found. Send me: ls /etc/NetworkManager /etc/dhcpcd.conf"; exit 1
fi

sleep 3
echo "Now using:"; grep '^nameserver' /etc/resolv.conf
getent hosts github.com >/dev/null && echo "OK: name lookups work." || echo "WARNING: github.com didn't resolve. Send me this output."
# The cluster's own DNS (CoreDNS) copies this Pi's settings when it starts; refresh it.
if command -v kubectl >/dev/null && kubectl get nodes >/dev/null 2>&1; then
  kubectl -n kube-system rollout restart deployment coredns >/dev/null && echo "Restarted cluster DNS (CoreDNS)."
fi
