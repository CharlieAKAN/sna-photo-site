const fs = require('fs');

const pages = [
  'index.html',
  'gallery/index.html',
  'sessions/index.html',
  'about/index.html',
  'blog/index.html',
  ...fs.readdirSync('blog', { withFileTypes: true })
    .filter(entry => entry.isDirectory() && fs.existsSync(`blog/${entry.name}/index.html`))
    .map(entry => `blog/${entry.name}/index.html`),
];

let failures = 0;
for (const page of pages) {
  const html = fs.readFileSync(page, 'utf8');
  const required = [
    ['title', /<title>\s*[\s\S]+?\s*<\/title>/],
    ['description', /<meta\s+name="description"\s+content="[^"]+"/],
    ['canonical', /<link\s+rel="canonical"\s+href="https:\/\//],
    ['Open Graph title', /property="og:title"/],
    ['Open Graph description', /property="og:description"/],
    ['Open Graph image', /property="og:image"/],
    ['Twitter card', /name="twitter:card"/],
    ['structured data', /type="application\/ld\+json"/],
  ];
  for (const [label, pattern] of required) {
    if (!pattern.test(html)) {
      console.error(`${page}: missing ${label}`);
      failures++;
    }
  }
  if ((html.match(/<h1\b/g) || []).length !== 1) {
    console.error(`${page}: must contain exactly one H1`);
    failures++;
  }
  for (const match of html.matchAll(/<img\b[^>]*>/g)) {
    const image = match[0];
    if (!/\balt=/.test(image) || !/\bwidth=/.test(image) || !/\bheight=/.test(image)) {
      console.error(`${page}: image missing alt text or dimensions`);
      failures++;
    }
  }
  for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(match[1]); } catch (error) {
      console.error(`${page}: invalid JSON-LD (${error.message})`);
      failures++;
    }
  }
}

if (failures) {
  console.error(`SEO check failed with ${failures} issue(s).`);
  process.exit(1);
}
console.log(`SEO check passed for ${pages.length} public pages.`);
