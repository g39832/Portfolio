#!/bin/bash
# CI/CD lab: a broken GitHub Actions workflow, some JSON and YAML, and the real cluster workflow.
set -e
cd "$HOME"
mkdir -p workflows data real answers scripts
cat > workflows/broken.yml <<'Y'
name: Tests
on:
  push:
    branch: [main]
jobs:
  test:
    runs-on: ubuntu-lastest
    steps:
      - uses: actions/checkout@v4
      - name: Run tests
        run: echo "testing ${{ github.event.head_commit.message }}"
      - uses: actions/setup-python@v5
        with:
          python-version: 3.10
Y
cat > data/services.json <<'J'
{"services": [
  {"name": "web", "namespace": "graysoncodes", "port": 30080, "public": true},
  {"name": "blog", "namespace": "graysoncodes", "port": 5080, "public": true},
  {"name": "ledger", "namespace": "ledger", "port": 30505, "public": true},
  {"name": "jellyfin", "namespace": "media", "port": 30096, "public": false},
  {"name": "pihole", "namespace": "pihole", "port": 30880, "public": false},
  {"name": "portainer", "namespace": "portainer", "port": 30777, "public": false}
]}
J
cat > data/app.yaml <<'Y'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: demo
spec:
  replicas: 1
  template:
    spec:
      containers:
        - name: app
          image: ghcr.io/g39832/demo:1.4.2
Y
printf '1.4.2\n1.10.0\n1.9.7\n2.0.0-rc.1\n1.10.1\n0.9.12\n' > data/versions.txt
printf '#!/bin/bash\necho ok\n' > scripts/check.sh
cp /opt/sandbox/envs/ci/cluster-images.yml real/ 2>/dev/null || true
printf 'CI/CD lab. Workflows in ~/workflows, data in ~/data, the real cluster workflow in ~/real.\n' > README.txt
