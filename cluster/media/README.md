# Media server (Jellyfin) on the Pi cluster

Jellyfin is a personal Netflix: posters, descriptions, watch progress and "resume where
you left off", for your movies, shows, music and home videos. It runs on the k3s cluster,
on the **Pi 5** (`raspberrypi`, 192.168.1.35), from `cluster/k8s/60-jellyfin.yaml`.

**It is private.** There is no Cloudflare route, so it is only reachable on your home
Wi-Fi or over Tailscale. Never add a Cloudflare route for it.

## Addresses

| What | Address |
|---|---|
| Jellyfin at home | http://192.168.1.35:8096 |
| Jellyfin from anywhere (Tailscale on) | http://100.120.223.33:8096 |
| Same thing, through either Pi | http://192.168.1.35:30096 or http://192.168.1.36:30096 |

Phone and TV apps (Jellyfin for Android/iOS/Android TV/Fire TV/Roku): enter
`http://192.168.1.35:8096` as the server.

## Why the Pi 5, and what it can do

- The Pi 5 has 8 GB of memory and 92 GB free on its SD card. The Pi 4 has 4 GB and ~6 GB free.
- **The Pi 5 has no hardware video encoder**, so Jellyfin is set up for **direct play**: your
  device plays the file as-is and the Pi just sends it. That costs almost no CPU.
- If a device can't play a file's format, Jellyfin converts it with the CPU. Expect **one**
  light conversion at a time, not several. To avoid it, use **MP4 or MKV with H.264 video
  and AAC audio** (plays everywhere). H.265/HEVC is fine for most phones and TVs.
- In the Jellyfin app on each device, set **Settings → Playback → Max streaming bitrate**
  to a high value (or "Auto") so it does not shrink videos needlessly.

## Folders (on the Pi 5)

```
/opt/media-server/
  config/            Jellyfin settings, users, watch progress (backed up nightly)
  cache/             thumbnails and temporary files (safe to delete)
  media/             your files - Jellyfin can only READ these
    movies/
    shows/
    music/
    personal-videos/
  backups/           nightly config backups, newest 7 kept
  documentation/
```

All of it is owned by `grayson`, and Jellyfin runs as `grayson` too, so you can copy files
in as yourself.

## First-time install (already done once; here for rebuilding)

1. Make the folders (on the Pi 5). This stops if `/opt/media-server` already exists:
   ```bash
   if [ -e /opt/media-server ]; then echo "already exists"; else sudo mkdir -p /opt/media-server/{config,cache,backups,documentation,media/{movies,shows,music,personal-videos}} && sudo chown -R grayson:grayson /opt/media-server; fi
   ```
   Jellyfin runs as user id 1000. Check `id -u` prints 1000; if not, change
   `runAsUser`/`runAsGroup` in `60-jellyfin.yaml` to match.
2. Start it: `kubectl apply -f ~/Portfolio/cluster/k8s/60-jellyfin.yaml`
3. Wait: `kubectl -n media rollout status deploy/jellyfin --timeout=600s`
   (first start can take a few minutes).

## Setting it up in the browser

Open http://192.168.1.35:8096 and follow the wizard:

1. **Language**: English.
2. **Administrator**: pick your username and a strong password (you type it; it is stored
   only on the Pi, never in git).
3. **Libraries**: add one per folder. Click **Add Media Library**:

   | Content type | Display name | Folder |
   |---|---|---|
   | Movies | Movies | `/media/movies` |
   | Shows | TV Shows | `/media/shows` |
   | Music | Music | `/media/music` |
   | Home Videos and Photos | Personal Videos | `/media/personal-videos` |

   Leave metadata downloaders on (TheMovieDB, MusicBrainz): they fetch posters and
   descriptions. Leave **"Save artwork into media folders"** off (the media folder is read-only).
4. **Metadata language/country**: English / United States.
5. **Remote access**: leave **"Allow remote connections"** on (that is what lets Tailscale
   and other devices at home connect) but leave **automatic port mapping (UPnP) OFF**.
6. Finish and sign in.

Afterwards, in **Dashboard → Playback → Transcoding**, leave **Hardware acceleration: None**
(the Pi 5 has none Jellyfin can use).

### Other people's accounts

Dashboard → **Users** → **+**. Give each person their own account so their watch
progress is separate. Untick **"Allow this user to manage the server"** for everyone but you,
and under **Library access** pick which libraries they see. You can also turn off
**"Allow video playback that requires transcoding"** for them to protect the Pi.

## Adding movies and shows

Name things the way Jellyfin expects and it finds posters automatically:

```
movies/
  The Matrix (1999)/
    The Matrix (1999).mkv
shows/
  Breaking Bad (2008)/
    Season 01/
      Breaking Bad S01E01.mkv
      Breaking Bad S01E02.mkv
music/
  Artist Name/
    Album Name (2020)/
      01 - Song Title.flac
personal-videos/
  2026 Beach Trip/
    clip1.mp4
```

Copy files from Windows (PowerShell), for example:
```powershell
scp -r "D:\Movies\The Matrix (1999)" grayson@raspberrypi.local:/opt/media-server/media/movies/
```
or use WinSCP (free, drag and drop) to `raspberrypi.local` as `grayson`.

Jellyfin notices new files on its own; to force it: Dashboard → **Libraries** → **Scan All Libraries**.

Only add media you own or have the right to use.

## Everyday commands (on the Pi 5)

| Task | Command |
|---|---|
| Is it running? | `kubectl -n media get pods` |
| Restart it | `kubectl -n media rollout restart deployment jellyfin` |
| See its log | `kubectl -n media logs deploy/jellyfin --tail=100` |
| Free space left | `df -h /opt/media-server` |

**Update Jellyfin:** change the version in `cluster/k8s/60-jellyfin.yaml`
(`image: jellyfin/jellyfin:10.11.10`), push, then on the Pi 5:
`cd ~/Portfolio && git pull && kubectl apply -f cluster/k8s/60-jellyfin.yaml`.
Make a backup first (below). Your files and settings are untouched by updates.

## Backups

Every night at 4:00 am the cluster saves Jellyfin's settings, users and watch progress to
`/opt/media-server/backups/jellyfin-config-<date>.tar.gz` (newest 7 kept). The databases are
copied safely while Jellyfin runs. **Your media files are not in the backup** (too big): they
are your originals, so keep copies of anything precious somewhere else too.

Backup right now: `kubectl -n media create job --from=cronjob/jellyfin-backup backup-now`

The backups are on the same SD card, so copy one to your PC now and then (PowerShell):
```powershell
scp "grayson@raspberrypi.local:/opt/media-server/backups/jellyfin-config-*.tar.gz" "$HOME\Documents\pi-backup\"
```

**Restore** (on the Pi 5):
```bash
kubectl -n media scale deployment jellyfin --replicas=0
mv /opt/media-server/config /opt/media-server/config.before-restore
tar -xzf /opt/media-server/backups/jellyfin-config-XXXXXXXX-XXXXXX.tar.gz -C /opt/media-server
kubectl -n media scale deployment jellyfin --replicas=1
```

## Moving media to a USB SSD later

1. Plug the drive into a **blue USB 3 port** on the Pi 5. Ask before formatting anything:
   formatting erases the drive.
2. Mount it (for example at `/mnt/media-ssd`) with an `/etc/fstab` line using its UUID and
   `nofail`, so the Pi still boots if it's unplugged.
3. Copy `/opt/media-server/media/` to the drive, check it, then point Jellyfin at it by
   changing the `media` hostPath in `60-jellyfin.yaml` to the new folder. Library paths inside
   Jellyfin (`/media/movies` etc.) stay the same, so nothing needs rescanning from scratch.

## Without internet

Playback is fully local and works without internet. What needs internet: posters and
descriptions (TheMovieDB/MusicBrainz), the first download of the Jellyfin image, and updates.
Already-downloaded artwork stays.

## Troubleshooting

| Problem | Check |
|---|---|
| Page won't load | `kubectl -n media get pods` should say `1/1 Running`. If `Pending`, the Pi 5 is off or the folders are missing (`ls /opt/media-server`). |
| Pod restarts / `CrashLoopBackOff` | `kubectl -n media logs deploy/jellyfin --previous`. "Permission denied" means fix ownership: `sudo chown -R grayson:grayson /opt/media-server` |
| New movie doesn't show | File naming (see above), then Scan All Libraries |
| Video stutters | It's converting: Dashboard → Activity shows "Transcoding". Use H.264/AAC files or raise the app's max bitrate. Wi-Fi speed also matters. |
| App can't find the server | Type `http://192.168.1.35:8096` by hand (auto-discovery isn't set up) |
| SD card filling up | `df -h /`, clear `/opt/media-server/cache`, move media to an SSD |

## Ports in use (so new apps don't clash)

| Port | What | Where |
|---|---|---|
| 8096 / 30096 | Jellyfin | Pi 5 |
| 53 / 30880 | Pi-hole DNS / admin | Pi 4 |
| 30080 | Website (local test address) | both |
| 30777 | Portainer (cluster dashboard) | both |
| 80, 443 | old nginx | Pi 5 |
| 3000, 3001, 7575, 9090, 9100, 9443 | Docker apps from before: Grafana, Uptime Kuma, Homarr, Prometheus, node-exporter, old Portainer | Pi 5 |

## Future media apps (not installed)

Each gets its own file in `cluster/k8s/` and its own folders, kept separate from Jellyfin:

| App | For | Planned folder | Planned port |
|---|---|---|---|
| Navidrome | Spotify-style music | reads `/opt/media-server/media/music` | 4533 |
| Audiobookshelf | Audiobooks, podcasts | `/opt/media-server/media/audiobooks` | 13378 |
| Immich | Photos | its own SSD folder (needs lots of space + a database) | 2283 |
| Calibre-Web | Ebooks | `/opt/media-server/media/books` | 8083 |
| Jellyseerr / Sonarr / Radarr / Bazarr | Requests and library management | own config folders | 5055 / 8989 / 7878 / 6767 |
| Forgejo, Nextcloud | Git, cloud storage | own folders | later |

Uptime Kuma, Grafana and Prometheus already run on the Pi 5 in Docker (from before).
Immich and Nextcloud really want a USB SSD first.
