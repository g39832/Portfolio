# graysoncodes.org on the Pi cluster

Two Raspberry Pis running k3s: the **Pi 5 is the boss** (server) and the **Pi 4 is a
worker** (agent). Both are on Wi-Fi. The cluster runs:

| Piece | What it is | Copies |
|---|---|---|
| `web` | The portfolio + TumorSim (nginx). Also forwards `/blog`, `/admin/blog`, `/media`, `/sitemap.xml` to the blog | 2 (one per Pi) |
| `blog` | The Flask blog. Its database and pictures are on the saved disk `blog-data` | 1 (SQLite has one writer) |
| `blog-backup` | Nightly backup at 3:30 am, keeps 14 | scheduled |
| `cloudflared` | The Cloudflare Tunnel, how the internet reaches the site | 2 (one per Pi) |
| `portainer` | The cluster dashboard (own username + password) | 1 |

The images are built by GitHub Actions (`.github/workflows/cluster-images.yml`) for ARM
and published as `ghcr.io/g39832/portfolio-web` and `ghcr.io/g39832/portfolio-blog`.

**Limit:** the blog's disk lives on one Pi. If that Pi dies, the portfolio stays up on
the other Pi but the blog waits until its Pi comes back.

---

## First-time setup

### 1. Flash both Pis
Raspberry Pi Imager → **Raspberry Pi OS Lite (64-bit)**. Edit settings: hostname
`pi5` / `pi2`, your username and password, your Wi-Fi, SSH on. In your router, give
each Pi a **reserved IP** (the cluster breaks if the boss's IP changes).

### 2. Pi 5: install the boss
Our Pi 5 (`raspberrypi`, 192.168.1.35) already has the repo in `~/Portfolio`, so:
```bash
cd ~/Portfolio && git pull
bash ~/Portfolio/cluster/setup-pi.sh server     # reboots once - run it again afterwards
```
On a freshly flashed Pi, first run `sudo apt-get update && sudo apt-get install -y git`
and `git clone https://github.com/g39832/Portfolio.git ~/Portfolio`.
It prints the Pi 5's **IP** and a **token** at the end.

### 3. Pi 4 (`pi2`, 192.168.1.36): join as a worker
```bash
curl -fsSLO https://raw.githubusercontent.com/g39832/Portfolio/main/cluster/setup-pi.sh
bash setup-pi.sh agent PI5_IP TOKEN             # reboots once - run it again afterwards
```

### 4. Pi 5: check both are there
```bash
kubectl get nodes -o wide        # both should say Ready
```

### 5. Cloudflare tunnel token
Cloudflare dashboard → Zero Trust → Networks → Tunnels → your tunnel → **Configure**.
The install command shown there ends in a long token (starts with `eyJ`). Copy just the token:
```bash
kubectl apply -f ~/Portfolio/cluster/k8s/00-namespace.yaml
kubectl -n graysoncodes create secret generic cloudflared-token --from-literal=token=PASTE_TOKEN
```

### 6. Start everything
```bash
kubectl apply -f ~/Portfolio/cluster/k8s/
kubectl -n graysoncodes get pods -o wide        # wait until all say Running
```

### 7. Put the blog back
Copy the backup you saved on your PC to the Pi 5 (in PowerShell on Windows):
```powershell
scp "$HOME\Documents\pi-backup\blog-backup-*.tar.gz" grayson@pi5.local:~/
```
Then on the Pi 5:
```bash
B=$(ls -t ~/blog-backup-*.tar.gz | head -1)
kubectl -n graysoncodes exec -i deploy/blog -- sh -c 'cat > /data/restore.tar.gz' < "$B"
kubectl -n graysoncodes exec deploy/blog -- python -m blogapp restore /data/restore.tar.gz --yes
kubectl -n graysoncodes rollout restart deployment blog
```

### 8. Test on your Wi-Fi
Open `http://PI5_IP:30080` (or the Pi 4's IP). Check the home page, `/tumorsim/`, `/blog`.

### 9. Point the tunnel at the cluster
Cloudflare → your tunnel → **Public Hostname** → edit `graysoncodes.org` (and `www`
if you have it) → Service **HTTP** `web.graysoncodes.svc.cluster.local:80`. Open
https://graysoncodes.org and sign in at `/admin/blog`.

---

## The dashboard (Portainer)

Sign in with your own username and password. The address works through either Pi:

- **At home:** http://192.168.1.35:30777
- **From anywhere:** http://100.120.223.33:30777 (the Pi 5's Tailscale address; turn Tailscale on)

**First time only:** Portainer asks for a one-time setup code before it lets anyone create the
admin account. Get it on the Pi 5 with:
```bash
kubectl -n portainer logs deploy/portainer | grep -o 'setup_token=[0-9a-f]*'
```
Create the account within 5 minutes of Portainer starting. If it says it timed out:
`kubectl -n portainer rollout restart deployment portainer`, then get the new code.
After signing in, click **Get Started** to add this cluster ("local").

**Forgot the password?** Delete Portainer's saved settings and start fresh:
```bash
kubectl delete -f ~/Portfolio/cluster/k8s/40-portainer.yaml && kubectl apply -f ~/Portfolio/cluster/k8s/40-portainer.yaml
```

---

## Everyday

**Update the site:** push to `main`, wait for the **Cluster images** action to go green, then on the Pi 5:
```bash
kubectl -n graysoncodes rollout restart deployment web blog
```

**See what's running:** the dashboard, or `kubectl -n graysoncodes get pods -o wide`

**Logs:** `kubectl -n graysoncodes logs deploy/blog` (or `deploy/web`, `deploy/cloudflared`)

**Backups:** they are on the same disk as the blog, so copy the newest one to your PC now and then. On the Pi 5:
```bash
kubectl -n graysoncodes exec deploy/blog -- sh -c 'cat "$(ls -t /data/backups/*.tar.gz | head -1)"' > ~/blog-backup.tar.gz
```
then on Windows: `scp grayson@pi5.local:~/blog-backup.tar.gz "$HOME\Documents\pi-backup\"`

**Change the blog password:**
```bash
kubectl -n graysoncodes exec -it deploy/blog -- python -m blogapp set-password --username grayson
```

## Testing the images on Windows
```bash
docker build -f cluster/blog.Dockerfile -t portfolio-blog:test .
docker build -f cluster/web.Dockerfile -t portfolio-web:test .
docker network create pftest
docker run -d --name blog --network pftest -e BLOG_COOKIE_SECURE=0 portfolio-blog:test
docker run -d --name pfweb --network pftest -p 18080:8080 -e BLOG_UPSTREAM=http://blog:5080 portfolio-web:test
# http://localhost:18080
```

## Other apps on the cluster

| App | File | Address (Tailscale on) | Notes |
|---|---|---|---|
| Start page (Homepage) | `k8s/45-homepage.yaml` | http://100.120.223.33:30300 | A tile + logo for every app. Edit `services.yaml` inside the file to add tiles. |
| Pi-hole | `k8s/50-pihole.yaml` | http://100.120.223.33:30880/admin | DNS ad blocker on the Pi 4 (`192.168.1.36`, port 53). Password: `kubectl -n pihole exec -it deploy/pihole -- pihole setpassword` |
| Pi-hole backup | `k8s/51-pihole-pi5.yaml` | http://100.120.223.33:30881/admin | Second Pi-hole on the Pi 5 (`192.168.1.35`). See **Pi-hole for the whole house** below. |
| IT-Tools | `k8s/48-it-tools.yaml` | http://100.120.223.33:30481 | ~80 developer/IT tools. Private on purpose (no Cloudflare route). |
| Network Labs | `k8s/49-labs.yaml` + `labs/` | http://100.120.223.33:30403 | Guide for the router labs. Page update: `bash labs/deploy.sh`. The labs run in Docker on the Pi 5 via Containerlab (`labs/lab.sh`), not in k3s. |
| Course + practice labs | `k8s/55-sandbox.yaml` + `sandbox/` | http://100.120.223.33:30410 | The DevOps Path course (lessons, quizzes, auto-checked tasks, progress) and web terminals (phone friendly) with missions for Linux, Bash, Git & GitHub, Kubernetes, Networking, Containers, Security, Backups, CI/CD, IaC, plus an SSH jump to the Pis. See **Practice labs** below. |
| Jellyfin | `k8s/60-jellyfin.yaml` | http://100.120.223.33:8096 | Media server on the Pi 5. Full guide: `media/README.md` |
| CrowdSec | `k8s/80-crowdsec.yaml` | (no web page) | Watches the public site's logs for attackers; `81-crowdsec-cloudflare.yaml` blocks them at Cloudflare. See **Security (CrowdSec)** below. |

Install or update any of them from Windows without pushing first:
```powershell
Get-Content -Raw "$HOME\Desktop\Portfolio\cluster\k8s\FILE.yaml" | ssh grayson@raspberrypi.local "kubectl apply -f -"
```

Health report for a Pi (read-only):
```powershell
Get-Content -Raw "$HOME\Desktop\Portfolio\cluster\inspect-pi.sh" | ssh grayson@raspberrypi.local "tr -d '\r' | bash -s"
```

## The course (DevOps Path)

http://100.120.223.33:30410 opens the course: 13 modules in order (Linux → Bash → Git → Networking →
Docker → images → Kubernetes → Observability → CI/CD → IaC → Security → Backups → a capstone on the real
cluster). Each lesson has a short read, "on your cluster, right now" panels (read-only commands run live
against the Pis), links to the docs it's based on, a quiz, and hands-on tasks with a **Check my work**
button that looks at what you really did in the lab. Progress, XP, streaks, badges and a Review queue of
missed questions are saved on the labs' volume (`/work/.course/progress.json`), so phone and PC match.
On a phone the lesson and its terminal are two tabs; on a wide screen the terminal sits on the right.

- Server: `sandbox/course/server.py` (Python standard library + PyYAML) on 127.0.0.1:7700 in the same
  container as the terminals; nginx (`sandbox/nginx.conf`) sends `/` to it and `/term/` to ttyd. Old
  `:30410/?arg=<lab>` links still work (they redirect to `/term/`).
- Content: `sandbox/course/modules/NN-<id>.yaml`, one file per module, in file-name order. See
  `sandbox/course/README.md` for the format. A task can reuse a lab mission by title (`mission: Count the 404s`)
  so `learn` and the course share one check.
- Checks and live panels only run commands from those files, as the terminal's user with that lab's
  environment (`sandbox/prep.sh` sets a lab up the same way opening its terminal does).

## Practice labs

Terminals in the browser, so lessons work from the phone too. The start page's daily lesson has
**Read the full lesson** (steps, a self-check question) and **Run** buttons that open the right lab
with the command ready to send. Inside a lab, type `learn` for its missions, `learn 3` / `learn hint 3`
for one mission, `learn reset` to start over, and in the Kubernetes lab `tidy` to empty the playground.

- Image: `sandbox.Dockerfile` (ttyd + the tools), built by GitHub Actions as `ghcr.io/g39832/portfolio-sandbox`.
  Lab content: `sandbox/envs/<lab>/` (`seed.sh` sets it up, `missions.md` holds the missions and their checks).
  The terminal page with the phone key bar is `sandbox/terminal.html`.
- Put it up / update it: `bash ~/Portfolio/cluster/sandbox/deploy.sh`. The first run prints the login
  (user `grayson` + a random password). `--choose-password` lets you pick your own, `--show-password` shows it again, `--new-password` makes a new random one.
- Safety: kubectl in the labs can **read** the cluster (not Secrets) and **change** only the `playground`
  namespace (Pod Security "baseline", 20-pod quota, default limits). The `pi` lab is just SSH and needs the
  real Pi password. Work is kept on a 2Gi volume on the Pi 5, and each lab runs in tmux, so a dropped phone
  connection picks up where it left off.
- Full lessons live in `start/lessons.js` (served at `/i/lessons.js` by the start page).
- Docker: **every lab** has `docker`, `docker compose` and `docker buildx`. They talk to a private Docker
  engine (Docker-in-Docker, a second container in the sandbox pod), not to the Pi 5's own Docker, so lab
  experiments can't touch Uptime Kuma, Containerlab or anything real. `-p 8080:80` publishes on the pod, so
  `curl localhost:8080` works; bind mounts work for anything under your lab home. Images are kept in
  `/var/lib/sandbox-docker` on the Pi 5 (wipe with `docker system prune -a --volumes` in any lab).
  The `docker` lab has missions for docker run, ports, networks, DNS, volumes and compose.

## Docker on the Pis themselves

`docker/setup-docker.sh` installs and checks everything Docker on a real Pi: Engine, compose, buildx,
rootless extras, tab completion, your user in the `docker` group, log rotation, and networking tools
(tcpdump, bridge, nsenter, conntrack, dig). It keeps an existing Docker (the Pi 5's) and only tops it up,
and sets `ip-forward-no-drop` so Docker never sets the FORWARD policy to DROP (which could cut pod traffic
between the Pis). Run it on each Pi, then log out and back in once:

    ssh grayson@192.168.1.35
    cd ~/Portfolio && git pull && bash cluster/docker/setup-docker.sh

    ssh grayson@192.168.1.36
    curl -fsSLo setup-docker.sh https://raw.githubusercontent.com/g39832/Portfolio/main/cluster/docker/setup-docker.sh && bash setup-docker.sh

`bash setup-docker.sh --check` only runs the checks. The `pi` practice lab (SSH) then has full Docker on both Pis.

## Pi-hole for the whole house

Goal: every device at home gets ad blocking, and nobody notices. Gentle default blocklist only, an allowlist
for things blockers often break, privacy mode 2 (the dashboard shows counts, not who visited what), and two
Pi-holes so one Pi being off changes nothing.

Order matters:
1. **Reserve the Pis' addresses** in the Orbi (Advanced > Setup > LAN Setup > Address Reservation):
   `raspberrypi` = 192.168.1.35, `pi2` = 192.168.1.36. Otherwise a router reboot could move them and break DNS.
2. **Pis look up names directly, never via Pi-hole** (prevents a loop after a power cut). On EACH Pi:
   `sudo bash ~/Portfolio/cluster/pi-own-dns.sh`
3. **Start Pi-hole #2 and set up both:** on the Pi 5, `bash ~/Portfolio/cluster/pihole-house-setup.sh`
   (both lines of its test must show `0.0.0.0` and a real address), then
   `kubectl -n pihole exec -it deploy/pihole-2 -- pihole setpassword`.
4. **Router:** Orbi > Internet > Domain Name Server (DNS) Address > Use These DNS Servers:
   Primary `192.168.1.36`, Secondary `192.168.1.35`. Do it when nobody is busy online.
5. Add Uptime Kuma DNS monitors for both, so Discord tells you if one stops.

Something broke on a website? Pi-hole admin > Disable blocking > 5 minutes, try again. If that fixes it,
find the domain (set privacy level to 0 for a moment, Query Log) and add it to `ALLOW` in
`pihole-house-setup.sh`, then re-run that script.

**Undo everything in one step:** Orbi DNS back to "Get Automatically from ISP".

## Security (CrowdSec)

CrowdSec reads the public website's nginx logs and flags attackers (scanners looking
for `/.env` or `/wp-login.php`, password guessing, path-traversal tricks, bad bots).
nginx logs the visitor's real IP from Cloudflare's `CF-Connecting-IP` header
(`nginx/default.conf.template`), otherwise every visitor would look like the tunnel.

Install or update (k3s pulls CrowdSec's official Helm chart by itself):
```powershell
Get-Content -Raw "$HOME\Desktop\Portfolio\cluster\k8s\80-crowdsec.yaml" | ssh grayson@raspberrypi.local "kubectl apply -f -"
```

Look at what it caught (on the Pi 5):
```bash
kubectl -n crowdsec get pods
kubectl -n crowdsec exec deploy/crowdsec-lapi -- cscli alerts list
kubectl -n crowdsec exec deploy/crowdsec-lapi -- cscli decisions list   # current bans
# lines read/parsed live in the agents (one per Pi), not the LAPI:
for p in $(kubectl -n crowdsec get pods -o name | grep agent); do echo "== $p"; kubectl -n crowdsec exec $p -- cscli metrics show acquisition; done
```

Unban someone (for example yourself while testing):
```bash
kubectl -n crowdsec exec deploy/crowdsec-lapi -- cscli decisions delete --ip 1.2.3.4
```

If the install job fails with `lookup ... server misbehaving`, the cluster DNS is stale:
`kubectl -n kube-system rollout restart deployment coredns`

Stage 1 (`80-crowdsec.yaml`) **detects**. Stage 2 (`81-crowdsec-cloudflare.yaml`) makes
Cloudflare stop flagged IPs: a Cloudflare Worker in front of every `*graysoncodes.org`
page (dnd. included) shows them an "are you human?" check (Turnstile) instead of the site.
Set it up once on the Pi 5 with a Cloudflare API token (the script asks for it, hidden,
and keeps it in a cluster secret, never in git):
```bash
bash ~/Portfolio/cluster/crowdsec-cloudflare-setup.sh
```
Then in the Cloudflare dashboard: graysoncodes.org > **Workers Routes** > edit the
CrowdSec route > **Fail open**. Redo that after the blocker restarts (it removes its
Worker when it stops and re-adds it, "fail closed", when it starts).

Test it with a made-up IP:
```bash
kubectl -n crowdsec exec deploy/crowdsec-lapi -- cscli decisions add --ip 192.0.2.10 --type captcha
kubectl -n crowdsec logs deploy/cloudflare-bouncer --tail=20
kubectl -n crowdsec exec deploy/crowdsec-lapi -- cscli decisions delete --ip 192.0.2.10
```

`dnd.graysoncodes.org` also goes through the web nginx (a second `server` block in
`nginx/default.conf.template` that passes it on to Campaign Ledger), so CrowdSec watches
it too. In the Cloudflare tunnel its public hostname points at
`http://web.graysoncodes.svc.cluster.local:80`, the same as the main site.

### Discord alerts

Every ban is posted to a Discord channel. Set it up (or change the channel) on the Pi 5;
it asks for the channel's webhook URL (Edit Channel > Integrations > Webhooks):
```bash
bash ~/Portfolio/cluster/crowdsec-discord-setup.sh
```
Send another test message any time:
```bash
kubectl -n crowdsec exec deploy/crowdsec-lapi -- cscli notifications test discord
```

## Off-site backups (D&D app + blog)

Every night the Campaign Ledger data (4:30am) and the blog data (4:40am) are copied to
Backblaze B2 with restic: encrypted on the Pi, 7 daily + 4 weekly + 12 monthly copies kept,
and checked after each run. Free: it's a few MB and B2's first 10 GB are free. Failures are
posted to the CrowdSec Discord channel. Files: `k8s/90-offsite-backup.yaml`, `backup/`.

- Set up or update (asks for the B2 bucket and key; Enter keeps the saved ones):
  `bash ~/Portfolio/cluster/backup/setup.sh`
- Run one now: `kubectl -n ledger create job --from=cronjob/offsite-backup backup-now`
  (blog: `-n graysoncodes`)
- See the last runs: `kubectl -n ledger get jobs`
- Get a copy back and check it (doesn't touch the running app):
  `bash ~/Portfolio/cluster/backup/restore.sh ledger` (or `blog`), lands in `~/restores/`

The backup password is in the `offsite-backup` secret and was shown once by setup.sh. Keep a
copy off the Pi: without it nobody can read the backups. To read the password again on the Pi 5:
`kubectl -n ledger get secret offsite-backup -o jsonpath='{.data.RESTIC_PASSWORD}' | base64 -d; echo`
