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
