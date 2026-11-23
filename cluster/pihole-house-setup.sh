#!/usr/bin/env bash
# Gets both Pi-holes ready for the whole house, set up so nobody notices them:
#   - only the gentle default blocklist (StevenBlack), nothing aggressive
#   - an allowlist for things ad blockers often break (sponsored Google links, Xbox, Spotify...)
#   - privacy mode 2: the dashboard shows counts only, not who visited which site
# Safe to run again any time (e.g. after adding a domain below).
# Run on the Pi 5:  ssh grayson@192.168.1.35   then   bash ~/Portfolio/cluster/pihole-house-setup.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"

# Exact domains to always allow. Allowing one that isn't blocked does nothing, so this is harmless.
ALLOW=(
  # Google: sponsored results and Shopping links that otherwise go nowhere; Chrome/Android/YouTube history
  googleadservices.com www.googleadservices.com
  clients2.google.com clients4.google.com android.clients.google.com s.youtube.com
  # Links shared from X/Twitter
  t.co
  # Windows' "no internet" check
  www.msftconnecttest.com www.msftncsi.com
  # Xbox sign-in, achievements, party chat
  xbox.ipv6.microsoft.com device.auth.xboxlive.com title.auth.xboxlive.com xsts.auth.xboxlive.com
  title.mgt.xboxlive.com profile.xboxlive.com notify.xboxlive.com
  # Spotify
  spclient.wg.spotify.com apresolve.spotify.com
  # Dropbox downloads
  dl.dropboxusercontent.com
)

echo "== Port 53 on this Pi (an old DNS program here would fight Pi-hole #2):"
sudo ss -lunp 'sport = :53' || true

kubectl apply -f "$here/k8s/50-pihole.yaml" -f "$here/k8s/51-pihole-pi5.yaml"
kubectl -n pihole rollout status deployment pihole --timeout=300s
kubectl -n pihole rollout status deployment pihole-2 --timeout=300s
sleep 15   # first start downloads the blocklist

for d in pihole pihole-2; do
  echo; echo "== $d"
  kubectl -n pihole exec deploy/$d -- pihole-FTL --config misc.privacylevel 2 >/dev/null
  kubectl -n pihole exec deploy/$d -- pihole allow "${ALLOW[@]}" --comment "house-safe allowlist" | grep -E 'Added|already' || true
  echo "privacy level: $(kubectl -n pihole exec deploy/$d -- pihole-FTL --config misc.privacylevel)"
done

command -v dig >/dev/null || sudo apt-get install -y -qq dnsutils >/dev/null
echo; echo "== Test (blocked ad domain should say 0.0.0.0, google.com a normal address):"
for ip in 192.168.1.36 192.168.1.35; do
  ad="$(dig +short +time=2 +tries=1 @"$ip" doubleclick.net 2>/dev/null | head -1)"
  ok="$(dig +short +time=2 +tries=1 @"$ip" google.com 2>/dev/null | head -1)"
  echo "$ip   doubleclick.net -> ${ad:-NO ANSWER}   google.com -> ${ok:-NO ANSWER}"
done
echo
echo "If both lines show 0.0.0.0 and a real address, both Pi-holes work."
echo "Pi-hole #2 password (once):  kubectl -n pihole exec -it deploy/pihole-2 -- pihole setpassword"
