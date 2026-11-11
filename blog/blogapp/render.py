"""Markdown -> safe HTML.

Raw HTML in articles is switched off (it is shown as text), unsafe link schemes
are refused by markdown-it, and the final HTML goes through nh3 (an allow-list
sanitizer) as a second layer. Code is highlighted on the server with Pygments,
so readers download no highlighting JavaScript.
"""
import re
from html import escape

import nh3
from markdown_it import MarkdownIt
from pygments import highlight
from pygments.formatters import HtmlFormatter
from pygments.lexers import get_lexer_by_name
from pygments.util import ClassNotFound

from .util import count_words, reading_minutes, slugify

_formatter = HtmlFormatter(nowrap=True)

ALLOWED_TAGS = {
    "a", "abbr", "b", "blockquote", "br", "code", "del", "div", "em", "figcaption",
    "figure", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "img", "li", "ol", "p",
    "pre", "s", "span", "strong", "sub", "sup", "table", "tbody", "td", "th", "thead",
    "tr", "ul",
}
ALLOWED_ATTRIBUTES = {
    "*": {"class", "id"},
    "a": {"href", "title"},
    "img": {"src", "alt", "title", "width", "height", "loading", "decoding", "srcset", "sizes"},
    "div": {"data-lang"},
    "ol": {"start"},
}


def _sanitize(html):
    return nh3.clean(
        html,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        url_schemes={"http", "https", "mailto"},
        link_rel="noopener noreferrer",
        strip_comments=True,
    )


def _highlight(code, lang):
    lang = (lang or "").strip().split()[0].lower() if lang else ""
    if lang:
        try:
            lexer = get_lexer_by_name(lang, stripnl=False)
            return highlight(code, lexer, _formatter), lang
        except ClassNotFound:
            pass
    return escape(code), lang


def _heading_ids(state):
    """Give every heading a stable id and collect the table of contents."""
    used = set()
    toc = []
    tokens = state.tokens
    for i, token in enumerate(tokens):
        if token.type != "heading_open":
            continue
        inline = tokens[i + 1]
        text = "".join(
            child.content for child in (inline.children or []) if child.type in ("text", "code_inline")
        ) or inline.content
        base = slugify(text, 60) or "section"
        anchor = base
        n = 2
        while anchor in used:
            anchor = f"{base}-{n}"
            n += 1
        used.add(anchor)
        token.attrSet("id", anchor)
        level = int(token.tag[1])
        toc.append({"level": level, "id": anchor, "text": text})
    state.env["toc"] = toc


def _lone_images(state):
    """A paragraph holding only an image becomes a <figure> (caption = image title)."""
    tokens = state.tokens
    for i in range(len(tokens) - 2):
        if (
            tokens[i].type == "paragraph_open"
            and tokens[i + 1].type == "inline"
            and tokens[i + 2].type == "paragraph_close"
        ):
            children = [c for c in (tokens[i + 1].children or []) if not (c.type == "text" and not c.content.strip())]
            if len(children) == 1 and children[0].type == "image":
                tokens[i].meta["figure"] = True
                tokens[i + 2].meta["figure"] = True
                children[0].meta["figure"] = True


def _build_parser():
    md = MarkdownIt("commonmark", {"html": False, "linkify": False, "typographer": False})
    md.enable(["table", "strikethrough"])
    md.core.ruler.push("heading_ids", _heading_ids)
    md.core.ruler.push("lone_images", _lone_images)

    def render_fence(self, tokens, idx, options, env):
        token = tokens[idx]
        code_html, lang = _highlight(token.content, token.info)
        label = escape(lang) if lang else "text"
        return (
            f'<div class="code-block" data-lang="{label}">'
            f'<div class="code-head"><span class="code-lang">{label}</span></div>'
            f'<pre class="highlight"><code>{code_html}</code></pre></div>\n'
        )

    def render_code_block(self, tokens, idx, options, env):
        code_html = escape(tokens[idx].content)
        return (
            '<div class="code-block" data-lang="text"><div class="code-head"><span class="code-lang">text</span></div>'
            f'<pre class="highlight"><code>{code_html}</code></pre></div>\n'
        )

    def render_paragraph_open(self, tokens, idx, options, env):
        return "<figure>" if tokens[idx].meta.get("figure") else "<p>"

    def render_paragraph_close(self, tokens, idx, options, env):
        return "</figure>\n" if tokens[idx].meta.get("figure") else "</p>\n"

    def render_image(self, tokens, idx, options, env):
        token = tokens[idx]
        src = token.attrGet("src") or ""
        alt = self.renderInlineAsText(token.children or [], options, env)
        title = token.attrGet("title") or ""
        info = (env.get("media") or {}).get(src)
        attrs = [f'alt="{escape(alt)}"']
        shown_src = src
        if info:
            shown_src = info["display_url"]
            attrs.append(f'width="{info["display_width"]}" height="{info["display_height"]}"')
        attrs.append('loading="lazy" decoding="async"')
        img = f'<img src="{escape(shown_src)}" {" ".join(attrs)}>'
        if info and shown_src != src:
            img = f'<a href="{escape(src)}" class="image-link">{img}</a>'
        if token.meta.get("figure"):
            return img + (f"<figcaption>{escape(title)}</figcaption>" if title else "")
        if title:
            img = img.replace("<img ", f'<img title="{escape(title)}" ', 1)
        return img

    def render_table_open(self, tokens, idx, options, env):
        return '<div class="table-wrap"><table>\n'

    def render_table_close(self, tokens, idx, options, env):
        return "</table></div>\n"

    md.add_render_rule("fence", render_fence)
    md.add_render_rule("code_block", render_code_block)
    md.add_render_rule("paragraph_open", render_paragraph_open)
    md.add_render_rule("paragraph_close", render_paragraph_close)
    md.add_render_rule("image", render_image)
    md.add_render_rule("table_open", render_table_open)
    md.add_render_rule("table_close", render_table_close)
    return md


_md = _build_parser()
_ALIGN = re.compile(r'style="text-align:(left|right|center)"')
_MEDIA_SRC = re.compile(r"\]\((/media/[^\s)\"']+)")


def media_urls(markdown_text):
    return set(_MEDIA_SRC.findall(markdown_text or ""))


def render_markdown(markdown_text, media_lookup=None):
    """Return html, toc, word_count, reading_minutes and has_h1.

    media_lookup(urls) -> {url: {display_url, display_width, display_height}}
    lets uploaded images render with their size (no layout jumps) and use the
    lighter resized copy.
    """
    markdown_text = markdown_text or ""
    env = {"media": media_lookup(media_urls(markdown_text)) if media_lookup else {}}
    html = _md.render(markdown_text, env)
    # Table alignment as classes, so the strict Content-Security-Policy needs no inline styles.
    html = _ALIGN.sub(lambda m: f'class="align-{m.group(1)}"', html)
    words = count_words(markdown_text)
    toc = env.get("toc", [])
    return {
        "html": _sanitize(html),
        "toc": [entry for entry in toc if entry["level"] in (2, 3)],
        "word_count": words,
        "reading_minutes": reading_minutes(words),
        "has_h1": any(entry["level"] == 1 for entry in toc),
    }


def plain_excerpt(markdown_text, length=200):
    """First paragraph-ish text, used when no excerpt was written."""
    text = re.sub(r"```.*?```", " ", markdown_text or "", flags=re.S)
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", text)
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s*", "", text, flags=re.M)
    text = re.sub(r"[*_`~|]", "", text)
    text = " ".join(text.split())
    if len(text) <= length:
        return text
    return text[:length].rsplit(" ", 1)[0].rstrip(",.;:") + "…"
