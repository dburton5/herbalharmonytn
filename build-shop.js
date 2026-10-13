/*
 * Herbal Harmony TN — Shop page generator
 * ---------------------------------------
 * Reads every product file in /products (created and edited in the Decap
 * admin panel at /admin) and writes static pages:
 *
 *   /shop/index.html               the shop grid
 *   /shop/<slug>/index.html        one detail page per product
 *   /shop/thank-you/index.html     where Stripe sends customers after paying
 *
 * Runs on every Netlify build (see netlify.toml). No dependencies.
 * Run locally with:  node build-shop.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PRODUCTS_DIR = path.join(ROOT, 'products');
const SETTINGS_FILE = path.join(ROOT, 'settings', 'shop.json');
const REVIEWS_DIR = path.join(ROOT, 'reviews');
const OUT_DIR = path.join(ROOT, 'shop');
const SITE_URL = 'https://herbalharmonytn.com';
const FDA_DISCLAIMER =
  'These statements have not been evaluated by the Food and Drug Administration. ' +
  'This product is not intended to diagnose, treat, cure, or prevent any disease.';

/* ---------- helpers ---------- */

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function money(n) {
  const v = Number(n);
  if (!isFinite(v)) return '';
  return '$' + (Number.isInteger(v) ? String(v) : v.toFixed(2));
}

// Small, safe Markdown subset: paragraphs, line breaks, **bold**, *italic*,
// [links](https://...), and "- " bullet lists. Everything is escaped first.
function inlineMd(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>');
}

function md(text) {
  if (!text) return '';
  return String(text)
    .replace(/\r\n/g, '\n')
    .trim()
    .split(/\n{2,}/)
    .map(function (block) {
      const lines = block.split('\n');
      if (lines.every(function (l) { return /^\s*[-*]\s+/.test(l); })) {
        return '<ul>' + lines.map(function (l) {
          return '<li>' + inlineMd(l.replace(/^\s*[-*]\s+/, '')) + '</li>';
        }).join('') + '</ul>';
      }
      return '<p>' + lines.map(inlineMd).join('<br>') + '</p>';
    })
    .join('\n');
}

function photoSrc(p) {
  return (p && (p.image || p)) || '';
}

function absUrl(src) {
  if (!src) return '';
  return /^https?:\/\//.test(src) ? src : SITE_URL + (src.charAt(0) === '/' ? '' : '/') + src;
}

/* ---------- load shop settings ---------- */

// Store-wide text edited in the admin panel under "Shop Settings".
function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) || {};
  } catch (e) {
    console.warn('No shop settings found (' + e.message + ') — using defaults.');
    return {};
  }
}
const SETTINGS = loadSettings();

/* ---------- load reviews ---------- */

// Approved customer reviews, added in the admin panel under "Reviews".
function loadReviews() {
  let files = [];
  try {
    files = fs.readdirSync(REVIEWS_DIR).filter(function (f) { return /\.json$/.test(f); });
  } catch (e) {
    return [];
  }
  const out = [];
  files.forEach(function (f) {
    let r;
    try {
      r = JSON.parse(fs.readFileSync(path.join(REVIEWS_DIR, f), 'utf8'));
    } catch (e) {
      console.error('Skipping review ' + f + ': not valid JSON (' + e.message + ')');
      return;
    }
    const rating = Math.round(Number(r.rating));
    if (r.approved === false || !r.name || !r.text || !r.product || !(rating >= 1 && rating <= 5)) return;
    out.push({
      name: String(r.name).trim(),
      city: r.city ? String(r.city).trim() : '',
      product: String(r.product).trim(),
      rating: rating,
      text: String(r.text).trim(),
      date: r.date ? String(r.date).slice(0, 10) : ''
    });
  });
  out.sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
  return out;
}
const REVIEWS = loadReviews();

function reviewsFor(slug) {
  return REVIEWS.filter(function (r) { return r.product === slug; });
}

function avgRating(list) {
  if (!list.length) return 0;
  return list.reduce(function (t, r) { return t + r.rating; }, 0) / list.length;
}

function stars(n, label) {
  const full = Math.round(n);
  let s = '';
  for (let i = 1; i <= 5; i++) s += '<span class="star' + (i <= full ? ' on' : '') + '">★</span>';
  return '<span class="stars" role="img" aria-label="' + esc(label || (full + ' out of 5 stars')) + '">' + s + '</span>';
}

function prettyDate(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return '';
  const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const parts = d.split('-');
  return m[Number(parts[1]) - 1] + ' ' + Number(parts[2]) + ', ' + parts[0];
}

function reviewsSection(p) {
  const list = reviewsFor(p.slug);
  const avg = avgRating(list);
  const summary = list.length
    ? '<div class="rv-summary">' + stars(avg, avg.toFixed(1) + ' out of 5 stars') +
      '<span class="rv-avg">' + avg.toFixed(1) + '</span><span class="rv-count">' + list.length + ' review' + (list.length === 1 ? '' : 's') + '</span></div>'
    : '<p class="rv-empty">No reviews yet. Enjoying your jar? Be the first to share how you take your cup.</p>';
  const items = list.map(function (r) {
    return '<li class="rv-item">' + stars(r.rating) +
      '<p class="rv-text">' + esc(r.text).replace(/\n+/g, '<br>') + '</p>' +
      '<p class="rv-meta"><strong>' + esc(r.name) + '</strong>' + (r.city ? ' · ' + esc(r.city) : '') +
      (prettyDate(r.date) ? ' · ' + prettyDate(r.date) : '') + '</p></li>';
  }).join('');
  const formName = 'review';
  const form =
    '<details class="rv-form-wrap" id="write-review">\n' +
    '  <summary class="btn btn-outline-dark">Write a Review</summary>\n' +
    '  <form class="rv-form" name="' + formName + '" method="POST" action="/shop/review-thanks/" data-netlify="true" netlify-honeypot="company">\n' +
    '    <input type="hidden" name="form-name" value="' + formName + '">\n' +
    '    <input type="hidden" name="product" value="' + esc(p.slug) + '">\n' +
    '    <p class="rv-hp"><label>Leave this empty <input name="company" tabindex="-1" autocomplete="off"></label></p>\n' +
    '    <fieldset class="rv-rate"><legend>Your rating</legend><div class="rv-stars-in">' +
    [5, 4, 3, 2, 1].map(function (n) {
      return '<input type="radio" id="rate' + n + '" name="rating" value="' + n + '"' + (n === 5 ? ' checked' : '') + ' required>' +
        '<label for="rate' + n + '" title="' + n + ' star' + (n === 1 ? '' : 's') + '">★<span class="visually-hidden">' + n + ' star' + (n === 1 ? '' : 's') + '</span></label>';
    }).join('') + '</div></fieldset>\n' +
    '    <label>Your name <span class="hint">(first name and last initial is fine)</span><input name="name" required maxlength="60" autocomplete="name"></label>\n' +
    '    <label>City <span class="hint">(optional)</span><input name="city" maxlength="60"></label>\n' +
    '    <label>Your review<textarea name="review" required rows="4" maxlength="1500" placeholder="How do you enjoy it? Flavor, aroma, your favorite time for a cup…"></textarea></label>\n' +
    '    <label>Email <span class="hint">(optional, never shown)</span><input type="email" name="email" autocomplete="email"></label>\n' +
    '    <button type="submit" class="btn btn-buy">Send Review</button>\n' +
    '    <p class="rv-note">Reviews are read before they appear on the site.</p>\n' +
    '  </form>\n' +
    '</details>\n';
  return '<section class="reviews" id="reviews">\n<h2>Reviews</h2>\n' + summary + '\n' +
    (items ? '<ul class="rv-list">' + items + '</ul>\n' : '') + form + '</section>\n';
}

/* ---------- load products ---------- */

function loadProducts() {
  let files = [];
  try {
    files = fs.readdirSync(PRODUCTS_DIR).filter(function (f) { return /\.json$/.test(f); });
  } catch (e) {
    console.warn('No products folder yet — building an empty shop.');
  }
  const seen = {};
  const products = [];
  files.forEach(function (f) {
    let p;
    try {
      p = JSON.parse(fs.readFileSync(path.join(PRODUCTS_DIR, f), 'utf8'));
    } catch (e) {
      console.error('Skipping ' + f + ': not valid JSON (' + e.message + ')');
      return;
    }
    p.slug = String(p.slug || f.replace(/\.json$/, ''))
      .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (!p.name || !p.slug) {
      console.error('Skipping ' + f + ': needs a name and slug.');
      return;
    }
    if (p.slug === 'thank-you' || p.slug === 'review-thanks') {
      console.error('Skipping ' + f + ': "' + p.slug + '" is reserved for a confirmation page.');
      return;
    }
    if (seen[p.slug]) {
      console.error('Skipping ' + f + ': slug "' + p.slug + '" is already used by ' + seen[p.slug] + '.');
      return;
    }
    if (p.published === false) return;
    seen[p.slug] = f;
    p.photos = Array.isArray(p.photos) ? p.photos.filter(photoSrc) : [];
    p.ingredients = Array.isArray(p.ingredients) ? p.ingredients.filter(Boolean) : [];
    p.inStock = p.inStock !== false;
    p.showDisclaimer = p.showDisclaimer !== false;
    p.order = isFinite(Number(p.order)) ? Number(p.order) : 100;
    if (p.buyLink && !/^https:\/\/(buy|checkout)\.stripe\.com\//.test(p.buyLink)) {
      console.warn('Warning: ' + p.name + ' buy link is not a Stripe Payment Link: ' + p.buyLink);
    }
    products.push(p);
  });
  products.sort(function (a, b) { return a.order - b.order || a.name.localeCompare(b.name); });
  return products;
}

/* ---------- shared layout ---------- */

function head(opts) {
  return '<!DOCTYPE html>\n<html lang="en">\n<head>\n' +
    '<!-- Google tag (gtag.js) -->\n' +
    '<script async src="https://www.googletagmanager.com/gtag/js?id=G-S7YN9JLEH8"></script>\n' +
    '<script>\n' +
    '  window.dataLayer = window.dataLayer || [];\n' +
    '  function gtag(){dataLayer.push(arguments);}\n' +
    '  gtag(\'js\', new Date());\n' +
    '\n' +
    '  gtag(\'config\', \'G-S7YN9JLEH8\');\n' +
    '</script>\n' +
    '<meta charset="UTF-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
    '<title>' + esc(opts.title) + '</title>\n' +
    '<meta name="description" content="' + esc(opts.description) + '">\n' +
    (opts.noindex ? '<meta name="robots" content="noindex">\n' : '') +
    '<link rel="canonical" href="' + esc(SITE_URL + opts.path) + '">\n' +
    '<meta property="og:type" content="' + (opts.ogType || 'website') + '">\n' +
    '<meta property="og:site_name" content="Herbal Harmony TN">\n' +
    '<meta property="og:title" content="' + esc(opts.title) + '">\n' +
    '<meta property="og:description" content="' + esc(opts.description) + '">\n' +
    '<meta property="og:url" content="' + esc(SITE_URL + opts.path) + '">\n' +
    (opts.image ? '<meta property="og:image" content="' + esc(absUrl(opts.image)) + '">\n' : '') +
    '<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
    '<link href="https://fonts.googleapis.com/css2?family=Zilla+Slab:wght@500;600;700&family=Great+Vibes&family=Lora:ital,wght@0,400;0,500;1,400&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">\n' +
    '<link rel="stylesheet" href="/assets/shop.css">\n' +
    '<link rel="alternate" type="application/rss+xml" title="Herbal Harmony TN" href="' + SITE_URL + '/rss.xml">\n' +
    (opts.extraHead || '') +
    '</head>\n<body>\n' +
    '<nav class="site-nav">\n' +
    '  <a href="/" class="nav-logo"><img src="/images/logo.png" alt="Herbal Harmony"></a>\n' +
    '  <ul class="nav-links" id="navLinks">\n' +
    '    <li><a href="/">Home</a></li>\n' +
    '    <li><a href="/#about">About</a></li>\n' +
    '    <li><a href="/blog/">Blog</a></li>\n' +
    '    <li><a href="/book/">Book</a></li>\n' +
    '    <li><a href="/shop/" class="active">Shop</a></li>\n' +
    '  </ul>\n' +
    '  <button class="menu-toggle" aria-label="Menu" aria-controls="navLinks" aria-expanded="false" onclick="var o=document.getElementById(\'navLinks\').classList.toggle(\'open\');this.setAttribute(\'aria-expanded\',o)"><span></span><span></span><span></span></button>\n' +
    '</nav>\n';
}

function foot() {
  return '<footer class="site-foot">\n' +
    '  <div class="foot-grid">\n' +
    '    <div class="foot-brand">\n' +
    '      <p class="foot-script">Harmonize Life.</p>\n' +
    '      <p>Small-batch herbal goods, hand-blended in Memphis, TN.</p>\n' +
    '    </div>\n' +
    '    <div class="foot-col"><h4>Explore</h4><a href="/">Home</a><a href="/#about">About</a><a href="/blog/">Blog</a><a href="/book/">Book</a><a href="/shop/">Shop</a></div>\n' +
    '  </div>\n' +
    '  <div class="foot-bottom">&copy; ' + new Date().getFullYear() + ' Herbal Harmony TN &nbsp;·&nbsp; Memphis, TN &nbsp;·&nbsp; Secure checkout by Stripe</div>\n' +
    '</footer>\n</body>\n</html>\n';
}

/* ---------- buy button ---------- */

function buyButton(p, cls) {
  if (!p.inStock) return '<span class="btn btn-disabled ' + (cls || '') + '">Sold Out</span>';
  if (!p.buyLink) return '<span class="btn btn-disabled ' + (cls || '') + '">Coming Soon</span>';
  return '<a class="btn btn-buy ' + (cls || '') + '" href="' + esc(p.buyLink) + '">Buy Now · ' + esc(money(p.price)) + '</a>';
}

/* ---------- shop grid ---------- */

function card(p) {
  const img = photoSrc(p.photos[0]);
  const alt = (p.photos[0] && p.photos[0].alt) || p.name;
  return '<a class="pcard" href="/shop/' + esc(p.slug) + '/">\n' +
    '  <div class="pcard-img">' +
    (img ? '<img src="' + esc(img) + '" alt="' + esc(alt) + '" loading="lazy">' : '<div class="pcard-noimg">Photo coming soon</div>') +
    (!p.inStock ? '<span class="badge">Sold Out</span>' : (!p.buyLink ? '<span class="badge badge-soon">Coming Soon</span>' : '')) +
    '</div>\n' +
    '  <div class="pcard-body">\n' +
    (p.category ? '    <p class="eyebrow">' + esc(p.category) + '</p>\n' : '') +
    '    <h2>' + esc(p.name) + '</h2>\n' +
    '    <p class="pcard-desc">' + esc(p.shortDescription || '') + '</p>\n' +
    '    <div class="pcard-foot"><span class="price">' + esc(money(p.price)) + '</span>' +
    (p.size ? '<span class="pcard-size">' + esc(p.size) + '</span>' : '') + '</div>\n' +
    '    <span class="pcard-link">View details &rarr;</span>\n' +
    '  </div>\n</a>\n';
}

function shopPage(products) {
  const cards = products.map(card).join('');
  const comingSoon = products.length < 3
    ? '<div class="pcard pcard-soon"><p class="script">More on the shelf soon</p><p>New small-batch blends and herbal goods are in the works. Check back — or follow along on the <a href="/blog/">blog</a>.</p></div>\n'
    : '';
  return head({
      title: 'Shop — Herbal Harmony TN',
      description: 'Small-batch, hand-blended herbal teas and goods from Herbal Harmony TN in Memphis, Tennessee.',
      path: '/shop/'
    }) +
    '<header class="shop-hero">\n' +
    '  <p class="eyebrow">Small Batch · Hand-Blended in Memphis, TN</p>\n' +
    '  <h1>From Our Hands to Yours</h1>\n' +
    '  <p class="script hero-script">Harmonize Life.</p>\n' +
    (SETTINGS.fulfillmentBanner ? '  <p class="hero-note">' + esc(SETTINGS.fulfillmentBanner) + '</p>\n' : '') +
    '</header>\n' +
    '<main class="shop-main">\n' +
    (products.length
      ? '<div class="pgrid">\n' + cards + comingSoon + '</div>\n'
      : '<p class="empty">Our first products are on the way — check back soon.</p>\n') +
    '</main>\n' + foot();
}

/* ---------- product detail ---------- */

function productPage(p) {
  const imgs = p.photos;
  const main = imgs[0];
  const gallery = imgs.length
    ? '<div class="gallery">\n' +
      '  <div class="gallery-main"><img id="mainImg" src="' + esc(photoSrc(main)) + '" alt="' + esc(main.alt || p.name) + '"></div>\n' +
      (imgs.length > 1
        ? '  <div class="thumbs">' + imgs.map(function (ph, i) {
            return '<button type="button" class="thumb' + (i === 0 ? ' on' : '') + '" data-src="' + esc(photoSrc(ph)) + '" data-alt="' + esc(ph.alt || p.name) + '" aria-label="Show photo ' + (i + 1) + '"><img src="' + esc(photoSrc(ph)) + '" alt=""></button>';
          }).join('') + '</div>\n'
        : '') +
      '</div>\n'
    : '<div class="gallery"><div class="gallery-main pcard-noimg">Photo coming soon</div></div>\n';

  const facts = [];
  if (p.size) facts.push('<li><span>Size</span>' + esc(p.size) + '</li>');
  if (p.netWeight) facts.push('<li><span>Net Wt.</span>' + esc(p.netWeight) + '</li>');

  const sections = [];
  if (p.description) sections.push('<section class="pd-block"><h2>About the Blend</h2><div class="prose">' + md(p.description) + '</div></section>');
  if (p.ingredients.length) sections.push('<section class="pd-block"><h2>Ingredients</h2><ul class="chips">' + p.ingredients.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</ul></section>');
  if (p.directions) sections.push('<section class="pd-block"><h2>How to Use</h2><div class="prose">' + md(p.directions) + '</div></section>');
  if (SETTINGS.fulfillment) {
    sections.push('<section class="pd-block pd-ship" id="pickup-delivery"><h2>Pickup, Delivery &amp; Shipping</h2><div class="prose">' + md(SETTINGS.fulfillment) + '</div></section>');
  }
  if (p.goodToKnow || p.storage) {
    sections.push('<section class="pd-block pd-note"><h2>Good to Know</h2><div class="prose">' + md(p.goodToKnow) +
      (p.storage ? '<p class="storage">' + esc(p.storage) + '</p>' : '') + '</div></section>');
  }

  const availability = !p.inStock ? 'https://schema.org/OutOfStock'
    : (p.buyLink ? 'https://schema.org/InStock' : 'https://schema.org/PreOrder');
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    description: p.shortDescription || '',
    image: imgs.map(function (ph) { return absUrl(photoSrc(ph)); }),
    brand: { '@type': 'Brand', name: 'Herbal Harmony TN' },
    offers: {
      '@type': 'Offer',
      price: Number(p.price || 0).toFixed(2),
      priceCurrency: 'USD',
      availability: availability,
      url: SITE_URL + '/shop/' + p.slug + '/'
    }
  };

  const prodReviews = reviewsFor(p.slug);
  if (prodReviews.length) {
    ld.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: avgRating(prodReviews).toFixed(1),
      reviewCount: prodReviews.length
    };
    ld.review = prodReviews.slice(0, 10).map(function (r) {
      return {
        '@type': 'Review',
        author: { '@type': 'Person', name: r.name },
        reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 5 },
        reviewBody: r.text,
        datePublished: r.date || undefined
      };
    });
  }

  return head({
      title: p.name + ' — Herbal Harmony TN',
      description: p.shortDescription || p.name,
      path: '/shop/' + p.slug + '/',
      image: photoSrc(main),
      ogType: 'product',
      extraHead: '<script type="application/ld+json">' + JSON.stringify(ld).replace(/</g, '\\u003c') + '</script>\n'
    }) +
    '<main class="pd-main">\n' +
    '<p class="crumbs"><a href="/shop/">Shop</a> <span>/</span> ' + esc(p.name) + '</p>\n' +
    '<div class="pd-top">\n' + gallery +
    '<div class="pd-info">\n' +
    (p.category ? '  <p class="eyebrow">' + esc(p.category) + '</p>\n' : '') +
    '  <h1>' + esc(p.name) + '</h1>\n' +
    (prodReviews.length
      ? '  <a class="pd-rating" href="#reviews">' + stars(avgRating(prodReviews), avgRating(prodReviews).toFixed(1) + ' out of 5 stars') +
        ' <span>' + prodReviews.length + ' review' + (prodReviews.length === 1 ? '' : 's') + '</span></a>\n'
      : '') +
    '  <p class="pd-price">' + esc(money(p.price)) + '</p>\n' +
    (p.shortDescription ? '  <p class="pd-short">' + esc(p.shortDescription) + '</p>\n' : '') +
    (facts.length ? '  <ul class="facts">' + facts.join('') + '</ul>\n' : '') +
    '  ' + buyButton(p, 'btn-wide') + '\n' +
    (p.inStock && p.buyLink ? '  <p class="secure">Secure checkout with Stripe. You\'ll get an email receipt.' +
      (SETTINGS.fulfillment ? ' <a href="#pickup-delivery">Pickup, delivery &amp; shipping details</a>.' : '') + '</p>\n' : '') +
    (p.inStock && !p.buyLink ? '  <p class="secure">Coming soon to the shop — check back shortly.</p>\n' : '') +
    '  <p class="script pd-script">Harmonize Life.</p>\n' +
    '</div>\n</div>\n' +
    '<div class="pd-details">\n' + sections.join('\n') + '\n</div>\n' +
    reviewsSection(p) +
    (p.showDisclaimer ? '<p class="disclaimer">' + esc(FDA_DISCLAIMER) + '</p>\n' : '') +
    '<p class="back"><a href="/shop/">&larr; Back to the shop</a></p>\n' +
    '</main>\n' +
    (imgs.length > 1
      ? '<script>document.querySelectorAll(".thumb").forEach(function(b){b.addEventListener("click",function(){var m=document.getElementById("mainImg");m.src=b.dataset.src;m.alt=b.dataset.alt;document.querySelectorAll(".thumb").forEach(function(t){t.classList.toggle("on",t===b)});});});</script>\n'
      : '') +
    foot();
}

/* ---------- thank-you page ---------- */

function thankYouPage() {
  return head({
      title: 'Thank You — Herbal Harmony TN',
      description: 'Thank you for your order from Herbal Harmony TN.',
      path: '/shop/thank-you/',
      noindex: true
    }) +
    '<main class="ty-main">\n' +
    '  <p class="script ty-script">Thank you.</p>\n' +
    '  <h1>Your order is in</h1>\n' +
    (SETTINGS.thankYou
      ? md(SETTINGS.thankYou) + '\n'
      : '  <p>A receipt is on its way to your email from Stripe. We\'ll reach out when your order is on its way.</p>\n') +
    '  <p>Questions? Just reply to your receipt email.</p>\n' +
    '  <a class="btn btn-buy" href="/shop/">Back to the Shop</a>\n' +
    '</main>\n' + foot();
}

/* ---------- review thank-you page ---------- */

function reviewThanksPage() {
  return head({
      title: 'Thanks for Your Review — Herbal Harmony TN',
      description: 'Thank you for reviewing Herbal Harmony TN.',
      path: '/shop/review-thanks/',
      noindex: true
    }) +
    '<main class="ty-main">\n' +
    '  <p class="script ty-script">Thank you.</p>\n' +
    '  <h1>Your review is in</h1>\n' +
    '  <p>I read every review before it goes up, so yours will appear on the site shortly. I appreciate you taking the time.</p>\n' +
    '  <a class="btn btn-buy" href="/shop/">Back to the Shop</a>\n' +
    '</main>\n' + foot();
}

/* ---------- write ---------- */

function write(rel, html) {
  const file = path.join(OUT_DIR, rel, 'index.html');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html, 'utf8');
}

function main() {
  const products = loadProducts();
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  write('', shopPage(products));
  write('thank-you', thankYouPage());
  write('review-thanks', reviewThanksPage());
  // Latest approved reviews for the home page (it loads this file and hides
  // its Reviews section when the list is empty).
  const names = {};
  products.forEach(function (p) { names[p.slug] = p.name; });
  const homeReviews = REVIEWS.filter(function (r) { return names[r.product]; }).slice(0, 6).map(function (r) {
    return { name: r.name, city: r.city, rating: r.rating, text: r.text, date: r.date,
      product: names[r.product], url: '/shop/' + r.product + '/#reviews' };
  });
  fs.writeFileSync(path.join(OUT_DIR, 'reviews.json'), JSON.stringify(homeReviews), 'utf8');
  products.forEach(function (p) { write(p.slug, productPage(p)); });
  console.log('Shop built: ' + products.length + ' product(s) → /shop/');
}

main();
