import re
import xml.etree.ElementTree as ET


def test_empty_blog_page(client):
    r = client.get("/blog")
    assert r.status_code == 200
    html = r.get_data(as_text=True)
    assert "No articles have been published yet" in html
    assert "Featured" not in html  # empty sections are not shown
    assert 'href="/blog"' in html  # Blog in the navigation


def test_landing_page_shows_featured_and_list(admin, app):
    for i in range(3):
        admin.publish(title=f"Post {i}", body_md=f"Body {i}")
    admin.publish(title="The featured one", body_md="Star", featured=True, excerpt="Read me first")
    html = app.test_client().get("/blog").get_data(as_text=True)
    assert "Featured" in html and "The featured one" in html and "Read me first" in html
    assert html.count("The featured one") >= 1
    assert "min read" in html
    # The featured article is not repeated in the list below it.
    listing = html.split("list-heading")[1]
    assert "The featured one" not in listing


def test_article_page_content(admin, app):
    md = ("Intro paragraph.\n\n## First part\n\nText.\n\n## Second part\n\n```python\nprint('hi')\n```\n\n"
          "### Detail\n\nMore.\n\n| A | B |\n|:-:|--:|\n| 1 | 2 |\n\n> quote\n\n---\n\n~~gone~~ `inline`")
    from blogapp.db import connect
    conn = connect(app.config["DATABASE"])
    cat_id = conn.execute("SELECT id FROM categories WHERE slug = 'homelab'").fetchone()[0]
    conn.close()
    admin.publish(title="Building my Raspberry Pi homelab", body_md=md, excerpt="How I built it",
                  category_id=cat_id, tags="raspberry pi, docker", seo_description="Pi homelab guide")
    r = app.test_client().get("/blog/building-my-raspberry-pi-homelab")
    html = r.get_data(as_text=True)
    assert r.status_code == 200
    assert "<h1 class=\"article-title\">Building my Raspberry Pi homelab</h1>" in html
    assert "How I built it" in html and "By Grayson Cox" in html and "min read" in html
    assert "Homelab" in html and "#docker" in html
    assert 'id="first-part"' in html and 'href="#first-part"' in html  # table of contents
    assert 'class="highlight"' in html and '<span class="nb">print</span>' in html  # server-side highlighting
    assert 'class="align-center"' in html and "<blockquote>" in html and "<s>gone</s>" in html
    assert '<meta name="description" content="Pi homelab guide">' in html
    assert '<link rel="canonical" href="https://graysoncodes.org/blog/building-my-raspberry-pi-homelab">' in html
    assert 'property="og:type" content="article"' in html
    assert '"@type": "BlogPosting"' in html
    assert "← Back to all articles" in html


def test_article_html_is_sanitized(admin, app):
    admin.publish(title="XSS attempt <script>", body_md=(
        "<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[click](javascript:alert(1))\n\n"
        "![x](javascript:alert(1))\n\n<iframe src='https://evil'></iframe>"))
    html = app.test_client().get("/blog/xss-attempt-script").get_data(as_text=True)
    body = html.split('class="prose"')[1].split("</article>")[0]
    assert "<script" not in body and "<iframe" not in body and "onerror=" not in body.replace("onerror=alert", "")
    assert 'href="javascript' not in body and 'src="javascript' not in body
    assert "<title>XSS attempt &lt;script&gt;" in html


def test_security_headers(client, admin):
    admin.publish(title="Headers", body_md="x")
    r = client.get("/blog/headers")
    csp = r.headers["Content-Security-Policy"]
    assert "script-src 'self'" in csp and "unsafe-inline" not in csp and "frame-ancestors 'none'" in csp
    assert r.headers["X-Content-Type-Options"] == "nosniff"
    assert r.headers["X-Frame-Options"] == "DENY"
    assert not re.search(r"<script>(?!\s*$)", r.get_data(as_text=True))  # no inline scripts


def test_search(admin, app):
    admin.publish(title="Nginx reverse proxy", body_md="Configure upstream servers", tags="web")
    admin.publish(title="SQLite tuning", body_md="WAL mode and pragmas", tags="databases")
    admin.publish(title="Untagged", body_md="Nothing relevant", tags="cloudflare")
    anon = app.test_client()
    assert "Nginx reverse proxy" in anon.get("/blog?q=nginx").get_data(as_text=True)          # title
    page = anon.get("/blog?q=pragmas").get_data(as_text=True)                                 # content
    assert "SQLite tuning" in page and "Nginx reverse proxy" not in page
    assert "Untagged" in anon.get("/blog?q=cloudflare").get_data(as_text=True)                # tags
    assert "No articles match" in anon.get("/blog?q=kubernetes").get_data(as_text=True)
    assert "noindex" in anon.get("/blog?q=nginx").get_data(as_text=True)
    # LIKE wildcards are treated literally.
    assert "No articles match" in anon.get("/blog?q=%25%25").get_data(as_text=True)


def test_category_and_tag_filters(admin, app):
    from blogapp.db import connect
    conn = connect(app.config["DATABASE"])
    linux = conn.execute("SELECT id FROM categories WHERE slug = 'linux'").fetchone()[0]
    dbs = conn.execute("SELECT id FROM categories WHERE slug = 'databases'").fetchone()[0]
    conn.close()
    admin.publish(title="Systemd timers", body_md="x", category_id=linux, tags="systemd")
    admin.publish(title="Postgres backups", body_md="x", category_id=dbs, tags="backups")
    anon = app.test_client()
    page = anon.get("/blog/category/linux").get_data(as_text=True)
    assert "Systemd timers" in page and "Postgres backups" not in page
    page = anon.get("/blog/tag/backups").get_data(as_text=True)
    assert "Postgres backups" in page and "Systemd timers" not in page
    assert anon.get("/blog/category/networking").status_code == 404  # no public articles -> hidden
    assert anon.get("/blog/category/nope").status_code == 404


def test_pagination_newest_first(admin, app):
    for i in range(8):  # PER_PAGE is 3 in tests; the newest one is featured on page 1
        admin.publish(title=f"Numbered {i}", body_md="x")
    anon = app.test_client()
    page1 = anon.get("/blog").get_data(as_text=True)
    assert "Page 1 of 3" in page1 and 'rel="next"' in page1
    assert page1.index("Numbered 6") < page1.index("Numbered 5")
    page3 = anon.get("/blog?page=3").get_data(as_text=True)
    assert "Numbered 0" in page3 and 'rel="prev"' in page3
    assert anon.get("/blog?page=9").status_code == 404
    assert anon.get("/blog?page=abc").status_code == 200


def test_related_articles(admin, app):
    admin.publish(title="Docker on the Pi", body_md="x", tags="docker, pi")
    admin.publish(title="Docker compose tips", body_md="x", tags="docker")
    admin.publish(title="Unrelated", body_md="x", tags="cooking")
    html = app.test_client().get("/blog/docker-on-the-pi").get_data(as_text=True)
    related = html.split("Related articles")[1]
    assert "Docker compose tips" in related and "Unrelated" not in related


def test_rss_feed(admin, app):
    admin.create(title="Draft only", body_md="x")
    admin.publish(title="Feed item", body_md="![img](/media/x.png) & more", excerpt="Summary <b>")
    r = app.test_client().get("/blog/feed.xml")
    assert r.status_code == 200 and r.mimetype == "application/rss+xml"
    root = ET.fromstring(r.data)
    items = root.findall("./channel/item")
    assert [i.findtext("title") for i in items] == ["Feed item"]
    assert items[0].findtext("link") == "https://graysoncodes.org/blog/feed-item"
    assert items[0].findtext("description") == "Summary <b>"
    content = items[0].findtext("{http://purl.org/rss/1.0/modules/content/}encoded")
    assert 'src="https://graysoncodes.org/media/x.png"' in content


def test_sitemap(admin, app):
    admin.publish(title="In the sitemap", body_md="x")
    admin.create(title="Not in the sitemap", body_md="x")
    r = app.test_client().get("/sitemap.xml")
    root = ET.fromstring(r.data)
    locs = [e.text for e in root.iter("{http://www.sitemaps.org/schemas/sitemap/0.9}loc")]
    assert "https://graysoncodes.org/" in locs
    assert "https://graysoncodes.org/blog" in locs
    assert "https://graysoncodes.org/blog/in-the-sitemap" in locs
    assert not any("admin" in l or "not-in-the-sitemap" in l for l in locs)


def test_conditional_get(admin, app):
    admin.publish(title="Etag", body_md="x")
    anon = app.test_client()
    first = anon.get("/blog/etag")
    etag = first.headers["ETag"]
    again = anon.get("/blog/etag", headers={"If-None-Match": etag})
    assert again.status_code == 304


def test_mobile_layout_basics(admin, app):
    admin.publish(title="Phone friendly", body_md="```\n" + "x" * 300 + "\n```\n\n| a |\n|---|\n| b |")
    html = app.test_client().get("/blog/phone-friendly").get_data(as_text=True)
    assert '<meta name="viewport" content="width=device-width, initial-scale=1">' in html
    assert '<div class="table-wrap">' in html  # wide tables scroll inside their own box
    css = app.test_client().get("/blog/static/blog.css").get_data(as_text=True)
    assert ".code-block pre { margin: 0; padding: 0.95rem 1rem; overflow-x: auto;" in css
    assert "@media (max-width: 560px)" in css and "max-width: 46rem" in css
    assert "@keyframes" not in css and "animation" not in css  # nothing moves


def test_trailing_slash_and_unknown(client):
    r = client.get("/blog/")
    assert r.status_code == 301
    assert client.get("/blog/does-not-exist").status_code == 404
