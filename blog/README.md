# graysoncodes.org blog

The blog at **graysoncodes.org/blog** and its private admin area at **graysoncodes.org/admin/blog**.

It runs **alongside** the existing portfolio and doesn't replace it. nginx keeps serving the React
portfolio from `/var/www/html` exactly as before. Only these addresses go to the blog service:

| Address | Served by | What it is |
|---|---|---|
| `/`, `/assets/…`, `/case-studies/…`, `/robots.txt` | nginx → `/var/www/html` (unchanged) | The portfolio |
| `/blog`, `/blog/…`, `/blog/feed.xml` | nginx → blog service | Public blog + RSS |
| `/sitemap.xml` | nginx → blog service | Sitemap (portfolio pages + articles) |
| `/admin/blog/…` | nginx → blog service | Private admin |
| `/media/…` | nginx, straight from disk | Uploaded images |

Contents: [How it works](#1-how-it-works) · [Admin access](#2-signing-in-to-the-admin) ·
[First article](#3-writing-your-first-article) · [Images](#4-uploading-images) ·
[Editing & publishing](#5-editing-and-publishing) · [Scheduling](#6-scheduling) ·
[Categories & tags](#7-categories-and-tags) · [Backups](#8-backups) · [Restore](#9-restoring) ·
[First install on the Pi](#10-first-install-on-the-pi) · [Deploying updates](#11-deploying-updates) ·
[Admin password](#12-changing-the-admin-password) · [Where things are stored](#13-where-everything-is-stored) ·
[Troubleshooting](#14-troubleshooting) · [Environment variables](#15-environment-variables) ·
[Moving to another server](#16-moving-to-another-server) · [Local development](#17-local-development)

---

## 1. How it works

```
 Visitor ─▶ Cloudflare ─▶ Cloudflare Tunnel ─▶ nginx on the Pi ─┬─▶ /var/www/html  (portfolio, unchanged)
                                                                ├─▶ /var/lib/graysoncodes-blog/data/media  (/media/…)
                                                                └─▶ 127.0.0.1:5080  blog service (Waitress + Flask)
                                                                        │
                                                                        └─▶ /var/lib/graysoncodes-blog/data/blog.sqlite3
```

* **Small Python service** (`blogapp/`): Flask, served by Waitress (one process, 4 threads,
  roughly 40–60 MB of RAM). It only listens on `127.0.0.1`, so nginx is the only thing that can reach it.
* **SQLite** database in WAL mode. Rendered article HTML is stored at save time, so showing an
  article is a single indexed query.
* **Server-rendered pages**, with no React and no frontend framework on the blog. Code highlighting is done
  on the server (Pygments). The only JavaScript readers get is ~2 KB: the theme toggle and the copy-code buttons.
* **Markdown** articles. Raw HTML in articles is shown as text, and everything is passed through an
  allow-list sanitizer (nh3) as a second layer.
* **Scheduled publishing needs no background job.** An article is public when its status is
  published/scheduled *and* its publish time has passed. Each page load checks that, so nothing has to
  run in the background.
* **No analytics, view counters or tracking**, and no external services apart from Google Fonts. If
  those fonts can't load, the blog falls back to system fonts.
* Pages send an `ETag`, so repeat visits get a cheap `304 Not Modified`.

Code map:

| File | Job |
|---|---|
| `blogapp/__init__.py` | App setup, security headers, error pages |
| `blogapp/public.py` | `/blog`, articles, categories, tags, RSS, sitemap |
| `blogapp/admin.py` | Everything under `/admin/blog` |
| `blogapp/articles.py` | Article storage + publishing workflow |
| `blogapp/media.py` | Image validation, resizing, storage |
| `blogapp/auth.py` | Passwords, sessions, CSRF, login throttling |
| `blogapp/render.py` | Markdown → safe HTML |
| `blogapp/backup.py` | Backup + restore |
| `blogapp/migrations/*.sql` | Database schema (applied automatically, never destructive) |
| `deploy/` | systemd units, nginx snippets, env file template |
| `tests/` | Automated tests (`pytest`) |

---

## 2. Signing in to the admin

Go to **https://graysoncodes.org/admin/blog**, which redirects to the sign-in page.

* There is **no default account**. Create one on the Pi with `./manage.sh create-admin` (step 10).
* Five wrong passwords from the same address within 15 minutes block that address for 15 minutes.
  Twenty wrong passwords for the same username block that username for 15 minutes.
* Sessions end after 12 hours of inactivity, or after 7 days at most. **Sign out** ends the session on the
  server, so the old cookie stops working.
* The admin is never linked from the public site, and it is also hidden from search engines
  (`noindex`, `Disallow: /admin/` in robots.txt). Hiding is not the protection, though: every admin page
  and action checks the session on the server.

---

## 3. Writing your first article

1. Sign in → **New** (or **+ New article** on the Articles page).
2. Type a **title**. The **URL** (slug) fills itself in from the title until you edit it by hand.
3. Write in the big text box using Markdown. The toolbar inserts headings, bold, lists, code blocks,
   tables, links and images. Keyboard shortcuts: **Ctrl+S** save, **Ctrl+B** bold, **Ctrl+I** italic,
   **Ctrl+K** link. A Markdown cheat sheet is under the editor.
4. Use **Preview** (tab) to see the rendered article, or **Side by side** on wide screens.
5. On the right, fill in the **Excerpt** (shown under the title and on cards), the **Search engine
   description**, the **Category**, the **Tags** (comma-separated) and the **Featured image**.
6. The article is a **draft** and autosaves a few seconds after you stop typing. The status at the top says
   *Unsaved changes*, *Autosaving…* or *Saved 3:41 PM*.
7. Click **Publish now**. It's live at `/blog/<slug>`.

Headings: the article title is already the page's main heading (H1), so start sections at **H2** (`##`).
The editor warns you if you use H1 in the body. Articles with 3+ section headings get an automatic
"On this page" table of contents.

---

## 4. Uploading images

There are three ways:

* **In the editor:** click **Image** in the toolbar. In the window that opens you can upload from your computer
  (or drop files on it), pick any earlier upload, see its size and dimensions, add **alt text** and a
  **caption**, then **Insert into article** or **Use as featured image**.
* **Drag and drop or paste** an image straight into the text box. It uploads and inserts
  `![](/media/…)`. Type the alt text between the `[ ]`.
* **Media page** (`/admin/blog/media`): upload several at once, search, edit alt text and captions, see which
  articles use an image, and delete images.

In Markdown, an image on its own line with a caption looks like this:

```markdown
![A Raspberry Pi 5 in a small rack](/media/2026/11/3f9a1c0be2d4a7e1.jpg "The Pi 5 that runs this site")
```

The quoted part becomes the caption under the image.

What happens to uploads:

* JPEG, PNG, WebP and GIF are accepted, up to **10 MB** and 40 megapixels each. The type is checked by
  decoding the file itself, not by its name, so renamed scripts or executables are refused.
* Photos are stored at most 2400 px wide, with a 1200 px copy used inside articles and a 640 px copy for
  cards. Readers' phones get the light copy, and clicking an image opens the large one.
* **EXIF data (including phone GPS location) is removed.** Transparency is kept, and animated GIF/WebP
  files are stored untouched so they keep animating.
* Files get random names such as `2026/11/3f9a1c0be2d4a7e1.jpg`, so file names can never clash or escape the folder.
* Deleting an article does **not** delete its images. Clean up unused ones from the Media page, where an
  image that is still in use asks for an extra confirmation.

---

## 5. Editing and publishing

Statuses: **Draft** (private) → **Published** (public) / **Scheduled** (public at a set time) →
**Archived** (hidden, kept).

| You want to… | Do this |
|---|---|
| Fix a typo in a live article | Edit, then click **Update**. Live articles are **not autosaved**, so half-finished edits never go public. Your typing is kept in this browser until you click Update. |
| Hide an article | **Unpublish** (back to draft) or **Archive** (Articles page → More → Archive). Hidden articles return 404 to the public. |
| Bring back an archived article | **Restore from archive** (it comes back as a draft), then publish. |
| Start a new article from an old one | **Duplicate** (makes a draft copy with tags). |
| Undo changes | **Version history** in the editor: a version is kept on every manual save, publish and restore (newest 50 per article). |
| Delete forever | **Delete permanently…**, then tick the confirmation box. This can't be undone except from a backup. |
| Change a live article's URL | Edit the URL field and click Update. The old URL keeps working as a permanent redirect. |
| Put an article at the top of /blog | Tick **Feature at the top of the blog** (the newest featured one wins; otherwise the newest article is featured). |

Safety nets in the editor:

* **Never overwrites newer work.** Every save says which version it was based on. If the article was
  saved somewhere newer (another tab, your phone), you get a warning instead of an overwrite. You then
  choose to load the newer version or deliberately keep yours.
* **Local backup.** What you type is also kept in this browser. If the tab crashes, you lose connection, or
  your session expires, reopening the editor offers to restore it.
* **Leaving with unsaved changes** shows the browser's "leave page?" warning.
* Republishing an article you unpublished keeps its original publish date.

---

## 6. Scheduling

In the editor's **Publishing** box, choose a date and time under **Schedule for later** (in
**America/Chicago** time, set by `BLOG_TIMEZONE`) and click **Schedule**. The article shows as
*Scheduled* on the Articles page and appears on the blog, in the RSS feed and in the sitemap at that
moment. Nothing needs to run in the background. To cancel, click **Unpublish** (back to draft), or
**Publish now** to publish it straight away.

---

## 7. Categories and tags

* **Categories** (`/admin/blog/categories`): one per article. You can add, rename, change the URL slug,
  reorder (lower **Order** numbers come first) and delete. Deleting a category leaves its articles
  uncategorised, not deleted. Categories with no published articles are hidden on the blog. It
  starts with: DevOps, Linux, Software Development, Infrastructure, Homelab, Databases, Networking,
  Projects, Engineering Notes.
* **Tags** are created by typing them on an article (comma-separated; suggestions appear as you type).
  On `/admin/blog/tags` you can rename or delete them. Renaming a tag to an existing tag's name **merges** them.

Public URLs: `/blog/category/<slug>`, `/blog/tag/<slug>`, search `/blog?q=…`, feed `/blog/feed.xml`.

---

## 8. Backups

A backup is **one `.tar.gz` file** holding a consistent copy of the database (taken safely while
the blog runs) and **every uploaded image**, plus a `manifest.json` with counts. Files are named by time,
e.g. `blog-backup-20261110-033012.tar.gz`, and an existing backup is never overwritten.

**Automatic:** the `graysoncodes-blog-backup.timer` runs every night at about 03:30 and keeps the newest
14 in `/home/grayson/blog-backups`. Check it with:

```bash
systemctl list-timers graysoncodes-blog-backup.timer
journalctl -u graysoncodes-blog-backup --since "2 days ago"
ls -lh /home/grayson/blog-backups
```

**By hand** (e.g. before an upgrade):

```bash
cd ~/Portfolio/blog && ./manage.sh backup
# or into a specific folder:  ./manage.sh backup --dest /mnt/usb/blog
```

**Get a copy off the Pi.** A backup sitting on the same SD card or SSD doesn't survive that drive
dying. From your Windows PC (PowerShell):

```powershell
scp grayson@raspberrypi.local:/home/grayson/blog-backups/blog-backup-*.tar.gz "$HOME\Documents\blog-backups\"
```

(or copy them to the B2 bucket / a USB drive you already use for other backups).

---

## 9. Restoring

Restoring brings back **both** the articles (database) and the images. The current data is **not
deleted**: it is renamed to `/var/lib/graysoncodes-blog/data.before-restore-<time>` first.

```bash
sudo systemctl stop graysoncodes-blog
cd ~/Portfolio/blog
./manage.sh restore /home/grayson/blog-backups/blog-backup-20261110-033012.tar.gz --yes
sudo systemctl start graysoncodes-blog
./manage.sh check        # "Integrity: ok", article/image counts, "Missing files: 0"
```

`restore` checks the archive (no files outside the data folder, database integrity check) before
switching anything over. Once you're happy, delete the `…before-restore-…` folder.

---

## 10. First install on the Pi

These steps touch the live server, so read them through first. They only **add** things: nothing in
`/var/www/html` and no existing nginx location is changed or removed.

```bash
# 1. Get the code (the portfolio repo already lives in ~/Portfolio)
cd ~/Portfolio && git pull

# 2. Python environment for the blog
sudo apt install -y python3-venv
cd ~/Portfolio/blog
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

# 3. Persistent data + backup folders (outside the git checkout and outside /var/www/html).
#    The app creates /var/lib/graysoncodes-blog/data inside this folder on first start.
sudo mkdir -p /var/lib/graysoncodes-blog
sudo chown grayson:grayson /var/lib/graysoncodes-blog
sudo chmod 755 /var/lib/graysoncodes-blog
mkdir -p /home/grayson/blog-backups

# 4. Settings (contains no secrets)
sudo install -m 644 deploy/blog.env.example /etc/graysoncodes-blog.env
sudo nano /etc/graysoncodes-blog.env        # check the values; defaults are right for graysoncodes.org

# 5. Create the database and your admin account (asks for a password, 12+ characters)
chmod +x manage.sh
./manage.sh create-admin --username grayson

# 6. Run it as a service + nightly backups
sudo cp deploy/graysoncodes-blog.service deploy/graysoncodes-blog-backup.service deploy/graysoncodes-blog-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now graysoncodes-blog graysoncodes-blog-backup.timer
curl -sI http://127.0.0.1:5080/blog | head -1        # HTTP/1.1 200 OK

# 7. nginx: add the blog locations to the existing graysoncodes.org server block
sudo cp /etc/nginx/sites-enabled/default ~/nginx-default.backup-$(date +%F)   # keep a copy first
sudo cp deploy/nginx-blog.conf       /etc/nginx/snippets/graysoncodes-blog.conf
sudo cp deploy/nginx-blog-proxy.conf /etc/nginx/snippets/graysoncodes-blog-proxy.conf
sudo nano /etc/nginx/sites-enabled/default
#    inside the  server { ... }  block that has  root /var/www/html;  add one line:
#        include snippets/graysoncodes-blog.conf;
sudo nginx -t && sudo systemctl reload nginx

# 8. Publish the portfolio build that has the new "Blog" nav link and robots.txt
cd ~/Portfolio/my-react-app && npm run build && sudo cp -r dist/* /var/www/html/
```

(If your nginx site file has a different name, `ls /etc/nginx/sites-enabled/` shows it.)

### On graysoncodes.org's Pi: the portfolio runs in Docker

On the actual Pi, the Cloudflare Tunnel (the `cloudflared` system service) points at the **`portfolio`
Docker container** (nginx:alpine on port 8080, serving `~/Portfolio/my-react-app/dist`), not at the
system nginx. So instead of steps 7–8 above:

```bash
cd ~/Portfolio && git pull
cd ~/Portfolio/my-react-app
cp docker-compose.yml ~/docker-compose.portfolio.backup-$(date +%F-%H%M).yml
cp ../blog/deploy/docker-compose.portfolio.yml docker-compose.yml
npm run build
docker compose up -d
```

`deploy/docker-compose.portfolio.yml` keeps the same container name and port 8080, but runs it on the
Pi's network (`network_mode: host`) so nginx can reach the blog on `127.0.0.1:5080`. It also mounts
`deploy/nginx-portfolio-docker.conf` (the stock nginx:alpine behaviour plus the blog locations) and the
media folder (read-only). Portfolio updates are now just `git pull && npm run build` in
`my-react-app`, because the container serves `dist/` directly.

To undo: copy the backup over `docker-compose.yml` again and run `docker compose up -d`.

**The Cloudflare Tunnel needs no changes.** It already sends graysoncodes.org to nginx, and nginx now
routes the blog paths. Check from any device: `https://graysoncodes.org/blog`, then
`https://graysoncodes.org/admin/blog`.

If anything goes wrong in step 7, remove the `include` line and `sudo systemctl reload nginx`. The
portfolio is back exactly as before.

---

## 11. Deploying updates

```bash
cd ~/Portfolio && git pull
cd blog
./manage.sh backup                                 # safety copy first
.venv/bin/pip install -r requirements.txt          # only needed if requirements.txt changed
sudo systemctl restart graysoncodes-blog           # applies any new database migrations on start
./manage.sh check
# Portfolio changes (if any), same as always:
cd ../my-react-app && npm run build && sudo cp -r dist/* /var/www/html/
```

Updates never touch `/var/lib/graysoncodes-blog/data`, so articles and images are untouched. Database
migrations only add (they run once each, inside a transaction, and are recorded in `schema_migrations`).
Running tests on the Pi (optional): `.venv/bin/pip install -r requirements-dev.txt && .venv/bin/python -m pytest`.

> The old portfolio steps include `sudo rm -rf /var/www/html/*`. That is still safe: blog data is
> not in `/var/www/html`.

---

## 12. Changing the admin password

* **In the browser:** Admin → **Account** → *Change password*. Every other session is signed out.
  The same page has *Sign out everywhere else* and the name shown on articles.
* **Forgot it?** On the Pi:

  ```bash
  cd ~/Portfolio/blog && ./manage.sh set-password --username grayson
  ```

  This signs out every session. Passwords are stored as salted **scrypt** hashes. Nobody, including
  you, can read them back.

---

## 13. Where everything is stored

| What | Where (Pi) |
|---|---|
| Articles, categories, tags, revisions, image info, admin account, sessions | `/var/lib/graysoncodes-blog/data/blog.sqlite3` (+ `-wal`, `-shm` while running) |
| Uploaded images | `/var/lib/graysoncodes-blog/data/media/YYYY/MM/` |
| Backups | `/home/grayson/blog-backups/` |
| Settings | `/etc/graysoncodes-blog.env` |
| Code | `/home/grayson/Portfolio/blog` |
| Service logs | `journalctl -u graysoncodes-blog` |

Permissions are set automatically on start: the database is readable only by `grayson`, and the media
folder is readable by nginx.

---

## 14. Troubleshooting

| Symptom | Check |
|---|---|
| `/blog` shows the portfolio or a 404 from nginx | The `include snippets/graysoncodes-blog.conf;` line is missing or in the wrong `server` block. `sudo nginx -t`, then reload. |
| `502 Bad Gateway` on /blog | The service is down: `systemctl status graysoncodes-blog`, `journalctl -u graysoncodes-blog -n 50`. |
| Service won't start: "Read-only file system" / "No such file" | `/var/lib/graysoncodes-blog` or `/home/grayson/blog-backups` doesn't exist (step 3). |
| Images 404 but articles work | nginx `/media/` alias path, or permissions: `ls -ld /var/lib/graysoncodes-blog/data /var/lib/graysoncodes-blog/data/media` should show `drwx--x--x` and `drwxr-xr-x`. Restart the service to reset them. |
| "Too many failed sign-in attempts" | Wait 15 minutes, or reset the password with `./manage.sh set-password` (that doesn't clear the throttle; waiting does). |
| Can't sign in, no error, sent back to sign-in | The admin cookie is HTTPS-only. Use `https://graysoncodes.org`, not the Pi's local `http://` address (or set `BLOG_COOKIE_SECURE=0` only for LAN testing). |
| "Your session expired or the form was out of date" | The page was open from an old session. Reload and try again. |
| Upload refused | Over 10 MB, over 40 megapixels, or not a real JPEG/PNG/WebP/GIF (e.g. HEIC from an iPhone: export as JPEG). Also nginx's `client_max_body_size 12m` in the snippet. |
| Editor says "newer version exists" | You saved this article in another tab or device. Copy your text if needed, then load the newer version, or choose *Keep mine*. |
| Scheduled article didn't appear | Check the time zone (`BLOG_TIMEZONE`) and the Pi's clock: `timedatectl`. |
| Anything else | `./manage.sh check` (paths, integrity, counts, missing image files). |

---

## 15. Environment variables

All optional; set them in `/etc/graysoncodes-blog.env` (template: `deploy/blog.env.example`).

| Variable | Default | Meaning |
|---|---|---|
| `BLOG_DATA_DIR` | `blog/instance` (dev) | Database + media folder. **Production: `/var/lib/graysoncodes-blog/data`.** |
| `BLOG_BACKUP_DIR` | `<data dir>-backups` | Where `backup` writes archives |
| `BLOG_SITE_URL` | `https://graysoncodes.org` | Used for canonical links, RSS and sitemap (never taken from the request) |
| `BLOG_SITE_NAME` / `BLOG_AUTHOR_NAME` | `Grayson Cox` | Shown in titles, feed and as the fallback author |
| `BLOG_TIMEZONE` | `America/Chicago` | Dates on the site and the schedule box |
| `BLOG_HOST` / `BLOG_PORT` / `BLOG_THREADS` | `127.0.0.1` / `5080` / `4` | Waitress listener |
| `BLOG_COOKIE_SECURE` | `1` | HTTPS-only admin cookie. Only set `0` for local http testing. |
| `BLOG_TRUST_CLOUDFLARE_IP` | `1` | Use `CF-Connecting-IP` for login throttling |
| `BLOG_MAX_UPLOAD_MB` | `10` | Image size limit |
| `BLOG_PER_PAGE` | `9` | Articles per page |
| `BLOG_SESSION_IDLE_HOURS` / `BLOG_SESSION_MAX_DAYS` | `12` / `7` | Admin session lifetime |
| `BLOG_LOGIN_MAX_PER_IP` / `BLOG_LOGIN_MAX_PER_USER` / `BLOG_LOGIN_WINDOW_MINUTES` | `5` / `20` / `15` | Sign-in throttling |
| `BLOG_ADMIN_USERNAME` / `BLOG_ADMIN_PASSWORD` | – | Non-interactive `create-admin` / `set-password` (don't leave a password in the env file) |
| `BLOG_SERVE_MEDIA` | `1` | Let Python serve `/media` too (nginx normally does it) |

No secret key is needed: sessions are random tokens stored (hashed) in the database.

---

## 16. Moving to another server

1. On the old server: `./manage.sh backup` and copy the `.tar.gz` somewhere safe.
2. On the new server: do steps 1–4 and 6–8 of the first install (skip `create-admin`; your account is in the backup).
3. `./manage.sh restore /path/to/blog-backup-….tar.gz --yes`, then `sudo systemctl restart graysoncodes-blog`.
4. `./manage.sh check`, then point the Cloudflare Tunnel at the new machine.

---

## 17. Local development

```powershell
cd Portfolio\blog
python -m venv .venv
.venv\Scripts\pip install -r requirements-dev.txt
$env:BLOG_COOKIE_SECURE = "0"
.venv\Scripts\python -m blogapp create-admin --username grayson
.venv\Scripts\python -m blogapp serve                  # http://127.0.0.1:5080/blog
.venv\Scripts\python -m pytest                         # run the tests
```

To see the blog inside the portfolio's dev server, run `npm run dev` in `my-react-app` as well. Vite
forwards `/blog`, `/admin/blog`, `/media` and `/sitemap.xml` to port 5080. Local data goes to
`blog/instance/` (git-ignored).
