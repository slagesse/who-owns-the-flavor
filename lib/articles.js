const fs = require('fs');
const path = require('path');
const { createStore } = require('./content-store');

const TEMPLATE_PATH = path.join(__dirname, '..', '.views', 'article-template.html');

const META_FIELDS = ['Headline', 'Subhead', 'Author', 'AuthorHeadshot', 'Date', 'Order', 'Desc', 'Image', 'ImageAlt', 'ImageCredit'];

function orderOf(meta) {
  const n = Number(meta.Order);
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}

const store = createStore({
  contentDir: path.join(__dirname, '..', '.content', 'print'),
  trashDir: path.join(__dirname, '..', '.content', 'trash', 'print'),
  metaFields: META_FIELDS,
});

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Renders "[text](url)" links inside otherwise-plain text.
function inlineFormat(str) {
  return escapeHtml(str).replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, text, url) => `<a href="${url}">${text}</a>`);
}

function parseBlocks(body) {
  const chunks = body.split(/\n\s*\n/).map((c) => c.trim()).filter(Boolean);

  return chunks.map((chunk) => {
    if (chunk.startsWith('## ')) {
      return { type: 'heading', text: chunk.slice(3).trim() };
    }

    if (chunk.startsWith('> ')) {
      const quoteLines = [];
      let citation = '';
      for (const line of chunk.split(/\r?\n/)) {
        if (line.startsWith('> ')) quoteLines.push(line.slice(2));
        else if (line.startsWith('—')) citation = line.slice(1).trim();
      }
      return { type: 'quote', text: quoteLines.join(' '), citation };
    }

    if (chunk.startsWith('Resource:')) {
      return { type: 'resource', text: chunk.slice('Resource:'.length).trim() };
    }

    return { type: 'paragraph', text: chunk };
  });
}

function renderBlocks(blocks) {
  return blocks.map((block) => {
    switch (block.type) {
      case 'heading':
        return `<div class="section-label">${inlineFormat(block.text)}</div>`;
      case 'quote':
        return `<figure class="pull-quote" aria-label="Pull quote">\n      <p>${inlineFormat(block.text)}</p>\n      <cite>— ${inlineFormat(block.citation)}</cite>\n    </figure>`;
      case 'resource':
        return `<p class="resource">Resource: ${inlineFormat(block.text)}</p>`;
      default:
        return `<p class="article-paragraph">${inlineFormat(block.text)}</p>`;
    }
  }).join('\n\n    ');
}

function loadTemplate() {
  return fs.readFileSync(TEMPLATE_PATH, 'utf8');
}

function renderArticlePage(meta, blocks) {
  const subheadBlock = meta.Subhead
    ? `<p class="article-subtitle">${inlineFormat(meta.Subhead)}</p>`
    : '';

  const imageBlock = meta.Image ? `<figure>
      <img
        class="feature-image"
        src="${meta.Image}"
        alt="${escapeHtml(meta.ImageAlt || '')}"
        width="100%"
        height="450"
        style="width:100%;height:450px;border-radius:12px;border:1px solid rgba(0,0,0,0.12)"
      />
      ${meta.ImageCredit ? `<figcaption class="feature-credit">${inlineFormat(meta.ImageCredit)}</figcaption>` : ''}
    </figure>` : '';

  const template = loadTemplate();

  return template
    .replace(/{{TITLE}}/g, `${escapeHtml(meta.Headline || 'Story')} - Who Owns the Flavor`)
    .replace(/{{HEADLINE}}/g, inlineFormat(meta.Headline || ''))
    .replace(/{{SUBHEAD_BLOCK}}/g, subheadBlock)
    .replace(/{{IMAGE_BLOCK}}/g, imageBlock)
    .replace(/{{AUTHOR_NAME}}/g, escapeHtml(meta.Author || ''))
    .replace(/{{AUTHOR_HEADSHOT}}/g, escapeHtml(meta.AuthorHeadshot || ''))
    .replace(/{{DATE}}/g, escapeHtml(meta.Date || ''))
    .replace(/{{BODY}}/g, renderBlocks(blocks));
}

// Returns { meta, body } for a slug, or null if no content file exists for it.
function getArticle(slug) {
  return store.getItem(slug);
}

// Renders the "Latest" print-card grid for news.html, sorted by Order.
function renderPrintGrid() {
  const articles = store.listItems()
    .map((slug) => ({ slug, ...store.getItem(slug) }))
    .sort((a, b) => orderOf(a.meta) - orderOf(b.meta) || (a.meta.Headline || '').localeCompare(b.meta.Headline || ''));

  return articles.map(({ slug, meta }) => `
      <a class="print-card" href="/print/${slug}">
        ${meta.Image ? `<img class="print-thumb" src="${escapeHtml(meta.Image)}" alt="${escapeHtml(meta.ImageAlt || '')}">` : ''}
        <div class="print-content">
          <h3 class="print-title">${inlineFormat(meta.Headline || '')}</h3>
          <p class="print-meta">
            <span class="author">${escapeHtml(meta.Author || '')}</span>
            <span class="sep">•</span>
            <span class="date">${escapeHtml(meta.Date || '')}</span>
          </p>
          <p class="print-desc">${inlineFormat(meta.Desc || '')}</p>
          <span class="print-cta">Read →</span>
        </div>
      </a>`).join('\n');
}

// Returns rendered HTML for a slug, or null if no content file exists for it.
function renderArticle(slug) {
  const article = getArticle(slug);
  if (!article) return null;
  return renderArticlePage(article.meta, parseBlocks(article.body));
}

function summarize(slug) {
  const { meta } = store.getItem(slug) || { meta: {} };
  return { slug, headline: meta.Headline || '', author: meta.Author || '', date: meta.Date || '', order: orderOf(meta) };
}

function summarizeTrashed(slug) {
  const { meta } = store.getTrashedItem(slug) || { meta: {} };
  return { slug, headline: meta.Headline || '', author: meta.Author || '', date: meta.Date || '' };
}

// Returns [{ slug, headline, author, date, order }, ...] sorted by Order then headline.
function listArticles() {
  return store.listItems().map(summarize).sort((a, b) => a.order - b.order || a.headline.localeCompare(b.headline));
}

function listTrash() {
  return store.listTrash().map(summarizeTrashed).sort((a, b) => a.headline.localeCompare(b.headline));
}

// Sets each article's Order field to match its position in slugOrder (1-based).
// Slugs not found are skipped; articles not mentioned in slugOrder keep their old Order.
function reorderArticles(slugOrder) {
  slugOrder.forEach((slug, index) => {
    const article = store.getItem(slug);
    if (!article) return;
    store.saveItem(slug, { ...article.meta, Order: String(index + 1) }, article.body);
  });
}

function createArticle(slug, meta, body) {
  return store.createItem(slug, meta, body);
}

function saveArticle(slug, meta, body) {
  return store.saveItem(slug, meta, body);
}

function trashArticle(slug) {
  return store.trashItem(slug);
}

function restoreArticle(slug) {
  return store.restoreItem(slug);
}

function deleteTrashedArticle(slug) {
  return store.deleteTrashedItem(slug);
}

function emptyTrash() {
  return store.emptyTrash();
}

module.exports = {
  renderArticle,
  renderPrintGrid,
  listArticles,
  listTrash,
  getArticle,
  createArticle,
  saveArticle,
  reorderArticles,
  trashArticle,
  restoreArticle,
  deleteTrashedArticle,
  emptyTrash,
};
