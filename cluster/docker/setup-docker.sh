#!/usr/bin/env bash
# Sets up Docker fully on a Pi, and checks it works. Safe to run again any time.
#   ssh grayson@192.168.1.35   (Pi 5)   or   ssh grayson@192.168.1.36   (Pi 4)
#   bash ~/Portfolio/cluster/docker/setup-docker.sh
#   (on the Pi 4, which has no Portfolio clone:
#    curl -fsSL https://raw.githubusercontent.com/g39832/Portfolio/main/cluster/docker/setup-docker.sh | bash)
# Only check, change nothing:   bash setup-docker.sh --check
#
# What you get: Docker Engine + CLI + containerd, docker compose, docker buildx, rootless extras,
# tab completion, your user in the "docker" group (no sudo needed), log rotation so container
# logs can't fill the SD card, and tools for poking at container networking
# (tcpdump, bridge, nsenter, conntrack, ip, dig, curl, jq).
#
# It plays nicely with k3s: k3s uses its own containerd, Docker uses another. The one setting that
# matters is "ip-forward-no-drop": without it Docker sets the kernel's FORWARD policy to DROP,
# which can cut off pod traffic between the two Pis.
#
# If Docker is already installed (the Pi 5 runs Uptime Kuma, Homarr, Grafana and Containerlab in
# it), it is kept and only topped up. Docker restarts once if its settings change; containers with
# a restart policy come straight back.
set -euo pipefail

me="${SUDO_USER:-$USER}"
CHECK_ONLY=0; [ "${1:-}" = "--check" ] && CHECK_ONLY=1
ok()   { printf '  \033[32mOK\033[0m    %s\n' "$*"; }
bad()  { printf '  \033[31mFAIL\033[0m  %s\n' "$*"; FAILED=1; }
step() { printf '\n\033[1m%s\033[0m\n' "$*"; }
FAILED=0
SUDO=""; [ "$(id -u)" -ne 0 ] && SUDO="sudo"

if [ "$CHECK_ONLY" = 0 ]; then
  . /etc/os-release
  arch="$(dpkg --print-architecture)"
  step "1. Docker packages ($PRETTY_NAME, $arch)"
  if dpkg -l docker.io 2>/dev/null | grep -q '^ii'; then
    # Debian's own docker.io package: keep it (swapping engines would stop your containers),
    # just add the plugins it lacks as standalone files.
    echo "  Docker came from Debian's docker.io package; keeping it and adding the plugins."
    $SUDO apt-get update -qq
    plugdir=/usr/local/lib/docker/cli-plugins; $SUDO mkdir -p "$plugdir"
    case "$arch" in arm64) ga=arm64; ca=aarch64 ;; amd64) ga=amd64; ca=x86_64 ;; *) ga=$arch; ca=$arch ;; esac
    if ! docker compose version >/dev/null 2>&1; then
      $SUDO curl -fsSL -o "$plugdir/docker-compose" "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$ca"
      $SUDO chmod +x "$plugdir/docker-compose"
    fi
    if ! docker buildx version >/dev/null 2>&1; then
      v="$(curl -fsSL https://api.github.com/repos/docker/buildx/releases/latest | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -1)"
      $SUDO curl -fsSL -o "$plugdir/docker-buildx" "https://github.com/docker/buildx/releases/download/$v/buildx-$v.linux-$ga"
      $SUDO chmod +x "$plugdir/docker-buildx"
    fi
  else
    # Docker's own apt repository (the normal way, and how updates keep coming with apt upgrade).
    suite="${VERSION_CODENAME:-bookworm}"
    curl -fsSI "https://download.docker.com/linux/debian/dists/$suite/Release" >/dev/null 2>&1 || suite=bookworm
    $SUDO install -m 0755 -d /etc/apt/keyrings
    $SUDO curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
    $SUDO chmod a+r /etc/apt/keyrings/docker.asc
    # Replace any older Docker repo line so apt doesn't complain about duplicates.
    for f in /etc/apt/sources.list.d/*.list /etc/apt/sources.list.d/*.sources; do
      if [ -f "$f" ] && [ "$f" != /etc/apt/sources.list.d/docker.list ] && grep -q download.docker.com "$f"; then
        $SUDO mv "$f" "$f.replaced-by-setup-docker"
      fi
    done
    echo "deb [arch=$arch signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $suite stable" \
      | $SUDO tee /etc/apt/sources.list.d/docker.list >/dev/null
    $SUDO apt-get update -qq
    $SUDO apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin \
      docker-compose-plugin docker-ce-rootless-extras >/dev/null
  fi
  ok "Docker $(docker --version | sed 's/Docker version //')"

  step "2. Networking tools"
  $SUDO apt-get install -y -qq bash-completion iproute2 iptables tcpdump conntrack dnsutils curl jq \
    util-linux bridge-utils ethtool netcat-openbsd >/dev/null
  ok "tcpdump, bridge, nsenter, conntrack, ip, dig, curl, jq"

  step "3. Settings (/etc/docker/daemon.json)"
  $SUDO mkdir -p /etc/docker
  old="$($SUDO cat /etc/docker/daemon.json 2>/dev/null || echo '{}')"
  [ -n "${old// /}" ] || old='{}'
  # Add our settings, keep anything already there (your own settings win).
  want='{"log-driver": "json-file", "log-opts": {"max-size": "10m", "max-file": "3"}, "live-restore": true, "ip-forward-no-drop": true}'
  new="$(printf '%s' "$old" | jq -S --argjson w "$want" '$w * .')"
  printf '%s\n' "$new" > /tmp/daemon.json.new
  # Older Docker (before 28) doesn't know ip-forward-no-drop: try again without it.
  if ! $SUDO dockerd --validate --config-file /tmp/daemon.json.new >/dev/null 2>&1; then
    new="$(printf '%s' "$new" | jq -S 'del(."ip-forward-no-drop")')"
    printf '%s\n' "$new" > /tmp/daemon.json.new
  fi
  if [ "$(printf '%s' "$old" | jq -S . 2>/dev/null)" != "$new" ]; then
    if $SUDO dockerd --validate --config-file /tmp/daemon.json.new >/dev/null 2>&1; then
      [ -f /etc/docker/daemon.json ] && $SUDO cp /etc/docker/daemon.json "/etc/docker/daemon.json.bak-$(date +%Y%m%d%H%M%S)"
      $SUDO cp /tmp/daemon.json.new /etc/docker/daemon.json
      $SUDO systemctl restart docker
      ok "updated (old copy kept as daemon.json.bak-*), Docker restarted"
    else
      echo "  This Docker doesn't accept those settings; leaving daemon.json alone:"
      $SUDO dockerd --validate --config-file /tmp/daemon.json.new 2>&1 | sed 's/^/    /' || true
    fi
  else
    ok "already set"
  fi
  rm -f /tmp/daemon.json.new
  $SUDO systemctl enable --now docker containerd >/dev/null 2>&1 || $SUDO systemctl enable --now docker >/dev/null

  step "4. Your user"
  if id -nG "$me" | grep -qw docker; then ok "$me is in the docker group"
  else
    $SUDO usermod -aG docker "$me"
    ok "added $me to the docker group (log out and back in, or run: newgrp docker)"
  fi
fi

# ---- checks: these show that everything works ----
D=docker; docker info >/dev/null 2>&1 || D="$SUDO docker"
step "Checks"
systemctl is-active --quiet docker && ok "Docker service is running" || bad "Docker service is not running (sudo systemctl status docker)"
$D version --format '{{.Server.Version}}' >/dev/null 2>&1 && ok "engine $($D version --format '{{.Server.Version}}')" || bad "can't reach the Docker engine"
$D compose version >/dev/null 2>&1 && ok "$($D compose version)" || bad "docker compose missing"
$D buildx version >/dev/null 2>&1 && ok "buildx $($D buildx version | awk '{print $2}')" || bad "docker buildx missing"
if $D run --rm hello-world >/dev/null 2>&1; then ok "docker run hello-world"; else bad "docker run hello-world"; fi
name="setup-docker-check-$$"; net="setup-docker-net-$$"
if $D run -d --rm --name "$name" -p 127.0.0.1:18080:80 nginx:alpine >/dev/null 2>&1; then
  for _ in $(seq 20); do curl -fs localhost:18080 >/dev/null 2>&1 && break; sleep 0.5; done
  curl -fs localhost:18080 | grep -qi nginx && ok "published port (-p) reaches a container" || bad "published port didn't answer"
  $D rm -f "$name" >/dev/null 2>&1 || true
else bad "couldn't start nginx"; fi
if $D network create "$net" >/dev/null 2>&1; then
  $D run -d --rm --name "$name-api" --network "$net" nginx:alpine >/dev/null 2>&1 || true
  sleep 2
  $D run --rm --network "$net" busybox wget -qO- -T 5 "http://$name-api" 2>/dev/null | grep -qi nginx \
    && ok "container DNS by name on a user network" || bad "container DNS on a user network"
  $D run --rm alpine wget -q --spider -T 8 https://github.com 2>/dev/null \
    && ok "containers reach the internet" || bad "containers can't reach the internet"
  $D rm -f "$name-api" >/dev/null 2>&1 || true; $D network rm "$net" >/dev/null 2>&1 || true
fi
if command -v k3s >/dev/null 2>&1; then
  pol="$($SUDO iptables -S FORWARD 2>/dev/null | head -1)"
  [ "$pol" = "-P FORWARD DROP" ] && echo "  note  FORWARD policy is DROP; k3s's own rules still allow pod traffic, but check 'kubectl get nodes' and the site." || ok "FORWARD policy: ${pol#-P FORWARD } (k3s pod traffic unaffected)"
fi
if command -v k3s >/dev/null 2>&1 && $SUDO k3s kubectl get nodes >/dev/null 2>&1; then
  notready="$($SUDO k3s kubectl get nodes --no-headers 2>/dev/null | awk '$2 != "Ready"' | wc -l)"
  [ "$notready" = 0 ] && ok "all k3s nodes Ready" || bad "$notready k3s node(s) not Ready"
fi
free_gb="$(df -BG --output=avail /var/lib/docker 2>/dev/null | tail -1 | tr -dc 0-9)"
if [ -n "$free_gb" ]; then
  if [ "$free_gb" -lt 4 ]; then echo "  note  only ${free_gb} GB free for images: keep it tidy with docker system prune -a"
  else ok "${free_gb} GB free for images"; fi
fi

echo
if [ "$FAILED" = 0 ]; then
  echo "Docker is ready. Try: docker run hello-world"
  id -nG "$me" | grep -qw docker && [ -z "$(id -nG | grep -w docker)" ] && echo "(Log out and back in once so docker works without sudo.)"
else
  echo "Something above failed. Paste this output to Claude."
  exit 1
fi
