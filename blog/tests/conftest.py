import io
import re
import sys
from pathlib import Path

import pytest
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from blogapp import create_app  # noqa: E402
from blogapp.auth import create_user  # noqa: E402

PASSWORD = "correct horse battery staple"


def make_app(data_dir, **extra):
    config = {
        "DATA_DIR": data_dir,
        "COOKIE_SECURE": False,
        "SITE_URL": "https://graysoncodes.org",
        "TESTING": True,
        "PER_PAGE": 3,
        "MAX_UPLOAD_MB": 2,
        "LOGIN_MAX_PER_IP": 5,
        "TIMEZONE": "America/Chicago",
    }
    config.update(extra)
    return create_app(config)


@pytest.fixture
def data_dir(tmp_path):
    return tmp_path / "data"


@pytest.fixture
def app(data_dir):
    app = make_app(data_dir)
    with app.app_context():
        create_user("admin", PASSWORD, "Grayson Cox")
    return app


@pytest.fixture
def client(app):
    return app.test_client()


def csrf_from(html):
    match = re.search(r'name="csrf_token" value="([^"]+)"', html) or re.search(r'"csrf": "([^"]+)"', html)
    assert match, "no CSRF token on page"
    return match.group(1)


class Admin:
    """A signed-in test client with helpers."""

    def __init__(self, client):
        self.client = client
        r = client.post("/admin/blog/login", data={"username": "admin", "password": PASSWORD})
        assert r.status_code == 302, r.data
        self.csrf = csrf_from(client.get("/admin/blog/articles/new").get_data(as_text=True))

    def headers(self):
        return {"X-CSRF-Token": self.csrf, "X-Requested-With": "fetch"}

    def create(self, **fields):
        data = {"title": "Hello world", "body_md": "Some **content** here.", "slug_auto": True}
        data.update(fields)
        r = self.client.post("/admin/blog/api/articles", json=data, headers=self.headers())
        assert r.status_code == 201, r.get_json()
        return r.get_json()["article"]

    def save(self, article, **fields):
        data = {"title": "Hello world", "body_md": "Some **content** here.", "slug": article["slug"],
                "base_version": article["version"]}
        data.update(fields)
        return self.client.post(f"/admin/blog/api/articles/{article['id']}", json=data, headers=self.headers())

    def action(self, article_id, action, **payload):
        return self.client.post(f"/admin/blog/articles/{article_id}/{action}", json=payload, headers=self.headers())

    def publish(self, **fields):
        article = self.create(**fields)
        r = self.action(article["id"], "publish")
        assert r.status_code == 200, r.get_json()
        return r.get_json()["article"]

    def upload(self, data, name="photo.png"):
        return self.client.post(
            "/admin/blog/api/media",
            data={"file": (io.BytesIO(data), name)},
            headers=self.headers(),
            content_type="multipart/form-data",
        )


@pytest.fixture
def admin(client):
    return Admin(client)


def image_bytes(fmt="PNG", size=(800, 600), mode="RGB", **save):
    img = Image.new(mode, size, (20, 120, 200) if mode == "RGB" else (20, 120, 200, 128))
    out = io.BytesIO()
    img.save(out, fmt, **save)
    return out.getvalue()
