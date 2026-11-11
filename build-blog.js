/*
 * Herbal Harmony TN — journal builder
 * ------------------------------------
 * Reads markdown in /blog/posts and writes:
 *   /blog/index.html          journal home (featured story, topics, cards)
 *   /blog/<slug>/index.html   one article page per post
 *   /blog/posts.json          latest-post data for the homepage and RSS
 *   /_redirects               old share URLs that changed slug
 *
 * Drafts (draft: true) are skipped, including the contributor template
 * if it is copied into /blog/posts before it is ready.
 *
 * No automatic publishing. A neighbor's submission stays in Netlify Forms
 * until Don copies blog/templates/community-voice.md into /blog/posts.
 *
 * Run: node build-blog.js
 */
const fs = require('fs');
const path = require('path');
const marked = require('marked');

const ROOT = __dirname;
const POSTS_DIR = path.join(ROOT, 'blog', 'posts');
const BLOG_DIR = path.join(ROOT, 'blog');
const SITE = 'https://herbalharmonytn.com';

const CATEGORIES = [
  { slug: 'herbs-a-z', name: 'Herbs A–Z' },
  { slug: 'conditions', name: 'Conditions' },
  { slug: 'rituals-rest', name: 'Rituals & Rest' },
  { slug: 'recipes', name: 'Recipes' },
  { slug: 'community-voices', name: 'Community Voices' }
];

const LEGACY_CATEGORY = {
  'herbal remedies': 'herbs-a-z',
  supplements: 'conditions',
  'holistic wellness': 'rituals-rest'
};

const DEFAULT_AUTHOR = {
  name: 'Dondre Burton',
  role: 'Founder, Herbal Harmony TN',
  bio: 'Dondre Burton founded Herbal Harmony TN in Memphis. Mullein leaf was his way into herbs, and he writes about teas, plants, and everyday rituals in plain language from his own experience.',
  photo: '/images/authors/dondre.svg'
};

const DEFAULT_REVIEWER = {
  name: 'Herbal Harmony Editorial',
  role: 'Checked for plain language and sourcing. Not a clinical review.'
};

const DISCLAIMER = 'This article is for education only. These statements have not been evaluated by the Food and Drug Administration. It is not intended to diagnose, treat, cure, or prevent any disease, and it is not a substitute for care from a qualified clinician. Talk with your healthcare professional before using herbs, especially if you are pregnant or nursing, have a medical condition, give herbs to a child, or take medication.';

const GTAG = '<!-- Google tag (gtag.js) -->\n' +
  '<script async src="https://www.googletagmanager.com/gtag/js?id=G-S7YN9JLEH8"></script>\n' +
  '<script>\n' +
  '  window.dataLayer = window.dataLayer || [];\n' +
  '  function gtag(){dataLayer.push(arguments);}\n' +
  '  gtag(\'js\', new Date());\n' +
  '  gtag(\'config\', \'G-S7YN9JLEH8\');\n' +
  '</script>\n';

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stripTags(html) {
  return String(html)
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/['’‘]/g, '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function unquote(value) {
  var v = String(value == null ? '' : value).trim();
  if (v.length >= 2) {
    var a = v.charAt(0);
    var b = v.charAt(v.length - 1);
    if ((a === '"' && b === '"') || (a === "'" && b === "'")) {
      v = v.slice(1, -1);
    }
  }
  return v.replace(/\\"/g, '"').replace(/\\n/g, '\n');
}

function asBool(value) {
  return value === true || value === 'true' || value === 'yes';
}

function parseFrontmatter(content) {
  var match = String(content).match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { meta: {}, body: content };
  var lines = match[1].split(/\r?\n/);
  var meta = {};
  var i = 0;
  while (i < lines.length) {
    var line = lines[i];
    if (!line.trim() || /^\s*#/.test(line)) { i += 1; continue; }
    var keyMatch = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!keyMatch) { i += 1; continue; }
    var key = keyMatch[1];
    var raw = keyMatch[2].trim();
    if (raw === '' || raw === '|' || raw === '|-' || raw === '>' || raw === '>-') {
      i += 1;
      if (i < lines.length && /^\s*-\s+/.test(lines[i])) {
        var items = [];
        while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
          var itemText = lines[i].replace(/^\s*-\s+/, '');
          if (key === 'sources') {
            var obj = {};
            var first = itemText.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
            if (first) obj[first[1]] = unquote(first[2]);
            else obj.title = unquote(itemText);
            i += 1;
            while (i < lines.length && /^\s+[A-Za-z0-9_]+:\s*/.test(lines[i]) && !/^\s*-\s+/.test(lines[i])) {
              var km = lines[i].match(/^\s+([A-Za-z0-9_]+):\s*(.*)$/);
              if (km) obj[km[1]] = unquote(km[2]);
              i += 1;
            }
            items.push(obj);
          } else {
            var named = itemText.match(/^(takeaway|tag|item):\s*(.*)$/);
            items.push(unquote(named ? named[2] : itemText));
            i += 1;
          }
        }
        meta[key] = items;
        continue;
      }
      var block = [];
      while (i < lines.length && (/^\s+\S/.test(lines[i]) || (lines[i].trim() === '' && raw.indexOf('|') === 0))) {
        if (lines[i].trim() === '') {
          if (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) block.push('');
          else break;
        } else block.push(lines[i].trim());
        i += 1;
      }
      meta[key] = block.join(raw.indexOf('|') === 0 ? '\n' : ' ');
      continue;
    }
    var parts = [raw];
    i += 1;
    while (i < lines.length && /^\s+\S/.test(lines[i]) && !/^\s*-\s+/.test(lines[i]) && !/^[A-Za-z0-9_]+:\s*/.test(lines[i])) {
      parts.push(lines[i].trim());
      i += 1;
    }
    meta[key] = unquote(parts.join(' '));
  }
  return { meta: meta, body: content.slice(match[0].length) };
}

function asTags(value) {
  if (Array.isArray(value)) {
    return value.map(function (item) {
      if (typeof item === 'string') {
        var named = item.match(/^(?:tag|takeaway):\s*(.*)$/);
        return (named ? named[1] : item).trim();
      }
      if (item && typeof item === 'object') return String(item.tag || item.takeaway || '').trim();
      return '';
    }).filter(Boolean);
  }
  return String(value || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
}

function asTakeaways(value) {
  if (Array.isArray(value)) return asTags(value);
  var text = String(value || '').replace(/\\n/g, '\n');
  if (text.indexOf('\n') !== -1) {
    return text.split('\n').map(function (s) { return s.replace(/^[-*]\s+/, '').trim(); }).filter(Boolean);
  }
  return text.trim() ? [text.trim()] : [];
}

function asSources(value) {
  if (!Array.isArray(value)) return [];
  return value.map(function (item) {
    if (typeof item === 'string') return { title: item.trim(), url: '' };
    if (!item || typeof item !== 'object') return null;
    return { title: String(item.title || '').trim(), url: String(item.url || '').trim() };
  }).filter(function (item) { return item && item.title; });
}

function categoryOf(name) {
  var label = String(name || '').trim();
  var found = CATEGORIES.filter(function (c) { return c.name.toLowerCase() === label.toLowerCase(); })[0];
  if (found) return found;
  var legacy = LEGACY_CATEGORY[label.toLowerCase()];
  if (legacy) return CATEGORIES.filter(function (c) { return c.slug === legacy; })[0];
  var slug = slugify(label);
  found = CATEGORIES.filter(function (c) { return c.slug === slug; })[0];
  if (found) return found;
  return { slug: slug || 'journal', name: label || 'Journal' };
}

function chicago(dateValue) {
  var d = new Date(dateValue);
  if (isNaN(d.getTime())) return { iso: '', label: '' };
  var label = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', year: 'numeric', month: 'long', day: 'numeric'
  }).format(d);
  var iso = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(d);
  return { iso: iso, label: label };
}

function readMinutes(markdown) {
  var text = String(markdown)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)]\([^)]*\)/g, '$1')
    .replace(/[#>*_~`]/g, ' ');
  var words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

function imageSize(absPath) {
  try {
    var buf = fs.readFileSync(absPath);
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
      return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    }
    if (buf[0] === 0xFF && buf[1] === 0xD8) {
      var i = 2;
      while (i + 8 < buf.length) {
        if (buf[i] !== 0xFF) { i += 1; continue; }
        var marker = buf[i + 1];
        if (marker === 0xD8 || marker === 0xD9) { i += 2; continue; }
        if (i + 3 >= buf.length) break;
        var len = buf.readUInt16BE(i + 2);
        var sof = (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC);
        if (sof && i + 8 < buf.length) {
          return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
        }
        if (len < 2) break;
        i += 2 + len;
      }
    }
  } catch (err) { /* missing image */ }
  return null;
}

function absUrl(urlPath) {
  if (!urlPath) return SITE + '/images/share-card.jpg';
  if (/^https?:\/\//.test(urlPath)) return urlPath;
  return SITE + (urlPath.charAt(0) === '/' ? urlPath : '/' + urlPath);
}

function normalizeMarkdown(md) {
  return String(md).replace(/^[ \t]*•[ \t]*/gm, '- ');
}

function renderMarkdown(markdown) {
  var toc = [];
  var used = {};
  var renderer = new marked.Renderer();
  renderer.heading = function (text, level) {
    if (level < 2 || level > 3) return '<h' + level + '>' + text + '</h' + level + '>\n';
    var plain = stripTags(text);
    var base = slugify(plain) || 'section';
    var id = base;
    var n = 2;
    while (used[id]) { id = base + '-' + n; n += 1; }
    used[id] = true;
    toc.push({ level: level, id: id, text: plain });
    return '<h' + level + ' id="' + esc(id) + '">' + text + '</h' + level + '>\n';
  };
  renderer.link = function (href, title, text) {
    if (!href) return text;
    var titleAttr = title ? ' title="' + esc(title) + '"' : '';
    return '<a href="' + esc(href) + '"' + titleAttr + '>' + text + '</a>';
  };
  var html = marked.parse(normalizeMarkdown(markdown), {
    renderer: renderer,
    gfm: true,
    breaks: false,
    headerIds: false,
    mangle: false
  });
  return { html: html, toc: toc };
}

function rawSlugFromFile(filename) {
  var base = filename.replace(/\.md$/i, '');
  var m = base.match(/^\d{4}-\d{2}-\d{2}-(.+)$/);
  return m ? m[1] : base;
}

function loadPosts() {
  var files = fs.readdirSync(POSTS_DIR).filter(function (name) { return name.endsWith('.md'); });
  var posts = [];
  files.forEach(function (filename) {
    var raw = fs.readFileSync(path.join(POSTS_DIR, filename), 'utf8');
    var parsed = parseFrontmatter(raw);
    var meta = parsed.meta;
    if (asBool(meta.draft)) {
      console.log('Skipping draft ' + filename);
      return;
    }
    var category = categoryOf(meta.category);
    var tags = asTags(meta.tags);
    var voice = String(meta.voice || '').toLowerCase();
    var community = voice === 'community' || category.slug === 'community-voices';
    var authorName = String(meta.author || '').trim() || DEFAULT_AUTHOR.name;
    var authorRole = String(meta.authorRole || '').trim() || (community ? 'Community contributor' : DEFAULT_AUTHOR.role);
    var authorBio = String(meta.authorBio || '').trim() || (community ? '' : DEFAULT_AUTHOR.bio);
    var authorPhoto = String(meta.authorPhoto || '').trim() || (community ? '' : DEFAULT_AUTHOR.photo);
    var neighborhood = String(meta.authorNeighborhood || meta.neighborhood || '').trim();
    var reviewerName = String(meta.reviewer || '').trim() || (community ? DEFAULT_AUTHOR.name : DEFAULT_REVIEWER.name);
    var reviewerRole = String(meta.reviewerRole || '').trim() || (community ? 'Founder, Herbal Harmony TN. Edited before publishing. Not a clinical review.' : DEFAULT_REVIEWER.role);
    var published = chicago(meta.date);
    var updated = meta.updated ? chicago(meta.updated) : { iso: '', label: '' };
    if (updated.iso && updated.iso === published.iso) updated = { iso: '', label: '' };
    var rendered = renderMarkdown(parsed.body);
    var minutes = meta.readTime ? Math.max(1, parseInt(meta.readTime, 10) || 1) : readMinutes(parsed.body);
    var rawSlug = rawSlugFromFile(filename);
    var slug = slugify(rawSlug) || slugify(meta.title) || 'post';
    var thumb = String(meta.thumbnail || '').trim();
    var size = null;
    if (thumb && thumb.charAt(0) === '/') {
      size = imageSize(path.join(ROOT, thumb.replace(/^\//, '')));
    }
    posts.push({
      filename: filename,
      title: String(meta.title || 'Untitled').trim(),
      description: String(meta.description || '').trim(),
      date: meta.date || '',
      dateIso: published.iso,
      dateLabel: published.label,
      updatedIso: updated.iso,
      updatedLabel: updated.label,
      category: category.name,
      categorySlug: category.slug,
      tags: tags,
      tagSlugs: tags.map(slugify).filter(Boolean),
      thumbnail: thumb,
      thumbnailAlt: String(meta.thumbnailAlt || meta.title || '').trim(),
      image: size,
      author: authorName,
      authorRole: authorRole,
      authorBio: authorBio,
      authorPhoto: authorPhoto,
      neighborhood: neighborhood,
      community: community,
      reviewer: reviewerName,
      reviewerRole: reviewerRole,
      takeaways: asTakeaways(meta.takeaways),
      sources: asSources(meta.sources),
      featured: asBool(meta.featured),
      minutes: minutes,
      readLabel: minutes + ' min read',
      slug: slug,
      legacySlug: rawSlug !== slug ? rawSlug : '',
      url: '/blog/' + slug + '/',
      html: rendered.html,
      toc: rendered.toc,
      body: parsed.body
    });
  });
  posts.sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
  var seen = {};
  posts.forEach(function (post) {
    if (seen[post.slug]) throw new Error('Duplicate slug: ' + post.slug);
    seen[post.slug] = true;
  });
  return posts;
}

function nav(active) {
  var items = [
    ['/', 'home', 'Home'],
    ['/#about', 'about', 'About'],
    ['/blog/', 'blog', 'Blog'],
    ['/write/', 'write', 'Write'],
    ['/book/', 'book', 'Book'],
    ['/shop/', 'shop', 'Shop']
  ];
  return '<a class="skip" href="#main">Skip to content</a>\n' +
    '<nav class="site-nav" aria-label="Primary">\n' +
    '  <a class="nav-logo" href="/"><img src="/images/logo.png" alt="Herbal Harmony"></a>\n' +
    '  <ul class="nav-links" id="navLinks">\n' +
    items.map(function (item) {
      var current = item[1] === active ? ' aria-current="page"' : '';
      var title = item[1] === 'write' ? ' title="Write for Herbal Harmony"' : '';
      return '    <li><a href="' + item[0] + '"' + current + title + '>' + item[2] + '</a></li>';
    }).join('\n') + '\n' +
    '  </ul>\n' +
    '  <button class="menu-toggle" id="menuBtn" type="button" aria-label="Open menu" aria-controls="navLinks" aria-expanded="false"><span></span><span></span><span></span></button>\n' +
    '</nav>\n';
}

function topicNav(currentSlug) {
  var links = '<a href="/blog/" data-all="true">All</a>\n';
  links += CATEGORIES.map(function (c) {
    var current = c.slug === currentSlug ? ' aria-current="page"' : '';
    return '    <a href="/blog/?category=' + c.slug + '" data-category="' + c.slug + '"' + current + '>' + esc(c.name) + '</a>';
  }).join('\n');
  links += '\n    <a class="topics-write" href="/write/">Write for Us</a>';
  return '<nav class="topics" aria-label="Topics">\n' + links + '\n  </nav>';
}

function footer() {
  var topics = CATEGORIES.map(function (c) {
    return '        <a href="/blog/?category=' + c.slug + '">' + esc(c.name) + '</a>';
  }).join('\n');
  return '<footer class="site-foot">\n' +
    '  <div class="foot-grid">\n' +
    '    <div>\n' +
    '      <img src="/images/logo-light.png" alt="Herbal Harmony">\n' +
    '      <p>Wellness rooted in nature, grown in Memphis. Herbs, teas, and everyday rituals. Harmonize Life.</p>\n' +
    '    </div>\n' +
    '    <div>\n' +
    '      <h2>Explore</h2>\n' +
    '      <a href="/">Home</a>\n' +
    '      <a href="/#about">About</a>\n' +
    '      <a href="/blog/">Blog</a>\n' +
    '      <a href="/book/">Book</a>\n' +
    '      <a href="/shop/">Shop</a>\n' +
    '      <a href="/write/">Write for Us</a>\n' +
    '    </div>\n' +
    '    <div>\n' +
    '      <h2>Topics</h2>\n' +
    topics + '\n' +
    '    </div>\n' +
    '  </div>\n' +
    '  <p class="foot-bottom">&copy; 2026 Herbal Harmony TN &nbsp;·&nbsp; Memphis, TN &nbsp;·&nbsp; Harmonize Life</p>\n' +
    '</footer>\n' +
    '<script src="/assets/blog.js"></script>\n';
}

function head(opts) {
  var image = absUrl(opts.image || '/images/share-card.jpg');
  var type = opts.ogType || 'website';
  return '<!DOCTYPE html>\n<html lang="en">\n<head>\n' +
    GTAG +
    '<meta charset="UTF-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
    '<title>' + esc(opts.title) + '</title>\n' +
    '<meta name="description" content="' + esc(opts.description) + '">\n' +
    (opts.noindex ? '<meta name="robots" content="noindex">\n' : '') +
    '<link rel="canonical" href="' + esc(SITE + opts.path) + '">\n' +
    '<meta property="og:type" content="' + type + '">\n' +
    '<meta property="og:site_name" content="Herbal Harmony TN">\n' +
    '<meta property="og:title" content="' + esc(opts.title) + '">\n' +
    '<meta property="og:description" content="' + esc(opts.description) + '">\n' +
    '<meta property="og:url" content="' + esc(SITE + opts.path) + '">\n' +
    '<meta property="og:image" content="' + esc(image) + '">\n' +
    (opts.published ? '<meta property="article:published_time" content="' + esc(opts.published) + '">\n' : '') +
    '<meta name="twitter:card" content="summary_large_image">\n' +
    '<meta name="twitter:image" content="' + esc(image) + '">\n' +
    '<link rel="icon" type="image/png" href="/images/favicon.png">\n' +
    '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">\n' +
    '<link rel="shortcut icon" href="/favicon.ico">\n' +
    '<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
    '<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400..700;1,9..40,400..700&display=swap" rel="stylesheet">\n' +
    '<link rel="stylesheet" href="/assets/blog.css">\n' +
    '<link rel="alternate" type="application/rss+xml" title="Herbal Harmony TN" href="' + SITE + '/rss.xml">\n' +
    (opts.extraHead || '') +
    '</head>\n<body' + (opts.page ? ' data-page="' + opts.page + '"' : '') + '>\n';
}

function dims(post) {
  if (!post.image) return '';
  return ' width="' + post.image.w + '" height="' + post.image.h + '"';
}

function card(post, extra) {
  var tags = post.tagSlugs.join('|');
  var featured = extra && extra.featuredDup ? ' data-featured="true" hidden' : '';
  return '<a class="card" href="' + esc(post.url) + '" data-category="' + esc(post.categorySlug) + '" data-tags="' + esc(tags) + '"' + featured + ' aria-labelledby="card-' + esc(post.slug) + '">\n' +
    '  <div class="card-media">' +
    (post.thumbnail
      ? '<img src="' + esc(post.thumbnail) + '" alt=""' + dims(post) + ' loading="lazy">'
      : '') +
    '</div>\n' +
    '  <div class="card-body">\n' +
    '    <p class="kicker">' + esc(post.category) + '</p>\n' +
    '    <h3 id="card-' + esc(post.slug) + '">' + esc(post.title) + '</h3>\n' +
    '    <p class="excerpt">' + esc(post.description) + '</p>\n' +
    '    <p class="card-meta"><span>' + esc(post.author) + '</span><span>' + esc(post.readLabel) + '</span></p>\n' +
    '  </div>\n' +
    '</a>\n';
}

function relatedPosts(post, posts) {
  return posts.filter(function (other) { return other.slug !== post.slug; }).map(function (other) {
    var score = other.categorySlug === post.categorySlug ? 3 : 0;
    post.tagSlugs.forEach(function (tag) {
      if (other.tagSlugs.indexOf(tag) !== -1) score += 1;
    });
    return { post: other, score: score };
  }).sort(function (a, b) {
    if (b.score !== a.score) return b.score - a.score;
    return new Date(b.post.date) - new Date(a.post.date);
  }).slice(0, 3).map(function (item) { return item.post; });
}

function tocList(toc) {
  if (!toc.length) return '';
  return '<ol>\n' + toc.map(function (item) {
    var cls = item.level === 3 ? ' class="toc-h3"' : '';
    return '  <li' + cls + '><a href="#' + esc(item.id) + '">' + esc(item.text) + '</a></li>';
  }).join('\n') + '\n</ol>';
}

function articlePage(post, posts) {
  var showToc = post.toc.length >= 3;
  var takeaways = post.takeaways.length
    ? '<aside class="takeaways" aria-labelledby="takeaways-title">\n' +
      '  <h2 id="takeaways-title">Key takeaways</h2>\n' +
      '  <ul>\n' + post.takeaways.map(function (item) { return '    <li>' + esc(item) + '</li>'; }).join('\n') + '\n  </ul>\n' +
      '</aside>\n'
    : '';
  var toc = showToc
    ? '<details class="toc" id="toc" open>\n  <summary>In this article</summary>\n' + tocList(post.toc) + '</details>\n'
    : '';
  var sources = post.sources.length ? post.sources : [{
    title: 'This article is based on traditional herbal use and the author’s experience. It does not cite peer-reviewed studies.',
    url: ''
  }];
  var hasLinks = sources.some(function (s) { return s.url; });
  var sourceList = '<ol>\n' + sources.map(function (s) {
    var inner = s.url ? '<a href="' + esc(s.url) + '">' + esc(s.title) + '</a>' : esc(s.title);
    return '  <li>' + inner + '</li>';
  }).join('\n') + '\n</ol>';
  var place = '';
  if (post.community && post.neighborhood) {
    place = '<p class="by-role">' + esc(post.neighborhood) + ', Memphis</p>';
  } else if (post.authorRole) {
    place = '<p class="by-role">' + esc(post.authorRole) + '</p>';
  }
  var dates = '<span>Published <time datetime="' + esc(post.dateIso) + '">' + esc(post.dateLabel) + '</time></span>';
  if (post.updatedLabel) {
    dates += '<span>Updated <time datetime="' + esc(post.updatedIso) + '">' + esc(post.updatedLabel) + '</time></span>';
  }
  dates += '<span>' + esc(post.readLabel) + '</span>';
  var avatar = post.authorPhoto
    ? '<img class="avatar" src="' + esc(post.authorPhoto) + '" alt="" width="56" height="56">'
    : '<span class="avatar" aria-hidden="true"></span>';
  var tags = post.tags.length
    ? '<ul class="tag-list">\n' + post.tags.map(function (tag, i) {
      return '  <li><a href="/blog/?tag=' + esc(post.tagSlugs[i]) + '">' + esc(tag) + '</a></li>';
    }).join('\n') + '\n</ul>\n'
    : '';
  var aboutPlace = post.community && post.neighborhood
    ? esc(post.neighborhood) + ', Memphis'
    : esc(post.authorRole);
  var related = relatedPosts(post, posts);
  var relatedHtml = related.length
    ? '<section class="related wrap" aria-labelledby="related-title">\n' +
      '  <h2 id="related-title">Related articles</h2>\n' +
      '  <div class="cards">\n' + related.map(function (item) { return card(item); }).join('') + '  </div>\n' +
      '</section>\n'
    : '';
  var hero = post.thumbnail
    ? '<figure class="hero-figure"><img src="' + esc(post.thumbnail) + '" alt="' + esc(post.thumbnailAlt) + '"' + dims(post) + ' fetchpriority="high"></figure>\n'
    : '';
  var ld = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    datePublished: post.date || post.dateIso,
    dateModified: post.updatedIso || post.date || post.dateIso,
    author: { '@type': 'Person', name: post.author },
    publisher: { '@type': 'Organization', name: 'Herbal Harmony TN', url: SITE + '/' },
    image: absUrl(post.thumbnail),
    mainEntityOfPage: SITE + post.url
  };
  var extra = '<script type="application/ld+json">' + JSON.stringify(ld).replace(/</g, '\\u003c') + '</script>\n';
  return head({
    title: post.title + ' | Herbal Harmony TN',
    description: post.description,
    path: post.url,
    image: post.thumbnail,
    ogType: 'article',
    published: post.date || post.dateIso,
    page: 'article',
    extraHead: extra
  }) +
    nav('blog') +
    '<main id="main">\n' +
    '  <header class="masthead"><div class="masthead-inner">\n' + topicNav(post.categorySlug) + '  </div></header>\n' +
    '  <article class="article-wrap">\n' +
    '    <nav class="crumbs" aria-label="Breadcrumb"><ol>\n' +
    '      <li><a href="/blog/">Journal</a></li>\n' +
    '      <li><a href="/blog/?category=' + esc(post.categorySlug) + '">' + esc(post.category) + '</a></li>\n' +
    '      <li aria-current="page">' + esc(post.title) + '</li>\n' +
    '    </ol></nav>\n' +
    '    <header class="article-head">\n' +
    '      <p class="kicker">' + esc(post.category) + '</p>\n' +
    '      <h1>' + esc(post.title) + '</h1>\n' +
    (post.description ? '      <p class="dek">' + esc(post.description) + '</p>\n' : '') +
    '      <div class="byline">\n        ' + avatar + '\n        <div>\n' +
    '          <p class="by-name">' + esc(post.author) + '</p>\n' +
    '          ' + place + '\n' +
    '          <p class="by-dates">' + dates + '</p>\n' +
    '        </div>\n      </div>\n' +
    '      <p class="reviewed">Reviewed by <strong>' + esc(post.reviewer) + '</strong>' +
    (post.reviewerRole ? ' <span>— ' + esc(post.reviewerRole) + '</span>' : '') + '</p>\n' +
    '    </header>\n' +
    hero +
    takeaways +
    toc +
    '    <div class="prose">\n' + post.html + '    </div>\n' +
    tags +
    '    <section class="sources" aria-labelledby="sources-title">\n' +
    '      <h2 id="sources-title">Sources</h2>\n' +
    (hasLinks ? '      <p class="sources-note">Works and references cited in this piece.</p>\n' : '') +
    sourceList +
    '    </section>\n' +
    '    <section class="disclaimer" aria-labelledby="disclaimer-title">\n' +
    '      <h2 id="disclaimer-title">Medical disclaimer</h2>\n' +
    '      <p>' + esc(DISCLAIMER) + '</p>\n' +
    '    </section>\n' +
    '    <section class="author-card" aria-labelledby="author-title">\n' +
    '      ' + (post.authorPhoto ? '<img class="avatar" src="' + esc(post.authorPhoto) + '" alt="" width="72" height="72">' : '<span class="avatar" aria-hidden="true"></span>') + '\n' +
    '      <div>\n' +
    '        <h2 id="author-title">About the author</h2>\n' +
    '        <p class="by-name">' + esc(post.author) + '</p>\n' +
    '        <p class="by-role">' + aboutPlace + '</p>\n' +
    (post.authorBio ? '        <p>' + esc(post.authorBio) + '</p>\n' : '') +
    '      </div>\n' +
    '    </section>\n' +
    '  </article>\n' +
    relatedHtml +
    '</main>\n' +
    footer() +
    '</body>\n</html>\n';
}

function indexPage(posts) {
  var featured = posts.filter(function (p) { return p.featured; })[0] || posts[0];
  var legacy = {};
  posts.forEach(function (p) { if (p.legacySlug) legacy[p.legacySlug] = p.slug; });
  var meta = { legacy: legacy, slugs: posts.map(function (p) { return p.slug; }) };
  var featuredHtml = '';
  if (featured) {
    featuredHtml = '<article class="featured" id="featured">\n' +
      '  <a class="featured-link" href="' + esc(featured.url) + '" aria-labelledby="featured-title">\n' +
      '    <div class="featured-media">' +
      (featured.thumbnail ? '<img src="' + esc(featured.thumbnail) + '" alt=""' + dims(featured) + ' fetchpriority="high">' : '') +
      '</div>\n' +
      '    <div class="featured-copy">\n' +
      '      <p class="kicker">Featured · ' + esc(featured.category) + '</p>\n' +
      '      <h2 id="featured-title">' + esc(featured.title) + '</h2>\n' +
      '      <p class="dek">' + esc(featured.description) + '</p>\n' +
      '      <p class="meta">' +
      (featured.authorPhoto ? '<img class="avatar" src="' + esc(featured.authorPhoto) + '" alt="" width="36" height="36">' : '') +
      '<span>' + esc(featured.author) + '</span><span class="dot">' + esc(featured.readLabel) + ' · ' + esc(featured.dateLabel) + '</span></p>\n' +
      '    </div>\n  </a>\n</article>\n';
  }
  var cards = posts.map(function (p) {
    return card(p, { featuredDup: featured && p.slug === featured.slug });
  }).join('');
  return head({
    title: 'The Journal — Herbal Harmony TN',
    description: 'Plain-language herbal and wellness articles from Herbal Harmony TN in Memphis. Herbs, conditions, rituals, recipes, and community voices.',
    path: '/blog/',
    page: 'index'
  }) +
    nav('blog') +
    '<main id="main">\n' +
    '  <header class="masthead">\n    <div class="masthead-inner">\n' +
    '      <p class="eyebrow">Harmonize Life · Memphis</p>\n' +
    '      <h1>The Journal</h1>\n' +
    '      <hr class="rule">\n' +
    '      <p class="lede">Plain-language notes on herbs, food, and feeling well, written in Memphis. Read for yourself, then decide with a clinician when health is on the line.</p>\n' +
    '      <p class="invite">Live in Memphis? <a href="/write/">Write for us</a>. Don reads every pitch. Nothing is published on its own.</p>\n' +
    topicNav('') +
    '    </div>\n  </header>\n' +
    '  <div class="wrap section">\n' +
    featuredHtml +
    '    <h2 class="section-title" id="listHeading">Latest</h2>\n' +
    '    <noscript><p class="noscript">Topic filters use JavaScript. Every article is still listed here.</p></noscript>\n' +
    '    <div class="cards" id="postList">\n' + cards + '    </div>\n' +
    '    <div class="empty-state" id="emptyState" hidden>\n' +
    '      <h2>Nothing in this topic yet</h2>\n' +
    '      <p id="emptyText">Try another topic, or read the latest articles.</p>\n' +
    '      <a class="btn" href="/write/">Write for Herbal Harmony</a>\n' +
    '    </div>\n' +
    '  </div>\n' +
    '</main>\n' +
    '<script type="application/json" id="blog-meta">' + JSON.stringify(meta).replace(/</g, '\\u003c') + '</script>\n' +
    footer() +
    '</body>\n</html>\n';
}

function writeRedirect(legacySlug, slug) {
  var dir = path.join(BLOG_DIR, legacySlug);
  fs.mkdirSync(dir, { recursive: true });
  var target = '/blog/' + slug + '/';
  var html = '<!DOCTYPE html>\n<html lang="en">\n<head>\n' +
    '<meta charset="UTF-8">\n' +
    '<link rel="canonical" href="' + SITE + target + '">\n' +
    '<meta http-equiv="refresh" content="0; url=' + target + '">\n' +
    '<title>Redirecting…</title>\n' +
    '</head>\n<body>\n' +
    '<p><a href="' + target + '">Continue to the article</a></p>\n' +
    '</body>\n</html>\n';
  fs.writeFileSync(path.join(dir, 'index.html'), html);
}

function cleanDirs(keep) {
  fs.readdirSync(BLOG_DIR, { withFileTypes: true }).forEach(function (ent) {
    if (!ent.isDirectory()) return;
    if (ent.name === 'posts' || ent.name === 'templates') return;
    if (keep[ent.name]) return;
    fs.rmSync(path.join(BLOG_DIR, ent.name), { recursive: true, force: true });
  });
}

function publicPost(post) {
  return {
    title: post.title,
    description: post.description,
    date: post.date,
    dateLabel: post.dateLabel,
    updated: post.updatedIso,
    slug: post.slug,
    url: post.url,
    category: post.category,
    categorySlug: post.categorySlug,
    tags: post.tags,
    thumbnail: post.thumbnail,
    author: post.author,
    authorRole: post.authorRole,
    neighborhood: post.neighborhood,
    community: post.community,
    readMinutes: post.minutes,
    readLabel: post.readLabel,
    featured: post.featured
  };
}

function verify(posts) {
  var index = fs.readFileSync(path.join(BLOG_DIR, 'index.html'), 'utf8')
    .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  var sentinels = {
    'mullein-leaf-the-herb-that-started-it-all': 'There\'s one herb that changed everything for me.',
    'the-ancient-power-of-elderberry-syrup': 'Long before pharmacies lined every corner',
    'the-trinity-natures-parasite-cleanse': 'The Trinity is a handcrafted parasite cleanse',
    'watermelon-juice-natures-nitric-oxide-booster': 'Most people think of watermelon',
    'peppermint-leaf-tea-a-refreshing-classic-for-digestion-and-calm': 'There\'s something about the smell of peppermint',
    'hibiscus-tea-and-blood-pressure-what-the-research-really-says': 'If you grew up around Caribbean',
    'harmony-herbal-blend-whats-in-the-jar-and-what-it-can-support': 'Every jar on that shelf was measured'
  };
  Object.keys(sentinels).forEach(function (slug) {
    var post = posts.filter(function (p) { return p.slug === slug; })[0];
    if (!post) throw new Error('Missing migrated post ' + slug);
    var file = path.join(BLOG_DIR, slug, 'index.html');
    var html = fs.readFileSync(file, 'utf8').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    if (html.indexOf(sentinels[slug]) === -1) throw new Error('Lost body text in ' + slug);
    ['Key takeaways', 'Sources', 'Reviewed by', 'Medical disclaimer', 'Related articles', 'About the author'].forEach(function (bit) {
      if (html.indexOf(bit) === -1) throw new Error(slug + ' missing ' + bit);
    });
    if (index.indexOf(post.title) === -1) throw new Error('Index missing ' + post.title);
  });
  var hibiscus = posts.filter(function (p) { return p.slug.indexOf('hibiscus') === 0; })[0];
  if (!hibiscus || hibiscus.toc.length < 5) throw new Error('Hibiscus table of contents did not build');
  if (!posts.some(function (p) { return p.featured; })) throw new Error('No featured article');
}

function main() {
  var posts = loadPosts();
  if (!posts.length) throw new Error('No posts found in ' + POSTS_DIR);
  var keep = { posts: true, templates: true };
  posts.forEach(function (p) {
    keep[p.slug] = true;
    if (p.legacySlug) keep[p.legacySlug] = true;
  });
  cleanDirs(keep);
  posts.forEach(function (post) {
    var dir = path.join(BLOG_DIR, post.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), articlePage(post, posts));
    if (post.legacySlug) writeRedirect(post.legacySlug, post.slug);
  });
  fs.writeFileSync(path.join(BLOG_DIR, 'index.html'), indexPage(posts));
  var legacy = {};
  var redirects = [];
  posts.forEach(function (p) {
    if (!p.legacySlug) return;
    legacy[p.legacySlug] = p.slug;
    redirects.push('/blog/' + p.legacySlug + '/  /blog/' + p.slug + '/  301!');
  });
  var redirectFile = path.join(ROOT, '_redirects');
  var banner = '# Generated by build-blog.js. Old journal URLs that changed slug.\n';
  fs.writeFileSync(redirectFile, banner + (redirects.length ? redirects.join('\n') + '\n' : ''));
  fs.writeFileSync(path.join(BLOG_DIR, 'posts.json'), JSON.stringify({
    posts: posts.map(publicPost),
    legacy: legacy
  }, null, 2) + '\n');
  verify(posts);
  posts.forEach(function (p) {
    console.log(p.slug + ' · ' + p.category + ' · ' + p.readLabel + ' · toc ' + p.toc.length + (p.featured ? ' · featured' : ''));
  });
  console.log('Wrote ' + posts.length + ' article page(s), blog/index.html, and blog/posts.json.');
}

main();
