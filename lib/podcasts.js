const fs = require('fs');
const path = require('path');
const { createStore } = require('./content-store');

const TEMPLATE_PATH = path.join(__dirname, '..', '.views', 'episode-template.html');

const META_FIELDS = [
  'Title', 'Desc', 'Thumb', 'ThumbAlt', 'ThumbCredit', 'Href', 'AudioUrl', 'Order',
  'EpisodeLabel', 'Written', 'Voiced', 'ResearchInterviews', 'Produced', 'MusicLabel', 'Music',
];

const store = createStore({
  contentDir: path.join(__dirname, '..', '.content', 'podcasts'),
  trashDir: path.join(__dirname, '..', '.content', 'trash', 'podcasts'),
  metaFields: META_FIELDS,
});

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Inline markup: [text](url) links, *text* italics, ^text^ superscript,
// and literal newlines become <br> (used for speaker/dialogue line breaks).
function inlineFormat(str) {
  return escapeHtml(str)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, url) => `<a href="${url}">${text}</a>`)
    .replace(/\*([^*]+)\*/g, (_m, text) => `<em>${text}</em>`)
    .replace(/\^([^^]+)\^/g, (_m, text) => `<sup>${text}</sup>`)
    .replace(/\n/g, '<br>\n      ');
}

function orderOf(meta) {
  const n = Number(meta.Order);
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}

// Returns { meta, body } for a slug, or null if no content file exists for it.
function getPodcast(slug) {
  return store.getItem(slug);
}

function summarize(slug) {
  const { meta } = store.getItem(slug) || { meta: {} };
  return { slug, title: meta.Title || '', desc: meta.Desc || '', href: meta.Href || '', order: orderOf(meta) };
}

function summarizeTrashed(slug) {
  const { meta } = store.getTrashedItem(slug) || { meta: {} };
  return { slug, title: meta.Title || '', desc: meta.Desc || '', href: meta.Href || '', order: orderOf(meta) };
}

// Returns [{ slug, title, desc, href, order }, ...] sorted by Order then title.
function listPodcasts() {
  return store.listItems().map(summarize).sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

function listTrash() {
  return store.listTrash().map(summarizeTrashed).sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

function createPodcast(slug, meta, body) {
  return store.createItem(slug, meta, body);
}

function savePodcast(slug, meta, body) {
  return store.saveItem(slug, meta, body);
}

// Sets each podcast's Order field to match its position in slugOrder (1-based).
// Slugs not found are skipped; podcasts not mentioned in slugOrder keep their old Order.
function reorderPodcasts(slugOrder) {
  slugOrder.forEach((slug, index) => {
    const podcast = store.getItem(slug);
    if (!podcast) return;
    store.saveItem(slug, { ...podcast.meta, Order: String(index + 1) }, podcast.body);
  });
}

function trashPodcast(slug) {
  return store.trashItem(slug);
}

function restorePodcast(slug) {
  return store.restoreItem(slug);
}

function deleteTrashedPodcast(slug) {
  return store.deleteTrashedItem(slug);
}

function emptyTrash() {
  return store.emptyTrash();
}

// Renders the .podcast-grid cards + any thumbnail credit lines, for embedding
// into news.html in place of the old hardcoded markup.
function renderPodcastGrid() {
  const episodes = store.listItems()
    .map((slug) => ({ slug, ...store.getItem(slug) }))
    .sort((a, b) => orderOf(a.meta) - orderOf(b.meta) || (a.meta.Title || '').localeCompare(b.meta.Title || ''));

  const cards = episodes.map(({ meta }) => `
      <a class="podcast-card" href="${escapeHtml(meta.Href || '#')}">
        ${meta.Thumb ? `<img class="podcast-thumb" src="${escapeHtml(meta.Thumb)}" alt="${escapeHtml(meta.ThumbAlt || '')}">` : ''}
        <div class="podcast-content">
          <h3 class="podcast-title">${escapeHtml(meta.Title || '')}</h3>
          <p class="podcast-desc">${escapeHtml(meta.Desc || '')}</p>
          <span class="podcast-cta">Listen and transcript →</span>
        </div>
      </a>`).join('\n');

  const credits = episodes
    .map(({ meta }) => meta.ThumbCredit)
    .filter(Boolean)
    .map((credit) => `<p class="podcast-credit">${inlineFormat(credit)}</p>`)
    .join('\n      ');

  return `${cards}\n\n      ${credits}`;
}

// --- Transcript page rendering (the podcast's own `body` text) ---

// A chunk's first line is treated as a speaker tag if it's short and ends
// with ":" — e.g. "Halter:" atop a line of dialogue, or "Ace Hornbeck:"
// atop a blockquote. Everything after is the paragraph/quote content.
function splitSpeaker(text) {
  const lines = text.split(/\r?\n/);
  const first = lines[0].trim();
  if (first.endsWith(':') && first.length <= 60) {
    return { speaker: first, rest: lines.slice(1).join('\n').trim() };
  }
  return { speaker: null, rest: text };
}

function parseTranscriptBlocks(body) {
  return body.split(/\n\s*\n/).map((c) => c.trim()).filter(Boolean).map((chunk) => {
    if (chunk.startsWith('## ')) {
      return { type: 'heading', text: chunk.slice(3).trim() };
    }
    if (chunk.startsWith('> ')) {
      const { speaker, rest } = splitSpeaker(chunk.slice(2).trim());
      return { type: 'quote', speaker, text: rest };
    }
    const { speaker, rest } = splitSpeaker(chunk);
    return { type: 'paragraph', speaker, text: rest };
  });
}

function renderTranscriptBlocks(blocks) {
  let isFirstParagraph = true;
  let inFootnoteSection = false;

  return blocks.map((block) => {
    const speakerHtml = block.speaker ? `<strong>${inlineFormat(block.speaker)}</strong><br>\n      ` : '';

    if (block.type === 'heading') {
      inFootnoteSection = true;
      return `<h2>${inlineFormat(block.text)}</h2>`;
    }

    if (block.type === 'quote') {
      return `<blockquote>\n      ${speakerHtml}${inlineFormat(block.text)}\n    </blockquote>`;
    }

    const cls = inFootnoteSection ? ' class="credits"' : isFirstParagraph ? ' class="lede"' : '';
    isFirstParagraph = false;
    return `<p${cls}>${speakerHtml}${inlineFormat(block.text)}</p>`;
  }).join('\n\n      ');
}

function loadTemplate() {
  return fs.readFileSync(TEMPLATE_PATH, 'utf8');
}

function renderEpisodeLinks(currentSlug) {
  const others = store.listItems()
    .filter((slug) => slug !== currentSlug)
    .map((slug) => ({ slug, ...store.getItem(slug) }))
    .filter(({ meta }) => meta.EpisodeLabel)
    .sort((a, b) => orderOf(a.meta) - orderOf(b.meta));

  return others
    .map(({ meta }) => `<a href="${escapeHtml(meta.Href || '#')}">${escapeHtml(meta.EpisodeLabel || '')}</a>`)
    .join(' ·\n      ');
}

// Renders the full transcript page (audio player + transcript body) for a
// podcast slug, or null if that podcast has no transcript-page fields set.
function renderEpisodePage(slug) {
  const podcast = store.getItem(slug);
  if (!podcast) return null;

  const { meta, body } = podcast;
  const template = loadTemplate();

  return template
    .replace(/{{TITLE}}/g, 'Who Owns the Flavor')
    .replace(/{{EPISODE_TITLE}}/g, escapeHtml(meta.Title || ''))
    .replace(/{{WRITTEN}}/g, escapeHtml(meta.Written || ''))
    .replace(/{{VOICED}}/g, escapeHtml(meta.Voiced || ''))
    .replace(/{{RESEARCH}}/g, escapeHtml(meta.ResearchInterviews || ''))
    .replace(/{{PRODUCED}}/g, escapeHtml(meta.Produced || ''))
    .replace(/{{MUSIC_LABEL}}/g, escapeHtml(meta.MusicLabel || 'Music'))
    .replace(/{{MUSIC_CREDIT}}/g, escapeHtml(meta.Music || ''))
    .replace(/{{EPISODE_LABEL}}/g, escapeHtml(meta.EpisodeLabel || ''))
    .replace(/{{EPISODE_LINKS}}/g, renderEpisodeLinks(slug))
    .replace(/{{TRANSCRIPT_BODY}}/g, renderTranscriptBlocks(parseTranscriptBlocks(body || '')))
    .replace(/{{AUDIO_URL}}/g, escapeHtml(meta.AudioUrl || ''));
}

module.exports = {
  getPodcast,
  listPodcasts,
  listTrash,
  createPodcast,
  savePodcast,
  reorderPodcasts,
  trashPodcast,
  restorePodcast,
  deleteTrashedPodcast,
  emptyTrash,
  renderPodcastGrid,
  renderEpisodePage,
};
