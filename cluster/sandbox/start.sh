#!/bin/bash
# Container start: ttyd on a private socket, nginx on :7681 in front of it (see nginx.conf).
# $TTYD_CREDENTIAL is "user:password" from the sandbox-login secret.
set -euo pipefail
user="${TTYD_CREDENTIAL%%:*}"
pass="${TTYD_CREDENTIAL#*:}"
printf '%s:%s\n' "$user" "$(openssl passwd -apr1 "$pass")" > /tmp/htpasswd
cookie="$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')"
sed "s/COOKIE/$cookie/g" /opt/sandbox/nginx.conf > /tmp/nginx.conf
rm -f /tmp/ttyd.sock
ttyd -i /tmp/ttyd.sock -W -a -m 6 -t titleFixed=Practice -I /opt/sandbox/index.html /opt/sandbox/enter.sh &
for _ in $(seq 50); do [ -S /tmp/ttyd.sock ] && break; sleep 0.1; done
nginx -e /dev/stderr -c /tmp/nginx.conf -g 'daemon off;' &
wait -n
echo "ttyd or nginx stopped; restarting the container" >&2
exit 1
