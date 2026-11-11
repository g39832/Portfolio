-- Initial blog schema. Times are stored as UTC text 'YYYY-MM-DDTHH:MM:SSZ',
-- which sorts and compares correctly as plain strings.

CREATE TABLE users (
    id            INTEGER PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name  TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
);

-- Server-side sessions: the cookie holds a random token; only its SHA-256 is
-- stored, so logging out (or a password change) really ends the session.
CREATE TABLE sessions (
    token_hash   TEXT PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    csrf_token   TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    expires_at   TEXT NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE login_attempts (
    id           INTEGER PRIMARY KEY,
    ip           TEXT NOT NULL,
    username     TEXT NOT NULL,
    attempted_at TEXT NOT NULL,
    succeeded    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_login_attempts_ip ON login_attempts(ip, attempted_at);
CREATE INDEX idx_login_attempts_user ON login_attempts(username, attempted_at);

CREATE TABLE categories (
    id          INTEGER PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
    slug        TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL
);

CREATE TABLE tags (
    id   INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    slug TEXT NOT NULL UNIQUE
);

CREATE TABLE media (
    id            INTEGER PRIMARY KEY,
    path          TEXT NOT NULL UNIQUE,      -- relative to MEDIA_DIR, e.g. 2026/11/ab12cd.jpg
    medium_path   TEXT,                      -- resized copy for article bodies (NULL = use path)
    thumb_path    TEXT,                      -- small copy for cards and the library (NULL = use path)
    original_name TEXT NOT NULL DEFAULT '',
    mime_type     TEXT NOT NULL,
    width         INTEGER NOT NULL,
    height        INTEGER NOT NULL,
    size_bytes    INTEGER NOT NULL,          -- total bytes on disk incl. resized copies
    alt_text      TEXT NOT NULL DEFAULT '',
    caption       TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL
);
CREATE INDEX idx_media_created ON media(created_at);

CREATE TABLE articles (
    -- AUTOINCREMENT: a deleted article's id is never reused (the editor keys its
    -- in-browser backup by id).
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    title              TEXT NOT NULL DEFAULT '',
    slug               TEXT NOT NULL UNIQUE,
    excerpt            TEXT NOT NULL DEFAULT '',
    seo_description    TEXT NOT NULL DEFAULT '',
    body_md            TEXT NOT NULL DEFAULT '',
    body_html          TEXT NOT NULL DEFAULT '',  -- rendered + sanitized on save
    toc_json           TEXT NOT NULL DEFAULT '[]',
    word_count         INTEGER NOT NULL DEFAULT 0,
    reading_minutes    INTEGER NOT NULL DEFAULT 1,
    status             TEXT NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft', 'published', 'scheduled', 'archived')),
    featured           INTEGER NOT NULL DEFAULT 0,
    category_id        INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    featured_image_id  INTEGER REFERENCES media(id) ON DELETE SET NULL,
    featured_image_alt TEXT NOT NULL DEFAULT '',
    author_id          INTEGER REFERENCES users(id) ON DELETE SET NULL,
    published_at       TEXT,          -- go-live time (also the scheduled time)
    content_updated_at TEXT,          -- last time a published article's content changed
    created_at         TEXT NOT NULL,
    updated_at         TEXT NOT NULL,
    version            INTEGER NOT NULL DEFAULT 1   -- bumps on every save; guards autosave
);
CREATE INDEX idx_articles_public ON articles(status, published_at DESC);
CREATE INDEX idx_articles_category ON articles(category_id, status, published_at DESC);
CREATE INDEX idx_articles_updated ON articles(updated_at DESC);
CREATE INDEX idx_articles_featured_image ON articles(featured_image_id);

CREATE TABLE article_tags (
    article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    tag_id     INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (article_id, tag_id)
);
CREATE INDEX idx_article_tags_tag ON article_tags(tag_id, article_id);

-- Old slugs keep working (301 redirect) after a published article is renamed.
CREATE TABLE slug_redirects (
    old_slug   TEXT PRIMARY KEY,
    article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
);

-- Version history: a snapshot on every manual save, publish and restore.
CREATE TABLE revisions (
    id          INTEGER PRIMARY KEY,
    article_id  INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    excerpt     TEXT NOT NULL,
    body_md     TEXT NOT NULL,
    reason      TEXT NOT NULL,
    created_at  TEXT NOT NULL
);
CREATE INDEX idx_revisions_article ON revisions(article_id, id DESC);

INSERT INTO categories (name, slug, sort_order, created_at) VALUES
    ('DevOps', 'devops', 10, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    ('Linux', 'linux', 20, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    ('Software Development', 'software-development', 30, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    ('Infrastructure', 'infrastructure', 40, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    ('Homelab', 'homelab', 50, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    ('Databases', 'databases', 60, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    ('Networking', 'networking', 70, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    ('Projects', 'projects', 80, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    ('Engineering Notes', 'engineering-notes', 90, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));
