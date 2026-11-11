"""SQLite access: one connection per request, explicit transactions, migrations."""
import sqlite3
from contextlib import contextmanager
from pathlib import Path

from flask import current_app, g

MIGRATIONS_DIR = Path(__file__).resolve().parent / "migrations"


def connect(path):
    # isolation_level=None: autocommit unless we open a transaction ourselves,
    # so every multi-step write goes through transaction() below.
    conn = sqlite3.connect(str(path), timeout=10, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 5000")
    conn.execute("PRAGMA synchronous = NORMAL")  # safe with WAL, far fewer fsyncs on the SD/SSD
    return conn


def get_db():
    if "db" not in g:
        g.db = connect(current_app.config["DATABASE"])
    return g.db


def close_db(_exc=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


@contextmanager
def transaction(db=None):
    """BEGIN IMMEDIATE ... COMMIT, rolling back on any error."""
    db = db or get_db()
    db.execute("BEGIN IMMEDIATE")
    try:
        yield db
    except BaseException:
        db.execute("ROLLBACK")
        raise
    else:
        db.execute("COMMIT")


def migration_files():
    return sorted(p for p in MIGRATIONS_DIR.glob("*.sql") if p.name[:4].isdigit())


def migrate(path):
    """Apply any migrations not yet recorded. Never drops or rewrites data:
    each file runs once, inside its own transaction, and is recorded."""
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    conn = connect(path)
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations ("
            " version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)"
        )
        done = {row[0] for row in conn.execute("SELECT version FROM schema_migrations")}
        applied = []
        for file in migration_files():
            version = file.stem
            if version in done:
                continue
            sql = file.read_text(encoding="utf-8")
            try:
                conn.executescript(
                    "BEGIN IMMEDIATE;\n"
                    + sql
                    + "\nINSERT INTO schema_migrations (version, applied_at) VALUES ("
                    + "'" + version.replace("'", "''") + "', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));\n"
                    + "COMMIT;"
                )
            except Exception:
                if conn.in_transaction:
                    conn.execute("ROLLBACK")
                raise
            applied.append(version)
        return applied
    finally:
        conn.close()
