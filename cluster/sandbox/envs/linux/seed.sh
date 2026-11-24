#!/bin/bash
# Linux lab: a fake web server's files to poke around in.
set -e
cd "$HOME"
mkdir -p practice/logs practice/etc/nginx/sites practice/etc/app answers
python3 - <<'PY'
import random
random.seed(7)
ips = ["203.0.113.%d" % i for i in (4, 9, 15, 23, 42, 77)] + ["198.51.100.%d" % i for i in (3, 8)]
weights = [30, 8, 5, 12, 3, 6, 20, 2]
paths = ["/", "/blog", "/blog/pi-cluster", "/projects", "/favicon.ico", "/wp-login.php", "/.env", "/about", "/static/app.js"]
codes = {"/wp-login.php": 404, "/.env": 404}
with open("practice/logs/access.log", "w") as f:
    for n in range(240):
        ip = random.choices(ips, weights)[0]
        p = random.choice(paths)
        code = codes.get(p, random.choice([200] * 12 + [304, 404, 500]))
        size = 0 if code == 304 else random.randint(200, 48000)
        f.write(f'{ip} - - [23/Nov/2026:{8 + n // 30:02d}:{n % 60:02d}:{(n * 7) % 60:02d} -0600] "GET {p} HTTP/1.1" {code} {size} "-" "Mozilla/5.0"\n')
PY
printf 'server { listen 8080; root /srv/site; }\n' > practice/etc/nginx/nginx.conf
printf 'server { server_name blog.local; }\n' > practice/etc/nginx/sites/blog.conf
printf 'server { server_name dnd.local; }\n' > practice/etc/nginx/sites/dnd.conf
printf 'PORT=5050\nDEBUG=false\n' > practice/etc/app/app.conf
printf 'not a conf file\n' > practice/etc/app/README
head -c 32 /dev/urandom | base64 > practice/secret.key
chmod 644 practice/secret.key
printf 'Welcome to the Linux lab. Answers you write go in ~/answers/.\n' > README.txt
