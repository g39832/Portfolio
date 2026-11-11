from datetime import timedelta

from blogapp.util import to_str, utcnow


def test_create_and_edit(admin):
    article = admin.create(title="My First Post", body_md="# Not this\n\n## Section\n\nHello there friend.",
                           tags="Linux, nginx", excerpt="Short intro")
    assert article["slug"] == "my-first-post"
    assert article["status"] == "draft"
    r = admin.save(article, title="My First Post, edited", body_md="Changed text", tags="nginx")
    assert r.status_code == 200, r.get_json()
    saved = r.get_json()["article"]
    assert saved["version"] == article["version"] + 1
    page = admin.client.get(f"/admin/blog/articles/{article['id']}/edit").get_data(as_text=True)
    assert "My First Post, edited" in page and "Changed text" in page


def test_draft_is_never_public(admin, app):
    article = admin.create(title="Secret draft", body_md="Top secret words")
    anon = app.test_client()
    assert anon.get(f"/blog/{article['slug']}").status_code == 404
    assert b"Secret draft" not in anon.get("/blog").data
    assert b"Secret draft" not in anon.get("/blog?q=secret").data
    assert b"secret-draft" not in anon.get("/sitemap.xml").data
    assert b"Secret draft" not in anon.get("/blog/feed.xml").data


def test_publish_and_unpublish(admin, app):
    article = admin.publish(title="Going live", body_md="Live text")
    anon = app.test_client()
    r = anon.get("/blog/going-live")
    assert r.status_code == 200
    assert b"Live text" in r.data
    assert admin.action(article["id"], "unpublish").status_code == 200
    assert anon.get("/blog/going-live").status_code == 404


def test_publish_requires_title_and_body(admin):
    article = admin.create(title="", body_md="")
    r = admin.action(article["id"], "publish")
    assert r.status_code == 400


def test_editing_published_article_keeps_it_published(admin, app):
    article = admin.publish(title="Stable", body_md="v1")
    r = admin.save(article, title="Stable", body_md="v2 text")
    assert r.status_code == 200
    assert r.get_json()["article"]["status"] == "published"
    body = app.test_client().get("/blog/stable").get_data(as_text=True)
    assert "v2 text" in body


def test_published_articles_are_not_autosaved(admin):
    article = admin.publish(title="No autosave", body_md="v1")
    r = admin.save(article, body_md="half-typed", autosave=True)
    assert r.status_code == 400
    assert r.get_json()["field"] == "autosave"


def test_autosave_conflict_never_overwrites_newer_content(admin):
    article = admin.create(title="Conflict", body_md="original")
    newer = admin.save(article, title="Conflict", body_md="newer from tab B").get_json()["article"]
    # Tab A still thinks it has the original version.
    stale = admin.save(article, title="Conflict", body_md="stale from tab A", autosave=True)
    assert stale.status_code == 409
    page = admin.client.get(f"/admin/blog/articles/{article['id']}/edit").get_data(as_text=True)
    assert "newer from tab B" in page and "stale from tab A" not in page
    # Saving on top of the latest version works.
    assert admin.save(newer, body_md="continued").status_code == 200


def test_schedule_publishes_only_when_time_arrives(admin, app):
    article = admin.create(title="Future post", body_md="Coming soon")
    r = admin.action(article["id"], "schedule", publish_at="2099-01-01T09:00")
    assert r.status_code == 200, r.get_json()
    assert r.get_json()["article"]["status"] == "scheduled"
    anon = app.test_client()
    assert anon.get("/blog/future-post").status_code == 404

    # Move the scheduled time into the past: it becomes visible without any background job.
    from blogapp.db import connect
    conn = connect(app.config["DATABASE"])
    conn.execute("UPDATE articles SET published_at = ? WHERE id = ?",
                 (to_str(utcnow() - timedelta(minutes=1)), article["id"]))
    conn.close()
    assert anon.get("/blog/future-post").status_code == 200
    assert b"future-post" in anon.get("/sitemap.xml").data


def test_schedule_in_past_rejected(admin):
    article = admin.create(title="Past", body_md="x")
    r = admin.action(article["id"], "schedule", publish_at="2001-01-01T09:00")
    assert r.status_code == 400


def test_archive_and_restore(admin, app):
    article = admin.publish(title="Old news", body_md="text")
    anon = app.test_client()
    assert admin.action(article["id"], "archive").get_json()["article"]["status"] == "archived"
    assert anon.get("/blog/old-news").status_code == 404
    assert admin.client.get("/admin/blog?status=archived").get_data(as_text=True).count("Old news") >= 1
    assert admin.action(article["id"], "restore").get_json()["article"]["status"] == "draft"
    assert anon.get("/blog/old-news").status_code == 404
    admin.action(article["id"], "publish")
    assert anon.get("/blog/old-news").status_code == 200


def test_delete_needs_confirmation(admin, app):
    article = admin.publish(title="Delete me", body_md="bye")
    r = admin.client.post(f"/admin/blog/articles/{article['id']}/delete", data={"csrf_token": admin.csrf})
    assert r.status_code == 400
    assert app.test_client().get("/blog/delete-me").status_code == 200
    page = admin.client.get(f"/admin/blog/articles/{article['id']}/delete")
    assert b"permanently" in page.data
    r = admin.client.post(f"/admin/blog/articles/{article['id']}/delete",
                          data={"csrf_token": admin.csrf, "confirm": "yes"})
    assert r.status_code == 302
    assert app.test_client().get("/blog/delete-me").status_code == 404
    assert admin.client.get(f"/admin/blog/articles/{article['id']}/edit").status_code == 404


def test_duplicate(admin):
    article = admin.publish(title="Original", body_md="Same body", tags="pi, linux")
    r = admin.action(article["id"], "duplicate")
    assert r.status_code == 200
    edit_url = r.get_json()["edit_url"]
    page = admin.client.get(edit_url).get_data(as_text=True)
    assert "Original (copy)" in page and "Same body" in page and "linux" in page
    assert 'badge-draft' in page


def test_duplicate_slugs_prevented(admin):
    first = admin.create(title="Same title", body_md="a")
    second = admin.create(title="Same title", body_md="b")
    assert first["slug"] == "same-title"
    assert second["slug"] == "same-title-2"
    # Typing an existing slug by hand is refused, not silently changed.
    r = admin.save(second, slug="same-title", slug_auto=False)
    assert r.status_code == 400
    assert r.get_json()["field"] == "slug"


def test_invalid_and_reserved_slugs_refused(admin):
    article = admin.create(title="Slugs", body_md="a")
    for bad in ["Has Spaces", "../etc", "feed.xml", "category", "-dash-"]:
        r = admin.save(article, slug=bad, slug_auto=False)
        assert r.status_code == 400, bad


def test_slug_kept_when_title_changes_after_publishing(admin, app):
    article = admin.publish(title="Permanent URL", body_md="x")
    r = admin.save(article, title="A totally different title", slug="", slug_auto=True)
    assert r.get_json()["article"]["slug"] == "permanent-url"
    assert app.test_client().get("/blog/permanent-url").status_code == 200


def test_changed_slug_redirects_from_old_url(admin, app):
    article = admin.publish(title="Rename me", body_md="x")
    r = admin.save(article, slug="renamed", slug_auto=False)
    assert r.status_code == 200
    anon = app.test_client()
    old = anon.get("/blog/rename-me")
    assert old.status_code == 301 and old.headers["Location"].endswith("/blog/renamed")
    assert anon.get("/blog/renamed").status_code == 200


def test_content_survives_round_trip(admin):
    tricky = "Quotes \" ' < > & emoji 🐙\n\n```python\nprint('<b>')\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n"
    article = admin.create(title="Round trip ✓", body_md=tricky)
    for _ in range(3):
        article = admin.save(article, title="Round trip ✓", body_md=tricky).get_json()["article"]
    from blogapp.db import connect
    conn = connect(admin.client.application.config["DATABASE"])
    stored = conn.execute("SELECT body_md, title FROM articles WHERE id = ?", (article["id"],)).fetchone()
    conn.close()
    assert stored[0] == tricky
    assert stored[1] == "Round trip ✓"


def test_revisions_and_restore(admin):
    article = admin.create(title="History", body_md="first version")
    article = admin.save(article, body_md="second version").get_json()["article"]
    page = admin.client.get(f"/admin/blog/articles/{article['id']}/revisions").get_data(as_text=True)
    assert "Created" in page and "Saved" in page
    from blogapp.db import connect
    conn = connect(admin.client.application.config["DATABASE"])
    first_rev = conn.execute("SELECT id FROM revisions WHERE article_id = ? ORDER BY id LIMIT 1", (article["id"],)).fetchone()[0]
    conn.close()
    r = admin.client.post(f"/admin/blog/articles/{article['id']}/revisions/{first_rev}/restore", data={"csrf_token": admin.csrf})
    assert r.status_code == 302
    page = admin.client.get(f"/admin/blog/articles/{article['id']}/edit").get_data(as_text=True)
    assert "first version" in page


def test_categories_and_tags_management(admin, app):
    r = admin.client.post("/admin/blog/categories", data={"csrf_token": admin.csrf, "name": "Robotics", "sort_order": "5"})
    assert r.status_code == 302
    from blogapp.db import connect
    conn = connect(app.config["DATABASE"])
    cat_id = conn.execute("SELECT id FROM categories WHERE slug = 'robotics'").fetchone()[0]
    conn.close()
    admin.publish(title="Rover", body_md="Wheels", category_id=cat_id, tags="Arduino, C")
    anon = app.test_client()
    assert b"Robotics" in anon.get("/blog").data
    # Rename the category and the tag; the public pages follow.
    admin.client.post("/admin/blog/categories", data={"csrf_token": admin.csrf, "id": cat_id, "name": "Robots", "slug": "robots"})
    assert anon.get("/blog/category/robots").status_code == 200
    conn = connect(app.config["DATABASE"])
    tag_id = conn.execute("SELECT id FROM tags WHERE name = 'Arduino'").fetchone()[0]
    conn.close()
    admin.client.post("/admin/blog/tags", data={"csrf_token": admin.csrf, "id": tag_id, "name": "Microcontrollers"})
    assert b"Microcontrollers" in anon.get("/blog/rover").data
    # Deleting the category keeps the article.
    admin.client.post(f"/admin/blog/categories/{cat_id}/delete", data={"csrf_token": admin.csrf})
    assert anon.get("/blog/rover").status_code == 200
    assert anon.get("/blog/category/robots").status_code == 404


def test_seeded_categories_exist(admin):
    page = admin.client.get("/admin/blog/categories").get_data(as_text=True)
    for name in ["DevOps", "Linux", "Software Development", "Infrastructure", "Homelab", "Databases",
                 "Networking", "Projects", "Engineering Notes"]:
        assert name in page


def test_dashboard_lists_by_status(admin):
    admin.create(title="A draft", body_md="x")
    admin.publish(title="A live one", body_md="x")
    page = admin.client.get("/admin/blog?status=draft").get_data(as_text=True)
    assert "A draft" in page and "A live one" not in page
    page = admin.client.get("/admin/blog?status=published").get_data(as_text=True)
    assert "A live one" in page and "A draft" not in page
    page = admin.client.get("/admin/blog").get_data(as_text=True)
    assert "Recently edited" in page
    # No analytics of any kind.
    assert "page views" not in page.lower() and "visitors" not in page.lower()


def test_preview_is_admin_only(admin, app):
    article = admin.create(title="Preview me", body_md="**bold**")
    r = admin.client.get(f"/admin/blog/articles/{article['id']}/preview")
    assert r.status_code == 200 and b"<strong>bold</strong>" in r.data and b"noindex" in r.data
    assert app.test_client().get(f"/admin/blog/articles/{article['id']}/preview").status_code == 302
    r = admin.client.post("/admin/blog/api/preview", json={"body_md": "# Hi\n\n<script>x</script>"}, headers=admin.headers())
    data = r.get_json()
    assert "<script>" not in data["html"] and data["has_h1"] is True
