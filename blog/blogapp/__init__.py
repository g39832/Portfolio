"""graysoncodes.org blog service.

A small Flask app that serves /blog (public), /admin/blog (private) and
/media (uploaded images), next to the static React portfolio served by nginx.
"""
import hashlib
import logging
import os

from flask import Flask, g, render_template, request, send_from_directory
from werkzeug.exceptions import HTTPException

from . import util
from .config import load_config
from .db import close_db, migrate

CSP_PUBLIC = (
    "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; "
    "font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; "
    "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
)
# The admin preview pane loads images and media thumbnails as blob: URLs.
CSP_ADMIN = CSP_PUBLIC.replace("img-src 'self' data:", "img-src 'self' data: blob:")


def _tighten_permissions(app):
    """On the Pi: nginx (www-data) may read media, but only the blog user may read the database."""
    if os.name != "posix":
        return
    for path, mode in ((app.config["DATA_DIR"], 0o711), (app.config["MEDIA_DIR"], 0o755),
                       (app.config["DATABASE"], 0o600)):
        try:
            os.chmod(path, mode)
        except OSError:
            app.logger.warning("Could not set permissions on %s", path)


def create_app(overrides=None):
    config = load_config(overrides)
    app = Flask(__name__, static_folder="static", static_url_path="/blog/static")
    app.config.update(config)
    app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 60 * 60 * 24 * 365  # static files are fingerprinted
    app.config["TEMPLATES_AUTO_RELOAD"] = False
    if not app.debug:
        logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    app.config["DATA_DIR"].mkdir(parents=True, exist_ok=True)
    app.config["MEDIA_DIR"].mkdir(parents=True, exist_ok=True)
    applied = migrate(app.config["DATABASE"])
    _tighten_permissions(app)
    if applied:
        app.logger.info("Applied database migrations: %s", ", ".join(applied))

    app.teardown_appcontext(close_db)

    # Fingerprints for cache busting: /blog/static/blog.css?v=1a2b3c4d
    fingerprints = {}

    def asset(name):
        if name not in fingerprints or app.debug:
            path = app.static_folder + "/" + name
            with open(path, "rb") as fh:
                fingerprints[name] = hashlib.sha256(fh.read()).hexdigest()[:10]
        return f"/blog/static/{name}?v={fingerprints[name]}"

    @app.context_processor
    def template_globals():
        from .auth import csrf_token

        return {
            "asset": asset,
            "site_url": app.config["SITE_URL"],
            "site_name": app.config["SITE_NAME"],
            "author_name": app.config["AUTHOR_NAME"],
            "csrf_token": csrf_token,
            "current_user": g.get("user"),
            "now_year": util.utcnow().year,
        }

    app.add_template_filter(util.format_date, "date")
    app.add_template_filter(lambda v: util.format_date(v, with_time=True), "datetime")
    app.add_template_filter(util.utc_to_local_input, "local_input")
    app.add_template_filter(
        lambda v: util.parse_utc(v).strftime("%a, %d %b %Y %H:%M:%S +0000") if v else "", "rfc822"
    )

    @app.template_filter("filesize")
    def filesize(value):
        value = float(value or 0)
        for unit in ("B", "KB", "MB"):
            if value < 1024 or unit == "MB":
                return f"{value:.0f} {unit}" if unit == "B" else f"{value:.1f} {unit}"
            value /= 1024
        return f"{value:.1f} MB"

    from .admin import bp as admin_bp
    from .public import bp as public_bp

    app.register_blueprint(public_bp)
    app.register_blueprint(admin_bp)

    if app.config["SERVE_MEDIA"]:
        # In production nginx serves /media straight from disk; this route keeps
        # local development and a missing nginx rule working.
        @app.route("/media/<path:filename>")
        def media_file(filename):
            response = send_from_directory(app.config["MEDIA_DIR"], filename, max_age=60 * 60 * 24 * 30)
            response.headers["X-Content-Type-Options"] = "nosniff"
            response.headers["Content-Security-Policy"] = "default-src 'none'; sandbox"
            return response

    @app.after_request
    def security_headers(response):
        is_admin = request.path.startswith("/admin/")
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=(), interest-cohort=()")
        if response.mimetype == "text/html":
            response.headers.setdefault("Content-Security-Policy", CSP_ADMIN if is_admin else CSP_PUBLIC)
        if is_admin:
            response.headers["Cache-Control"] = "no-store"
            response.headers["X-Robots-Tag"] = "noindex, nofollow"
        if app.config["COOKIE_SECURE"]:
            response.headers.setdefault("Strict-Transport-Security", "max-age=31536000")
        return response

    @app.errorhandler(HTTPException)
    def http_error(error):
        if request.path.startswith("/admin/blog/api/"):
            return {"error": error.name, "message": error.description}, error.code
        if error.code in (404, 400, 403, 405, 413, 429):
            template = "admin/error.html" if request.path.startswith("/admin/") else "public/error.html"
            return render_template(template, error=error), error.code
        return error

    @app.errorhandler(Exception)
    def server_error(error):
        app.logger.exception("Unhandled error on %s", request.path)
        if request.path.startswith("/admin/blog/api/"):
            return {"error": "server_error", "message": "Something went wrong on the server. Your text is still in the editor."}, 500
        return render_template("public/error.html", error=None), 500

    return app
