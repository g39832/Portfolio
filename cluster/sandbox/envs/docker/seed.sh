#!/bin/bash
# Docker lab: an answers folder and a small compose stack to finish.
set -e
cd "$HOME"
mkdir -p answers stack
cat > stack/compose.yaml <<'Y'
# Two copies of a tiny web server that prints who it is, and nginx in front of them.
services:
  whoami:
    image: traefik/whoami:v1.11
    deploy:
      replicas: 2
  proxy:
    image: nginx:1.29-alpine
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on: [whoami]
    # TODO: publish port 80 on 8081 so you can curl localhost:8081
Y
cat > stack/nginx.conf <<'N'
# "whoami" is the compose service name: Docker's DNS (127.0.0.11) returns both copies' IPs.
resolver 127.0.0.11 valid=5s;
server {
  listen 80;
  location / {
    set $up http://whoami:80;
    proxy_pass $up;
  }
}
N
docker version >/dev/null 2>&1 || echo "(The Docker engine is still starting; give it a few seconds.)"
printf 'Docker lab. Run learn to see the missions. The compose stack is in ~/stack.\n' > README.txt
