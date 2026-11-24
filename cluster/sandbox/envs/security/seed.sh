#!/bin/bash
# Security lab: a Secret to decode, a release file to verify, a project with a leaked key.
set -e
cd "$HOME"
mkdir -p answers files project/config project/src .ssh
chmod 755 .ssh   # too open on purpose: a mission fixes it
pw="pi-$(head -c 6 /dev/urandom | od -An -tx1 | tr -d ' \n')"
cat > files/secret.yaml <<Y
apiVersion: v1
kind: Secret
metadata:
  name: db-login
  namespace: demo
type: Opaque
data:
  username: $(printf admin | base64)
  password: $(printf '%s' "$pw" | base64)
Y
head -c 4096 /dev/urandom > files/release.tar.gz
printf 'DEBUG=false\nPORT=5050\n' > project/config/app.env
printf 'region = "us-east-1"\naws_access_key_id = "AKIA%s"\n' "$(head -c 8 /dev/urandom | od -An -tx1 | tr -d ' \n' | tr a-f A-F)" > project/config/cloud.ini
printf 'print("hello")\n' > project/src/main.py
printf 'Security lab. Look in ~/files and ~/project.\n' > README.txt
