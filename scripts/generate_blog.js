const fs = require("fs");
const path = require("path");

const BASE_URL = (process.env.SITE_URL || "https://charlieakan.github.io/sna-photo-site").replace(/\/$/, "");
const ROOT = path.join(__dirname, "..");
const BLOG_DIR = path.join(ROOT, "blog");
const REQUIRED = [
  "title",
  "date",
  "isoDate",
  "excerpt",
  "slug",
  "tags",
  "content",
  "sources",
];
const POST_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: REQUIRED,
  properties: {
    title: { type: "string" },
    date: { type: "string" },
    isoDate: { type: "string" },
    excerpt: { type: "string" },
    slug: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
    content: { type: "string" },
    sources: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "publisher", "url"],
        properties: {
          title: { type: "string" },
          publisher: { type: "string" },
          url: { type: "string" },
        },
      },
    },
  },
};

function escapeHtml(value = "") {
  return String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
}

function validatePost(post) {
  for (const key of REQUIRED)
    if (!post[key]) throw new Error(`Generated post is missing ${key}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(post.isoDate))
    throw new Error("isoDate must use YYYY-MM-DD");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(post.slug))
    throw new Error("slug must be lowercase and URL safe");
  if (!Array.isArray(post.tags)) throw new Error("tags must be an array");
  if (post.title.length < 25 || post.title.length > 65)
    throw new Error("Title must be between 25 and 65 characters");
  if (post.excerpt.length < 80 || post.excerpt.length > 160)
    throw new Error("Excerpt must be between 80 and 160 characters");
  if (post.tags.length < 1 || post.tags.some((tag) => typeof tag !== "string" || !tag.trim()))
    throw new Error("Post needs at least one valid tag");
  if (post.content.includes("—")) throw new Error("Post contains an em dash");
  if (!Array.isArray(post.sources) || post.sources.length < 2)
    throw new Error("Post must include at least two research sources");
  const domains = new Set();
  for (const source of post.sources) {
    if (!source.title || !source.publisher || !source.url)
      throw new Error("Each source needs title, publisher, and url");
    let url;
    try {
      url = new URL(source.url);
    } catch {
      throw new Error(`Invalid source URL: ${source.url}`);
    }
    if (url.protocol !== "https:")
      throw new Error(`Source must use HTTPS: ${source.url}`);
    domains.add(url.hostname.replace(/^www\./, ""));
  }
  if (domains.size < 2)
    throw new Error("Research must use at least two independent domains");
  if (/<script|<style|\son\w+=/i.test(post.content))
    throw new Error("Unsafe HTML found in generated content");
  const allowedTags = new Set(["h2", "h3", "p", "ul", "li", "a", "strong", "em"]);
  for (const match of post.content.matchAll(/<\/?([a-z0-9]+)\b[^>]*>/gi))
    if (!allowedTags.has(match[1].toLowerCase()))
      throw new Error(`Unsupported HTML tag in content: ${match[1]}`);
  for (const match of post.content.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)) {
    let link;
    try {
      link = new URL(match[1]);
    } catch {
      throw new Error(`Article contains an invalid link: ${match[1]}`);
    }
    if (link.protocol !== "https:")
      throw new Error(`Article links must use HTTPS: ${match[1]}`);
  }
  const citedSources = post.sources.filter((source) => post.content.includes(source.url));
  if (citedSources.length < 2)
    throw new Error("Article must cite at least two listed sources in the body");
  const plainWordCount = post.content.replace(/<[^>]+>/g, " ").trim().split(/\s+/).length;
  if (plainWordCount < 600)
    throw new Error(`Article is too short (${plainWordCount} words; minimum is 600)`);
  const robotic = [
    "in conclusion",
    "delve",
    "tapestry",
    "it is important to note",
    "in today's fast-paced world",
  ];
  for (const phrase of robotic)
    if (post.content.toLowerCase().includes(phrase))
      throw new Error(`Robotic phrase found: ${phrase}`);
  return post;
}

function readPosts() {
  if (!fs.existsSync(BLOG_DIR)) return [];
  return fs
    .readdirSync(BLOG_DIR)
    .filter((file) => fs.statSync(path.join(BLOG_DIR, file)).isDirectory() && fs.existsSync(path.join(BLOG_DIR, file, "index.html")))
    .map((file) => {
      const html = fs.readFileSync(path.join(BLOG_DIR, file, "index.html"), "utf8");
      const match = html.match(/<!-- METADATA: (.*?) -->/);
      if (!match) return null;
      try {
        return JSON.parse(match[1]);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.isoDate.localeCompare(a.isoDate));
}

function syncIndex() {
  const posts = readPosts();
  const cards = posts
    .map((post, index) =>
      index === 0
        ? `<article class="blog-card blog-card--featured">
  <a class="journal-card-image" href="blog/${escapeHtml(post.slug)}/" aria-label="Read ${escapeHtml(post.title)}"><img src="assets/images/pet-12.webp" alt="Snout ’n About Photography watercolor logo" width="1500" height="1000" loading="lazy"></a>
  <div class="journal-card-body">
    <span class="blog-date"><time datetime="${escapeHtml(post.isoDate)}">${escapeHtml(post.date)}</time></span>
    <h3>${escapeHtml(post.title)}</h3>
    <p>${escapeHtml(post.excerpt)}</p>
    <a class="link" href="blog/${escapeHtml(post.slug)}/">Read article <span aria-hidden="true">→</span></a>
  </div>
</article>`
        : `<article class="blog-card blog-card--archive">
  <div class="journal-card-body">
    <span class="blog-date"><time datetime="${escapeHtml(post.isoDate)}">${escapeHtml(post.date)}</time></span>
    <h3><a href="blog/${escapeHtml(post.slug)}/">${escapeHtml(post.title)}</a></h3>
  </div>
</article>`,
    )
    .join("\n");
  const indexPath = path.join(BLOG_DIR, "index.html");
  const index = fs.readFileSync(indexPath, "utf8");
  const start = "<!-- POSTS_START -->";
  const end = "<!-- POSTS_END -->";
  if (!index.includes(start) || !index.includes(end))
    throw new Error("POSTS markers are missing from blog/index.html");
  fs.writeFileSync(
    indexPath,
    index.replace(
      new RegExp(`${start}[\\s\\S]*?${end}`),
      `${start}\n${cards}\n${end}`,
    ),
  );
  generateSitemap(posts);
  console.log(`Synced ${posts.length} post(s) and sitemap.xml`);
}

function generateSitemap(posts) {
  const today = new Date().toISOString().slice(0, 10);
  const pages = ["", "/gallery/", "/sessions/", "/about/", "/blog/"];
  const urls = pages.map(
    (url, i) =>
      `  <url><loc>${BASE_URL}${url || "/"}</loc><lastmod>${today}</lastmod><priority>${i === 0 ? "1.0" : "0.8"}</priority></url>`,
  );
  posts.forEach((post) =>
    urls.push(
      `  <url><loc>${BASE_URL}/blog/${escapeHtml(post.slug)}/</loc><lastmod>${post.isoDate}</lastmod><priority>0.7</priority></url>`,
    ),
  );
  fs.writeFileSync(
    path.join(ROOT, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`,
  );
}

async function generateBlog() {
  if (!process.env.OPENAI_API_KEY)
    throw new Error("Set OPENAI_API_KEY before generating a post");
  const OpenAI = require("openai");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const topics = [
    "best places for dog photos near Marietta GA",
    "prepare a dog for a photo session",
    "prepare a cat for portraits",
    "senior pet photography",
    "outdoor versus studio pet portraits",
    "what to bring to a pet photography session",
    "seasonal pet photos in Georgia",
    "nervous pets during photo sessions",
  ];
  const existing =
    readPosts()
      .map((post) => post.title)
      .join("; ") || "None yet";
  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-5.4",
    tools: [{ type: "web_search" }],
    text: {
      format: {
        type: "json_schema",
        name: "pet_photography_blog_post",
        strict: true,
        schema: POST_SCHEMA,
      },
    },
    instructions: `You are the writer and careful fact-checker for Snout 'n About Photography, a warm pet photography studio in Marietta, Georgia.

RESEARCH FIRST:
- Use web search before writing. Do not rely on memory for factual, medical, safety, local, seasonal, or location claims.
- Prefer primary and authoritative sources such as government pages, park authorities, veterinary organizations, and recognized animal-welfare or training organizations.
- Use at least two independent domains. Open and read every source you rely on.
- If reliable sources do not support a claim, leave it out. Never invent a place, rule, statistic, price, policy, quote, testimonial, credential, or business detail.
- Local recommendations must be verified as currently open and dog-friendly on an official page. State leash, permit, or access rules only when an official source confirms them.
- Pet health or behavior guidance must stay general and must not replace veterinary or qualified behavioral advice.

VOICE:
- Sound like a thoughtful local photographer talking to a pet owner, not a marketer or AI.
- Use an 8th-grade reading level, short paragraphs, concrete language, and natural rhythm.
- Use we, us, and you where natural. Do not overuse rhetorical questions.
- Never use em dashes, "In conclusion", "delve", "tapestry", "it is important to note", or generic filler.
- Do not stuff keywords. Use only genuinely relevant phrases such as Marietta pet photography, Atlanta area pet photographer, dog photography in Marietta, senior pet portraits, or pet photo session.

OUTPUT:
Return only valid JSON with title, date, isoDate, excerpt, slug, tags (array), content (semantic HTML using h2, h3, p, ul, li, and inline a tags only), and sources.
- The title must be 25-65 characters, including spaces.
- The excerpt must be 80-160 characters, including spaces.
- The article body must contain at least 600 words.
- Sources must be an array of objects with title, publisher, and the direct HTTPS url.
- Cite at least two of the listed source URLs naturally in the article body.
- End with a warm invitation to book, but do not invent an offer or urgency.`,
    input: `Research and write one useful article. Choose one of these directions: ${topics.join("; ")}. Avoid duplicating these existing posts: ${existing}. Today's date is ${new Date().toISOString().slice(0, 10)}.`,
  });
  let currentResponse = response;
  let post;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      if (!currentResponse.output_text)
        throw new Error("OpenAI returned no article content");
      post = validatePost(JSON.parse(currentResponse.output_text));
      break;
    } catch (error) {
      if (attempt === 3)
        throw new Error(`Draft failed validation after 3 attempts: ${error.message}`);
      console.warn(`Draft validation attempt ${attempt} failed: ${error.message}`);
      currentResponse = await client.responses.create({
        model: process.env.OPENAI_MODEL || "gpt-5.4",
        previous_response_id: currentResponse.id,
        text: {
          format: {
            type: "json_schema",
            name: "pet_photography_blog_post",
            strict: true,
            schema: POST_SCHEMA,
          },
        },
        input: `Return a corrected complete JSON article. The previous draft failed this requirement: ${error.message}. Preserve well-supported research and citations while fixing every validation issue.`,
      });
    }
  }
  fs.mkdirSync(BLOG_DIR, { recursive: true });
  const template = fs.readFileSync(
    path.join(ROOT, "blog-template.html"),
    "utf8",
  );
  const metadata = JSON.stringify({
    title: post.title,
    date: post.date,
    isoDate: post.isoDate,
    excerpt: post.excerpt,
    slug: post.slug,
    tags: post.tags,
    sources: post.sources,
  }).replace(/-->/g, "--&gt;");
  const sourcesHtml = `<section class="post-sources" aria-labelledby="sources-title"><h2 id="sources-title">Sources</h2><ul>${post.sources.map((source) => `<li><a href="${escapeHtml(source.url)}" rel="noopener">${escapeHtml(source.title)}</a> <span>${escapeHtml(source.publisher)}</span></li>`).join("")}</ul></section>`;
  const html = template
    .replaceAll("{{POST_TITLE}}", escapeHtml(post.title))
    .replaceAll("{{POST_DATE}}", escapeHtml(post.date))
    .replaceAll("{{POST_ISO_DATE}}", escapeHtml(post.isoDate))
    .replaceAll("{{POST_EXCERPT}}", escapeHtml(post.excerpt))
    .replaceAll("{{POST_SLUG}}", escapeHtml(post.slug))
    .replace("{{POST_CONTENT}}", `${post.content}${sourcesHtml}`)
    .replace("{{POST_METADATA}}", metadata);
  const destinationDir = path.join(BLOG_DIR, post.slug);
  fs.mkdirSync(destinationDir, { recursive: true });
  const destination = path.join(destinationDir, "index.html");
  if (fs.existsSync(destination))
    throw new Error(`Post already exists: ${post.slug}`);
  fs.writeFileSync(destination, html);
  console.log(`Created blog/${post.slug}/`);
  syncIndex();
}

(async () => {
  try {
    process.argv.includes("--sync-only") ? syncIndex() : await generateBlog();
  } catch (error) {
    console.error(`Blog generation failed: ${error.message}`);
    process.exitCode = 1;
  }
})();
