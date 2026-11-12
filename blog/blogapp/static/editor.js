// Article editor: Markdown toolbar, live preview, safe autosave, local backup, publishing actions.
//
// Saving rules
// * Only one save is ever in flight. Edits made during a save trigger another save afterwards.
// * Every save sends the version it was based on. If the server has a newer version
//   (another tab or device saved), it answers 409 and nothing is overwritten.
// * Drafts autosave ~2.5 s after typing stops. Live articles are never autosaved, so
//   half-finished edits never go public; they are kept in this browser until Update.
(function () {
  'use strict';

  var config = JSON.parse(document.getElementById('editor-data').textContent);
  var $ = function (id) { return document.getElementById(id); };

  var form = $('editor-form');
  var title = $('title');
  var slug = $('slug');
  var body = $('body');
  var excerpt = $('excerpt');
  var seo = $('seo');
  var category = $('category');
  var tags = $('tags');
  var featured = $('featured');
  var imageId = $('featured-image-id');
  var imageAlt = $('featured-alt');
  var statusEl = $('save-status');
  var actionError = $('action-error');

  var article = config.article; // null until first save
  var state = {
    version: article ? article.version : null,
    isPublic: article ? article.is_public : false,
    dirty: false,
    saving: null,       // promise of the save in flight
    again: false,       // another save requested while one was running
    conflict: false,
    lastSaved: null,    // serialized payload of the last successful save
    timer: null,
  };
  var AUTOSAVE_DELAY = 2500;
  var backupKey = function () { return 'blog-editor-backup-' + (article ? article.id : 'new'); };

  // ---- Payload -------------------------------------------------------------
  function collect() {
    return {
      title: title.value,
      slug: slug.value.trim(),
      slug_auto: slug.dataset.auto === '1',
      body_md: body.value,
      excerpt: excerpt.value,
      seo_description: seo.value,
      category_id: category.value || null,
      tags: tags.value,
      featured: featured.checked,
      featured_image_id: imageId.value || null,
      featured_image_alt: imageAlt.value,
    };
  }
  function serialize(data) { return JSON.stringify(data); }
  state.lastSaved = article ? serialize(collect()) : null;

  // ---- Status display ------------------------------------------------------
  function setStatus(kind, text) {
    statusEl.dataset.state = kind;
    statusEl.textContent = text;
  }
  function timeNow() {
    var d = new Date();
    return d.getHours() % 12 + (d.getHours() % 12 ? 0 : 12) + ':' + String(d.getMinutes()).padStart(2, '0') + (d.getHours() < 12 ? ' AM' : ' PM');
  }

  // ---- Local backup (survives a crash, closed tab or lost connection) ------
  var backupTimer;
  function backupSoon() {
    clearTimeout(backupTimer);
    backupTimer = setTimeout(function () {
      try { localStorage.setItem(backupKey(), JSON.stringify({ t: Date.now(), data: collect() })); } catch (e) { /* full or blocked */ }
    }, 500);
  }
  function clearBackup() {
    clearTimeout(backupTimer);
    try { localStorage.removeItem(backupKey()); } catch (e) { /* ignore */ }
  }
  function offerRestore() {
    var raw;
    try { raw = localStorage.getItem(backupKey()); } catch (e) { return; }
    if (!raw) return;
    var saved;
    try { saved = JSON.parse(raw); } catch (e) { clearBackup(); return; }
    var current = collect();
    if (!saved || !saved.data || serialize(saved.data) === serialize(current)) { clearBackup(); return; }
    if (article && article.updated_at && saved.t < Date.parse(article.updated_at)) {
      // The server copy is newer than the backup, so the backup is stale. Keep it around, but don't nag.
      return;
    }
    $('restore-time').textContent = new Date(saved.t).toLocaleString();
    $('restore-box').hidden = false;
    $('restore-yes').onclick = function () {
      var d = saved.data;
      title.value = d.title || ''; slug.value = d.slug || ''; slug.dataset.auto = d.slug_auto ? '1' : '0';
      body.value = d.body_md || ''; excerpt.value = d.excerpt || ''; seo.value = d.seo_description || '';
      category.value = d.category_id || ''; tags.value = d.tags || ''; featured.checked = !!d.featured;
      imageAlt.value = d.featured_image_alt || '';
      $('restore-box').hidden = true;
      changed();
    };
    $('restore-no').onclick = function () { clearBackup(); $('restore-box').hidden = true; };
  }

  // ---- Saving --------------------------------------------------------------
  function request(url, payload) {
    return fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': config.csrf, 'X-Requested-With': 'fetch' },
      body: JSON.stringify(payload),
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) { data._status = r.status; return data; });
    });
  }

  function applySaved(saved, sentPayload) {
    var wasNew = !article;
    article = Object.assign(article || {}, saved);
    state.version = saved.version;
    state.isPublic = saved.is_public;
    // The server may adjust the slug (e.g. "my-post-2" to keep it unique); what it
    // stored is what counts as saved, so the page doesn't look dirty afterwards.
    if (slug.value === sentPayload.slug && slug.value !== saved.slug) slug.value = saved.slug;
    sentPayload.slug = saved.slug;
    state.lastSaved = serialize(sentPayload);
    if (wasNew) {
      try {
        var old = localStorage.getItem('blog-editor-backup-new');
        localStorage.removeItem('blog-editor-backup-new');
        if (old) localStorage.setItem(backupKey(), old);
      } catch (e) { /* ignore */ }
      history.replaceState(null, '', saved.edit_url);
      document.querySelectorAll('[data-needs-article]').forEach(function (el) { el.hidden = false; });
    }
    $('word-count').textContent = saved.word_count + ' words';
    $('read-time').textContent = saved.reading_minutes + ' min read';
    $('h1-warning').hidden = !saved.has_h1;
  }

  function save(options) {
    options = options || {};
    if (state.conflict && !options.force) return Promise.resolve(false);
    if (state.saving) {
      state.again = true;
      return state.saving.then(function () { return save(options); });
    }
    clearTimeout(state.timer);
    var payload = collect();
    var sent = serialize(payload);
    var sentPayload = JSON.parse(sent);
    if (article && sent === state.lastSaved && !options.force) {
      state.dirty = false;
      setStatus('saved', 'Saved');
      return Promise.resolve(true);
    }
    payload.autosave = !!options.autosave;
    payload.force = !!options.force;
    payload.base_version = state.version;
    setStatus('saving', options.autosave ? 'Autosaving…' : 'Saving…');
    var url = article ? article.save_url : config.urls.create;
    state.saving = request(url, payload).then(function (res) {
      if (res.ok) {
        applySaved(res.article, sentPayload);
        var stillDirty = serialize(collect()) !== state.lastSaved;
        state.dirty = stillDirty;
        state.conflict = false;
        $('conflict-box').hidden = true;
        clearFieldErrors();
        if (stillDirty) {
          setStatus('dirty', 'Unsaved changes');
          backupSoon();
          scheduleAutosave();
        } else {
          clearBackup();
          setStatus('saved', (options.autosave ? 'Autosaved ' : 'Saved ') + timeNow());
        }
        return true;
      }
      if (res._status === 409) {
        state.conflict = true;
        $('conflict-text').textContent = res.message;
        $('conflict-box').hidden = false;
        setStatus('error', 'Not saved — newer version exists');
        backupSoon();
        return false;
      }
      if (res._status === 401) {
        setStatus('error', 'Signed out — your text is kept in this browser');
        backupSoon();
        showActionError('Your session ended. Open the sign-in page in a new tab, sign in, then come back and save.');
        return false;
      }
      if (res.field === 'autosave') {
        state.isPublic = true;
        setStatus('dirty', 'Unsaved changes');
        return false;
      }
      setStatus('error', 'Not saved');
      if (res.field === 'slug') { showFieldError('slug-error', res.message); }
      else { showActionError(res.message || 'Saving failed (' + res._status + ').'); }
      return false;
    }, function () {
      setStatus('error', 'Offline — not saved. Your text is kept in this browser.');
      backupSoon();
      return false;
    }).then(function (ok) {
      state.saving = null;
      if (state.again) {
        state.again = false;
        if (state.dirty) scheduleAutosave();
      }
      return ok;
    });
    return state.saving;
  }

  function scheduleAutosave() {
    clearTimeout(state.timer);
    if (state.isPublic || state.conflict) return;
    if (!article && !title.value.trim() && !body.value.trim()) return; // nothing worth creating yet
    state.timer = setTimeout(function () { save({ autosave: true }); }, AUTOSAVE_DELAY);
  }

  function changed() {
    state.dirty = true;
    if (!state.conflict) setStatus('dirty', 'Unsaved changes');
    backupSoon();
    scheduleAutosave();
    updateCounts();
    if (previewVisible()) schedulePreview();
  }

  function showFieldError(id, message) {
    var el = $(id);
    el.textContent = message;
    el.hidden = false;
  }
  function clearFieldErrors() {
    ['slug-error', 'action-error'].forEach(function (id) { $(id).hidden = true; });
  }
  function showActionError(message) {
    actionError.textContent = message;
    actionError.hidden = false;
  }

  // ---- Inputs --------------------------------------------------------------
  function slugify(text) {
    return text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '');
  }
  title.addEventListener('input', function () {
    if (slug.dataset.auto === '1' && !(article && article.is_public)) slug.value = slugify(title.value);
  });
  slug.addEventListener('input', function () {
    slug.dataset.auto = '0';
    var cleaned = slug.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-{2,}/g, '-');
    if (cleaned !== slug.value) slug.value = cleaned;
  });
  $('slug-regen').addEventListener('click', function () {
    slug.value = slugify(title.value);
    slug.dataset.auto = article && article.is_public ? '0' : '1';
    changed();
  });
  form.addEventListener('input', function (e) { if (e.target.id !== 'publish-at') changed(); });
  form.addEventListener('change', function (e) {
    if (e.target.tagName === 'SELECT' || e.target.type === 'checkbox') changed();
  });
  form.addEventListener('submit', function (e) { e.preventDefault(); save(); });

  function updateCounts() {
    var text = body.value.replace(/```[\s\S]*?```|`[^`]*`|!\[[^\]]*\]\([^)]*\)|[#>*_~`|\[\]()-]/g, ' ');
    var words = (text.match(/[A-Za-z0-9][A-Za-z0-9'’.-]*/g) || []).length;
    $('word-count').textContent = words + ' word' + (words === 1 ? '' : 's');
    $('read-time').textContent = Math.max(1, Math.ceil(words / 220)) + ' min read';
    $('h1-warning').hidden = !/^#\s/m.test(body.value.replace(/```[\s\S]*?```/g, ''));
    $('seo-count').textContent = seo.value.length;
  }
  updateCounts();

  // ---- Toolbar -------------------------------------------------------------
  function replaceSelection(before, after, placeholder) {
    var start = body.selectionStart;
    var end = body.selectionEnd;
    var selected = body.value.slice(start, end) || placeholder || '';
    body.setRangeText(before + selected + after, start, end, 'end');
    body.setSelectionRange(start + before.length, start + before.length + selected.length);
    body.focus();
    changed();
  }
  function prefixLines(prefix, numbered) {
    var value = body.value;
    var start = value.lastIndexOf('\n', body.selectionStart - 1) + 1;
    var endIdx = value.indexOf('\n', body.selectionEnd);
    var end = endIdx === -1 ? value.length : endIdx;
    var lines = value.slice(start, end).split('\n');
    var out = lines.map(function (line, i) {
      var clean = line.replace(/^(#{1,6}\s*|>\s?|[-*+]\s+|\d+\.\s+)/, '');
      return (numbered ? (i + 1) + '. ' : prefix) + clean;
    }).join('\n');
    body.setRangeText(out, start, end, 'end');
    body.focus();
    changed();
  }
  function insertBlock(text) {
    var start = body.selectionStart;
    var before = body.value.slice(0, start);
    var lead = before && !/\n\n$/.test(before) ? (/\n$/.test(before) ? '\n' : '\n\n') : '';
    body.setRangeText(lead + text + '\n\n', start, body.selectionEnd, 'end');
    body.focus();
    changed();
  }
  var actions = {
    h1: function () { prefixLines('# '); },
    h2: function () { prefixLines('## '); },
    h3: function () { prefixLines('### '); },
    h4: function () { prefixLines('#### '); },
    bold: function () { replaceSelection('**', '**', 'bold text'); },
    italic: function () { replaceSelection('*', '*', 'italic text'); },
    strike: function () { replaceSelection('~~', '~~', 'struck text'); },
    code: function () { replaceSelection('`', '`', 'code'); },
    link: function () {
      var url = window.prompt('Link address (https://…)', 'https://');
      if (!url || url === 'https://') return;
      replaceSelection('[', '](' + url.trim() + ')', 'link text');
    },
    ul: function () { prefixLines('- '); },
    ol: function () { prefixLines('', true); },
    quote: function () { prefixLines('> '); },
    codeblock: function () {
      var sel = body.value.slice(body.selectionStart, body.selectionEnd);
      insertBlock('```bash\n' + (sel || 'your code here') + '\n```');
    },
    table: function () { insertBlock('| Column | Column |\n|--------|--------|\n| Cell   | Cell   |'); },
    hr: function () { insertBlock('---'); },
    image: function () { openPicker(); },
  };
  document.querySelectorAll('[data-md]').forEach(function (button) {
    button.addEventListener('click', function () { actions[button.dataset.md](); });
  });
  body.addEventListener('keydown', function (e) {
    if (!(e.ctrlKey || e.metaKey)) return;
    var key = e.key.toLowerCase();
    if (key === 'b') { e.preventDefault(); actions.bold(); }
    else if (key === 'i') { e.preventDefault(); actions.italic(); }
    else if (key === 'k') { e.preventDefault(); actions.link(); }
  });
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
  });

  // ---- Images --------------------------------------------------------------
  function imageMarkdown(item, alt, caption) {
    var cleanAlt = (alt || '').replace(/[\[\]]/g, '');
    var cleanCaption = (caption || '').replace(/"/g, '\'');
    return '![' + cleanAlt + '](' + item.url + (cleanCaption ? ' "' + cleanCaption + '"' : '') + ')';
  }
  function openPicker() {
    var start = body.selectionStart;
    var end = body.selectionEnd;
    window.MediaPicker.open({
      onInsert: function (item, alt, caption) {
        body.setSelectionRange(start, end);
        insertBlock(imageMarkdown(item, alt, caption));
      },
      onFeatured: setFeatured,
    });
  }
  function setFeatured(item, alt) {
    imageId.value = item.id;
    $('featured-img').src = item.thumb_url;
    $('featured-preview').hidden = false;
    $('featured-remove').hidden = false;
    $('featured-choose').textContent = 'Change';
    if (alt && !imageAlt.value) imageAlt.value = alt;
    changed();
  }
  $('featured-choose').addEventListener('click', function () {
    window.MediaPicker.open({ onFeatured: setFeatured });
  });
  $('featured-remove').addEventListener('click', function () {
    imageId.value = '';
    $('featured-preview').hidden = true;
    $('featured-remove').hidden = true;
    $('featured-choose').textContent = 'Choose image';
    changed();
  });

  // Drag-and-drop or paste images straight into the text.
  function uploadInto(files) {
    var images = Array.prototype.filter.call(files, function (f) { return /^image\//.test(f.type); });
    if (!images.length) return false;
    images.forEach(function (file) {
      var marker = '![Uploading ' + (file.name || 'image').replace(/[\[\]]/g, '') + '…]()';
      insertBlock(marker);
      window.MediaPicker.upload(file).then(function (item) {
        body.value = body.value.replace(marker, imageMarkdown(item, '', ''));
        changed();
        setStatus('dirty', 'Image uploaded — add alt text between the [ ]');
      }, function (err) {
        body.value = body.value.replace(marker + '\n\n', '').replace(marker, '');
        changed();
        showActionError(err.message);
      });
    });
    return true;
  }
  var hint = $('drop-hint');
  body.addEventListener('dragover', function (e) {
    if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') !== -1) {
      e.preventDefault();
      hint.hidden = false;
    }
  });
  body.addEventListener('dragleave', function () { hint.hidden = true; });
  body.addEventListener('drop', function (e) {
    hint.hidden = true;
    if (e.dataTransfer && e.dataTransfer.files.length) {
      e.preventDefault();
      body.focus();
      uploadInto(e.dataTransfer.files);
    }
  });
  body.addEventListener('paste', function (e) {
    if (e.clipboardData && e.clipboardData.files.length && uploadInto(e.clipboardData.files)) e.preventDefault();
  });

  // ---- Preview -------------------------------------------------------------
  var panes = $('panes');
  var previewPane = $('pane-preview');
  var writePane = $('pane-write');
  var previewEl = $('preview');
  var previewTimer;
  var previewSeq = 0;
  function previewVisible() { return !previewPane.hidden; }
  function renderPreview() {
    var seq = ++previewSeq;
    request(config.urls.preview, { body_md: body.value }).then(function (res) {
      if (seq !== previewSeq || !res.html && res.html !== '') return;
      previewEl.innerHTML = res.html; // sanitized on the server
    });
  }
  function schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(renderPreview, 400);
  }
  function setView(view) {
    panes.dataset.view = view;
    writePane.hidden = view === 'preview';
    previewPane.hidden = view === 'write';
    ['write', 'preview', 'split'].forEach(function (v) {
      $('tab-' + v).setAttribute('aria-selected', String(v === view));
    });
    if (view !== 'write') renderPreview();
  }
  ['write', 'preview', 'split'].forEach(function (v) {
    $('tab-' + v).addEventListener('click', function () { setView(v); });
  });

  $('preview-btn').addEventListener('click', function () {
    if (state.isPublic) {
      // Saving a live article publishes the change, so preview in place instead.
      setView('preview');
      previewPane.scrollIntoView({ block: 'start' });
      return;
    }
    var win = window.open('', '_blank');
    save().then(function (ok) {
      if (ok && article) {
        if (win) win.location = article.edit_url.replace(/\/edit$/, '/preview');
      } else if (win) {
        win.close();
      }
    });
  });

  // ---- Publishing actions --------------------------------------------------
  var notices = { publish: 'published', schedule: 'scheduled', unpublish: 'unpublished', archive: 'archived', restore: 'restored' };
  document.querySelectorAll('[data-action]').forEach(function (button) {
    button.addEventListener('click', function () {
      var action = button.dataset.action;
      actionError.hidden = true;
      var payload = {};
      if (action === 'schedule') {
        payload.publish_at = $('publish-at').value;
        if (!payload.publish_at) { showActionError('Pick a date and time first.'); $('publish-at').focus(); return; }
      }
      if (action === 'publish' && !window.confirm('Publish this article now? It will be visible to everyone.')) return;
      if (action === 'unpublish' && !window.confirm('Unpublish? The article will be hidden from the blog and become a draft.')) return;
      button.disabled = true;
      // Save first so the action applies to exactly what is on screen.
      save().then(function (ok) {
        if (!ok || !article) { button.disabled = false; return null; }
        var url = article.edit_url.replace(/\/edit$/, '/' + action);
        return request(url, payload).then(function (res) {
          button.disabled = false;
          if (res._status >= 400) { showActionError(res.message || 'That didn\'t work (' + res._status + ').'); return; }
          state.dirty = false;
          clearBackup();
          if (action === 'duplicate') { window.location = res.edit_url + '?notice=duplicated'; return; }
          window.location = article.edit_url + '?notice=' + notices[action];
        });
      });
    });
  });

  // ---- Conflict handling -----------------------------------------------------
  $('conflict-reload').addEventListener('click', function () {
    if (!window.confirm('Reload the newer version? Copy anything you need from this page first — your text stays in this browser\'s backup.')) return;
    state.dirty = false;
    window.location.reload();
  });
  $('conflict-overwrite').addEventListener('click', function () {
    if (!window.confirm('Replace the newer saved version with what is on this screen? (The newer one stays in Version history if it was a manual save.)')) return;
    state.conflict = false;
    $('conflict-box').hidden = true;
    save({ force: true });
  });

  // ---- Leaving the page ------------------------------------------------------
  window.addEventListener('beforeunload', function (e) {
    if (state.dirty || state.saving) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  offerRestore();
  if (!article) title.focus();
})();
