from blogapp.render import render_markdown


def html(md):
    return render_markdown(md)["html"]


def test_headings_need_no_space_after_hashes():
    assert '<h2 id="setup">Setup</h2>' in html("##Setup")
    assert '<h3 id="next-steps">Next steps</h3>' in html("###Next steps")


def test_non_breaking_space_after_hashes_still_makes_a_heading():
    assert '<h2 id="setup">Setup</h2>' in html("## Setup")


def test_single_hash_word_stays_text_and_code_is_untouched():
    assert "<p>#hashtag</p>" in html("#hashtag")
    out = html("```\n##notaheading\n```")
    assert "<h2" not in out and "##notaheading" in out


def test_headings_show_in_table_of_contents():
    toc = render_markdown("##One\n\ntext\n\n### Two")["toc"]
    assert [(t["level"], t["text"]) for t in toc] == [(2, "One"), (3, "Two")]
