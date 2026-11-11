"""Command line for running and maintaining the blog.

    python -m blogapp serve [--host 127.0.0.1] [--port 5080]
    python -m blogapp migrate
    python -m blogapp create-admin [--username grayson]
    python -m blogapp set-password --username grayson
    python -m blogapp backup [--dest DIR]
    python -m blogapp restore ARCHIVE --yes
    python -m blogapp check
"""
import argparse
import getpass
import os
import sys

from . import create_app


def _ask_password():
    env = os.environ.get("BLOG_ADMIN_PASSWORD")
    if env:
        return env
    first = getpass.getpass("New password (12+ characters): ")
    if first != getpass.getpass("Repeat password: "):
        sys.exit("The passwords don't match.")
    return first


def main(argv=None):
    parser = argparse.ArgumentParser(prog="python -m blogapp")
    sub = parser.add_subparsers(dest="command", required=True)
    serve = sub.add_parser("serve", help="Run the blog with the Waitress web server")
    serve.add_argument("--host", default=os.environ.get("BLOG_HOST", "127.0.0.1"))
    serve.add_argument("--port", type=int, default=int(os.environ.get("BLOG_PORT", "5080")))
    serve.add_argument("--threads", type=int, default=int(os.environ.get("BLOG_THREADS", "4")))
    sub.add_parser("migrate", help="Apply database migrations")
    create = sub.add_parser("create-admin", help="Create the administrator account")
    create.add_argument("--username", default=os.environ.get("BLOG_ADMIN_USERNAME"))
    create.add_argument("--display-name", default=None)
    setpw = sub.add_parser("set-password", help="Change a password and sign out every session")
    setpw.add_argument("--username", required=True)
    backup = sub.add_parser("backup", help="Write a timestamped backup archive (database + media)")
    backup.add_argument("--dest", default=os.environ.get("BLOG_BACKUP_DIR"))
    backup.add_argument("--keep", type=int, default=int(os.environ.get("BLOG_BACKUP_KEEP", "0")),
                        help="Also delete the oldest automatic backups beyond this many (0 = keep all)")
    restore = sub.add_parser("restore", help="Restore database + media from a backup archive")
    restore.add_argument("archive")
    restore.add_argument("--yes", action="store_true", help="Confirm replacing the current data")
    sub.add_parser("check", help="Show where data lives and check it")
    args = parser.parse_args(argv)

    if args.command == "restore":
        from .backup import restore_backup

        if not args.yes:
            sys.exit("Restoring replaces the current blog data (it is moved aside, not deleted). Re-run with --yes.")
        print(restore_backup(args.archive))
        return

    app = create_app()
    with app.app_context():
        if args.command == "serve":
            from waitress import serve as waitress_serve

            print(f"Blog listening on http://{args.host}:{args.port}  (data: {app.config['DATA_DIR']})")
            waitress_serve(app, host=args.host, port=args.port, threads=args.threads,
                           ident="graysoncodes-blog", clear_untrusted_proxy_headers=False)
        elif args.command == "migrate":
            print("Database is up to date:", app.config["DATABASE"])
        elif args.command == "create-admin":
            from .auth import create_user
            from .db import get_db

            if get_db().execute("SELECT 1 FROM users LIMIT 1").fetchone() and not os.environ.get("BLOG_ALLOW_MORE_ADMINS"):
                sys.exit("An administrator already exists. Use set-password to change its password.")
            username = args.username or input("Username: ").strip()
            try:
                create_user(username, _ask_password(), args.display_name or app.config["AUTHOR_NAME"])
            except ValueError as exc:
                sys.exit(str(exc))
            print(f"Administrator {username!r} created. Sign in at /admin/blog/login")
        elif args.command == "set-password":
            from .auth import set_password

            try:
                set_password(args.username, _ask_password())
            except ValueError as exc:
                sys.exit(str(exc))
            print("Password changed. Every existing session was signed out.")
        elif args.command == "backup":
            from .backup import create_backup

            print(create_backup(args.dest, keep=args.keep))
        elif args.command == "check":
            from .db import get_db

            db = get_db()
            print("Data directory :", app.config["DATA_DIR"])
            print("Database       :", app.config["DATABASE"])
            print("Media          :", app.config["MEDIA_DIR"])
            print("Integrity      :", db.execute("PRAGMA integrity_check").fetchone()[0])
            print("Articles       :", db.execute("SELECT COUNT(*) FROM articles").fetchone()[0])
            print("Media files    :", db.execute("SELECT COUNT(*) FROM media").fetchone()[0])
            print("Admins         :", db.execute("SELECT COUNT(*) FROM users").fetchone()[0])
            missing = [r[0] for r in db.execute("SELECT path FROM media")
                       if not (app.config["MEDIA_DIR"] / r[0]).exists()]
            print("Missing files  :", len(missing))
            for path in missing[:20]:
                print("   ", path)


if __name__ == "__main__":
    main()
