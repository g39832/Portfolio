"""Step 1 of the nightly off-site backup: make a safe copy of an app's /data in /snapshot/data.

SQLite databases are copied with SQLite's own backup API (a consistent copy even while the app
is writing), then checked with PRAGMA integrity_check. Every other file is copied as-is.
Runs inside the app's own image (python:3.11-slim), as the app's user.

This step never fails the pod: it writes /snapshot/STATUS ("ok" or the error), and the restic
step reads it, so a broken snapshot still gets reported to Discord.
"""
import os
import shutil
import sqlite3
import sys
import traceback

SRC = "/data"
DST = "/snapshot/data"
STATUS = "/snapshot/STATUS"
DB_ENDINGS = (".sqlite3", ".sqlite", ".db")
SKIP_ENDINGS = ("-wal", "-shm", "-journal")   # folded into the database copy by the backup API
SKIP_DIRS = {"lost+found"}


def copy_db(src, dst):
    source = sqlite3.connect(src, timeout=60)
    try:
        target = sqlite3.connect(dst)
        try:
            source.backup(target)
            result = target.execute("PRAGMA integrity_check").fetchone()[0]
            if result != "ok":
                raise RuntimeError(f"integrity check failed for {src}: {result}")
        finally:
            target.close()
    finally:
        source.close()


def main():
    files = dbs = size = 0
    for root, dirs, names in os.walk(SRC):
        dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS)
        out = os.path.join(DST, os.path.relpath(root, SRC))
        os.makedirs(out, exist_ok=True)
        for name in sorted(names):
            if name.endswith(SKIP_ENDINGS):
                continue
            src, dst = os.path.join(root, name), os.path.join(out, name)
            if name.endswith(DB_ENDINGS):
                copy_db(src, dst)
                dbs += 1
            else:
                shutil.copy2(src, dst)
            files += 1
            size += os.path.getsize(dst)
    if files == 0:
        raise RuntimeError(f"{SRC} is empty, refusing to back up nothing")
    print(f"snapshot ok: {files} files ({dbs} databases), {size / 1048576:.1f} MB")


if __name__ == "__main__":
    os.makedirs("/snapshot", exist_ok=True)
    try:
        main()
        status = "ok"
    except Exception as exc:  # reported by the restic step
        traceback.print_exc()
        status = f"snapshot failed: {exc}"
    with open(STATUS, "w") as fh:
        fh.write(status)
    sys.exit(0)
