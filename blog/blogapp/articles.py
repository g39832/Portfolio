"""Article storage and the publishing workflow.

Statuses: draft, published, scheduled, archived.

An article is public when its status is 'published' or 'scheduled' and its
published_at time has passed. That single rule means scheduled articles go
live at the right moment without any background job or cron: every public
query simply compares published_at with the current time.
"""
import json
import re

from .db import get_db, transaction
from .media import lookup_for_render, url_for_path
from .render import plain_excerpt, render_markdown
from .util import Page, now_str, slugify, valid_slug

STATUSES = ("draft", "published", "scheduled", "archived")
PUBLIC_SQL = "a.status IN ('published', 'scheduled') AND a.published_at IS NOT NULL AND a.published_at <= ?"
MAX_TAGS = 15
MAX_REVISIONS = 50

LIST_COLUMNS = """
    a.id, a.title, a.slug, a.excerpt, a.body_md, a.status, a.featured, a.word_count, a.reading_minutes,
    a.published_at, a.content_updated_at, a.updated_at, a.created_at, a.version,
    a.featured_image_alt, a.category_id,
    c.name AS category_name, c.slug AS category_slug,
    m.path AS image_path, m.thumb_path AS image_thumb_path, m.medium_path AS image_medium_path,
    m.width AS image_width, m.height AS image_height, m.alt_text AS image_alt
"""
LIST_JOINS = """
    FROM articles a
    LEFT JOIN categories c ON c.id = a.category_id
    LEFT JOIN media m ON m.id = a.featured_image_id
"""


class ValidationError(ValueError):
    def __init__(self, message, field=None):
        super().__init__(message)
        self.field = field


class Conflict(Exception):
    def __init__(self, current):
        super().__init__("This article was saved somewhere else since you opened it.")
        self.current = current


class NotFound(Exception):
    pass


def like_escape(text):
    return "%" + text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"


def is_public(row, now=None):
    now = now or now_str()
    return row["status"] in ("published", "scheduled") and bool(row["published_at"]) and row["published_at"] <= now


def effective_status(row, now=None):
    """'scheduled' articles whose time has come are shown as published."""
    if row["status"] == "scheduled" and is_public(row, now):
        return "published"
    return row["status"]


def _decorate(rows):
    """Turn rows into dicts and attach tags with a single extra query (no N+1)."""
    items = [dict(r) for r in rows]
    if not items:
        return items
    ids = [item["id"] for item in items]
    marks = ",".join("?" * len(ids))
    tag_rows = get_db().execute(
        f"SELECT at.article_id, t.name, t.slug FROM article_tags at JOIN tags t ON t.id = at.tag_id"
        f" WHERE at.article_id IN ({marks}) ORDER BY t.name COLLATE NOCASE",
        ids,
    ).fetchall()
    by_article = {}
    for t in tag_rows:
        by_article.setdefault(t["article_id"], []).append({"name": t["name"], "slug": t["slug"]})
    for item in items:
        item["tags"] = by_article.get(item["id"], [])
        item["image_url"] = url_for_path(item.get("image_path"))
        item["image_thumb_url"] = url_for_path(item.get("image_thumb_path") or item.get("image_path"))
        item["image_medium_url"] = url_for_path(item.get("image_medium_path") or item.get("image_path"))
        item["summary"] = item.get("excerpt") or plain_excerpt(item.get("body_md", ""))
        item["effective_status"] = effective_status(item)
    return items


# ---- Public queries ---------------------------------------------------------

def _filters(query="", category_slug=None, tag_slug=None):
    where = [PUBLIC_SQL]
    params = [now_str()]
    if category_slug:
        where.append("c.slug = ?")
        params.append(category_slug)
    if tag_slug:
        where.append(
            "EXISTS (SELECT 1 FROM article_tags at JOIN tags t ON t.id = at.tag_id"
            " WHERE at.article_id = a.id AND t.slug = ?)"
        )
        params.append(tag_slug)
    for term in search_terms(query):
        like = like_escape(term)
        where.append(
            "(a.title LIKE ? ESCAPE '\\' OR a.excerpt LIKE ? ESCAPE '\\' OR a.body_md LIKE ? ESCAPE '\\'"
            " OR EXISTS (SELECT 1 FROM article_tags at2 JOIN tags t2 ON t2.id = at2.tag_id"
            " WHERE at2.article_id = a.id AND t2.name LIKE ? ESCAPE '\\'))"
        )
        params.extend([like, like, like, like])
    return " AND ".join(where), params


def search_terms(query):
    words = re.findall(r"[^\s\"']+", (query or "")[:200])
    return [w for w in words if len(w) >= 2][:6]


def list_public(page=1, per_page=9, query="", category_slug=None, tag_slug=None, exclude_id=None):
    where, params = _filters(query, category_slug, tag_slug)
    if exclude_id:
        where += " AND a.id != ?"
        params.append(exclude_id)
    db = get_db()
    total = db.execute(f"SELECT COUNT(*) {LIST_JOINS} WHERE {where}", params).fetchone()[0]
    rows = db.execute(
        f"SELECT {LIST_COLUMNS} {LIST_JOINS} WHERE {where}"
        " ORDER BY a.published_at DESC, a.id DESC LIMIT ? OFFSET ?",
        params + [per_page, (page - 1) * per_page],
    ).fetchall()
    return Page(_decorate(rows), page, per_page, total)


def featured_public():
    """The newest article marked 'featured', or else the newest article."""
    rows = get_db().execute(
        f"SELECT {LIST_COLUMNS} {LIST_JOINS} WHERE {PUBLIC_SQL}"
        " ORDER BY a.featured DESC, a.published_at DESC, a.id DESC LIMIT 1",
        (now_str(),),
    ).fetchall()
    items = _decorate(rows)
    return items[0] if items else None


def all_public(limit=None):
    sql = f"SELECT {LIST_COLUMNS}, a.body_html {LIST_JOINS} WHERE {PUBLIC_SQL} ORDER BY a.published_at DESC, a.id DESC"
    params = [now_str()]
    if limit:
        sql += " LIMIT ?"
        params.append(limit)
    return _decorate(get_db().execute(sql, params).fetchall())


def get_public(slug):
    """Return (article, redirect_slug). Unpublished articles are invisible."""
    db = get_db()
    row = db.execute(
        f"SELECT {LIST_COLUMNS}, a.body_html, a.toc_json, a.seo_description, a.author_id,"
        f" u.display_name AS author_name {LIST_JOINS} LEFT JOIN users u ON u.id = a.author_id"
        f" WHERE a.slug = ? AND {PUBLIC_SQL}",
        (slug, now_str()),
    ).fetchone()
    if row is not None:
        return _decorate([row])[0], None
    moved = db.execute(
        f"SELECT a.slug FROM slug_redirects r JOIN articles a ON a.id = r.article_id"
        f" WHERE r.old_slug = ? AND {PUBLIC_SQL}",
        (slug, now_str()),
    ).fetchone()
    return None, (moved["slug"] if moved else None)


def related_public(article, limit=3):
    """Articles sharing tags or the category, best matches first, in one query."""
    rows = get_db().execute(
        f"""SELECT {LIST_COLUMNS},
               (SELECT COUNT(*) FROM article_tags x JOIN article_tags y ON y.tag_id = x.tag_id
                 WHERE x.article_id = a.id AND y.article_id = ?) * 2
               + (CASE WHEN a.category_id IS NOT NULL AND a.category_id = ? THEN 1 ELSE 0 END) AS score
            {LIST_JOINS}
            WHERE {PUBLIC_SQL} AND a.id != ?
            ORDER BY score DESC, a.published_at DESC LIMIT ?""",
        (article["id"], article["category_id"], now_str(), article["id"], limit),
    ).fetchall()
    return _decorate([r for r in rows if r["score"] > 0])


def public_categories():
    return get_db().execute(
        f"SELECT c.name, c.slug, c.description, COUNT(a.id) AS article_count FROM categories c"
        f" JOIN articles a ON a.category_id = c.id AND {PUBLIC_SQL}"
        " GROUP BY c.id ORDER BY c.sort_order, c.name COLLATE NOCASE",
        (now_str(),),
    ).fetchall()


def public_tags(limit=40):
    return get_db().execute(
        f"SELECT t.name, t.slug, COUNT(a.id) AS article_count FROM tags t"
        f" JOIN article_tags at ON at.tag_id = t.id JOIN articles a ON a.id = at.article_id AND {PUBLIC_SQL}"
        " GROUP BY t.id ORDER BY article_count DESC, t.name COLLATE NOCASE LIMIT ?",
        (now_str(), limit),
    ).fetchall()


def last_public_change():
    row = get_db().execute(
        f"SELECT MAX(COALESCE(a.content_updated_at, a.published_at)) FROM articles a WHERE {PUBLIC_SQL}",
        (now_str(),),
    ).fetchone()
    return row[0]


# ---- Admin queries ----------------------------------------------------------

def status_counts():
    now = now_str()
    rows = get_db().execute(
        "SELECT CASE WHEN status = 'scheduled' AND published_at <= ? THEN 'published' ELSE status END AS s,"
        " COUNT(*) FROM articles GROUP BY s",
        (now,),
    ).fetchall()
    counts = {s: 0 for s in STATUSES}
    for s, n in rows:
        counts[s] = n
    counts["all"] = sum(counts[s] for s in STATUSES)
    return counts


def list_admin(status=None, query="", page=1, per_page=20, order="updated"):
    where, params = ["1 = 1"], []
    now = now_str()
    if status == "published":
        where.append(f"({PUBLIC_SQL})")
        params.append(now)
    elif status == "scheduled":
        where.append("a.status = 'scheduled' AND a.published_at > ?")
        params.append(now)
    elif status in ("draft", "archived"):
        where.append("a.status = ?")
        params.append(status)
    for term in search_terms(query):
        like = like_escape(term)
        where.append("(a.title LIKE ? ESCAPE '\\' OR a.body_md LIKE ? ESCAPE '\\' OR a.slug LIKE ? ESCAPE '\\')")
        params.extend([like, like, like])
    clause = " AND ".join(where)
    order_by = "a.updated_at DESC, a.id DESC"
    if order == "published":
        order_by = "a.published_at DESC, a.id DESC"
    db = get_db()
    total = db.execute(f"SELECT COUNT(*) {LIST_JOINS} WHERE {clause}", params).fetchone()[0]
    rows = db.execute(
        f"SELECT {LIST_COLUMNS} {LIST_JOINS} WHERE {clause} ORDER BY {order_by} LIMIT ? OFFSET ?",
        params + [per_page, (page - 1) * per_page],
    ).fetchall()
    return Page(_decorate(rows), page, per_page, total)


def get_article(article_id):
    db = get_db()
    row = db.execute(
        f"SELECT {LIST_COLUMNS}, a.body_html, a.toc_json, a.seo_description, a.featured_image_id,"
        f" a.author_id, u.display_name AS author_name {LIST_JOINS} LEFT JOIN users u ON u.id = a.author_id"
        " WHERE a.id = ?",
        (article_id,),
    ).fetchone()
    if row is None:
        raise NotFound()
    return _decorate([row])[0]


def article_state(article):
    """What the editor needs to know after a save."""
    return {
        "id": article["id"],
        "slug": article["slug"],
        "version": article["version"],
        "status": article["status"],
        "effective_status": article["effective_status"],
        "is_public": is_public(article),
        "published_at": article["published_at"],
        "updated_at": article["updated_at"],
        "word_count": article["word_count"],
        "reading_minutes": article["reading_minutes"],
    }


# ---- Saving -----------------------------------------------------------------

def clean_tag_names(raw):
    if isinstance(raw, str):
        raw = raw.split(",")
    names, seen = [], set()
    for name in raw or []:
        name = " ".join(str(name).split())[:40]
        if name and name.lower() not in seen:
            seen.add(name.lower())
            names.append(name)
    return names[:MAX_TAGS]


def _set_tags(db, article_id, names):
    db.execute("DELETE FROM article_tags WHERE article_id = ?", (article_id,))
    for name in names:
        row = db.execute("SELECT id FROM tags WHERE name = ?", (name,)).fetchone()
        if row is None:
            base = slugify(name, 40) or "tag"
            slug, n = base, 2
            while db.execute("SELECT 1 FROM tags WHERE slug = ?", (slug,)).fetchone():
                slug = f"{base}-{n}"
                n += 1
            tag_id = db.execute("INSERT INTO tags (name, slug) VALUES (?, ?)", (name, slug)).lastrowid
        else:
            tag_id = row["id"]
        db.execute("INSERT OR IGNORE INTO article_tags (article_id, tag_id) VALUES (?, ?)", (article_id, tag_id))


def _unique_slug(db, base, article_id=None):
    base = base or "untitled"
    if not valid_slug(base):
        base = f"post-{base}" if base else "untitled"
    slug, n = base, 2
    while True:
        row = db.execute("SELECT id FROM articles WHERE slug = ?", (slug,)).fetchone()
        redirect = db.execute("SELECT article_id FROM slug_redirects WHERE old_slug = ?", (slug,)).fetchone()
        taken = (row and row["id"] != article_id) or (redirect and redirect["article_id"] != article_id)
        if not taken:
            return slug
        slug = f"{base}-{n}"
        n += 1


def _snapshot(db, article_id, reason):
    row = db.execute("SELECT title, excerpt, body_md FROM articles WHERE id = ?", (article_id,)).fetchone()
    last = db.execute(
        "SELECT title, excerpt, body_md FROM revisions WHERE article_id = ? ORDER BY id DESC LIMIT 1",
        (article_id,),
    ).fetchone()
    if last and tuple(last) == tuple(row) and reason in ("Saved", "Autosaved"):
        return  # nothing changed since the last snapshot
    db.execute(
        "INSERT INTO revisions (article_id, title, excerpt, body_md, reason, created_at) VALUES (?,?,?,?,?,?)",
        (article_id, row["title"], row["excerpt"], row["body_md"], reason, now_str()),
    )
    db.execute(
        "DELETE FROM revisions WHERE article_id = ? AND id NOT IN"
        " (SELECT id FROM revisions WHERE article_id = ? ORDER BY id DESC LIMIT ?)",
        (article_id, article_id, MAX_REVISIONS),
    )


def _clean_fields(db, data):
    title = " ".join(str(data.get("title") or "").split())[:200]
    excerpt = str(data.get("excerpt") or "").strip()[:500]
    seo = " ".join(str(data.get("seo_description") or "").split())[:300]
    body = str(data.get("body_md") or "").replace("\r\n", "\n")
    if len(body) > 500_000:
        raise ValidationError("The article is too long (500,000 characters max).", "body_md")
    category_id = data.get("category_id") or None
    if category_id is not None:
        try:
            category_id = int(category_id)
        except (TypeError, ValueError):
            raise ValidationError("Unknown category.", "category_id") from None
        if not db.execute("SELECT 1 FROM categories WHERE id = ?", (category_id,)).fetchone():
            raise ValidationError("Unknown category.", "category_id")
    image_id = data.get("featured_image_id") or None
    if image_id is not None:
        try:
            image_id = int(image_id)
        except (TypeError, ValueError):
            raise ValidationError("Unknown image.", "featured_image_id") from None
        if not db.execute("SELECT 1 FROM media WHERE id = ?", (image_id,)).fetchone():
            raise ValidationError("That image no longer exists.", "featured_image_id")
    return {
        "title": title,
        "excerpt": excerpt,
        "seo_description": seo,
        "body_md": body,
        "category_id": category_id,
        "featured_image_id": image_id,
        "featured_image_alt": " ".join(str(data.get("featured_image_alt") or "").split())[:300],
        "featured": 1 if data.get("featured") in (True, 1, "1", "true", "on") else 0,
        "tags": clean_tag_names(data.get("tags")),
    }


def save_article(article_id, data, user_id=None, base_version=None, autosave=False, force=False):
    """Create (article_id=None) or update an article's content.

    Never changes the status, so editing a published article can't unpublish
    it. Updates are conditional on base_version: if someone saved a newer
    version in between, Conflict is raised instead of overwriting it.
    """
    db = get_db()
    fields = _clean_fields(db, data)
    rendered = render_markdown(fields["body_md"], lookup_for_render)
    requested_slug = str(data.get("slug") or "").strip().lower()
    slug_auto = data.get("slug_auto") in (True, 1, "1", "true", "on")
    now = now_str()

    with transaction(db):
        current = None
        if article_id is not None:
            current = db.execute("SELECT * FROM articles WHERE id = ?", (article_id,)).fetchone()
            if current is None:
                raise NotFound()
            if autosave and is_public(current):
                raise ValidationError("Published articles are not autosaved; use Update.", "autosave")
            if not force and base_version is not None and int(base_version) != current["version"]:
                raise Conflict(dict(current))

        # Slug: generated from the title unless typed by hand.
        if slug_auto or not requested_slug:
            if current is not None and (is_public(current) or current["status"] == "scheduled"):
                slug = current["slug"]  # never silently move a live (or announced) URL
            else:
                slug = _unique_slug(db, slugify(fields["title"]) or "untitled", article_id)
        else:
            slug = requested_slug
            if not valid_slug(slug):
                raise ValidationError(
                    "URL slugs may only use lowercase letters, numbers and single hyphens.", "slug"
                )
            other = db.execute("SELECT id FROM articles WHERE slug = ? AND id != ?", (slug, article_id or 0)).fetchone()
            if other:
                raise ValidationError("Another article already uses that URL slug.", "slug")
            moved = db.execute("SELECT article_id FROM slug_redirects WHERE old_slug = ?", (slug,)).fetchone()
            if moved and moved["article_id"] != article_id:
                # The old URL of another article: it now belongs to this one.
                db.execute("DELETE FROM slug_redirects WHERE old_slug = ?", (slug,))

        values = (
            fields["title"], slug, fields["excerpt"], fields["seo_description"], fields["body_md"],
            rendered["html"], json.dumps(rendered["toc"]), rendered["word_count"], rendered["reading_minutes"],
            fields["featured"], fields["category_id"], fields["featured_image_id"], fields["featured_image_alt"],
        )
        if current is None:
            article_id = db.execute(
                "INSERT INTO articles (title, slug, excerpt, seo_description, body_md, body_html, toc_json,"
                " word_count, reading_minutes, featured, category_id, featured_image_id, featured_image_alt,"
                " status, author_id, created_at, updated_at, version)"
                " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, 'draft', ?, ?, ?, 1)",
                values + (user_id, now, now),
            ).lastrowid
        else:
            content_changed = (
                current["title"] != fields["title"]
                or current["body_md"] != fields["body_md"]
                or current["excerpt"] != fields["excerpt"]
            )
            content_updated_at = current["content_updated_at"]
            if is_public(current) and content_changed:
                content_updated_at = now
            if current["slug"] != slug and is_public(current):
                db.execute(
                    "INSERT OR REPLACE INTO slug_redirects (old_slug, article_id, created_at) VALUES (?,?,?)",
                    (current["slug"], article_id, now),
                )
            db.execute("DELETE FROM slug_redirects WHERE old_slug = ? AND article_id = ?", (slug, article_id))
            db.execute(
                "UPDATE articles SET title = ?, slug = ?, excerpt = ?, seo_description = ?, body_md = ?,"
                " body_html = ?, toc_json = ?, word_count = ?, reading_minutes = ?, featured = ?,"
                " category_id = ?, featured_image_id = ?, featured_image_alt = ?,"
                " content_updated_at = ?, updated_at = ?, version = version + 1 WHERE id = ?",
                values + (content_updated_at, now, article_id),
            )
        _set_tags(db, article_id, fields["tags"])
        if not autosave:
            _snapshot(db, article_id, "Saved" if current is not None else "Created")
    article = get_article(article_id)
    article["has_h1"] = rendered["has_h1"]
    return article


def _bump(db, article_id, sql, params=()):
    db.execute(
        f"UPDATE articles SET {sql}, updated_at = ?, version = version + 1 WHERE id = ?",
        tuple(params) + (now_str(), article_id),
    )


def _require(db, article_id):
    row = db.execute("SELECT * FROM articles WHERE id = ?", (article_id,)).fetchone()
    if row is None:
        raise NotFound()
    return row


def publish(article_id):
    db = get_db()
    now = now_str()
    with transaction(db):
        row = _require(db, article_id)
        if not row["title"].strip():
            raise ValidationError("Give the article a title before publishing.", "title")
        if not row["body_md"].strip():
            raise ValidationError("The article has no content yet.", "body_md")
        # Keep the original date when re-publishing something that was live before.
        published_at = row["published_at"] if row["published_at"] and row["published_at"] <= now else now
        _bump(db, article_id, "status = 'published', published_at = ?", (published_at,))
        _snapshot(db, article_id, "Published")
    return get_article(article_id)


def schedule(article_id, when_utc):
    db = get_db()
    if not when_utc:
        raise ValidationError("Choose a date and time to publish.", "publish_at")
    if when_utc <= now_str():
        raise ValidationError("The scheduled time must be in the future. Use Publish now instead.", "publish_at")
    with transaction(db):
        row = _require(db, article_id)
        if not row["title"].strip() or not row["body_md"].strip():
            raise ValidationError("Add a title and some content before scheduling.", "title")
        _bump(db, article_id, "status = 'scheduled', published_at = ?", (when_utc,))
        _snapshot(db, article_id, "Scheduled")
    return get_article(article_id)


def unpublish(article_id):
    """Back to draft. published_at is kept so re-publishing keeps the original date;
    the article is hidden because drafts are never public."""
    db = get_db()
    with transaction(db):
        row = _require(db, article_id)
        if row["status"] == "scheduled" and not is_public(row):
            _bump(db, article_id, "status = 'draft', published_at = NULL")
        else:
            _bump(db, article_id, "status = 'draft'")
    return get_article(article_id)


def archive(article_id):
    db = get_db()
    with transaction(db):
        _require(db, article_id)
        _bump(db, article_id, "status = 'archived', featured = 0")
    return get_article(article_id)


def restore(article_id):
    db = get_db()
    with transaction(db):
        row = _require(db, article_id)
        if row["status"] != "archived":
            raise ValidationError("Only archived articles can be restored.")
        _bump(db, article_id, "status = 'draft'")
    return get_article(article_id)


def duplicate(article_id, user_id=None):
    db = get_db()
    now = now_str()
    with transaction(db):
        row = _require(db, article_id)
        title = (row["title"] or "Untitled") + " (copy)"
        slug = _unique_slug(db, slugify(title) or "untitled")
        new_id = db.execute(
            "INSERT INTO articles (title, slug, excerpt, seo_description, body_md, body_html, toc_json,"
            " word_count, reading_minutes, featured, category_id, featured_image_id, featured_image_alt,"
            " status, author_id, created_at, updated_at, version)"
            " SELECT ?, ?, excerpt, seo_description, body_md, body_html, toc_json, word_count, reading_minutes,"
            " 0, category_id, featured_image_id, featured_image_alt, 'draft', ?, ?, ?, 1"
            " FROM articles WHERE id = ?",
            (title, slug, user_id or row["author_id"], now, now, article_id),
        ).lastrowid
        db.execute(
            "INSERT INTO article_tags (article_id, tag_id) SELECT ?, tag_id FROM article_tags WHERE article_id = ?",
            (new_id, article_id),
        )
        _snapshot(db, new_id, "Duplicated")
    return get_article(new_id)


def delete(article_id):
    db = get_db()
    with transaction(db):
        _require(db, article_id)
        db.execute("DELETE FROM articles WHERE id = ?", (article_id,))  # tags/revisions/redirects cascade


def revisions(article_id):
    return get_db().execute(
        "SELECT id, title, reason, created_at, length(body_md) AS size FROM revisions"
        " WHERE article_id = ? ORDER BY id DESC",
        (article_id,),
    ).fetchall()


def get_revision(article_id, revision_id):
    row = get_db().execute(
        "SELECT * FROM revisions WHERE id = ? AND article_id = ?", (revision_id, article_id)
    ).fetchone()
    if row is None:
        raise NotFound()
    return row


def restore_revision(article_id, revision_id, user_id=None):
    rev = get_revision(article_id, revision_id)
    current = get_article(article_id)
    data = {
        "title": rev["title"],
        "excerpt": rev["excerpt"],
        "body_md": rev["body_md"],
        "slug": current["slug"],
        "seo_description": current["seo_description"],
        "category_id": current["category_id"],
        "featured_image_id": current["featured_image_id"],
        "featured_image_alt": current["featured_image_alt"],
        "featured": current["featured"],
        "tags": [t["name"] for t in current["tags"]],
    }
    article = save_article(article_id, data, user_id=user_id, force=True)
    db = get_db()
    with transaction(db):
        _snapshot(db, article_id, f"Restored from version #{revision_id}")
    return article


# ---- Categories and tags ----------------------------------------------------

def categories_with_counts():
    return get_db().execute(
        "SELECT c.*, COUNT(a.id) AS article_count FROM categories c LEFT JOIN articles a ON a.category_id = c.id"
        " GROUP BY c.id ORDER BY c.sort_order, c.name COLLATE NOCASE"
    ).fetchall()


def save_category(category_id, name, slug, description, sort_order):
    db = get_db()
    name = " ".join((name or "").split())[:80]
    if not name:
        raise ValidationError("Give the category a name.", "name")
    slug = (slug or "").strip().lower() or slugify(name, 60)
    if not valid_slug(slug):
        raise ValidationError("Slugs may only use lowercase letters, numbers and hyphens.", "slug")
    try:
        sort_order = int(sort_order or 0)
    except ValueError:
        sort_order = 0
    with transaction(db):
        clash = db.execute(
            "SELECT id FROM categories WHERE (name = ? OR slug = ?) AND id != ?", (name, slug, category_id or 0)
        ).fetchone()
        if clash:
            raise ValidationError("A category with that name or slug already exists.", "name")
        if category_id:
            db.execute(
                "UPDATE categories SET name = ?, slug = ?, description = ?, sort_order = ? WHERE id = ?",
                (name, slug, (description or "").strip()[:300], sort_order, category_id),
            )
        else:
            db.execute(
                "INSERT INTO categories (name, slug, description, sort_order, created_at) VALUES (?,?,?,?,?)",
                (name, slug, (description or "").strip()[:300], sort_order, now_str()),
            )


def delete_category(category_id):
    db = get_db()
    with transaction(db):
        db.execute("DELETE FROM categories WHERE id = ?", (category_id,))  # articles keep existing, uncategorised


def tags_with_counts():
    return get_db().execute(
        "SELECT t.*, COUNT(at.article_id) AS article_count FROM tags t"
        " LEFT JOIN article_tags at ON at.tag_id = t.id GROUP BY t.id ORDER BY t.name COLLATE NOCASE"
    ).fetchall()


def rename_tag(tag_id, name, slug=None):
    db = get_db()
    name = " ".join((name or "").split())[:40]
    if not name:
        raise ValidationError("Tag names can't be empty.", "name")
    slug = (slug or "").strip().lower() or slugify(name, 40)
    if not valid_slug(slug):
        raise ValidationError("Slugs may only use lowercase letters, numbers and hyphens.", "slug")
    with transaction(db):
        clash = db.execute(
            "SELECT id FROM tags WHERE (name = ? OR slug = ?) AND id != ?", (name, slug, tag_id)
        ).fetchone()
        if clash:
            # Merging: move every article over to the existing tag.
            db.execute(
                "INSERT OR IGNORE INTO article_tags (article_id, tag_id)"
                " SELECT article_id, ? FROM article_tags WHERE tag_id = ?",
                (clash["id"], tag_id),
            )
            db.execute("DELETE FROM tags WHERE id = ?", (tag_id,))
            return "merged"
        db.execute("UPDATE tags SET name = ?, slug = ? WHERE id = ?", (name, slug, tag_id))
        return "renamed"


def delete_tag(tag_id):
    db = get_db()
    with transaction(db):
        db.execute("DELETE FROM tags WHERE id = ?", (tag_id,))


def all_tag_names():
    return [r[0] for r in get_db().execute("SELECT name FROM tags ORDER BY name COLLATE NOCASE")]
