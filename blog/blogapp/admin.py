"""Private admin area at /admin/blog. Every route checks the session on the server."""
import json

from flask import Blueprint, abort, current_app, g, jsonify, redirect, render_template, request, url_for

from . import articles as store
from . import auth
from . import media as media_store
from .db import get_db, transaction
from .render import render_markdown
from .util import local_input_to_utc, now_str, parse_page

bp = Blueprint("admin", __name__, url_prefix="/admin/blog")

NOTICES = {
    "saved": "Saved.",
    "published": "Published. It's live on the blog now.",
    "scheduled": "Scheduled. It will appear on the blog at the chosen time.",
    "unpublished": "Unpublished. The article is a draft again and hidden from the blog.",
    "archived": "Archived. It's hidden from the blog; restore it any time.",
    "restored": "Restored as a draft.",
    "duplicated": "Duplicated. You're editing the copy.",
    "deleted": "The article was deleted permanently.",
    "media_deleted": "The image was deleted.",
    "media_saved": "Image details saved.",
    "uploaded": "Upload finished.",
    "category_saved": "Category saved.",
    "category_deleted": "Category deleted. Its articles are now uncategorised.",
    "tag_renamed": "Tag renamed.",
    "tag_merged": "Tag merged into the existing tag with that name.",
    "tag_deleted": "Tag removed from all articles.",
    "password_changed": "Password changed. Other sessions were signed out.",
    "profile_saved": "Profile saved.",
    "signed_out_others": "All other sessions were signed out.",
    "revision_restored": "That version was restored. The previous text is kept in the history.",
}


@bp.before_request
def load_user():
    auth.load_session()


@bp.context_processor
def admin_globals():
    return {"notice": NOTICES.get(request.args.get("notice", "")), "counts": None}


def wants_json():
    return request.headers.get("X-Requested-With") == "fetch" or request.is_json


def _article_or_404(article_id):
    try:
        return store.get_article(article_id)
    except store.NotFound:
        abort(404)


# ---- Sign in / out ----------------------------------------------------------

def _safe_next(target):
    if target and target.startswith("/admin/blog") and not target.startswith("//") and "\\" not in target:
        return target
    return url_for("admin.dashboard")


@bp.route("/login", methods=["GET", "POST"])
def login():
    if g.user is not None:
        return redirect(url_for("admin.dashboard"))
    has_users = get_db().execute("SELECT 1 FROM users LIMIT 1").fetchone() is not None
    error = None
    username = ""
    status = 200
    if request.method == "POST":
        username = (request.form.get("username") or "").strip()[:150]
        password = request.form.get("password") or ""
        ip = auth.client_ip()
        if auth.login_blocked(ip, username):
            error = "Too many failed sign-in attempts. Wait 15 minutes and try again."
            status = 429
        else:
            user = auth.authenticate(username, password)
            auth.record_attempt(ip, username, user is not None)
            if user is None:
                error = "That username and password don't match."
                status = 401
            else:
                token = auth.start_session(user["id"])
                current_app.logger.info("Admin sign-in for %s", user["username"])
                response = redirect(_safe_next(request.form.get("next")))
                return auth.set_session_cookie(response, token)
    return (
        render_template("admin/login.html", error=error, username=username, has_users=has_users,
                        next=request.values.get("next", "")),
        status,
    )


@bp.route("/logout", methods=["POST"])
@auth.login_required
def logout():
    auth.end_session(request.cookies.get(auth.cookie_name()))
    return auth.clear_session_cookie(redirect(url_for("admin.login", signed_out=1)))


# ---- Dashboard --------------------------------------------------------------

@bp.route("")
@bp.route("/")
@auth.login_required
def dashboard():
    status = request.args.get("status") or None
    if status not in (None, *store.STATUSES):
        status = None
    query = (request.args.get("q") or "").strip()[:200]
    page = parse_page(request.args.get("page"))
    result = store.list_admin(status=status, query=query, page=page)
    recent = store.list_admin(page=1, per_page=5).items if not (status or query) else []
    return render_template(
        "admin/dashboard.html", result=result, status=status, query=query, recent=recent,
        counts=store.status_counts(),
    )


# ---- Editor -----------------------------------------------------------------

def _editor(article):
    data = {
        "csrf": auth.csrf_token(),
        "article": None,
        "urls": {
            "create": url_for("admin.api_create"),
            "preview": url_for("admin.api_preview"),
            "media": url_for("admin.api_media"),
            "dashboard": url_for("admin.dashboard"),
        },
        "siteUrl": current_app.config["SITE_URL"],
    }
    if article:
        data["article"] = {
            **store.article_state(article),
            "save_url": url_for("admin.api_save", article_id=article["id"]),
            "edit_url": url_for("admin.edit", article_id=article["id"]),
        }
    return render_template(
        "admin/editor.html",
        article=article,
        editor_json=json.dumps(data).replace("</", "<\\/"),
        categories=store.categories_with_counts(),
        tag_names=store.all_tag_names(),
        featured_media=media_store.get_media(article["featured_image_id"]) if article and article["featured_image_id"] else None,
        now_local=now_str(),
    )


@bp.route("/articles/new")
@auth.login_required
def new():
    return _editor(None)


@bp.route("/articles/<int:article_id>/edit")
@auth.login_required
def edit(article_id):
    return _editor(_article_or_404(article_id))


@bp.route("/articles/<int:article_id>/preview")
@auth.login_required
def preview(article_id):
    article = _article_or_404(article_id)
    return render_template(
        "public/article.html",
        article=article,
        toc=json.loads(article["toc_json"] or "[]"),
        related=[],
        preview=True,
    )


def _save_response(article):
    state = store.article_state(article)
    state["save_url"] = url_for("admin.api_save", article_id=article["id"])
    state["edit_url"] = url_for("admin.edit", article_id=article["id"])
    state["has_h1"] = article.get("has_h1", False)
    return jsonify({"ok": True, "article": state})


def _payload():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        abort(400, description="Expected JSON.")
    return data


@bp.route("/api/articles", methods=["POST"])
@auth.login_required
def api_create():
    data = _payload()
    try:
        article = store.save_article(None, data, user_id=g.user["id"], autosave=bool(data.get("autosave")))
    except store.ValidationError as exc:
        return jsonify({"ok": False, "error": "invalid", "field": exc.field, "message": str(exc)}), 400
    return _save_response(article), 201


@bp.route("/api/articles/<int:article_id>", methods=["POST"])
@auth.login_required
def api_save(article_id):
    data = _payload()
    try:
        article = store.save_article(
            article_id, data, user_id=g.user["id"], base_version=data.get("base_version"),
            autosave=bool(data.get("autosave")), force=bool(data.get("force")),
        )
    except store.NotFound:
        return jsonify({"ok": False, "error": "not_found", "message": "This article was deleted."}), 404
    except store.Conflict as exc:
        return jsonify({
            "ok": False, "error": "conflict",
            "message": "A newer version of this article was saved in another tab or device. "
                       "Your text is still here; nothing was overwritten.",
            "server_version": exc.current["version"], "server_updated_at": exc.current["updated_at"],
        }), 409
    except store.ValidationError as exc:
        return jsonify({"ok": False, "error": "invalid", "field": exc.field, "message": str(exc)}), 400
    return _save_response(article)


@bp.route("/api/preview", methods=["POST"])
@auth.login_required
def api_preview():
    data = _payload()
    body = str(data.get("body_md") or "")[:500_000]
    rendered = render_markdown(body, media_store.lookup_for_render)
    return jsonify({
        "html": rendered["html"], "word_count": rendered["word_count"],
        "reading_minutes": rendered["reading_minutes"], "has_h1": rendered["has_h1"],
        "toc": rendered["toc"],
    })


# ---- Publishing actions -----------------------------------------------------

ACTIONS = {
    "publish": ("published", lambda aid, form: store.publish(aid)),
    "schedule": ("scheduled", lambda aid, form: store.schedule(aid, local_input_to_utc(form.get("publish_at")))),
    "unpublish": ("unpublished", lambda aid, form: store.unpublish(aid)),
    "archive": ("archived", lambda aid, form: store.archive(aid)),
    "restore": ("restored", lambda aid, form: store.restore(aid)),
}


@bp.route("/articles/<int:article_id>/<action>", methods=["POST"])
@auth.login_required
def article_action(article_id, action):
    if action == "duplicate":
        try:
            copy = store.duplicate(article_id, user_id=g.user["id"])
        except store.NotFound:
            abort(404)
        if wants_json():
            return jsonify({"ok": True, "edit_url": url_for("admin.edit", article_id=copy["id"])})
        return redirect(url_for("admin.edit", article_id=copy["id"], notice="duplicated"))
    if action not in ACTIONS:
        abort(404)
    notice, run = ACTIONS[action]
    form = request.get_json(silent=True) if request.is_json else request.form
    try:
        article = run(article_id, form or {})
    except store.NotFound:
        abort(404)
    except store.ValidationError as exc:
        if wants_json():
            return jsonify({"ok": False, "error": "invalid", "field": exc.field, "message": str(exc)}), 400
        return render_template("admin/error.html", error=None, message=str(exc),
                               back=url_for("admin.edit", article_id=article_id)), 400
    if wants_json():
        return _save_response(article)
    back = request.form.get("back")
    if back == "dashboard":
        return redirect(url_for("admin.dashboard", status=request.form.get("status") or None, notice=notice))
    return redirect(url_for("admin.edit", article_id=article_id, notice=notice))


@bp.route("/articles/<int:article_id>/delete", methods=["GET", "POST"])
@auth.login_required
def delete(article_id):
    article = _article_or_404(article_id)
    if request.method == "POST":
        if request.form.get("confirm") != "yes":
            abort(400, description="Tick the box to confirm.")
        store.delete(article_id)
        current_app.logger.info("Article %s (%s) deleted by %s", article_id, article["slug"], g.user["username"])
        return redirect(url_for("admin.dashboard", notice="deleted"))
    return render_template("admin/confirm_delete.html", article=article)


@bp.route("/articles/<int:article_id>/revisions")
@auth.login_required
def revisions(article_id):
    article = _article_or_404(article_id)
    selected = None
    if request.args.get("rev"):
        try:
            selected = store.get_revision(article_id, int(request.args["rev"]))
        except (store.NotFound, ValueError):
            abort(404)
    return render_template("admin/revisions.html", article=article,
                           revisions=store.revisions(article_id), selected=selected)


@bp.route("/articles/<int:article_id>/revisions/<int:revision_id>/restore", methods=["POST"])
@auth.login_required
def restore_revision(article_id, revision_id):
    _article_or_404(article_id)
    try:
        store.restore_revision(article_id, revision_id, user_id=g.user["id"])
    except store.NotFound:
        abort(404)
    return redirect(url_for("admin.edit", article_id=article_id, notice="revision_restored"))


# ---- Media ------------------------------------------------------------------

@bp.route("/media")
@auth.login_required
def media_library():
    page = parse_page(request.args.get("page"))
    query = (request.args.get("q") or "").strip()[:100]
    items, total = media_store.list_media(page=page, per_page=24, query=query)
    from .util import Page

    return render_template("admin/media.html", result=Page(items, page, 24, total), query=query,
                           max_mb=current_app.config["MAX_UPLOAD_MB"], errors=[])


@bp.route("/media/upload", methods=["POST"])
@auth.login_required
def media_upload():
    files = request.files.getlist("files")
    errors = []
    uploaded = 0
    for file in files:
        if not file or not file.filename:
            continue
        try:
            media_store.save_upload(file.read(), file.filename)
            uploaded += 1
        except media_store.MediaError as exc:
            errors.append(f"{file.filename}: {exc}")
    if errors:
        items, total = media_store.list_media(page=1, per_page=24)
        from .util import Page

        return render_template("admin/media.html", result=Page(items, 1, 24, total), query="",
                               max_mb=current_app.config["MAX_UPLOAD_MB"], errors=errors,
                               uploaded=uploaded), 400
    return redirect(url_for("admin.media_library", notice="uploaded"))


@bp.route("/media/<int:media_id>", methods=["GET", "POST"])
@auth.login_required
def media_detail(media_id):
    item = media_store.get_media(media_id)
    if item is None:
        abort(404)
    if request.method == "POST":
        media_store.update_media_text(media_id, request.form.get("alt_text"), request.form.get("caption"))
        return redirect(url_for("admin.media_detail", media_id=media_id, notice="media_saved"))
    return render_template("admin/media_detail.html", item=item, usage=media_store.media_usage(media_id))


@bp.route("/media/<int:media_id>/delete", methods=["POST"])
@auth.login_required
def media_delete(media_id):
    item = media_store.get_media(media_id)
    if item is None:
        abort(404)
    usage = media_store.media_usage(media_id)
    if usage and request.form.get("confirm_in_use") != "yes":
        abort(400, description="This image is used by an article. Confirm on the image page to delete it anyway.")
    media_store.delete_media(media_id)
    return redirect(url_for("admin.media_library", notice="media_deleted"))


@bp.route("/api/media", methods=["GET", "POST"])
@auth.login_required
def api_media():
    if request.method == "GET":
        page = parse_page(request.args.get("page"))
        items, total = media_store.list_media(page=page, per_page=24, query=(request.args.get("q") or "")[:100])
        return jsonify({"items": items, "page": page, "total": total, "has_more": page * 24 < total})
    file = request.files.get("file")
    if not file:
        return jsonify({"ok": False, "message": "No file was sent."}), 400
    try:
        item = media_store.save_upload(file.read(), file.filename, request.form.get("alt_text"),
                                       request.form.get("caption"))
    except media_store.MediaError as exc:
        return jsonify({"ok": False, "message": str(exc)}), 400
    return jsonify({"ok": True, "item": item}), 201


@bp.route("/api/media/<int:media_id>", methods=["POST"])
@auth.login_required
def api_media_update(media_id):
    if media_store.get_media(media_id) is None:
        abort(404)
    data = _payload()
    media_store.update_media_text(media_id, data.get("alt_text"), data.get("caption"))
    return jsonify({"ok": True, "item": media_store.get_media(media_id)})


# ---- Categories and tags ----------------------------------------------------

@bp.route("/categories", methods=["GET", "POST"])
@auth.login_required
def categories():
    error = None
    if request.method == "POST":
        try:
            store.save_category(
                request.form.get("id", type=int), request.form.get("name"), request.form.get("slug"),
                request.form.get("description"), request.form.get("sort_order"),
            )
            return redirect(url_for("admin.categories", notice="category_saved"))
        except store.ValidationError as exc:
            error = str(exc)
    return render_template("admin/categories.html", categories=store.categories_with_counts(), error=error), (
        400 if error else 200
    )


@bp.route("/categories/<int:category_id>/delete", methods=["POST"])
@auth.login_required
def category_delete(category_id):
    store.delete_category(category_id)
    return redirect(url_for("admin.categories", notice="category_deleted"))


@bp.route("/tags", methods=["GET", "POST"])
@auth.login_required
def tags():
    error = None
    if request.method == "POST":
        try:
            result = store.rename_tag(request.form.get("id", type=int), request.form.get("name"),
                                      request.form.get("slug"))
            return redirect(url_for("admin.tags", notice="tag_merged" if result == "merged" else "tag_renamed"))
        except store.ValidationError as exc:
            error = str(exc)
    return render_template("admin/tags.html", tags=store.tags_with_counts(), error=error), (400 if error else 200)


@bp.route("/tags/<int:tag_id>/delete", methods=["POST"])
@auth.login_required
def tag_delete(tag_id):
    store.delete_tag(tag_id)
    return redirect(url_for("admin.tags", notice="tag_deleted"))


# ---- Account ----------------------------------------------------------------

@bp.route("/account", methods=["GET", "POST"])
@auth.login_required
def account():
    error = None
    if request.method == "POST":
        form_name = request.form.get("form")
        db = get_db()
        if form_name == "profile":
            name = " ".join((request.form.get("display_name") or "").split())[:100]
            if not name:
                error = "Enter the name to show on your articles."
            else:
                with transaction(db):
                    db.execute("UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?",
                               (name, now_str(), g.user["id"]))
                return redirect(url_for("admin.account", notice="profile_saved"))
        elif form_name == "password":
            user = auth.authenticate(g.user["username"], request.form.get("current_password") or "")
            new = request.form.get("new_password") or ""
            if user is None:
                error = "Your current password isn't right."
            elif new != request.form.get("confirm_password"):
                error = "The new passwords don't match."
            elif auth.password_problem(new):
                error = auth.password_problem(new)
            else:
                with transaction(db):
                    db.execute("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
                               (auth.hash_password(new), now_str(), g.user["id"]))
                auth.end_all_sessions(g.user["id"], except_token=request.cookies.get(auth.cookie_name()))
                return redirect(url_for("admin.account", notice="password_changed"))
        elif form_name == "sessions":
            auth.end_all_sessions(g.user["id"], except_token=request.cookies.get(auth.cookie_name()))
            return redirect(url_for("admin.account", notice="signed_out_others"))
    sessions = get_db().execute(
        "SELECT created_at, last_seen_at FROM sessions WHERE user_id = ? ORDER BY last_seen_at DESC", (g.user["id"],)
    ).fetchall()
    return render_template("admin/account.html", error=error, sessions=sessions,
                           min_length=auth.MIN_PASSWORD_LENGTH), (400 if error else 200)
