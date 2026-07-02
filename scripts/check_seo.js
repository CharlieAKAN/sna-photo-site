const fs = require('fs');
const SITE_URL = (process.env.SITE_URL || 'https://sna-photo.com').replace(/\/$/, '');
const sitemap = fs.readFileSync('sitemap.xml', 'utf8');
const sitemapUrls = new Set([...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]));

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
const seenCanonicals = new Set();
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
  const title = html.match(/<title>\s*([\s\S]+?)\s*<\/title>/)?.[1].trim();
  const description = html.match(/<meta\s+name="description"\s+content="([^"]+)"/)?.[1].trim();
  const canonical = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/)?.[1];
  if (title && (title.length < 25 || title.length > 65)) {
    console.error(`${page}: title should be 25-65 characters (found ${title.length})`);
    failures++;
  }
  if (description && (description.length < 70 || description.length > 170)) {
    console.error(`${page}: description should be 70-170 characters (found ${description.length})`);
    failures++;
  }
  if (canonical) {
    if (!canonical.startsWith(`${SITE_URL}/`) && canonical !== `${SITE_URL}/`) {
      console.error(`${page}: canonical does not use SITE_URL`);
      failures++;
    }
    if (canonical.endsWith('.html')) {
      console.error(`${page}: canonical must use a clean URL`);
      failures++;
    }
    if (seenCanonicals.has(canonical)) {
      console.error(`${page}: duplicate canonical ${canonical}`);
      failures++;
    }
    seenCanonicals.add(canonical);
    if (!sitemapUrls.has(canonical)) {
      console.error(`${page}: canonical is missing from sitemap.xml`);
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
  if (page.startsWith('blog/') && page !== 'blog/index.html') {
    if (!/<!-- METADATA: \{.*?\} -->/.test(html)) {
      console.error(`${page}: missing generator metadata`);
      failures++;
    }
    if (!/<section class="post-sources"/.test(html)) {
      console.error(`${page}: missing visible research sources`);
      failures++;
    }
    const sourceLinks = html.match(/<section class="post-sources"[\s\S]*?<\/section>/)?.[0].match(/href="https:\/\//g) || [];
    if (sourceLinks.length < 2) {
      console.error(`${page}: needs at least two HTTPS source links`);
      failures++;
    }
  }
}

for (const url of sitemapUrls) {
  if (!seenCanonicals.has(url)) {
    console.error(`sitemap.xml: ${url} has no matching public page canonical`);
    failures++;
  }
}

if (failures) {
  console.error(`SEO check failed with ${failures} issue(s).`);
  process.exit(1);
}
console.log(`SEO check passed for ${pages.length} public pages.`);
