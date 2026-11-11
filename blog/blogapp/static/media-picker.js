// Media picker dialog used by the editor: browse, upload, pick, edit alt text/caption.
// Exposes window.MediaPicker = { open(handlers), upload(file) }.
(function () {
  'use strict';

  var dataEl = document.getElementById('editor-data');
  var dialog = document.getElementById('media-dialog');
  if (!dataEl || !dialog) return;
  var config = JSON.parse(dataEl.textContent);
  var listUrl = config.urls.media;

  var grid = document.getElementById('picker-grid');
  var more = document.getElementById('picker-more');
  var search = document.getElementById('picker-search');
  var fileInput = document.getElementById('picker-file');
  var drop = document.getElementById('picker-drop');
  var errorBox = document.getElementById('picker-error');
  var progress = document.getElementById('picker-progress');
  var detail = document.getElementById('picker-detail');
  var preview = document.getElementById('picker-preview');
  var meta = document.getElementById('picker-meta');
  var altInput = document.getElementById('picker-alt');
  var captionInput = document.getElementById('picker-caption');
  var insertBtn = document.getElementById('picker-insert');
  var featuredBtn = document.getElementById('picker-featured');

  var handlers = {};
  var page = 1;
  var selected = null;
  var searchTimer;

  function showError(message) {
    errorBox.textContent = message || '';
    errorBox.hidden = !message;
  }

  function sizeText(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }

  function tile(item) {
    var li = document.createElement('li');
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'media-tile';
    button.setAttribute('aria-pressed', 'false');
    var img = document.createElement('img');
    img.src = item.thumb_url;
    img.alt = '';
    img.loading = 'lazy';
    var label = document.createElement('span');
    label.className = 'media-tile-meta';
    var name = document.createElement('span');
    name.className = 'name';
    name.textContent = item.original_name || 'image';
    var dims = document.createElement('span');
    dims.className = 'muted small';
    dims.textContent = item.width + '×' + item.height + ' · ' + sizeText(item.size_bytes);
    label.appendChild(name);
    label.appendChild(dims);
    button.appendChild(img);
    button.appendChild(label);
    button.setAttribute('aria-label', 'Select ' + (item.alt_text || item.original_name || 'image'));
    button.addEventListener('click', function () { select(item, button); });
    li.appendChild(button);
    return li;
  }

  function select(item, button) {
    selected = item;
    Array.prototype.forEach.call(grid.querySelectorAll('.media-tile'), function (b) { b.setAttribute('aria-pressed', 'false'); });
    if (button) button.setAttribute('aria-pressed', 'true');
    detail.hidden = false;
    preview.src = item.medium_url;
    preview.alt = item.alt_text || '';
    meta.textContent = (item.original_name || 'image') + ' · ' + item.width + ' × ' + item.height + ' px · ' +
      sizeText(item.size_bytes) + ' · ' + item.mime_type;
    altInput.value = item.alt_text || '';
    captionInput.value = item.caption || '';
    featuredBtn.hidden = !handlers.onFeatured;
    insertBtn.hidden = !handlers.onInsert;
  }

  function load(reset) {
    if (reset) { page = 1; grid.innerHTML = ''; }
    var url = listUrl + '?page=' + page + '&q=' + encodeURIComponent(search.value.trim());
    return fetch(url, { headers: { 'X-Requested-With': 'fetch' }, credentials: 'same-origin' })
      .then(function (r) { if (!r.ok) throw new Error('Could not load images (' + r.status + ').'); return r.json(); })
      .then(function (data) {
        data.items.forEach(function (item) { grid.appendChild(tile(item)); });
        more.hidden = !data.has_more;
        if (!data.items.length && page === 1) {
          var li = document.createElement('li');
          li.className = 'muted';
          li.textContent = search.value ? 'No images match.' : 'No images yet. Upload one above.';
          grid.appendChild(li);
        }
      })
      .catch(function (err) { showError(err.message); });
  }

  function upload(file) {
    var form = new FormData();
    form.append('file', file);
    return fetch(listUrl, {
      method: 'POST',
      body: form,
      credentials: 'same-origin',
      headers: { 'X-CSRF-Token': config.csrf, 'X-Requested-With': 'fetch' },
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (body) {
        if (!r.ok) throw new Error((file.name ? file.name + ': ' : '') + (body.message || 'Upload failed (' + r.status + ').'));
        return body.item;
      });
    });
  }

  function uploadMany(files) {
    showError('');
    var list = Array.prototype.slice.call(files);
    var done = 0;
    var errors = [];
    var last = null;
    progress.textContent = 'Uploading ' + list.length + ' image(s)…';
    return list.reduce(function (chain, file) {
      return chain.then(function () {
        return upload(file).then(function (item) { last = item; done += 1; }, function (err) { errors.push(err.message); });
      });
    }, Promise.resolve()).then(function () {
      progress.textContent = done ? done + ' uploaded.' : '';
      if (errors.length) showError(errors.join(' '));
      return load(true).then(function () {
        if (last) {
          var first = grid.querySelector('.media-tile');
          select(last, first);
          altInput.focus();
        }
      });
    });
  }

  function saveText() {
    if (!selected) return Promise.resolve();
    var alt = altInput.value.trim();
    var caption = captionInput.value.trim();
    if (alt === (selected.alt_text || '') && caption === (selected.caption || '')) return Promise.resolve(selected);
    return fetch(listUrl + '/' + selected.id, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': config.csrf, 'X-Requested-With': 'fetch' },
      body: JSON.stringify({ alt_text: alt, caption: caption }),
    }).then(function (r) { return r.json(); }).then(function (body) { selected = body.item || selected; return selected; });
  }

  insertBtn.addEventListener('click', function () {
    var alt = altInput.value.trim();
    var caption = captionInput.value.trim();
    if (!alt && !window.confirm('This image has no alt text. Screen-reader users won\'t know what it shows. Insert anyway?')) {
      altInput.focus();
      return;
    }
    saveText().then(function () {
      if (handlers.onInsert) handlers.onInsert(selected, alt, caption);
      dialog.close();
    });
  });

  featuredBtn.addEventListener('click', function () {
    saveText().then(function () {
      if (handlers.onFeatured) handlers.onFeatured(selected, altInput.value.trim());
      dialog.close();
    });
  });

  fileInput.addEventListener('change', function () {
    if (fileInput.files.length) uploadMany(fileInput.files).then(function () { fileInput.value = ''; });
  });
  ['dragenter', 'dragover'].forEach(function (name) {
    drop.addEventListener(name, function (e) { e.preventDefault(); drop.classList.add('is-over'); });
  });
  ['dragleave', 'drop'].forEach(function (name) {
    drop.addEventListener(name, function (e) { e.preventDefault(); drop.classList.remove('is-over'); });
  });
  drop.addEventListener('drop', function (e) {
    if (e.dataTransfer && e.dataTransfer.files.length) uploadMany(e.dataTransfer.files);
  });
  more.addEventListener('click', function () { page += 1; load(false); });
  search.addEventListener('input', function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () { load(true); }, 300);
  });
  dialog.querySelector('[data-close]').addEventListener('click', function () { dialog.close(); });
  dialog.addEventListener('click', function (e) { if (e.target === dialog) dialog.close(); });

  window.MediaPicker = {
    open: function (h) {
      handlers = h || {};
      selected = null;
      detail.hidden = true;
      showError('');
      progress.textContent = '';
      dialog.showModal();
      load(true);
    },
    upload: upload,
  };
})();
