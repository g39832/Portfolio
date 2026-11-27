# Docker & networking
A real Docker engine, just for these labs: docker, docker compose and docker buildx all work. It is a private engine inside the practice-terminal pod (not the Pi 5's own Docker), so break things freely. -p publishes ports on this pod, so curl localhost:PORT reaches them. The first half follows iximiuz Labs' "Docker 101" challenges; the second half is Docker networking. Clean up any time with docker rm -f $(docker ps -aq), or wipe everything with docker system prune -a --volumes.

## Hello World
Run your first container from the hello-world image. It prints a message and exits. Then list ALL containers (also stopped ones) to see it.
hint: docker run hello-world
hint: docker ps -a
check: docker ps -a --filter ancestor=hello-world --format '{{.Status}}' | grep -q 'Exited (0)'

## Nginx in the foreground
Run the nginx web server image with no flags at all. It stays attached to your terminal and prints its logs. Stop it with Ctrl+C (that sends SIGINT). nginx is short for docker.io/library/nginx:latest.
hint: docker run nginx      (then Ctrl+C)
check: [ -n "$(docker ps -aq --filter ancestor=nginx)" ]

## An interactive shell
Start a Debian container with a terminal (-i keeps STDIN open, -t gives it a pseudo-terminal). Inside, look at /etc/os-release and ps, then leave with exit or Ctrl+D (Ctrl+C won't). Save Debian's version number (VERSION_ID) to ~/answers/debian.txt.
hint: docker run -it debian      then: cat /etc/os-release; exit
hint: docker run --rm debian sh -c '. /etc/os-release; echo $VERSION_ID' > ~/answers/debian.txt
check: a="$(tr -d ' \n"' < answers/debian.txt)"; [ -n "$a" ] && [ "$a" = "$(docker run --rm debian sh -c '. /etc/os-release; echo $VERSION_ID')" ]

## Run it in the background, with a port
Run nginx detached (-d), named web, and publish its port 80 on port 8080 (-p 8080:80). Then curl it.
hint: docker run -d --name web -p 8080:80 nginx
hint: curl -s localhost:8080 | head -5;  docker ps;  docker port web
check: [ "$(docker inspect -f '{{.State.Running}}' web 2>/dev/null)" = true ] && curl -fs localhost:8080 | grep -qi nginx

## Logs, exec and inspect
Read web's logs (you'll see your curl), run a command inside it with exec, and find its IP address on Docker's default bridge network with inspect. Save the IP to ~/answers/web-ip.txt.
hint: docker logs web;  docker exec web nginx -v;  docker exec -it web bash
hint: docker inspect -f '{{.NetworkSettings.Networks.bridge.IPAddress}}' web > ~/answers/web-ip.txt
check: a="$(tr -d ' \n' < answers/web-ip.txt)"; [ -n "$a" ] && [ "$a" = "$(docker inspect -f '{{.NetworkSettings.Networks.bridge.IPAddress}}' web 2>/dev/null)" ]

## The default bridge has no names
Containers on the default bridge can reach each other by IP but NOT by name. Try both from a throwaway busybox container, then save what wget says when the name fails ("bad address") to ~/answers/bridge.txt.
hint: docker run --rm busybox wget -qO- -T 3 http://$(cat ~/answers/web-ip.txt) | head -3
hint: docker run --rm busybox wget -qO- -T 3 http://web       (fails: bad address 'web')
hint: echo bad address > ~/answers/bridge.txt
check: grep -qi 'bad address' answers/bridge.txt

## Your own network gets DNS
Make a user-defined bridge network called labnet and run an nginx called api on it. On labnet, Docker's built-in DNS server (127.0.0.11) turns container names into IPs. Prove it with busybox.
hint: docker network create labnet
hint: docker run -d --name api --network labnet nginx
hint: docker run --rm --network labnet busybox sh -c 'cat /etc/resolv.conf; ping -c 1 api; wget -qO- http://api | head -4'
check: [ "$(docker inspect -f '{{.State.Running}}' api 2>/dev/null)" = true ] && docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' api | grep -qw labnet && docker run --rm --network labnet busybox wget -qO- -T 5 http://api | grep -qi nginx

## One container, two networks
Connect web to labnet too (it stays on bridge as well). Now api can reach web by name. Count web's networks with inspect.
hint: docker network connect labnet web
hint: docker exec api curl -s http://web | head -4;  docker network inspect labnet
check: [ "$(docker inspect -f '{{len .NetworkSettings.Networks}}' web 2>/dev/null)" -ge 2 ] && docker exec api curl -fs http://web | grep -qi nginx

## No network at all
--network none gives a container only a loopback interface. How many network interfaces does it have? Save the number to ~/answers/none.txt.
hint: docker run --rm --network none busybox ip addr
hint: docker run --rm --network none busybox sh -c 'ls /sys/class/net | wc -l' > ~/answers/none.txt
check: [ "$(tr -d ' \n' < answers/none.txt)" = 1 ]

## The host's network
--network host skips Docker's networking and shares the host's (here, the host is this pod). Compare ip addr inside such a container with ip addr in your terminal. Save the container's eth0 IPv4 address (without the /mask) to ~/answers/host-ip.txt.
hint: docker run --rm --network host busybox ip -4 addr show eth0
hint: docker run --rm --network host busybox ip -4 -o addr show eth0 | awk '{print $4}' | cut -d/ -f1 > ~/answers/host-ip.txt
check: a="$(tr -d ' \n' < answers/host-ip.txt)"; [ -n "$a" ] && [ "$a" = "$(ip -4 -o addr show eth0 | awk '{print $4}' | cut -d/ -f1)" ]

## Data that outlives a container
Containers lose their files when they're removed; volumes don't. Make a volume called notes, write hello.txt into it from one busybox container, then read it back from a NEW container.
hint: docker volume create notes
hint: docker run --rm -v notes:/n busybox sh -c 'echo hi from a volume > /n/hello.txt'
hint: docker run --rm -v notes:/n busybox cat /n/hello.txt
check: [ -n "$(docker run --rm -v notes:/n busybox cat /n/hello.txt 2>/dev/null)" ]

## Bind-mount your own web page
A bind mount puts a folder from your home into a container. Make ~/site/index.html saying anything, then run nginx called mysite with ~/site mounted read-only on /usr/share/nginx/html and port 8082 published. Edit the file and curl again: no rebuild needed.
hint: mkdir -p ~/site && echo '<h1>my page</h1>' > ~/site/index.html
hint: docker run -d --name mysite -p 8082:80 -v ~/site:/usr/share/nginx/html:ro nginx
hint: curl -s localhost:8082
check: [ -s site/index.html ] && [ "$(curl -fs localhost:8082)" = "$(cat site/index.html)" ]

## Compose a little stack
~/stack/compose.yaml runs two whoami web servers and an nginx in front of them, but nobody can reach it yet. Publish nginx's port 80 on 8081, start it with docker compose up -d, and curl it a few times: the Hostname and IP change, because Docker's DNS gives nginx both copies for the one service name.
hint: under the proxy service add:   ports: ["8081:80"]
hint: cd ~/stack && docker compose up -d && docker compose ps
hint: for i in 1 2 3 4; do curl -s localhost:8081 | grep -E 'Hostname|IP: 1'; done
check: curl -fs localhost:8081 | grep -q Hostname
