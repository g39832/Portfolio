#!/bin/bash
# Real Pi lab: an SSH config with short names for both Pis.
set -e
mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh"
cat > "$HOME/.ssh/config" <<C
# pi5 is the Pi this terminal runs on (its address comes from Kubernetes).
Host pi5
  HostName ${HOST_IP:-192.168.1.35}
  User grayson
Host pi2
  HostName 192.168.1.36
  User grayson
Host *
  ServerAliveInterval 30
C
chmod 600 "$HOME/.ssh/config"
