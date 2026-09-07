"""Sync the built site (dist/) to the self-hosted Raspberry Pi web root via SFTP.

Windows-safe replacement for scp/rsync that supports password auth (no sshpass needed).

Config via environment variables:
    PI_HOST (default 192.168.1.35), PI_USER (default grayson), PI_PASS (required)

Usage:
    python deploy.py              # upload dist/** to /var/www/html
    python deploy.py --prune      # also remove remote files not present locally
"""
import argparse
import os
import posixpath
import sys

try:
    import paramiko
except ImportError as e:
    sys.exit(f"paramiko not installed: run  pip install --user paramiko  ({e})")

HOST = os.environ.get("PI_HOST", "192.168.1.35")
USER = os.environ.get("PI_USER", "grayson")
PASS = os.environ.get("PI_PASS", "")
PORT = 22
REMOTE_DIR = "/var/www/html"

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
LOCAL_DIR = os.path.join(SCRIPT_DIR, "my-react-app", "dist")

if not PASS:
    sys.exit("Set the PI_PASS environment variable with the SSH password first.")

if not os.path.isdir(LOCAL_DIR):
    sys.exit(f"dist folder not found: {LOCAL_DIR}\nRun 'npm run build' first.")


def makedirs(sftp, path):
    """Recursively create remote posix dirs, ignoring any that already exist."""
    if not path or path == "/":
        return
    try:
        sftp.stat(path)
        return  # already exists
    except IOError:
        parent = posixpath.dirname(path)
        if parent and parent != path:
            makedirs(sftp, parent)
        sftp.mkdir(path)


def list_remote(sftp, rpath):
    """Return (dirs, files) for a remote dir, guarding against missing dirs."""
    try:
        attrs = sftp.listdir_attr(rpath)
    except IOError:
        return [], []
    dirs, files = [], []
    for a in attrs:
        target = posixpath.join(rpath, a.filename)
        if a.st_mode is not None and (a.st_mode & 0o040000):  # S_IFDIR
            dirs.append(target)
        else:
            files.append(target)
    return dirs, files


def upload_file(sftp, local_path, remote_path):
    """Upload overwriting even if the remote file is root-owned (delete first)."""
    try:
        sftp.remove(remote_path)
    except IOError:
        pass  # didn't exist or no need
    makedirs(sftp, posixpath.dirname(remote_path))
    try:
        sftp.put(local_path, remote_path)
    except PermissionError:
        sys.exit(
            f"Permission denied writing {remote_path}.\n"
            "Run ONCE on the Pi:  sudo chown -R grayson:www-data /var/www/html\n"
            "(the assets/ folder is currently root-owned)."
        )
    return os.path.getsize(local_path)


def sync_local_sftp(sftp, local_dir_all, root):
    """Walk the local dist tree and push every file."""
    uploaded = 0
    for dirpath, dirnames, filenames in os.walk(local_dir_all):
        dirnames[:] = [d for d in dirnames if d not in (".git", "node_modules")]
        rel = os.path.relpath(dirpath, local_dir_all)
        rdir = root if rel == "." else posixpath.join(root, rel.replace(os.sep, "/"))
        for fn in filenames:
            local_file = os.path.join(dirpath, fn)
            remote_file = posixpath.join(rdir, fn)
            size = upload_file(sftp, local_file, remote_file)
            uploaded += 1
            print(f"  {remote_file}  ({size} B)")
    return uploaded


def prune_remote(sftp, root, local_dir_all):
    """Delete remote paths that no longer exist locally (stale assets, old files)."""
    local_dirs, local_files = set(), set()
    for dirpath, _, filenames in os.walk(local_dir_all):
        rel = os.path.relpath(dirpath, local_dir_all)
        rdir = root if rel == "." else posixpath.join(root, rel.replace(os.sep, "/"))
        local_dirs.add(rdir)
        for fn in filenames:
            local_files.add(posixpath.join(rdir, fn))

    removed = 0
    pending = [root]
    while pending:
        d = pending.pop()
        dirs, files = list_remote(sftp, d)
        for rdir in dirs:
            if rdir in local_dirs:
                pending.append(rdir)
            else:
                _rmdir_tree(sftp, rdir)
                removed += 1
        for rf in files:
            if rf not in local_files:
                try:
                    sftp.remove(rf)
                    removed += 1
                    print(f"  pruned {rf}")
                except IOError:
                    pass
    return removed


def verify_remote(sftp, root, local_dir_all):
    """Compare sizes of local files to remote copies; warn on any mismatch."""
    mismatches = []
    count = 0
    for dirpath, _, filenames in os.walk(local_dir_all):
        rel = os.path.relpath(dirpath, local_dir_all)
        rdir = root if rel == "." else posixpath.join(root, rel.replace(os.sep, "/"))
        for fn in filenames:
            local_file = os.path.join(dirpath, fn)
            remote_file = posixpath.join(rdir, fn)
            lsize = os.path.getsize(local_file)
            try:
                rsize = sftp.stat(remote_file).st_size
            except IOError:
                rsize = None
            count += 1
            if rsize is None or rsize != lsize:
                mismatches.append(f"  {remote_file}  (local={lsize}, remote={rsize})")
    if mismatches:
        return count, mismatches
    return count, None


def _rmdir_tree(sftp, path):
    dirs, files = list_remote(sftp, path)
    for f in files:
        try:
            sftp.remove(f)
        except IOError:
            pass
    for d in dirs:
        _rmdir_tree(sftp, d)
    try:
        sftp.rmdir(path)
    except IOError:
        pass


def main():
    ap = argparse.ArgumentParser(description="Deploy dist/ to the Pi web root.")
    ap.add_argument("--prune", action="store_true",
                    help="Delete remote files/dirs no longer present locally.")
    args = ap.parse_args()

    print(f"Syncing:\n  {LOCAL_DIR}\n  -> {USER}@{HOST}:{REMOTE_DIR}\n")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect(HOST, port=PORT, username=USER, password=PASS, timeout=20)
        print(f"Connected to {USER}@{HOST} over SSH.")
    except Exception as e:
        sys.exit(f"SSH connection failed: {e}")

    try:
        sftp = client.open_sftp()
        try:
            makedirs(sftp, REMOTE_DIR)
            uploaded = sync_local_sftp(sftp, LOCAL_DIR, REMOTE_DIR)
            pruned = prune_remote(sftp, REMOTE_DIR, LOCAL_DIR) if args.prune else 0
            print(f"\nUploaded {uploaded} file(s)." + (f" Pruned {pruned} stale path(s)." if args.prune else ""))
            verified, mismatches = verify_remote(sftp, REMOTE_DIR, LOCAL_DIR)
            if mismatches:
                print("WARNING: remote files don't match local dist:")
                for m in mismatches:
                    print(m)
            else:
                print(f"Verified {verified} file(s) on the Pi — all match local sizes.")
            print("Done. Your site is live at http://192.168.1.35/")
        except Exception as e:
            sys.exit(f"Deploy failed: {e}")
        finally:
            sftp.close()
    finally:
        client.close()


if __name__ == "__main__":
    main()