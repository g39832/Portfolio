#!/usr/bin/env bash
# Network labs on the Pi 5: virtual routers (FRR, Cisco-style commands) and PCs, wired together
# by Containerlab. The guide with every step is http://100.120.223.33:30403
#
#   lab install        one time: installs Containerlab
#   lab list           what labs there are
#   lab start 2        start lab 2 (stops any other lab first)
#   lab r1             open router r1's command line (type "exit" to leave)
#   lab pc1            open pc1's command line
#   lab sh r1          open r1's Linux shell (for ip/ping/tcpdump on a router)
#   lab check          did I do it right?
#   lab reset          start the current lab again from scratch
#   lab draw           see a live map of the lab: http://100.120.223.33:50080 (Ctrl+C to stop)
#   lab stop           turn the lab off (frees the memory)
# Make "lab" a command (one time):  echo "alias lab='bash ~/Portfolio/cluster/labs/lab.sh'" >> ~/.bashrc && source ~/.bashrc
set -uo pipefail
SRC="$(cd "$(dirname "$0")" && pwd)"
RUN="$HOME/labs-run"
CUR="$RUN/current"
docker ps >/dev/null 2>&1 && D=docker || D="sudo docker"

labdir() { ls -d "$SRC"/lab"$1"-* 2>/dev/null | head -1; }
current() { [ -f "$CUR" ] && cat "$CUR"; }
need_lab() { L="$(current)"; [ -n "$L" ] || { echo "No lab is running. Start one: lab start 1"; exit 1; }; }
node() { echo "clab-lab$L-$1"; }

case "${1:-help}" in
  install)
    command -v containerlab >/dev/null && { containerlab version | head -3; echo "Already installed."; exit 0; }
    bash -c "$(curl -sL https://get.containerlab.dev)"
    echo "Getting the router + PC images (about 300 MB, one time)..."
    $D pull -q quay.io/frrouting/frr:10.4.5 && $D pull -q nicolaka/netshoot:v0.14
    echo "Done. Next: lab start 1" ;;

  list)
    for d in "$SRC"/lab[0-9]*-*/; do
      n="$(basename "$d")"; printf '  %s  %s\n' "${n:3:1}" "$(sed -n '1s/^# //p' "$d/topology.clab.yml")"
    done ;;

  start|reset)
    n="${2:-}"; [ "$1" = reset ] && n="$(current)"
    [ -n "$n" ] && d="$(labdir "$n")" && [ -n "$d" ] || { echo "Which lab? e.g. lab start 1   (see: lab list)"; exit 1; }
    bash "$0" stop >/dev/null 2>&1
    mkdir -p "$RUN" && rm -rf "$RUN/$(basename "$d")"
    cp -r "$d" "$RUN/" && cp "$SRC/daemons" "$SRC/vtysh.conf" "$RUN/"
    echo "Starting $(basename "$d")... (about 20 seconds)"
    sudo containerlab deploy -t "$RUN/$(basename "$d")/topology.clab.yml" --reconfigure >"$RUN/deploy.log" 2>&1 \
      || { tail -20 "$RUN/deploy.log"; echo "Start failed. Send me the lines above."; exit 1; }
    echo "$n" > "$CUR"
    # Wait until each router has loaded its settings (takes a few seconds after the start).
    for c in $($D ps --filter "name=clab-lab$n-r" --format '{{.Names}}'); do
      for _ in $(seq 30); do $D exec "$c" vtysh -c 'show running-config' 2>/dev/null | grep -q '^hostname' && break; sleep 1; done
    done
    sleep 3
    echo; echo "Lab $n is running. Its devices:"
    $D ps --filter "name=clab-lab$n-" --format '  {{.Names}}' | sed "s/clab-lab$n-/  lab /"
    echo; echo "Follow the steps in the guide: http://100.120.223.33:30403/#lab$n" ;;

  stop)
    L="$(current)"; [ -n "$L" ] || { echo "No lab running."; exit 0; }
    t="$(ls "$RUN"/lab"$L"-*/topology.clab.yml 2>/dev/null | head -1)"
    [ -n "$t" ] && sudo containerlab destroy -t "$t" --cleanup >/dev/null 2>&1
    rm -f "$CUR"; echo "Lab $L stopped." ;;

  draw)
    need_lab; t="$(ls "$RUN"/lab"$L"-*/topology.clab.yml | head -1)"
    echo "Open http://100.120.223.33:50080 (or http://192.168.1.35:50080 at home). Ctrl+C to stop."
    sudo containerlab graph -t "$t" ;;

  sh)
    need_lab; $D exec -it "$(node "${2:?which device? e.g. lab sh r1}")" bash ;;

  r[0-9]*)
    need_lab; $D exec -it "$(node "$1")" vtysh ;;

  pc[0-9]*)
    need_lab; $D exec -it "$(node "$1")" bash ;;

  check)
    need_lab; ok=0; total=0
    x() { $D exec "$(node "$1")" sh -c "$2" >/dev/null 2>&1; }
    t() { total=$((total+1)); if x "$1" "$2"; then ok=$((ok+1)); echo "  ✅ $3"; else echo "  ❌ $3"; [ -n "${4:-}" ] && echo "       hint: $4"; fi; }
    echo "Checking lab $L..."
    case "$L" in
      1)
        t pc1 "ip -4 addr show eth1 | grep -q 'inet 10.0.1.1/24'" "pc1 eth1 has 10.0.1.1/24" "on pc1: ip addr add 10.0.1.1/24 dev eth1"
        t pc2 "ip -4 addr show eth1 | grep -q 'inet 10.0.1.2/24'" "pc2 eth1 has 10.0.1.2/24" "same idea on pc2, with .2"
        t pc1 "ping -c2 -W1 10.0.1.2" "pc1 can ping pc2" "both addresses must be in the same /24, and eth1 must be up (ip link show eth1)" ;;
      2)
        t r1 "ip -4 addr show eth1 | grep -q 'inet 10.0.1.1/24'" "r1 eth1 is 10.0.1.1/24" "in r1: configure terminal / interface eth1 / ip address 10.0.1.1/24"
        t r1 "ip -4 addr show eth2 | grep -q 'inet 10.0.2.1/24'" "r1 eth2 is 10.0.2.1/24"
        t pc1 "ip route | grep -q 'default via 10.0.1.1 dev'" "pc1's gateway is r1" "on pc1: ip route add default via 10.0.1.1"
        t pc2 "ip route | grep -q 'default via 10.0.2.1 dev'" "pc2's gateway is r1" "pc2's gateway is r1's address on pc2's side"
        t pc1 "ping -c2 -W1 10.0.2.10" "pc1 can ping pc2 through r1" ;;
      3)
        t r1 "ip route show 10.0.3.0/24 | grep -q via" "r1 knows the way to pc2's network" "in r1: configure terminal / ip route 10.0.3.0/24 <next router's address>"
        t r3 "ip route show 10.0.1.0/24 | grep -q via" "r3 knows the way BACK to pc1's network" "replies need a route too"
        t r2 "ip route show 10.0.1.0/24 | grep -q via && ip route show 10.0.3.0/24 | grep -q via" "r2 knows both end networks" "r2 is in the middle: it needs a route to each end"
        t pc1 "ping -c2 -W1 10.0.3.10" "pc1 can ping pc2 across 3 routers" ;;
      4)
        t r1 "[ \$(vtysh -c 'show ip ospf neighbor' | grep -c Full) -ge 2 ]" "r1 has 2 OSPF neighbours (Full)" "in r1: router ospf / network 10.0.0.0/16 area 0 - do it on every router"
        t r2 "[ \$(vtysh -c 'show ip ospf neighbor' | grep -c Full) -ge 2 ]" "r2 has 2 OSPF neighbours (Full)"
        t r3 "[ \$(vtysh -c 'show ip ospf neighbor' | grep -c Full) -ge 2 ]" "r3 has 2 OSPF neighbours (Full)"
        t r1 "ip route show 10.0.3.0/24 | grep -q ospf" "r1 learned pc2's network from OSPF (not typed by hand)" "the routes must come from OSPF; check: show ip route ospf"
        t pc1 "ping -c2 -W1 10.0.3.10" "pc1 can ping pc2" ;;
      5)
        t pc1 "ping -c2 -W1 10.0.3.10" "pc1 can ping pc2"
        t pc2 "ping -c2 -W1 10.0.1.10" "pc2 can ping pc1"
        f=0
        x pc1 "ip route | grep -q 'default via 10.0.1.1 dev'" && f=$((f+1))
        x r2 "ip link show eth2 | grep -q 'state UP'" && f=$((f+1))
        x r3 "ip route show 10.0.1.0/24 | grep -q via" && f=$((f+1))
        echo "  Problems fixed: $f of 3" ;;
      *) echo "No checks for lab $L yet." ;;
    esac
    echo; [ "$ok" = "$total" ] && echo "🎉 Lab $L complete! ($ok/$total)" || echo "$ok of $total done. Stuck? Paste this output to Claude." ;;

  *) sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//' ;;
esac
