const fs = require('fs');
const path = require('path');

const SLUG_PATTERN = /^[a-z0-9-]+$/;

function parseFrontMatter(raw) {
  const lines = raw.split(/\r?\n/);
  const meta = {};
  let i = 0;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') { i++; break; }
    const idx = line.indexOf(':');
    if (idx === -1) break;
    meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  const body = lines.slice(i).join('\n').trim();
  return { meta, body };
}

function serialize(metaFields, meta, body) {
  const frontMatter = metaFields
    .filter((key) => meta[key] !== undefined && meta[key] !== null && String(meta[key]).trim() !== '')
    .map((key) => `${key}: ${String(meta[key]).trim()}`)
    .join('\n');
  return `${frontMatter}\n\n${String(body || '').trim()}\n`;
}

// A slug-keyed, .txt-file-backed store with soft-delete (trash) support.
// Two stores that share a slug namespace (e.g. articles vs. podcasts) should
// use separate contentDir/trashDir pairs so slugs can't collide across types.
function createStore({ contentDir, trashDir, metaFields }) {
  for (const dir of [contentDir, trashDir]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  function filePathIn(dir, slug) {
    const safeSlug = path.basename(String(slug || ''));
    if (!SLUG_PATTERN.test(safeSlug)) return null;
    return path.join(dir, `${safeSlug}.txt`);
  }

  function contentFilePath(slug) { return filePathIn(contentDir, slug); }
  function trashFilePath(slug) { return filePathIn(trashDir, slug); }

  function readEntry(dir, slug) {
    const filePath = filePathIn(dir, slug);
    if (!filePath || !fs.existsSync(filePath)) return null;
    return parseFrontMatter(fs.readFileSync(filePath, 'utf8'));
  }

  function getItem(slug) { return readEntry(contentDir, slug); }

  function listSlugsIn(dir) {
    return fs.readdirSync(dir).filter((f) => f.endsWith('.txt')).map((f) => f.slice(0, -4));
  }

  function listItems() { return listSlugsIn(contentDir); }
  function listTrash() { return listSlugsIn(trashDir); }

  // Returns { ok: true } or { error: 'invalid-slug' | 'exists' }.
  function createItem(slug, meta, body) {
    const filePath = contentFilePath(slug);
    if (!filePath) return { error: 'invalid-slug' };
    if (fs.existsSync(filePath) || fs.existsSync(trashFilePath(slug))) return { error: 'exists' };
    fs.writeFileSync(filePath, serialize(metaFields, meta, body), 'utf8');
    return { ok: true };
  }

  function saveItem(slug, meta, body) {
    const filePath = contentFilePath(slug);
    if (!filePath || !fs.existsSync(filePath)) return false;
    fs.writeFileSync(filePath, serialize(metaFields, meta, body), 'utf8');
    return true;
  }

  function trashItem(slug) {
    const src = contentFilePath(slug);
    if (!src || !fs.existsSync(src)) return false;
    fs.renameSync(src, trashFilePath(slug));
    return true;
  }

  function restoreItem(slug) {
    const src = trashFilePath(slug);
    if (!src || !fs.existsSync(src)) return false;
    fs.renameSync(src, contentFilePath(slug));
    return true;
  }

  function deleteTrashedItem(slug) {
    const filePath = trashFilePath(slug);
    if (!filePath || !fs.existsSync(filePath)) return false;
    fs.unlinkSync(filePath);
    return true;
  }

  function emptyTrash() {
    const files = fs.readdirSync(trashDir).filter((f) => f.endsWith('.txt'));
    files.forEach((f) => fs.unlinkSync(path.join(trashDir, f)));
    return files.length;
  }

  return {
    getItem,
    getTrashedItem: (slug) => readEntry(trashDir, slug),
    listItems,
    listTrash,
    createItem,
    saveItem,
    trashItem,
    restoreItem,
    deleteTrashedItem,
    emptyTrash,
  };
}

module.exports = { createStore, parseFrontMatter, SLUG_PATTERN };
