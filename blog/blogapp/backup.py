"""Backups: one .tar.gz holding a consistent copy of the database plus every media file.

* The database copy uses SQLite's online backup API, so it is consistent even
  while the blog is running.
* Archive names include the time and are opened in exclusive mode, so an
  existing backup is never overwritten.
* Restoring never deletes the current data: it is renamed to
  <data dir>.before-restore-<time> first.
"""
import json
import os
import shutil
import sqlite3
import tarfile
import tempfile
from datetime import datetime
from pathlib import Path

from .config import load_config

PREFIX = "blog-backup-"


def default_dest(config):
    data_dir = Path(config["DATA_DIR"])
    return data_dir.parent / (data_dir.name + "-backups")


def create_backup(dest=None, keep=0, config=None):
    config = config or load_config()
    dest = Path(dest) if dest else default_dest(config)
    dest.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    archive = dest / f"{PREFIX}{stamp}.tar.gz"
    n = 2
    while archive.exists():
        archive = dest / f"{PREFIX}{stamp}-{n}.tar.gz"
        n += 1

    with tempfile.TemporaryDirectory(prefix="blog-backup-") as tmp:
        db_copy = Path(tmp) / "blog.sqlite3"
        source = sqlite3.connect(str(config["DATABASE"]))
        target = sqlite3.connect(str(db_copy))
        try:
            source.backup(target)
            articles = target.execute("SELECT COUNT(*) FROM articles").fetchone()[0]
            media_rows = target.execute("SELECT COUNT(*) FROM media").fetchone()[0]
            versions = [r[0] for r in target.execute("SELECT version FROM schema_migrations ORDER BY version")]
        finally:
            target.close()
            source.close()
        manifest = {
            "created_at": datetime.now().astimezone().isoformat(timespec="seconds"),
            "articles": articles,
            "media_records": media_rows,
            "migrations": versions,
            "format": 1,
        }
        manifest_path = Path(tmp) / "manifest.json"
        manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

        try:
            with open(archive, "xb") as raw, tarfile.open(fileobj=raw, mode="w:gz") as tar:
                tar.add(manifest_path, arcname="manifest.json")
                tar.add(db_copy, arcname="blog.sqlite3")
                media_dir = Path(config["MEDIA_DIR"])
                if media_dir.exists():
                    tar.add(media_dir, arcname="media", filter=_skip_temp)
                raw.flush()
                os.fsync(raw.fileno())
        except BaseException:
            archive.unlink(missing_ok=True)
            raise

    removed = []
    if keep and keep > 0:
        backups = sorted(dest.glob(f"{PREFIX}*.tar.gz"))
        for old in backups[:-keep]:
            old.unlink()
            removed.append(old.name)
    size_mb = archive.stat().st_size / 1024 / 1024
    message = f"Backup written: {archive} ({size_mb:.1f} MB, {articles} articles, {media_rows} images)"
    if removed:
        message += f"\nRemoved {len(removed)} old backup(s) beyond the newest {keep}."
    return message


def _skip_temp(info):
    name = os.path.basename(info.name)
    if name.startswith(".") and name.endswith(".tmp"):
        return None
    return info


def _check_members(tar):
    for member in tar.getmembers():
        name = member.name
        parts = Path(name).parts
        if name.startswith(("/", "\\")) or ".." in parts or (parts and ":" in parts[0]):
            raise ValueError(f"Unsafe path in archive: {name}")
        if not (member.isfile() or member.isdir()):
            raise ValueError(f"Unexpected entry in archive: {name}")
        if not (name in ("manifest.json", "blog.sqlite3") or parts[0] == "media"):
            raise ValueError(f"Unexpected file in archive: {name}")


def restore_backup(archive, config=None):
    config = config or load_config()
    archive = Path(archive)
    if not archive.is_file():
        raise SystemExit(f"Backup not found: {archive}")
    data_dir = Path(config["DATA_DIR"])
    data_dir.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=data_dir.name + ".restoring-", dir=data_dir.parent))
    try:
        with tarfile.open(archive, "r:gz") as tar:
            _check_members(tar)
            names = tar.getnames()
            if "blog.sqlite3" not in names:
                raise ValueError("This archive has no blog.sqlite3 database.")
            try:
                tar.extractall(staging, filter="data")
            except TypeError:  # Python without extraction filters
                tar.extractall(staging)
        (staging / "media").mkdir(exist_ok=True)
        conn = sqlite3.connect(str(staging / "blog.sqlite3"))
        try:
            result = conn.execute("PRAGMA integrity_check").fetchone()[0]
            articles = conn.execute("SELECT COUNT(*) FROM articles").fetchone()[0]
        finally:
            conn.close()
        if result != "ok":
            raise ValueError(f"The database in the backup failed its integrity check: {result}")

        moved_aside = None
        if data_dir.exists():
            moved_aside = data_dir.with_name(f"{data_dir.name}.before-restore-{datetime.now():%Y%m%d-%H%M%S}")
            os.rename(data_dir, moved_aside)
        os.rename(staging, data_dir)
    except BaseException:
        shutil.rmtree(staging, ignore_errors=True)
        raise
    message = f"Restored {articles} articles and their media into {data_dir}."
    if moved_aside:
        message += f"\nThe previous data was kept at {moved_aside} (delete it once you're happy)."
    return message
