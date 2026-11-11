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
  var manifestPath = path.join(__dirname, 'blog', 'posts.json');
  var data;
  try {
    data = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    console.error('Could not read ' + manifestPath + '. Run node build-blog.js first.');
    console.error(err.message);
    return [];
  }
  var list = data.posts || [];

var posts = list.map(function (meta) {
  var slug = meta.slug;
  var articleUrl = SITE_URL + (meta.url || ('/blog/' + encodeURIComponent(slug) + '/'));
  var image = meta.thumbnail || '';
  var imageUrl = image ? (/^https?:/.test(image) ? image : SITE_URL + image) : '';
  var imageLength = 0;
  if (image && !/^https?:/.test(image)) {
    try { imageLength = fs.statSync(path.join(__dirname, image.replace(/^\//, ''))).size; } catch (e) {}
  }
  var dateObj = meta.date ? new Date(meta.date) : new Date();

                        return {
                          title: meta.title || 'Untitled',
                          description: meta.description || '',
                          dateObj: dateObj,
                          pubDate: toRfc822(meta.date),
                          slug: slug,
                          blogLink: articleUrl,
                          link: articleUrl,
                          guid: articleUrl,
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
      '      <guid isPermaLink="true">' + post.guid + '</guid>\n' +
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

function main() {
  var posts = loadPosts();
  var rss = buildRss(posts);
  fs.writeFileSync(OUTPUT_FILE, rss, 'utf8');
  console.log('RSS feed written to ' + OUTPUT_FILE + ' with ' + posts.length + ' item(s).');
}

main();
