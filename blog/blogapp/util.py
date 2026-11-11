"""Small helpers: time, slugs, word counts, pagination."""
import math
import re
import unicodedata
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from flask import current_app

TIME_FORMAT = "%Y-%m-%dT%H:%M:%SZ"
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
# Paths under /blog/ that an article slug must never take over.
RESERVED_SLUGS = {"category", "tag", "static", "feed", "page", "search", "admin", "media"}
WORDS_PER_MINUTE = 220


def utcnow():
    return datetime.now(timezone.utc).replace(microsecond=0)


def now_str():
    return utcnow().strftime(TIME_FORMAT)


def to_str(dt):
    return dt.astimezone(timezone.utc).strftime(TIME_FORMAT)


def parse_utc(value):
    if not value:
        return None
    return datetime.strptime(value, TIME_FORMAT).replace(tzinfo=timezone.utc)


def site_tz():
    return ZoneInfo(current_app.config["TIMEZONE"])


def local_input_to_utc(value):
    """'2026-11-20T09:30' typed in the site's time zone -> UTC string."""
    value = (value or "").strip()
    if not value:
        return None
    try:
        local = datetime.strptime(value[:16], "%Y-%m-%dT%H:%M")
    except ValueError:
        return None
    return to_str(local.replace(tzinfo=site_tz()))


def utc_to_local_input(value):
    dt = parse_utc(value)
    if not dt:
        return ""
    return dt.astimezone(site_tz()).strftime("%Y-%m-%dT%H:%M")


def format_date(value, with_time=False):
    dt = parse_utc(value)
    if not dt:
        return ""
    local = dt.astimezone(site_tz())
    text = f"{local:%B} {local.day}, {local.year}"
    if with_time:
        hour = local.hour % 12 or 12
        text += f", {hour}:{local:%M} {'AM' if local.hour < 12 else 'PM'}"
    return text


def slugify(text, max_length=80):
    text = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()
    if len(text) > max_length:
        text = text[:max_length].rsplit("-", 1)[0] or text[:max_length]
    return text.strip("-")


def valid_slug(slug):
    return bool(slug) and len(slug) <= 120 and bool(SLUG_RE.match(slug)) and slug not in RESERVED_SLUGS


_MD_NOISE = re.compile(r"```.*?```|`[^`]*`|!\[[^\]]*\]\([^)]*\)|[#>*_~`|\[\]()-]", re.S)


def count_words(markdown_text):
    text = _MD_NOISE.sub(" ", markdown_text or "")
    return len(re.findall(r"[A-Za-z0-9][A-Za-z0-9'’.-]*", text))


def reading_minutes(word_count):
    return max(1, math.ceil(word_count / WORDS_PER_MINUTE))


class Page:
    """Plain pagination info for templates."""

    def __init__(self, items, page, per_page, total):
        self.items = items
        self.page = page
        self.per_page = per_page
        self.total = total
        self.pages = max(1, math.ceil(total / per_page)) if per_page else 1

    @property
    def has_prev(self):
        return self.page > 1

    @property
    def has_next(self):
        return self.page < self.pages


def parse_page(value):
    try:
        page = int(value)
    except (TypeError, ValueError):
        return 1
    return min(max(page, 1), 10_000)
