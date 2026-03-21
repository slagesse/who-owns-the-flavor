const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(301, 'https://' + req.hostname + req.url);
    }
    next();
  });
}

// Serve static files (CSS, JS, images, audio, etc.)
app.use(express.static(__dirname));

// Top-level pages
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/news', (_req, res) => res.sendFile(path.join(__dirname, 'news.html')));
app.get('/about', (_req, res) => res.sendFile(path.join(__dirname, 'about.html')));
app.get('/stl', (_req, res) => res.sendFile(path.join(__dirname, 'stl.html')));
app.get('/memphis', (_req, res) => res.sendFile(path.join(__dirname, 'memphis.html')));
app.get('/nola', (_req, res) => res.sendFile(path.join(__dirname, 'nola.html')));
app.get('/map', (_req, res) => res.sendFile(path.join(__dirname, 'map.html')));

// Print articles
app.get('/print/dooky-chase', (_req, res) => res.sendFile(path.join(__dirname, 'print/dooky-chase.html')));
app.get('/print/rendeszvous-profile', (_req, res) => res.sendFile(path.join(__dirname, 'print/rendeszvous-profile.html')));
app.get('/print/good-competition', (_req, res) => res.sendFile(path.join(__dirname, 'print/good-competition.html')));
app.get('/print/wayne-m-baquet', (_req, res) => res.sendFile(path.join(__dirname, 'print/wayne-m-baquet.html')));
app.get('/print/delmar-divide', (_req, res) => res.sendFile(path.join(__dirname, 'print/delmar-divide.html')));
app.get('/print/frank-brigtsen', (_req, res) => res.sendFile(path.join(__dirname, 'print/frank-brigtsen.html')));
app.get('/print/nochi', (_req, res) => res.sendFile(path.join(__dirname, 'print/nochi.html')));
app.get('/print/ballhoggerz', (_req, res) => res.sendFile(path.join(__dirname, 'print/ballhoggerz.html')));

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
