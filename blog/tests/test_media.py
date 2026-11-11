import io

from PIL import Image

from conftest import image_bytes, make_app


def test_upload_png_jpeg_webp_gif(admin, app):
    for fmt, name, mime in [("PNG", "a.png", "image/png"), ("JPEG", "b.jpg", "image/jpeg"),
                            ("WEBP", "c.webp", "image/webp"), ("GIF", "d.gif", "image/gif")]:
        r = admin.upload(image_bytes(fmt), name)
        assert r.status_code == 201, (fmt, r.get_json())
        item = r.get_json()["item"]
        assert item["mime_type"] == mime
        assert item["width"] == 800 and item["height"] == 600
        assert item["url"].startswith("/media/")
        served = admin.client.get(item["url"])
        assert served.status_code == 200
        assert served.headers["X-Content-Type-Options"] == "nosniff"


def test_large_image_gets_resized_copies(admin):
    item = admin.upload(image_bytes("JPEG", size=(3000, 2000)), "big.jpg").get_json()["item"]
    assert item["width"] == 2400 and item["height"] == 1600  # full copy capped at 2400px
    medium = Image.open(io.BytesIO(admin.client.get(item["medium_url"]).data))
    thumb = Image.open(io.BytesIO(admin.client.get(item["thumb_url"]).data))
    assert medium.width == 1200 and thumb.width == 640


def test_transparency_kept(admin):
    item = admin.upload(image_bytes("PNG", size=(1500, 900), mode="RGBA"), "alpha.png").get_json()["item"]
    for url in (item["url"], item["medium_url"], item["thumb_url"]):
        img = Image.open(io.BytesIO(admin.client.get(url).data))
        assert img.mode in ("RGBA", "LA", "P") and img.format == "PNG"


def test_animated_gif_kept_intact(admin):
    frames = [Image.new("RGB", (100, 100), c) for c in ("red", "green", "blue")]
    out = io.BytesIO()
    frames[0].save(out, "GIF", save_all=True, append_images=frames[1:], duration=100, loop=0)
    original = out.getvalue()
    item = admin.upload(original, "anim.gif").get_json()["item"]
    served = admin.client.get(item["url"]).data
    assert served == original
    assert Image.open(io.BytesIO(served)).n_frames == 3


def test_exif_location_removed(admin):
    img = Image.new("RGB", (400, 300), "white")
    exif = Image.Exif()
    exif[0x010F] = "PhoneMaker"  # Make
    exif[0x8825] = {1: "N", 2: (37.0, 0.0, 0.0)}  # GPS info
    out = io.BytesIO()
    img.save(out, "JPEG", exif=exif)
    item = admin.upload(out.getvalue(), "gps.jpg").get_json()["item"]
    stored = Image.open(io.BytesIO(admin.client.get(item["url"]).data))
    assert not stored.getexif()


def test_rejects_non_images_even_with_image_names(admin):
    for data, name in [
        (b"#!/bin/sh\nrm -rf /\n", "evil.png"),
        (b"<?php system($_GET['c']); ?>", "shell.jpg"),
        (b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>", "x.svg"),
        (b"MZ\x90\x00" + b"\x00" * 200, "setup.gif"),
        (b"", "empty.png"),
    ]:
        r = admin.upload(data, name)
        assert r.status_code == 400, name
    assert admin.client.get("/admin/blog/api/media").get_json()["total"] == 0


def test_rejects_unsupported_real_images(admin):
    r = admin.upload(image_bytes("BMP"), "pic.png")
    assert r.status_code == 400


def test_rejects_oversized_files(admin):
    big = image_bytes("PNG") + b"\x00" * (3 * 1024 * 1024)  # over the 2 MB test limit
    r = admin.upload(big, "huge.png")
    assert r.status_code in (400, 413)


def test_filename_cannot_escape_media_dir(admin, app):
    r = admin.upload(image_bytes("PNG"), "../../../../etc/passwd.png")
    item = r.get_json()["item"]
    assert ".." not in item["url"]
    assert item["original_name"] == "passwd.png"
    files = [p for p in app.config["MEDIA_DIR"].rglob("*") if p.is_file()]
    assert files and all(app.config["MEDIA_DIR"] in p.parents for p in files)
    assert admin.client.get("/media/../blog.sqlite3").status_code == 404


def test_insert_image_into_article(admin, app):
    item = admin.upload(image_bytes("JPEG", size=(2000, 1000)), "rack.jpg").get_json()["item"]
    md = f'Intro\n\n![Server rack]({item["url"]} "My homelab rack")\n'
    admin.publish(title="With image", body_md=md, featured_image_id=item["id"], featured_image_alt="Rack photo")
    html = app.test_client().get("/blog/with-image").get_data(as_text=True)
    assert "<figure>" in html and "My homelab rack</figcaption>" in html
    assert item["medium_url"] in html  # the lighter copy is shown
    assert 'alt="Server rack"' in html and 'loading="lazy"' in html
    assert 'width="1200" height="600"' in html
    assert 'alt="Rack photo"' in html  # featured image alt text
    listing = app.test_client().get("/blog").get_data(as_text=True)
    assert item["thumb_url"] in listing or item["medium_url"] in listing


def test_alt_text_and_caption_editing(admin):
    item = admin.upload(image_bytes(), "x.png").get_json()["item"]
    r = admin.client.post(f"/admin/blog/api/media/{item['id']}", json={"alt_text": "A blue box", "caption": "Box"},
                          headers=admin.headers())
    assert r.get_json()["item"]["alt_text"] == "A blue box"


def test_delete_unused_media_removes_files(admin, app):
    item = admin.upload(image_bytes("JPEG", size=(1600, 1000)), "x.jpg").get_json()["item"]
    paths = [app.config["MEDIA_DIR"] / u[len("/media/"):] for u in (item["url"], item["medium_url"], item["thumb_url"])]
    assert all(p.exists() for p in paths)
    r = admin.client.post(f"/admin/blog/media/{item['id']}/delete", data={"csrf_token": admin.csrf})
    assert r.status_code == 302
    assert not any(p.exists() for p in paths)
    assert admin.client.get(item["url"]).status_code == 404


def test_media_in_use_needs_extra_confirmation(admin):
    item = admin.upload(image_bytes(), "used.png").get_json()["item"]
    admin.create(title="Uses it", body_md=f"![x]({item['url']})")
    page = admin.client.get(f"/admin/blog/media/{item['id']}").get_data(as_text=True)
    assert "Uses it" in page
    r = admin.client.post(f"/admin/blog/media/{item['id']}/delete", data={"csrf_token": admin.csrf})
    assert r.status_code == 400
    r = admin.client.post(f"/admin/blog/media/{item['id']}/delete", data={"csrf_token": admin.csrf, "confirm_in_use": "yes"})
    assert r.status_code == 302


def test_media_survives_restart(admin, data_dir):
    item = admin.upload(image_bytes(), "keep.png").get_json()["item"]
    original = admin.client.get(item["url"]).data
    restarted = make_app(data_dir)
    client = restarted.test_client()
    assert client.get(item["url"]).data == original
    from conftest import Admin
    page = Admin(client).client.get("/admin/blog/media").get_data(as_text=True)
    assert "keep.png" in page


def test_library_upload_form(admin):
    r = admin.client.post(
        "/admin/blog/media/upload",
        data={"csrf_token": admin.csrf, "files": [(io.BytesIO(image_bytes()), "one.png"), (io.BytesIO(b"nope"), "two.png")]},
        content_type="multipart/form-data",
    )
    assert r.status_code == 400
    page = r.get_data(as_text=True)
    assert "two.png" in page and "1 image uploaded" in page


def test_rejects_too_many_pixels_before_decoding(admin):
    # 9000 x 5000 = 45 megapixels, above the 40 MP limit; compresses to a tiny PNG.
    r = admin.upload(image_bytes("PNG", size=(9000, 5000)), "huge-dimensions.png")
    assert r.status_code == 400
    assert "too many pixels" in r.get_json()["message"]
