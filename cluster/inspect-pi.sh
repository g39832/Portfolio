#!/usr/bin/env bash
# Read-only health and hardware report for a Pi in the cluster. Changes nothing.
# From Windows PowerShell:
#   Get-Content -Raw "$HOME\Desktop\Portfolio\cluster\inspect-pi.sh" | ssh grayson@raspberrypi.local "bash -s"

section() { printf '\n===== %s =====\n' "$1"; }

section "IDENTITY"
echo "Host:   $(hostname)"
echo "Model:  $(tr -d '\0' < /proc/device-tree/model 2>/dev/null)"
echo "Arch:   $(uname -m)   Kernel: $(uname -r)"
echo "OS:     $(. /etc/os-release && echo "$PRETTY_NAME")"
echo "Uptime: $(uptime -p)"

section "CPU / TEMPERATURE / POWER"
echo "Cores: $(nproc)   Load: $(cut -d' ' -f1-3 /proc/loadavg)"
vcgencmd measure_temp 2>/dev/null || echo "temp: $(( $(cat /sys/class/thermal/thermal_zone0/temp) / 1000 ))C"
vcgencmd get_throttled 2>/dev/null   # 0x0 = no power or heat problems

section "MEMORY"
free -h

section "DISKS"
lsblk -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINTS,MODEL,TRAN
echo
df -h -x tmpfs -x devtmpfs -x overlay -x squashfs 2>/dev/null

section "NETWORK"
ip -4 -brief addr | grep -v '^lo'
ip route | grep default
echo "DNS servers: $(grep '^nameserver' /etc/resolv.conf | awk '{print $2}' | xargs)"
iw dev wlan0 link 2>/dev/null | grep -E 'SSID|signal|tx bitrate' | sed 's/^\s*/wifi /'

section "LISTENING PORTS (looking at 53 DNS, 80, 8096 Jellyfin)"
ss -tuln | awk 'NR==1 || /LISTEN|UNCONN/' | awk '{print $1, $5}' | sort -u -k2 | grep -E ':(53|67|80|443|8096|8920|1900|7359)\b' || echo "none of those ports are in use"

section "DOCKER"
if command -v docker >/dev/null; then
  docker --version
  docker ps --format '{{.Names}}  {{.Image}}  {{.Status}}  {{.Ports}}' 2>&1 | head -20
else
  echo "Docker not installed"
fi

section "K3S"
systemctl is-active k3s k3s-agent 2>/dev/null | paste -sd' '
command -v kubectl >/dev/null && kubectl get pods -A -o wide --field-selector spec.nodeName="$(hostname)" 2>/dev/null | awk '{print $1, $2, $4}' | column -t

section "USB DEVICES"
lsusb 2>/dev/null | grep -v -i 'root hub'
