// Shared admin behaviour: confirmations, closing menus, click-to-copy.
(function () {
  'use strict';

  document.addEventListener('submit', function (event) {
    var form = event.target;
    var message = form.getAttribute && form.getAttribute('data-confirm');
    if (message && !window.confirm(message)) event.preventDefault();
  });

  // Close an open "More" menu when clicking elsewhere or pressing Escape.
  document.addEventListener('click', function (event) {
    Array.prototype.forEach.call(document.querySelectorAll('details.more-actions[open]'), function (d) {
      if (!d.contains(event.target)) d.removeAttribute('open');
    });
  });
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    Array.prototype.forEach.call(document.querySelectorAll('details.more-actions[open]'), function (d) {
      d.removeAttribute('open');
      var summary = d.querySelector('summary');
      if (summary) summary.focus();
    });
  });

  Array.prototype.forEach.call(document.querySelectorAll('code.copyable'), function (code) {
    if (!navigator.clipboard) return;
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'copy-btn';
    button.textContent = 'Copy';
    button.addEventListener('click', function () {
      navigator.clipboard.writeText(code.textContent).then(function () {
        button.textContent = 'Copied';
        setTimeout(function () { button.textContent = 'Copy'; }, 1500);
      });
    });
    code.insertAdjacentElement('afterend', button);
  });
})();
