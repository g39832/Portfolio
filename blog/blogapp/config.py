"""Settings, read from environment variables (see deploy/blog.env.example)."""
import os
from pathlib import Path

PACKAGE_DIR = Path(__file__).resolve().parent
DEFAULT_DATA_DIR = PACKAGE_DIR.parent / "instance"


def _bool(name, default):
    value = os.environ.get(name)
    if value is None or value == "":
        return default
    return value.strip().lower() in ("1", "true", "yes", "on")


def _int(name, default):
    value = os.environ.get(name)
    return int(value) if value not in (None, "") else default


def load_config(overrides=None):
    data_dir = Path(os.environ.get("BLOG_DATA_DIR") or DEFAULT_DATA_DIR)
    config = {
        # Everything that must survive restarts and updates lives under DATA_DIR.
        "DATA_DIR": data_dir,
        "DATABASE": None,  # derived below unless overridden
        "MEDIA_DIR": None,
        # Public address, used for canonical URLs, the RSS feed and the sitemap.
        # Never derived from the request Host header.
        "SITE_URL": (os.environ.get("BLOG_SITE_URL") or "https://graysoncodes.org").rstrip("/"),
        "SITE_NAME": os.environ.get("BLOG_SITE_NAME") or "Grayson Cox",
        "AUTHOR_NAME": os.environ.get("BLOG_AUTHOR_NAME") or "Grayson Cox",
        "TIMEZONE": os.environ.get("BLOG_TIMEZONE") or "America/Chicago",
        # Cookies are marked Secure in production (the site is served over HTTPS
        # through the Cloudflare Tunnel). Turn off only for local http testing.
        "COOKIE_SECURE": _bool("BLOG_COOKIE_SECURE", True),
        # Behind Cloudflare the real visitor address arrives in CF-Connecting-IP.
        "TRUST_CLOUDFLARE_IP": _bool("BLOG_TRUST_CLOUDFLARE_IP", True),
        "SESSION_IDLE_HOURS": _int("BLOG_SESSION_IDLE_HOURS", 12),
        "SESSION_MAX_DAYS": _int("BLOG_SESSION_MAX_DAYS", 7),
        "LOGIN_MAX_PER_IP": _int("BLOG_LOGIN_MAX_PER_IP", 5),
        "LOGIN_MAX_PER_USER": _int("BLOG_LOGIN_MAX_PER_USER", 20),
        "LOGIN_WINDOW_MINUTES": _int("BLOG_LOGIN_WINDOW_MINUTES", 15),
        "MAX_UPLOAD_MB": _int("BLOG_MAX_UPLOAD_MB", 10),
        "PER_PAGE": _int("BLOG_PER_PAGE", 9),
        "SERVE_MEDIA": _bool("BLOG_SERVE_MEDIA", True),
        "TESTING": False,
    }
    if overrides:
        config.update(overrides)
    data_dir = Path(config["DATA_DIR"])
    config["DATA_DIR"] = data_dir
    config["DATABASE"] = Path(config["DATABASE"] or data_dir / "blog.sqlite3")
    config["MEDIA_DIR"] = Path(config["MEDIA_DIR"] or data_dir / "media")
    # Flask's own limit; a little above the image limit so we can reply with a
    # friendly message instead of a bare 413.
    config["MAX_CONTENT_LENGTH"] = (config["MAX_UPLOAD_MB"] + 2) * 1024 * 1024
    return config
