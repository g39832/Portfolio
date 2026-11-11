import sqlite3
import tarfile

import pytest

from blogapp.backup import create_backup, restore_backup
from blogapp.config import load_config
from blogapp.db import migrate
from conftest import Admin, image_bytes, make_app


def test_articles_survive_restart(admin, data_dir):
    admin.publish(title="Persistent", body_md="Still here after restart")
    restarted = make_app(data_dir)
    r = restarted.test_client().get("/blog/persistent")
    assert r.status_code == 200 and b"Still here after restart" in r.data


def test_migrations_are_idempotent_and_keep_data(admin, app):
    admin.publish(title="Keep me", body_md="data")
    db_path = app.config["DATABASE"]
    assert migrate(db_path) == []  # nothing re-applied
    conn = sqlite3.connect(db_path)
    assert conn.execute("SELECT COUNT(*) FROM articles").fetchone()[0] == 1
    assert conn.execute("SELECT COUNT(*) FROM schema_migrations").fetchone()[0] == 1
    conn.close()


def test_new_migration_applies_on_top_of_existing_data(tmp_path, monkeypatch, admin, app):
    admin.publish(title="Before upgrade", body_md="old data")
    extra = tmp_path / "migrations"
    extra.mkdir()
    from blogapp import db as dbmod
    for f in dbmod.migration_files():
        (extra / f.name).write_text(f.read_text(encoding="utf-8"), encoding="utf-8")
    (extra / "0002_example.sql").write_text("ALTER TABLE articles ADD COLUMN example TEXT NOT NULL DEFAULT '';",
                                            encoding="utf-8")
    monkeypatch.setattr(dbmod, "MIGRATIONS_DIR", extra)
    assert migrate(app.config["DATABASE"]) == ["0002_example"]
    conn = sqlite3.connect(app.config["DATABASE"])
    assert conn.execute("SELECT title, example FROM articles").fetchone() == ("Before upgrade", "")
    conn.close()


def test_failed_migration_rolls_back(tmp_path, monkeypatch, admin, app):
    extra = tmp_path / "migrations"
    extra.mkdir()
    from blogapp import db as dbmod
    for f in dbmod.migration_files():
        (extra / f.name).write_text(f.read_text(encoding="utf-8"), encoding="utf-8")
    (extra / "0002_broken.sql").write_text(
        "CREATE TABLE half_done (id INTEGER);\nTHIS IS NOT SQL;", encoding="utf-8")
    monkeypatch.setattr(dbmod, "MIGRATIONS_DIR", extra)
    with pytest.raises(sqlite3.Error):
        migrate(app.config["DATABASE"])
    conn = sqlite3.connect(app.config["DATABASE"])
    assert conn.execute("SELECT name FROM sqlite_master WHERE name = 'half_done'").fetchone() is None
    conn.close()


def _config(data_dir):
    return load_config({"DATA_DIR": data_dir})


def test_backup_and_restore_round_trip(admin, app, data_dir, tmp_path):
    admin.publish(title="Backed up", body_md="precious words")
    item = admin.upload(image_bytes(), "photo.png").get_json()["item"]
    image = admin.client.get(item["url"]).data
    dest = tmp_path / "backups"

    message = create_backup(dest, config=_config(data_dir))
    archives = list(dest.glob("blog-backup-*.tar.gz"))
    assert len(archives) == 1 and "1 articles, 1 images" in message
    with tarfile.open(archives[0]) as tar:
        names = tar.getnames()
    assert "blog.sqlite3" in names and "manifest.json" in names and any(n.endswith(".png") for n in names)

    # A second backup never overwrites the first.
    create_backup(dest, config=_config(data_dir))
    assert len(list(dest.glob("blog-backup-*.tar.gz"))) == 2

    # Disaster: the data directory is lost after more changes.
    admin.publish(title="Written after the backup", body_md="x")
    restore_message = restore_backup(archives[0], config=_config(data_dir))
    assert "Restored 1 articles" in restore_message
    assert list(data_dir.parent.glob("data.before-restore-*")), "old data must be kept aside"

    restored = make_app(data_dir).test_client()
    assert b"precious words" in restored.get("/blog/backed-up").data
    assert restored.get("/blog/written-after-the-backup").status_code == 404
    assert restored.get(item["url"]).data == image
    Admin(restored)  # the admin account came back too


def test_restore_refuses_unsafe_archives(tmp_path, data_dir):
    bad = tmp_path / "bad.tar.gz"
    payload = tmp_path / "x.txt"
    payload.write_text("pwned")
    with tarfile.open(bad, "w:gz") as tar:
        tar.add(payload, arcname="../../escape.txt")
    with pytest.raises(ValueError):
        restore_backup(bad, config=_config(data_dir))
    assert not (tmp_path / "escape.txt").exists()


def test_backup_rotation_only_when_asked(admin, data_dir, tmp_path):
    dest = tmp_path / "b"
    for _ in range(3):
        create_backup(dest, config=_config(data_dir))
    assert len(list(dest.glob("*.tar.gz"))) == 3
    create_backup(dest, keep=2, config=_config(data_dir))
    assert len(list(dest.glob("*.tar.gz"))) == 2
