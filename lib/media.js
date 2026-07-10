const fs = require('fs');
const path = require('path');

// A filename-validated, directory-backed media category (e.g. all the .mp3
// files in audio/, or all the .jpg/.png files in images/).
function createMediaCategory(dir, extensions) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const urlPrefix = `/${path.basename(dir)}`;

  function isValidFilename(name) {
    if (typeof name !== 'string' || !name || name.length > 200) return false;
    if (path.basename(name) !== name) return false; // no path separators / traversal
    const ext = path.extname(name).toLowerCase();
    return extensions.includes(ext) && name.length > ext.length;
  }

  // Returns [{ filename, url, size, modified }, ...] sorted by filename.
  function listFiles() {
    return fs.readdirSync(dir)
      .filter((f) => extensions.includes(path.extname(f).toLowerCase()))
      .map((filename) => {
        const stat = fs.statSync(path.join(dir, filename));
        return {
          filename,
          url: `${urlPrefix}/${encodeURIComponent(filename)}`,
          size: stat.size,
          modified: stat.mtime.toISOString(),
        };
      })
      .sort((a, b) => a.filename.localeCompare(b.filename));
  }

  // Saves a new file. Returns { ok: true, filename } or { error: 'invalid-name' | 'exists' }.
  function saveFile(filename, buffer) {
    if (!isValidFilename(filename)) return { error: 'invalid-name' };
    const filePath = path.join(dir, filename);
    if (fs.existsSync(filePath)) return { error: 'exists' };
    fs.writeFileSync(filePath, buffer);
    return { ok: true, filename };
  }

  // Permanently deletes a file. Returns false if it doesn't exist.
  function deleteFile(filename) {
    if (!isValidFilename(filename)) return false;
    const filePath = path.join(dir, filename);
    if (!fs.existsSync(filePath)) return false;
    fs.unlinkSync(filePath);
    return true;
  }

  return { listFiles, saveFile, deleteFile };
}

const audio = createMediaCategory(
  path.join(__dirname, '..', 'audio'),
  ['.mp3', '.wav', '.m4a', '.ogg', '.aac', '.flac']
);

const images = createMediaCategory(
  path.join(__dirname, '..', 'images'),
  ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg']
);

const headshots = createMediaCategory(
  path.join(__dirname, '..', 'headshots'),
  ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg']
);

module.exports = {
  listAudioFiles: audio.listFiles,
  saveAudioFile: audio.saveFile,
  deleteAudioFile: audio.deleteFile,
  listImageFiles: images.listFiles,
  saveImageFile: images.saveFile,
  deleteImageFile: images.deleteFile,
  listHeadshotFiles: headshots.listFiles,
  saveHeadshotFile: headshots.saveFile,
  deleteHeadshotFile: headshots.deleteFile,
};
