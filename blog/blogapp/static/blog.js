// Small progressive enhancements for the public blog. Everything works without it.
(function () {
  'use strict';

  // Theme toggle (hidden until this script runs, so there is never a dead button).
  var toggle = document.querySelector('[data-theme-toggle]');
  if (toggle) {
    var label = function () {
      var dark = document.documentElement.getAttribute('data-theme') !== 'light';
      var text = dark ? 'Switch to light mode' : 'Switch to dark mode';
      toggle.setAttribute('aria-label', text);
      toggle.setAttribute('title', text);
    };
    toggle.hidden = false;
    label();
    toggle.addEventListener('click', function () {
      var next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) { /* storage blocked */ }
      label();
    });
  }

  // Copy buttons on code blocks.
  var blocks = document.querySelectorAll('.prose .code-block');
  Array.prototype.forEach.call(blocks, function (block) {
    var head = block.querySelector('.code-head');
    var code = block.querySelector('pre code');
    if (!head || !code || !navigator.clipboard) return;
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'copy-btn';
    button.textContent = 'Copy';
    button.setAttribute('aria-label', 'Copy code to clipboard');
    var status = document.createElement('span');
    status.className = 'visually-hidden';
    status.setAttribute('aria-live', 'polite');
    head.appendChild(button);
    head.appendChild(status);
    var timer;
    button.addEventListener('click', function () {
      navigator.clipboard.writeText(code.innerText.replace(/\n$/, '')).then(function () {
        button.textContent = 'Copied';
        status.textContent = 'Code copied to clipboard';
      }, function () {
        button.textContent = 'Press Ctrl+C';
        var range = document.createRange();
        range.selectNodeContents(code);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      });
      clearTimeout(timer);
      timer = setTimeout(function () { button.textContent = 'Copy'; status.textContent = ''; }, 2000);
    });
  });
})();
