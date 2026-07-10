const crypto = require('crypto');

const USERNAME = 'admin';
const PASSWORD = 'orleans2026';
const SESSION_COOKIE = 'wotf_session';
const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;

const sessions = new Map(); // token -> expiry timestamp

function parseCookies(header) {
  const cookies = {};
  if (!header) return cookies;
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    cookies[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
  });
  return cookies;
}

function login(username, password) {
  if (username !== USERNAME || password !== PASSWORD) return null;
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, Date.now() + SESSION_MAX_AGE_MS);
  return token;
}

function logout(token) {
  sessions.delete(token);
}

function isAuthenticated(req) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!token || !sessions.has(token)) return false;
  if (sessions.get(token) < Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}

function requireAuth(req, res, next) {
  if (!isAuthenticated(req)) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

module.exports = {
  login,
  logout,
  isAuthenticated,
  requireAuth,
  parseCookies,
  SESSION_COOKIE,
  SESSION_MAX_AGE_MS,
};
