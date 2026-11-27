#!/bin/bash
# Container start: the course (course/server.py) on 127.0.0.1:7700, ttyd on a private socket under
# /term/, and nginx on :7681 in front of both (see nginx.conf).
# $TTYD_CREDENTIAL is "user:password" from the sandbox-login secret.
set -euo pipefail
user="${TTYD_CREDENTIAL%%:*}"
pass="${TTYD_CREDENTIAL#*:}"
printf '%s:%s\n' "$user" "$(openssl passwd -apr1 "$pass")" > /tmp/htpasswd
cookie="$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')"
sed "s/COOKIE/$cookie/g" /opt/sandbox/nginx.conf > /tmp/nginx.conf
rm -f /tmp/ttyd.sock
ttyd -i /tmp/ttyd.sock -b /term -W -a -m 8 -t titleFixed=Practice -I /opt/sandbox/index.html /opt/sandbox/enter.sh &
python3 /opt/sandbox/course/server.py &
for _ in $(seq 50); do [ -S /tmp/ttyd.sock ] && break; sleep 0.1; done
nginx -e /dev/stderr -c /tmp/nginx.conf -g 'daemon off;' &
wait -n
echo "ttyd, the course or nginx stopped; restarting the container" >&2
exit 1
