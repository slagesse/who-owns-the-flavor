const fs = require('fs');
const express = require('express');
const path = require('path');
const {
  renderArticle,
  renderPrintGrid,
  listArticles,
  listTrash: listArticleTrash,
  getArticle,
  createArticle,
  saveArticle,
  reorderArticles,
  trashArticle,
  restoreArticle,
  deleteTrashedArticle,
  emptyTrash: emptyArticleTrash,
} = require('./lib/articles');
const {
  listPodcasts,
  listTrash: listPodcastTrash,
  getPodcast,
  createPodcast,
  savePodcast,
  reorderPodcasts,
  trashPodcast,
  restorePodcast,
  deleteTrashedPodcast,
  emptyTrash: emptyPodcastTrash,
  renderPodcastGrid,
  renderEpisodePage,
} = require('./lib/podcasts');
const {
  listAudioFiles,
  saveAudioFile,
  deleteAudioFile,
  listImageFiles,
  saveImageFile,
  deleteImageFile,
  listHeadshotFiles,
  saveHeadshotFile,
  deleteHeadshotFile,
} = require('./lib/media');
const { login, logout, isAuthenticated, requireAuth, parseCookies, SESSION_COOKIE, SESSION_MAX_AGE_MS } = require('./lib/auth');
const app = express();
const PORT = process.env.PORT || 2121;

app.set('trust proxy', 1);

if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(301, 'https://' + req.hostname + req.url);
    }
    next();
  });
}

app.use(express.json());

// Serve static files (CSS, JS, images, audio, etc.)
app.use(express.static(__dirname));

// Top-level pages
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// news.html's podcast grid and "Latest" print grid are both flowed in from content files
app.get('/news', (_req, res) => {
  const template = fs.readFileSync(path.join(__dirname, 'news.html'), 'utf8');
  res.send(template
    .replace('{{PODCAST_CARDS}}', renderPodcastGrid())
    .replace('{{PRINT_CARDS}}', renderPrintGrid()));
});

app.get('/about', (_req, res) => res.sendFile(path.join(__dirname, 'about.html')));

// Episode transcript pages — the transcript is just the podcast item's own body text
function episodeRoute(podcastSlug) {
  return (_req, res, next) => {
    const html = renderEpisodePage(podcastSlug);
    if (!html) return next();
    res.send(html);
  };
}
app.get('/stl', episodeRoute('st-louis'));
app.get('/memphis', episodeRoute('memphis'));
app.get('/nola', episodeRoute('new-orleans'));

app.get('/map', (_req, res) => res.sendFile(path.join(__dirname, 'map.html')));
app.get('/login', (_req, res) => res.sendFile(path.join(__dirname, 'login.html')));

// Print articles — content lives in .content/print/<slug>.txt, flowed into a shared skeleton
app.get('/print/:slug', (req, res, next) => {
  const html = renderArticle(req.params.slug);
  if (!html) return next();
  res.send(html);
});

// --- Dashboard auth ---
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const token = login(username, password);
  if (!token) return res.status(401).json({ error: 'Invalid username or password' });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_MAX_AGE_MS,
  });
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (token) logout(token);
  res.clearCookie(SESSION_COOKIE);
  res.json({ ok: true });
});

app.get('/api/session', (req, res) => {
  res.json({ authenticated: isAuthenticated(req) });
});

// --- Article CMS API (all protected) ---
app.get('/api/articles', requireAuth, (_req, res) => {
  res.json(listArticles());
});

app.get('/api/articles/:slug', requireAuth, (req, res) => {
  const article = getArticle(req.params.slug);
  if (!article) return res.status(404).json({ error: 'Not found' });
  res.json({ slug: req.params.slug, meta: article.meta, body: article.body });
});

// Registered before the /:slug routes so "reorder" isn't matched as a slug.
app.put('/api/articles/reorder', requireAuth, (req, res) => {
  const { slugs } = req.body || {};
  if (!Array.isArray(slugs)) return res.status(400).json({ error: 'slugs array is required' });
  reorderArticles(slugs);
  res.json({ ok: true });
});

app.put('/api/articles/:slug', requireAuth, (req, res) => {
  const { meta, body } = req.body || {};
  if (!meta || !meta.Headline || !meta.Author || !meta.AuthorHeadshot || !meta.Date || typeof body !== 'string') {
    return res.status(400).json({ error: 'Headline, Author, AuthorHeadshot, Date, and body are required' });
  }
  const saved = saveArticle(req.params.slug, meta, body);
  if (!saved) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

app.post('/api/articles', requireAuth, (req, res) => {
  const { slug, meta, body } = req.body || {};
  if (!slug || !meta || !meta.Headline || !meta.Author || !meta.AuthorHeadshot || !meta.Date || typeof body !== 'string') {
    return res.status(400).json({ error: 'Slug, Headline, Author, AuthorHeadshot, Date, and body are required' });
  }
  const result = createArticle(slug, meta, body);
  if (result.error === 'invalid-slug') {
    return res.status(400).json({ error: 'Slug must be lowercase letters, numbers, and hyphens only' });
  }
  if (result.error === 'exists') {
    return res.status(409).json({ error: 'An article with that slug already exists' });
  }
  res.status(201).json({ ok: true, slug });
});

app.delete('/api/articles/:slug', requireAuth, (req, res) => {
  const trashed = trashArticle(req.params.slug);
  if (!trashed) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// --- Podcast CMS API (all protected) ---
app.get('/api/podcasts', requireAuth, (_req, res) => {
  res.json(listPodcasts());
});

app.get('/api/podcasts/:slug', requireAuth, (req, res) => {
  const podcast = getPodcast(req.params.slug);
  if (!podcast) return res.status(404).json({ error: 'Not found' });
  res.json({ slug: req.params.slug, meta: podcast.meta, body: podcast.body });
});

// Registered before the /:slug routes so "reorder" isn't matched as a slug.
app.put('/api/podcasts/reorder', requireAuth, (req, res) => {
  const { slugs } = req.body || {};
  if (!Array.isArray(slugs)) return res.status(400).json({ error: 'slugs array is required' });
  reorderPodcasts(slugs);
  res.json({ ok: true });
});

app.put('/api/podcasts/:slug', requireAuth, (req, res) => {
  const { meta, body } = req.body || {};
  if (!meta || !meta.Title || !meta.Desc) {
    return res.status(400).json({ error: 'Title and Desc are required' });
  }
  const saved = savePodcast(req.params.slug, meta, body || '');
  if (!saved) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

app.post('/api/podcasts', requireAuth, (req, res) => {
  const { slug, meta, body } = req.body || {};
  if (!slug || !meta || !meta.Title || !meta.Desc) {
    return res.status(400).json({ error: 'Slug, Title, and Desc are required' });
  }
  const result = createPodcast(slug, meta, body || '');
  if (result.error === 'invalid-slug') {
    return res.status(400).json({ error: 'Slug must be lowercase letters, numbers, and hyphens only' });
  }
  if (result.error === 'exists') {
    return res.status(409).json({ error: 'A podcast with that slug already exists' });
  }
  res.status(201).json({ ok: true, slug });
});

app.delete('/api/podcasts/:slug', requireAuth, (req, res) => {
  const trashed = trashPodcast(req.params.slug);
  if (!trashed) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// --- Trash (unified across content types) ---
const TRASH_TYPES = {
  article: { list: listArticleTrash, restore: restoreArticle, deleteForever: deleteTrashedArticle, empty: emptyArticleTrash, label: (a) => a.headline },
  podcast: { list: listPodcastTrash, restore: restorePodcast, deleteForever: deleteTrashedPodcast, empty: emptyPodcastTrash, label: (p) => p.title },
};

app.get('/api/trash', requireAuth, (_req, res) => {
  const combined = Object.entries(TRASH_TYPES).flatMap(([type, handlers]) =>
    handlers.list().map((item) => ({ type, slug: item.slug, title: handlers.label(item) }))
  );
  res.json(combined);
});

app.post('/api/trash/:type/:slug/restore', requireAuth, (req, res) => {
  const handlers = TRASH_TYPES[req.params.type];
  if (!handlers) return res.status(400).json({ error: 'Unknown content type' });
  const restored = handlers.restore(req.params.slug);
  if (!restored) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

app.delete('/api/trash/:type/:slug', requireAuth, (req, res) => {
  const handlers = TRASH_TYPES[req.params.type];
  if (!handlers) return res.status(400).json({ error: 'Unknown content type' });
  const deleted = handlers.deleteForever(req.params.slug);
  if (!deleted) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

app.delete('/api/trash', requireAuth, (_req, res) => {
  const count = Object.values(TRASH_TYPES).reduce((sum, handlers) => sum + handlers.empty(), 0);
  res.json({ ok: true, count });
});

// --- Media Bank: audio uploads (all protected) ---
app.get('/api/media/audio', requireAuth, (_req, res) => {
  res.json(listAudioFiles());
});

// Raw binary upload: the client sends the file bytes directly as the request
// body with the original filename in the X-Filename header.
app.post('/api/media/audio', requireAuth, express.raw({ type: () => true, limit: '150mb' }), (req, res) => {
  const rawName = req.header('X-Filename');
  if (!rawName) return res.status(400).json({ error: 'Missing X-Filename header' });
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ error: 'No file data received' });
  }

  let filename;
  try {
    filename = decodeURIComponent(rawName);
  } catch (_e) {
    return res.status(400).json({ error: 'Invalid filename' });
  }

  const result = saveAudioFile(filename, req.body);
  if (result.error === 'invalid-name') {
    return res.status(400).json({ error: 'Use a filename ending in .mp3, .wav, .m4a, .ogg, .aac, or .flac' });
  }
  if (result.error === 'exists') {
    return res.status(409).json({ error: 'A file with that name already exists' });
  }
  res.status(201).json({ ok: true, filename: result.filename });
});

app.delete('/api/media/audio/:filename', requireAuth, (req, res) => {
  let filename;
  try {
    filename = decodeURIComponent(req.params.filename);
  } catch (_e) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  const deleted = deleteAudioFile(filename);
  if (!deleted) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// --- Media Bank: image uploads (all protected) ---
app.get('/api/media/images', requireAuth, (_req, res) => {
  res.json(listImageFiles());
});

app.post('/api/media/images', requireAuth, express.raw({ type: () => true, limit: '150mb' }), (req, res) => {
  const rawName = req.header('X-Filename');
  if (!rawName) return res.status(400).json({ error: 'Missing X-Filename header' });
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ error: 'No file data received' });
  }

  let filename;
  try {
    filename = decodeURIComponent(rawName);
  } catch (_e) {
    return res.status(400).json({ error: 'Invalid filename' });
  }

  const result = saveImageFile(filename, req.body);
  if (result.error === 'invalid-name') {
    return res.status(400).json({ error: 'Use a filename ending in .jpg, .jpeg, .png, .gif, .webp, or .svg' });
  }
  if (result.error === 'exists') {
    return res.status(409).json({ error: 'A file with that name already exists' });
  }
  res.status(201).json({ ok: true, filename: result.filename });
});

app.delete('/api/media/images/:filename', requireAuth, (req, res) => {
  let filename;
  try {
    filename = decodeURIComponent(req.params.filename);
  } catch (_e) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  const deleted = deleteImageFile(filename);
  if (!deleted) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// --- Media Bank: headshot uploads (all protected) ---
app.get('/api/media/headshots', requireAuth, (_req, res) => {
  res.json(listHeadshotFiles());
});

app.post('/api/media/headshots', requireAuth, express.raw({ type: () => true, limit: '150mb' }), (req, res) => {
  const rawName = req.header('X-Filename');
  if (!rawName) return res.status(400).json({ error: 'Missing X-Filename header' });
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ error: 'No file data received' });
  }

  let filename;
  try {
    filename = decodeURIComponent(rawName);
  } catch (_e) {
    return res.status(400).json({ error: 'Invalid filename' });
  }

  const result = saveHeadshotFile(filename, req.body);
  if (result.error === 'invalid-name') {
    return res.status(400).json({ error: 'Use a filename ending in .jpg, .jpeg, .png, .gif, .webp, or .svg' });
  }
  if (result.error === 'exists') {
    return res.status(409).json({ error: 'A file with that name already exists' });
  }
  res.status(201).json({ ok: true, filename: result.filename });
});

app.delete('/api/media/headshots/:filename', requireAuth, (req, res) => {
  let filename;
  try {
    filename = decodeURIComponent(req.params.filename);
  } catch (_e) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  const deleted = deleteHeadshotFile(filename);
  if (!deleted) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// 404 handler
app.use((req, res) => {
    res.status(404).send(`
        <h1>404 - Page Not Found</h1>
        <p>The page you're looking for doesn't exist.</p>
        <a href="/">Go back to home</a>
    `);
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
