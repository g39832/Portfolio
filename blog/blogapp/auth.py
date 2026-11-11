"""Admin authentication: password hashing, server-side sessions, CSRF, login throttling."""
import functools
import hashlib
import hmac
import secrets
from datetime import timedelta

from flask import abort, current_app, g, redirect, request, url_for
from werkzeug.security import check_password_hash, generate_password_hash

from .db import get_db, transaction
from .util import now_str, parse_utc, to_str, utcnow

COOKIE_PATH = "/admin/blog"
MIN_PASSWORD_LENGTH = 12
# Used to spend the same time on unknown usernames as on real ones.
_DUMMY_HASH = generate_password_hash("timing-equaliser-not-a-real-password")


def cookie_name():
    # The __Host- prefix makes browsers insist on Secure + no Domain, but it also
    # requires Path=/; we prefer scoping the cookie to the admin path instead.
    return "blog_admin" if current_app.config["COOKIE_SECURE"] else "blog_admin_dev"


def hash_password(password):
    # Werkzeug's default is scrypt (memory-hard, salted).
    return generate_password_hash(password)


def password_problem(password):
    if len(password or "") < MIN_PASSWORD_LENGTH:
        return f"Use at least {MIN_PASSWORD_LENGTH} characters."
    if len(password) > 1024:
        return "That password is too long."
    return None


def client_ip():
    if current_app.config["TRUST_CLOUDFLARE_IP"] and request.headers.get("CF-Connecting-IP"):
        return request.headers["CF-Connecting-IP"].strip()[:64]
    if request.headers.get("X-Real-IP"):
        return request.headers["X-Real-IP"].strip()[:64]
    return (request.remote_addr or "unknown")[:64]


def _token_hash(token):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


# ---- Login throttling -------------------------------------------------------

def login_blocked(ip, username):
    cfg = current_app.config
    since = to_str(utcnow() - timedelta(minutes=cfg["LOGIN_WINDOW_MINUTES"]))
    db = get_db()
    by_ip = db.execute(
        "SELECT COUNT(*) FROM login_attempts WHERE ip = ? AND attempted_at >= ? AND succeeded = 0",
        (ip, since),
    ).fetchone()[0]
    by_user = db.execute(
        "SELECT COUNT(*) FROM login_attempts WHERE username = ? AND attempted_at >= ? AND succeeded = 0",
        ((username or "").lower(), since),
    ).fetchone()[0]
    return by_ip >= cfg["LOGIN_MAX_PER_IP"] or by_user >= cfg["LOGIN_MAX_PER_USER"]


def record_attempt(ip, username, succeeded):
    db = get_db()
    cutoff = to_str(utcnow() - timedelta(days=2))
    with transaction(db):
        db.execute(
            "INSERT INTO login_attempts (ip, username, attempted_at, succeeded) VALUES (?,?,?,?)",
            (ip, (username or "").lower()[:150], now_str(), 1 if succeeded else 0),
        )
        db.execute("DELETE FROM login_attempts WHERE attempted_at < ?", (cutoff,))


def authenticate(username, password):
    row = get_db().execute("SELECT * FROM users WHERE username = ?", ((username or "").strip(),)).fetchone()
    if row is None:
        check_password_hash(_DUMMY_HASH, password or "")
        return None
    if not check_password_hash(row["password_hash"], password or ""):
        return None
    return row


# ---- Sessions ---------------------------------------------------------------

def start_session(user_id):
    """Create a session and return the raw token for the cookie."""
    token = secrets.token_urlsafe(32)
    now = utcnow()
    db = get_db()
    with transaction(db):
        db.execute("DELETE FROM sessions WHERE expires_at < ?", (to_str(now),))
        db.execute(
            "INSERT INTO sessions (token_hash, user_id, csrf_token, created_at, last_seen_at, expires_at)"
            " VALUES (?,?,?,?,?,?)",
            (
                _token_hash(token), user_id, secrets.token_urlsafe(32), to_str(now), to_str(now),
                to_str(now + timedelta(days=current_app.config["SESSION_MAX_DAYS"])),
            ),
        )
    return token


def end_session(token):
    if token:
        db = get_db()
        with transaction(db):
            db.execute("DELETE FROM sessions WHERE token_hash = ?", (_token_hash(token),))


def end_all_sessions(user_id, except_token=None):
    db = get_db()
    with transaction(db):
        if except_token:
            db.execute(
                "DELETE FROM sessions WHERE user_id = ? AND token_hash != ?",
                (user_id, _token_hash(except_token)),
            )
        else:
            db.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))


def load_session():
    """Populate g.user / g.session from the cookie if it is valid."""
    g.user = None
    g.session = None
    token = request.cookies.get(cookie_name())
    if not token or len(token) > 100:
        return
    db = get_db()
    row = db.execute(
        "SELECT s.*, u.username, u.display_name FROM sessions s JOIN users u ON u.id = s.user_id"
        " WHERE s.token_hash = ?",
        (_token_hash(token),),
    ).fetchone()
    if row is None:
        return
    now = utcnow()
    idle_limit = timedelta(hours=current_app.config["SESSION_IDLE_HOURS"])
    if parse_utc(row["expires_at"]) <= now or now - parse_utc(row["last_seen_at"]) > idle_limit:
        end_session(token)
        return
    # Touch at most once a minute to keep writes rare.
    if (now - parse_utc(row["last_seen_at"])).total_seconds() > 60:
        db.execute("UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?", (to_str(now), row["token_hash"]))
    g.session = row
    g.user = {"id": row["user_id"], "username": row["username"], "display_name": row["display_name"]}


def set_session_cookie(response, token):
    response.set_cookie(
        cookie_name(),
        token,
        max_age=current_app.config["SESSION_MAX_DAYS"] * 86400,
        path=COOKIE_PATH,
        secure=current_app.config["COOKIE_SECURE"],
        httponly=True,
        samesite="Strict",
    )
    return response


def clear_session_cookie(response):
    response.delete_cookie(
        cookie_name(), path=COOKIE_PATH, secure=current_app.config["COOKIE_SECURE"],
        httponly=True, samesite="Strict",
    )
    return response


def csrf_token():
    return g.session["csrf_token"] if getattr(g, "session", None) else ""


def check_csrf():
    """Every state-changing admin request must carry the session's CSRF token."""
    sent = request.headers.get("X-CSRF-Token") or request.form.get("csrf_token") or ""
    expected = csrf_token()
    if not expected or not hmac.compare_digest(sent, expected):
        abort(400, description="Your session expired or the form was out of date. Reload the page and try again.")


def login_required(view):
    @functools.wraps(view)
    def wrapped(*args, **kwargs):
        if g.get("user") is None:
            if request.path.startswith(COOKIE_PATH + "/api/") or request.accept_mimetypes.best == "application/json":
                return {"error": "not_authenticated", "message": "Please sign in again."}, 401
            return redirect(url_for("admin.login", next=request.full_path if request.method == "GET" else None))
        if request.method not in ("GET", "HEAD", "OPTIONS"):
            check_csrf()
        return view(*args, **kwargs)

    return wrapped


# ---- User management (used by the CLI and the account page) -----------------

def create_user(username, password, display_name=""):
    problem = password_problem(password)
    if problem:
        raise ValueError(problem)
    username = (username or "").strip()
    if not username or len(username) > 150:
        raise ValueError("Choose a username.")
    db = get_db()
    now = now_str()
    with transaction(db):
        db.execute(
            "INSERT INTO users (username, display_name, password_hash, created_at, updated_at) VALUES (?,?,?,?,?)",
            (username, display_name or username, hash_password(password), now, now),
        )


def set_password(username, password):
    problem = password_problem(password)
    if problem:
        raise ValueError(problem)
    db = get_db()
    row = db.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    if row is None:
        raise ValueError(f"No user named {username!r}.")
    with transaction(db):
        db.execute(
            "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
            (hash_password(password), now_str(), row["id"]),
        )
        db.execute("DELETE FROM sessions WHERE user_id = ?", (row["id"],))
