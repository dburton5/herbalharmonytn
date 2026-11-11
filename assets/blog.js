(function () {
  var btn = document.getElementById('menuBtn');
  var links = document.getElementById('navLinks');

  function setMenu(open) {
    if (!btn || !links) return;
    links.classList.toggle('open', open);
    document.body.classList.toggle('menu-open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }

  function closeMenu() { setMenu(false); }

  if (btn && links) {
    btn.addEventListener('click', function () {
      var open = !links.classList.contains('open');
      setMenu(open);
      if (open) {
        var first = links.querySelector('a');
        if (first) first.focus();
      }
    });
    links.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', closeMenu);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (links.classList.contains('open')) {
          closeMenu();
          btn.focus();
        }
      }
    });
  }

  var metaEl = document.getElementById('blog-meta');
  if (metaEl && location.hash) {
    var hash = location.hash.replace(/^#/, '');
    try { hash = decodeURIComponent(hash); } catch (err) { /* keep raw */ }
    var meta = {};
    try { meta = JSON.parse(metaEl.textContent); } catch (err) { meta = {}; }
    var slug = (meta.legacy && meta.legacy[hash]) || hash;
    var known = meta.slugs || [];
    if (known.indexOf(slug) !== -1) {
      location.replace('/blog/' + slug + '/');
      return;
    }
  }

  var cards = document.getElementById('postList')
    ? document.querySelectorAll('#postList .card')
    : [];
  if (cards.length) {
    var params = new URLSearchParams(location.search);
    var cat = params.get('category') || 'all';
    var tag = (params.get('tag') || '').toLowerCase();
    var browsingAll = cat === 'all' && !tag;
    var shown = 0;
    cards.forEach(function (card) {
      var okCat = cat === 'all' || card.getAttribute('data-category') === cat;
      var tags = (card.getAttribute('data-tags') || '').split('|').filter(Boolean);
      var okTag = !tag || tags.indexOf(tag) !== -1;
      var featuredDup = card.getAttribute('data-featured') === 'true';
      var show = okCat && okTag && !(browsingAll && featuredDup);
      card.hidden = !show;
      if (show) shown += 1;
    });
    var hero = document.getElementById('featured');
    if (hero) hero.hidden = !browsingAll;
    var listHeading = document.getElementById('listHeading');
    var empty = document.getElementById('emptyState');
    var emptyText = document.getElementById('emptyText');
    if (listHeading) {
      if (tag) listHeading.textContent = 'Tagged articles';
      else if (cat !== 'all') {
        var current = document.querySelector('.topics a[data-category="' + cat + '"]');
        listHeading.textContent = current ? current.textContent : 'Articles';
      } else listHeading.textContent = 'Latest';
    }
    if (empty) {
      empty.hidden = shown !== 0;
      if (emptyText && shown === 0) {
        if (cat === 'community-voices') {
          emptyText.textContent = 'No neighbor stories are up yet. If you live in Memphis, you can send one for Don to review.';
        } else if (tag) {
          emptyText.textContent = 'No articles carry that tag yet. Try a topic above, or read the full journal.';
        } else {
          emptyText.textContent = 'Nothing in this topic yet. Try another one, or read the latest articles.';
        }
      }
    }
    document.querySelectorAll('.topics a').forEach(function (a) {
      var aCat = a.getAttribute('data-category') || '';
      var aTag = (a.getAttribute('data-tag') || '').toLowerCase();
      var on = false;
      if (a.hasAttribute('data-all')) on = browsingAll;
      else if (aTag) on = aTag === tag;
      else if (aCat) on = !tag && aCat === cat;
      if (on) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    var currentTopic = document.querySelector('.topics a[aria-current="page"]');
    var bar = document.querySelector('.topics');
    if (bar && currentTopic) {
      var left = currentTopic.offsetLeft - 16;
      if (left > 0) bar.scrollLeft = left;
    }
  }

  var toc = document.getElementById('toc');
  if (toc && window.matchMedia('(max-width: 899px)').matches) {
    toc.open = false;
  }

  var form = document.getElementById('pitch-form');
  if (form) {
    var body = form.querySelector('[name="body"]');
    var file = form.querySelector('[name="manuscript"]');
    var error = document.getElementById('formError');
    function clearBodyError() {
      if (body) body.setCustomValidity('');
      if (error) error.hidden = true;
    }
    if (body) body.addEventListener('input', clearBodyError);
    if (file) file.addEventListener('change', clearBodyError);
    form.addEventListener('submit', function (e) {
      if (!body || !file) return;
      body.setCustomValidity('');
      var hasBody = body.value.trim().length > 0;
      var hasFile = file.files && file.files.length > 0;
      if (!hasBody && !hasFile) {
        e.preventDefault();
        var msg = 'Paste your draft or attach a document. One of the two is enough.';
        body.setCustomValidity(msg);
        if (error) {
          error.textContent = msg;
          error.hidden = false;
        }
        body.reportValidity();
        body.focus();
      }
    });
  }
})();
