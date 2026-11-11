"""Image uploads: content-based validation, safe names, resized copies.

* The file type comes from decoding the bytes with Pillow, never from the
  filename or the browser's MIME type. Anything that is not a real JPEG, PNG,
  WebP or GIF is refused, so scripts and executables can't be uploaded.
* Stored names are random (e.g. 2026/11/3f9a1c0be2d4a7e1.jpg), so a filename
  can't cause path traversal or overwrite another file.
* Still images are re-encoded, which drops EXIF data such as phone GPS
  locations. Transparency is kept. Animated GIF/WebP files are stored
  byte-for-byte so the animation survives.
"""
import io
import os
import secrets
from pathlib import Path

from flask import current_app
from PIL import Image, ImageOps, UnidentifiedImageError

from .db import get_db, transaction
from .util import now_str

FORMATS = {
    "JPEG": ("image/jpeg", "jpg"),
    "PNG": ("image/png", "png"),
    "WEBP": ("image/webp", "webp"),
    "GIF": ("image/gif", "gif"),
}
MAX_PIXELS = 40_000_000       # ~ 8000 x 5000; larger is refused (decompression bombs)
FULL_MAX_EDGE = 2400          # the copy linked from articles
MEDIUM_MAX_WIDTH = 1200       # the copy shown inside articles
THUMB_MAX_WIDTH = 640         # cards, featured images in lists, library grid

Image.MAX_IMAGE_PIXELS = MAX_PIXELS


class MediaError(ValueError):
    pass


def media_dir():
    return Path(current_app.config["MEDIA_DIR"])


def url_for_path(rel_path):
    return f"/media/{rel_path}" if rel_path else None


def _safe_target(rel_path):
    root = media_dir().resolve()
    target = (root / rel_path).resolve()
    if root not in target.parents:
        raise MediaError("Invalid media path.")
    return target


def _write_atomic(rel_path, data):
    target = _safe_target(rel_path)
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_name(f".{target.name}.{secrets.token_hex(4)}.tmp")
    with open(tmp, "xb") as fh:
        fh.write(data)
        fh.flush()
        os.fsync(fh.fileno())
    os.replace(tmp, target)
    return len(data)


def _encode(img, fmt, icc):
    out = io.BytesIO()
    params = {"icc_profile": icc} if icc else {}
    if fmt == "JPEG":
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        img.save(out, "JPEG", quality=85, optimize=True, progressive=True, **params)
    elif fmt == "PNG":
        img.save(out, "PNG", optimize=True, **params)
    elif fmt == "WEBP":
        img.save(out, "WEBP", quality=85, method=4, **params)
    elif fmt == "GIF":
        img.save(out, "GIF", optimize=True)
    return out.getvalue()


def _resized(img, max_width=None, max_edge=None):
    width, height = img.size
    scale = 1.0
    if max_width and width > max_width:
        scale = max_width / width
    if max_edge and max(width, height) * scale > max_edge:
        scale = max_edge / max(width, height)
    if scale >= 1.0:
        return None
    size = (max(1, round(width * scale)), max(1, round(height * scale)))
    return img.resize(size, Image.Resampling.LANCZOS)


def inspect_upload(data):
    """Decode the bytes and return (format, image). Raises MediaError."""
    max_bytes = current_app.config["MAX_UPLOAD_MB"] * 1024 * 1024
    if not data:
        raise MediaError("The file is empty.")
    if len(data) > max_bytes:
        raise MediaError(f"Images must be {current_app.config['MAX_UPLOAD_MB']} MB or smaller.")
    try:
        probe = Image.open(io.BytesIO(data))  # reads the header only
        fmt = probe.format
        if probe.width * probe.height > MAX_PIXELS:
            # Refuse before decoding, so a huge image can't eat the Pi's memory.
            raise MediaError("That image has too many pixels.")
        probe.verify()
        img = Image.open(io.BytesIO(data))
        img.load()
    except MediaError:
        raise
    except Image.DecompressionBombError:
        raise MediaError("That image has too many pixels.") from None
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError):
        raise MediaError("That file isn't a supported image (JPEG, PNG, WebP or GIF).") from None
    if fmt not in FORMATS:
        raise MediaError("Only JPEG, PNG, WebP and GIF images can be uploaded.")
    if img.width * img.height > MAX_PIXELS:
        raise MediaError("That image has too many pixels.")
    return fmt, img


def save_upload(data, original_name="", alt_text="", caption=""):
    fmt, img = inspect_upload(data)
    mime, ext = FORMATS[fmt]
    animated = getattr(img, "is_animated", False) and getattr(img, "n_frames", 1) > 1
    month = now_str()[:7].replace("-", "/")
    token = secrets.token_hex(8)
    base = f"{month}/{token}"
    written = []
    try:
        if animated or fmt == "GIF":
            # Keep the original bytes: re-encoding would lose animation frames
            # or palette quality. Thumbnail = first frame as PNG (keeps transparency).
            path = f"{base}.{ext}"
            total = _write_atomic(path, data)
            written.append(path)
            width, height = img.size
            medium_path = None
            thumb_path = None
            img.seek(0)
            frame = img.convert("RGBA")
            small = _resized(frame, max_width=THUMB_MAX_WIDTH)
            if small is not None:
                thumb_path = f"{base}-sm.png"
                total += _write_atomic(thumb_path, _encode(small, "PNG", None))
                written.append(thumb_path)
        else:
            icc = img.info.get("icc_profile")
            img = ImageOps.exif_transpose(img)
            full = _resized(img, max_edge=FULL_MAX_EDGE) or img
            width, height = full.size
            path = f"{base}.{ext}"
            total = _write_atomic(path, _encode(full, fmt, icc))
            written.append(path)
            medium_path = thumb_path = None
            medium = _resized(full, max_width=MEDIUM_MAX_WIDTH)
            if medium is not None:
                medium_path = f"{base}-md.{ext}"
                total += _write_atomic(medium_path, _encode(medium, fmt, icc))
                written.append(medium_path)
            thumb = _resized(full, max_width=THUMB_MAX_WIDTH)
            if thumb is not None:
                thumb_path = f"{base}-sm.{ext}"
                total += _write_atomic(thumb_path, _encode(thumb, fmt, icc))
                written.append(thumb_path)

        original_name = os.path.basename(original_name or "")[:200]
        db = get_db()
        with transaction(db):
            cur = db.execute(
                "INSERT INTO media (path, medium_path, thumb_path, original_name, mime_type, width, height,"
                " size_bytes, alt_text, caption, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                (path, medium_path, thumb_path, original_name, mime, width, height, total,
                 (alt_text or "")[:300], (caption or "")[:300], now_str()),
            )
        return get_media(cur.lastrowid)
    except Exception:
        for rel in written:
            try:
                _safe_target(rel).unlink()
            except OSError:
                pass
        raise


def media_dict(row):
    if row is None:
        return None
    return {
        "id": row["id"],
        "url": url_for_path(row["path"]),
        "medium_url": url_for_path(row["medium_path"] or row["path"]),
        "thumb_url": url_for_path(row["thumb_path"] or row["path"]),
        "original_name": row["original_name"],
        "mime_type": row["mime_type"],
        "width": row["width"],
        "height": row["height"],
        "size_bytes": row["size_bytes"],
        "alt_text": row["alt_text"],
        "caption": row["caption"],
        "created_at": row["created_at"],
    }


def get_media(media_id):
    row = get_db().execute("SELECT * FROM media WHERE id = ?", (media_id,)).fetchone()
    return media_dict(row)


def list_media(page=1, per_page=24, query=""):
    db = get_db()
    where, params = "", []
    if query:
        like = "%" + query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        where = "WHERE original_name LIKE ? ESCAPE '\\' OR alt_text LIKE ? ESCAPE '\\' OR caption LIKE ? ESCAPE '\\'"
        params = [like, like, like]
    total = db.execute(f"SELECT COUNT(*) FROM media {where}", params).fetchone()[0]
    rows = db.execute(
        f"SELECT * FROM media {where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
        params + [per_page, (page - 1) * per_page],
    ).fetchall()
    return [media_dict(r) for r in rows], total


def media_usage(media_id):
    """Articles that use an image, as featured image or inside the text."""
    db = get_db()
    row = db.execute("SELECT path FROM media WHERE id = ?", (media_id,)).fetchone()
    if row is None:
        return []
    like = "%/media/" + row["path"] + "%"
    return db.execute(
        "SELECT id, title, slug, status FROM articles"
        " WHERE featured_image_id = ? OR body_md LIKE ? ORDER BY updated_at DESC",
        (media_id, like),
    ).fetchall()


def delete_media(media_id):
    db = get_db()
    row = db.execute("SELECT * FROM media WHERE id = ?", (media_id,)).fetchone()
    if row is None:
        return False
    with transaction(db):
        db.execute("DELETE FROM media WHERE id = ?", (media_id,))
    for rel in (row["path"], row["medium_path"], row["thumb_path"]):
        if rel:
            try:
                _safe_target(rel).unlink()
            except (OSError, MediaError):
                current_app.logger.warning("Could not remove media file %s", rel)
    return True


def update_media_text(media_id, alt_text, caption):
    db = get_db()
    with transaction(db):
        db.execute(
            "UPDATE media SET alt_text = ?, caption = ? WHERE id = ?",
            ((alt_text or "")[:300], (caption or "")[:300], media_id),
        )


def lookup_for_render(urls):
    """Map /media/... URLs in an article to their resized copy and size."""
    paths = [u[len("/media/"):] for u in urls if u.startswith("/media/")]
    if not paths:
        return {}
    marks = ",".join("?" * len(paths))
    rows = get_db().execute(f"SELECT * FROM media WHERE path IN ({marks})", paths).fetchall()
    found = {}
    for row in rows:
        width, height = row["width"], row["height"]
        if row["medium_path"]:
            display_width = min(width, MEDIUM_MAX_WIDTH)
            display_height = round(height * display_width / width)
        else:
            display_width, display_height = width, height
        found[url_for_path(row["path"])] = {
            "display_url": url_for_path(row["medium_path"] or row["path"]),
            "display_width": display_width,
            "display_height": display_height,
        }
    return found
