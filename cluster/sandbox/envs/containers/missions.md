# Containers
This lab has a real Docker engine of its own (a private one, not the Pi 5's), so you can write good Dockerfiles, build and run them, read images in a registry, and run containers on the cluster with kubectl. For docker run, ports and networks, see the docker lab. ~/app has a Dockerfile with lots of beginner mistakes.

## A container is just a process
Look at process 1 in this container: cat /proc/1/cmdline | tr '\0' ' '. Save the program name (first word, without a path) to ~/answers/pid1.txt. Compare with ps aux: a container is a normal Linux process with its own view of the system.
hint: tr '\0' ' ' < /proc/1/cmdline; echo
hint: basename "$(tr '\0' '\n' < /proc/1/cmdline | head -1)" > ~/answers/pid1.txt
check: [ "$(tr -d ' \n' < answers/pid1.txt)" = "$(basename "$(tr '\0' '\n' < /proc/1/cmdline | head -1)")" ]

## Pin the base image
python:latest changes under you. Change the FROM line to a pinned, small tag such as python:3.13-slim.
hint: sed -i 's/^FROM python:latest/FROM python:3.13-slim/' ~/app/Dockerfile
check: grep -Eq '^FROM python:[0-9]+\.[0-9]+[^ ]*' app/Dockerfile && ! grep -q ':latest' app/Dockerfile

## Make hadolint happy
hadolint lints Dockerfiles. Run it and fix things until it has no warnings or errors: join the apt lines with && and clean up the apt lists, use COPY not ADD, use --no-cache-dir for pip, and the JSON form of CMD.
hint: hadolint ~/app/Dockerfile
hint: RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
hint: CMD ["python", "app.py"]   (pin curl's version or add "# hadolint ignore=DL3008" above the RUN line)
check: hadolint --failure-threshold warning app/Dockerfile

## Cache-friendly order
Copy requirements.txt and run pip install BEFORE copying the rest of the app, so editing app.py doesn't redo the slow install.
hint: COPY requirements.txt .  /  RUN pip install --no-cache-dir -r requirements.txt  /  COPY . .
check: awk '/^COPY .*requirements.txt/{r=NR} /pip install/{p=NR} /^COPY \. /{a=NR} END{exit !(r && p && a && r<p && p<a)}' app/Dockerfile

## Don't run as root
Add a USER line near the end so the app doesn't run as root (python images don't have a user yet: make one with useradd, or use the number 1000).
hint: RUN useradd -u 1000 app   then   USER app   (before CMD)
check: grep -Eq '^USER +[^ r]' app/Dockerfile && ! grep -Eq '^USER +(root|0)$' app/Dockerfile

## Multi-stage builds
Write ~/app/Dockerfile.multi with two stages: a "build" stage that runs pip install into a folder (pip install --prefix=/install), and a final slim stage that COPY --from=build's only that folder and the app.
hint: FROM python:3.13-slim AS build ... RUN pip install --no-cache-dir --prefix=/install -r requirements.txt
hint: FROM python:3.13-slim ... COPY --from=build /install /usr/local
check: [ "$(grep -c '^FROM' app/Dockerfile.multi)" -ge 2 ] && grep -q -- '--from=' app/Dockerfile.multi

## Build it and run it
Build ~/app into an image called myapp, run it in the background with its port 8000 published on 8000, and curl it.
hint: docker build -t myapp ~/app
hint: docker run -d --name myapp -p 8000:8000 myapp && curl -s localhost:8000
hint: docker history myapp     (one line per layer: see what the cache-friendly order saves you)
check: [ "$(docker inspect -f '{{.State.Running}}' myapp 2>/dev/null)" = true ] && curl -fs localhost:8000 | grep -q 'hello from a container'

## Look inside a real image
skopeo reads images straight from a registry. How many layers does ghcr.io/g39832/portfolio-web:latest (arm64) have? Save the number to ~/answers/layers.txt.
hint: skopeo inspect --override-os linux --override-arch arm64 docker://ghcr.io/g39832/portfolio-web:latest | jq '.Layers | length'
check: [ "$(tr -d ' \n' < answers/layers.txt)" = "$(skopeo inspect --override-os linux --override-arch arm64 docker://ghcr.io/g39832/portfolio-web:latest 2>/dev/null | jq '.Layers | length')" ]

## Run a container on the cluster
Start a busybox pod called box in the playground that sleeps for an hour, then run a command inside it with kubectl exec.
hint: kubectl run box --image=busybox:1.36 -- sleep 3600
hint: kubectl exec box -- uname -a; kubectl exec -it box -- sh   (exit to leave)
check: [ "$(kubectl get pod box -o jsonpath='{.status.phase}' 2>/dev/null)" = Running ]
