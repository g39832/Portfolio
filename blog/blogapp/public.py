"""Public pages: blog index, categories, tags, articles, RSS feed, sitemap."""
import json

from flask import Blueprint, abort, current_app, make_response, redirect, render_template, request, url_for

from . import articles as store
from .util import parse_page

bp = Blueprint("public", __name__)

# Pages that live in the static React site and belong in the sitemap.
STATIC_PAGES = ["/", "/case-studies/dispodex/"]


def _respond(body, mimetype="text/html", max_age=0):
    """Send with an ETag so repeat visits get a cheap 304 Not Modified."""
    response = make_response(body)
    response.mimetype = mimetype
    response.headers["Cache-Control"] = f"public, max-age={max_age}, must-revalidate"
    response.add_etag()
    return response.make_conditional(request)


def _listing(title, description, canonical_path, category=None, tag=None):
    query = (request.args.get("q") or "").strip()[:200]
    page = parse_page(request.args.get("page"))
    per_page = current_app.config["PER_PAGE"]
    filtered = bool(query or category or tag)
    featured = None
    if not filtered and page == 1:
        featured = store.featured_public()
    exclude = None
    if not filtered:
        # The featured article is shown on its own on page 1, so leave it out of the list on every page.
        top = featured or store.featured_public()
        exclude = top["id"] if top else None
    result = store.list_public(
        page=page, per_page=per_page, query=query,
        category_slug=category["slug"] if category else None,
        tag_slug=tag["slug"] if tag else None,
        exclude_id=exclude,
    )
    if page > result.pages and result.total:
        abort(404)
    html = render_template(
        "public/index.html",
        page_title=title,
        description=description,
        canonical=canonical_path + (f"?page={page}" if page > 1 else ""),
        noindex=bool(query),
        featured=featured,
        result=result,
        query=query,
        category=category,
        tag=tag,
        categories=store.public_categories(),
        tags=store.public_tags(24),
        base_path=canonical_path,
    )
    return _respond(html)


@bp.route("/blog")
def index():
    return _listing(
        "Blog",
        "Technical articles, projects, experiments and engineering notes by Grayson Cox — "
        "Linux, self-hosting, homelab infrastructure, databases and software development.",
        "/blog",
    )


@bp.route("/blog/")
def index_slash():
    return redirect(url_for("public.index", **request.args), 301)


@bp.route("/blog/category/<slug>")
def category(slug):
    cat = next((c for c in store.public_categories() if c["slug"] == slug), None)
    if cat is None:
        abort(404)
    return _listing(
        cat["name"],
        cat["description"] or f"Articles about {cat['name']} by Grayson Cox.",
        f"/blog/category/{slug}",
        category=cat,
    )


@bp.route("/blog/tag/<slug>")
def tag(slug):
    found = next((t for t in store.public_tags(1000) if t["slug"] == slug), None)
    if found is None:
        abort(404)
    return _listing(f"Tagged “{found['name']}”", f"Articles tagged {found['name']} by Grayson Cox.",
                    f"/blog/tag/{slug}", tag=found)


@bp.route("/blog/<slug>")
def article(slug):
    item, moved_to = store.get_public(slug)
    if item is None:
        if moved_to:
            return redirect(url_for("public.article", slug=moved_to), 301)
        abort(404)
    html = render_template(
        "public/article.html",
        article=item,
        toc=json.loads(item["toc_json"] or "[]"),
        related=store.related_public(item),
        preview=False,
    )
    return _respond(html)


@bp.route("/blog/feed.xml")
def feed():
    items = store.all_public(limit=20)
    xml = render_template("public/feed.xml", items=items, updated=store.last_public_change())
    return _respond(xml, mimetype="application/rss+xml", max_age=600)


@bp.route("/sitemap.xml")
def sitemap():
    xml = render_template(
        "public/sitemap.xml",
        static_pages=STATIC_PAGES,
        items=store.all_public(),
        categories=store.public_categories(),
        updated=store.last_public_change(),
    )
    return _respond(xml, mimetype="application/xml", max_age=3600)


@bp.app_template_filter("absolute_urls")
def absolute_urls(html):
    """Feed readers need absolute links and image addresses."""
    site = current_app.config["SITE_URL"]
    return html.replace(' src="/', f' src="{site}/').replace(' href="/', f' href="{site}/')
