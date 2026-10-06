const fs = require('fs');
const path = require('path');

var POSTS_DIR = path.join(__dirname, 'blog', 'posts');
var OUTPUT_FILE = path.join(__dirname, 'rss.xml');
var SITE_URL = 'https://herbalharmonytn.com';

function escapeXml(str) {
  return String(str == null ? '' : str)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');
}

function parseFrontmatter(content) {
  var match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { meta: {}, body: content };
  }
  var raw = match[1];
  var body = match[2];
  var lines = raw.split(/\r?\n/);
  var meta = {};
  var currentKey = null;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (currentKey && /^\s+\S/.test(line)) {
      meta[currentKey] = meta[currentKey] + ' ' + line.trim();
      continue;
    }
    var idx = line.indexOf(':');
    if (idx === -1) continue;
    var key = line.slice(0, idx).trim();
    var value = line.slice(idx + 1).trim();
    if (value.length >= 2) {
      var first = value.charAt(0);
      var last = value.charAt(value.length - 1);
      if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
        value = value.slice(1, -1);
      }
    }
    meta[key] = value;
    currentKey = key;
  }
  return { meta: meta, body: body };
}

function slugFromFilename(filename) {
  var base = filename.replace(/\.md$/, '');
  var m = base.match(/^\d{4}-\d{2}-\d{2}-(.+)$/);
  return m ? m[1] : base;
}

function toRfc822(dateValue) {
  var d = dateValue ? new Date(dateValue) : new Date();
  if (isNaN(d.getTime())) {
    d = new Date();
  }
  return d.toUTCString();
}

function loadPosts() {
  var files;
  try {
    files = fs.readdirSync(POSTS_DIR);
  } catch (err) {
    console.error('Could not read posts directory: ' + POSTS_DIR);
    console.error(err.message);
    return [];
  }

var mdFiles = files.filter(function (name) {
  return name.slice(-3) === '.md';
});

var posts = mdFiles.map(function (filename) {
  var fullPath = path.join(POSTS_DIR, filename);
  var raw = fs.readFileSync(fullPath, 'utf8');
  var parsed = parseFrontmatter(raw);
  var meta = parsed.meta;
  var slug = slugFromFilename(filename);
  var link = SITE_URL + '/blog/#' + encodeURIComponent(slug);
  // Each post gets a small share page at /blog/<slug>/ with preview tags
  // (title, description, image) so Facebook and other sites show a proper card.
  var shareUrl = SITE_URL + '/blog/' + encodeURIComponent(slug) + '/';
  var image = meta.thumbnail || '';
  var imageUrl = image ? (/^https?:/.test(image) ? image : SITE_URL + image) : '';
  var imageLength = 0;
  if (image && !/^https?:/.test(image)) {
    try { imageLength = fs.statSync(path.join(__dirname, image)).size; } catch (e) {}
  }
  var dateObj = meta.date ? new Date(meta.date) : new Date();

                        return {
                          title: meta.title || 'Untitled',
                          description: meta.description || '',
                          dateObj: dateObj,
                          pubDate: toRfc822(meta.date),
                          slug: slug,
                          blogLink: link,
                          link: shareUrl,
                          guid: link,
                          imageUrl: imageUrl,
                          imageLength: imageLength
                        };
});

posts.sort(function (a, b) {
  return b.dateObj.getTime() - a.dateObj.getTime();
});

return posts.slice(0, 20);
}

function buildRss(posts) {
  var itemsXml = posts.map(function (post) {
    return '    <item>\n' +
      '      <title>' + escapeXml(post.title) + '</title>\n' +
      '      <link>' + post.link + '</link>\n' +
      '      <pubDate>' + post.pubDate + '</pubDate>\n' +
      '      <description>' + escapeXml(post.description) + '</description>\n' +
      '      <guid isPermaLink="false">' + post.guid + '</guid>\n' +
      (post.imageUrl
        ? '      <enclosure url="' + escapeXml(post.imageUrl) + '" length="' + post.imageLength + '" type="' + imageType(post.imageUrl) + '"/>\n' +
          '      <media:content url="' + escapeXml(post.imageUrl) + '" medium="image"/>\n'
        : '') +
      '    </item>';
  }).join('\n');

return '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">\n' +
  '  <channel>\n' +
  '    <title>Herbal Harmony TN</title>\n' +
  '    <link>' + SITE_URL + '</link>\n' +
  '    <description>Herbal remedies, supplements, and holistic living</description>\n' +
  '    <lastBuildDate>' + new Date().toUTCString() + '</lastBuildDate>\n' +
  itemsXml + '\n' +
  '  </channel>\n' +
  '</rss>\n';
}

function imageType(url) {
  var ext = url.split('?')[0].split('.').pop().toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return 'image/jpeg';
}

function escapeAttr(str) {
  return escapeXml(str).replace(/"/g, '&quot;');
}

function buildSharePage(post) {
  var title = escapeAttr(post.title);
  var desc = escapeAttr(post.description);
  return '<!DOCTYPE html>\n<html lang="en">\n<head>\n' +
    '<meta charset="UTF-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
    '<title>' + title + ' | Herbal Harmony TN</title>\n' +
    '<meta name="description" content="' + desc + '">\n' +
    '<link rel="canonical" href="' + escapeAttr(post.link) + '">\n' +
    '<meta property="og:type" content="article">\n' +
    '<meta property="og:site_name" content="Herbal Harmony TN">\n' +
    '<meta property="og:title" content="' + title + '">\n' +
    '<meta property="og:description" content="' + desc + '">\n' +
    '<meta property="og:url" content="' + escapeAttr(post.link) + '">\n' +
    (post.imageUrl ? '<meta property="og:image" content="' + escapeAttr(post.imageUrl) + '">\n' : '') +
    '<meta name="twitter:card" content="' + (post.imageUrl ? 'summary_large_image' : 'summary') + '">\n' +
    '<script>window.location.replace(' + JSON.stringify(post.blogLink) + ');</script>\n' +
    '</head>\n<body style="font-family:sans-serif;background:#F4F1EB;color:#2B3B22;text-align:center;padding:3rem 1rem">\n' +
    '<p><a href="' + escapeAttr(post.blogLink) + '" style="color:#2B3B22">Read &ldquo;' + title + '&rdquo;</a></p>\n' +
    '</body>\n</html>\n';
}

function writeSharePages(posts) {
  posts.forEach(function (post) {
    var dir = path.join(__dirname, 'blog', post.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), buildSharePage(post), 'utf8');
  });
  console.log('Wrote ' + posts.length + ' blog share page(s).');
}

function main() {
  var posts = loadPosts();
  writeSharePages(posts);
  var rss = buildRss(posts);
  fs.writeFileSync(OUTPUT_FILE, rss, 'utf8');
  console.log('RSS feed written to ' + OUTPUT_FILE + ' with ' + posts.length + ' item(s).');
}

main();
