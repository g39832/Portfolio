from conftest import PASSWORD, Admin


ADMIN_PAGES = [
    "/admin/blog", "/admin/blog/articles/new", "/admin/blog/media", "/admin/blog/categories",
    "/admin/blog/tags", "/admin/blog/account",
]


def test_unauthenticated_pages_redirect_to_login(client):
    for path in ADMIN_PAGES:
        r = client.get(path)
        assert r.status_code == 302, path
        assert "/admin/blog/login" in r.headers["Location"]


def test_unauthenticated_api_and_actions_are_refused(client, admin, app):
    article = admin.create()
    anon = app.test_client()
    assert anon.post("/admin/blog/api/articles", json={"title": "x"}).status_code == 401
    assert anon.post(f"/admin/blog/api/articles/{article['id']}", json={"title": "x"}).status_code == 401
    assert anon.post("/admin/blog/api/preview", json={"body_md": "x"}).status_code == 401
    assert anon.get("/admin/blog/api/media").status_code == 401
    r = anon.post(f"/admin/blog/articles/{article['id']}/publish")
    assert r.status_code == 302 and "/login" in r.headers["Location"]
    r = anon.post(f"/admin/blog/articles/{article['id']}/delete", data={"confirm": "yes"})
    assert r.status_code == 302
    # Nothing changed.
    assert admin.client.get(f"/admin/blog/articles/{article['id']}/edit").status_code == 200
    assert anon.get(f"/blog/{article['slug']}").status_code == 404


def test_invalid_credentials_rejected(client):
    r = client.post("/admin/blog/login", data={"username": "admin", "password": "wrong password!!"})
    assert r.status_code == 401
    assert b"don&#39;t match" in r.data or b"don't match" in r.data
    r = client.post("/admin/blog/login", data={"username": "nobody", "password": PASSWORD})
    assert r.status_code == 401
    assert client.get("/admin/blog").status_code == 302


def test_session_cookie_is_locked_down(app):
    client = app.test_client()
    r = client.post("/admin/blog/login", data={"username": "admin", "password": PASSWORD})
    cookie = r.headers["Set-Cookie"]
    assert "HttpOnly" in cookie
    assert "SameSite=Strict" in cookie
    assert "Path=/admin/blog" in cookie


def test_secure_flag_in_production(data_dir):
    from conftest import make_app
    from blogapp.auth import create_user

    app = make_app(data_dir, COOKIE_SECURE=True)
    with app.app_context():
        create_user("admin", PASSWORD)
    r = app.test_client().post("/admin/blog/login", data={"username": "admin", "password": PASSWORD})
    assert "Secure" in r.headers["Set-Cookie"]


def test_admin_session_works_and_logout_invalidates_it(app):
    client = app.test_client()
    admin = Admin(client)
    assert client.get("/admin/blog").status_code == 200
    token = client.get_cookie("blog_admin_dev", path="/admin/blog").value

    r = client.post("/admin/blog/logout", data={"csrf_token": admin.csrf})
    assert r.status_code == 302
    assert client.get("/admin/blog").status_code == 302

    # Replaying the old cookie doesn't work either: the session is gone on the server.
    other = app.test_client()
    other.set_cookie("blog_admin_dev", token, path="/admin/blog")
    assert other.get("/admin/blog").status_code == 302


def test_csrf_required_for_changes(admin):
    article = admin.create()
    r = admin.client.post(f"/admin/blog/articles/{article['id']}/publish", data={})
    assert r.status_code == 400
    r = admin.client.post(f"/admin/blog/api/articles/{article['id']}", json={"title": "x"},
                          headers={"X-CSRF-Token": "forged"})
    assert r.status_code == 400
    r = admin.client.post(f"/admin/blog/articles/{article['id']}/publish", data={"csrf_token": admin.csrf})
    assert r.status_code == 302


def test_login_rate_limit(client):
    for _ in range(5):
        client.post("/admin/blog/login", data={"username": "admin", "password": "nope nope nope"})
    r = client.post("/admin/blog/login", data={"username": "admin", "password": PASSWORD})
    assert r.status_code == 429
    assert client.get("/admin/blog").status_code == 302


def test_rate_limit_is_per_visitor_ip(client, app):
    for _ in range(5):
        client.post("/admin/blog/login", data={"username": "admin", "password": "bad bad bad bad"},
                    headers={"CF-Connecting-IP": "203.0.113.9"})
    r = client.post("/admin/blog/login", data={"username": "admin", "password": PASSWORD},
                    headers={"CF-Connecting-IP": "198.51.100.4"})
    assert r.status_code == 302


def test_password_change_signs_out_other_sessions(app):
    first = app.test_client()
    admin = Admin(first)
    second = app.test_client()
    Admin(second)
    r = first.post("/admin/blog/account", data={
        "csrf_token": admin.csrf, "form": "password", "current_password": PASSWORD,
        "new_password": "another long passphrase", "confirm_password": "another long passphrase",
    })
    assert r.status_code == 302
    assert first.get("/admin/blog").status_code == 200
    assert second.get("/admin/blog").status_code == 302
    r = app.test_client().post("/admin/blog/login", data={"username": "admin", "password": "another long passphrase"})
    assert r.status_code == 302


def test_passwords_are_hashed(app):
    from blogapp.db import connect

    conn = connect(app.config["DATABASE"])
    stored = conn.execute("SELECT password_hash FROM users").fetchone()[0]
    conn.close()
    assert PASSWORD not in stored
    assert stored.startswith(("scrypt:", "pbkdf2:"))


def test_no_admin_account_by_default(data_dir):
    from conftest import make_app

    app = make_app(data_dir)
    client = app.test_client()
    page = client.get("/admin/blog/login").get_data(as_text=True)
    assert "create-admin" in page
    assert client.post("/admin/blog/login", data={"username": "admin", "password": "admin"}).status_code == 401


def test_open_redirect_blocked(client):
    r = client.post("/admin/blog/login", data={"username": "admin", "password": PASSWORD, "next": "https://evil.example"})
    assert r.headers["Location"].endswith("/admin/blog/")


def test_admin_pages_not_cached_or_indexed(admin):
    r = admin.client.get("/admin/blog")
    assert r.headers["Cache-Control"] == "no-store"
    assert "noindex" in r.headers["X-Robots-Tag"]


def test_no_csrf_token_leaks_to_signed_out_visitors(client):
    html = client.get("/admin/blog/login").get_data(as_text=True)
    assert "csrf_token" not in html
