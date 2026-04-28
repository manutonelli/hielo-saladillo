const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const ROOT = __dirname;
const PRODUCTS_CSV = path.join(ROOT, 'products.csv');

const files = {
  '/':             path.join(ROOT, 'index.html'),
  '/index.html':   path.join(ROOT, 'index.html'),
  '/mayorista':    path.join(ROOT, 'mayorista.html'),
  '/mayorista.html': path.join(ROOT, 'mayorista.html'),
  '/minorista':    path.join(ROOT, 'minorista.html'),
  '/minorista.html': path.join(ROOT, 'minorista.html'),
};

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Serve HTML pages
  const urlPath = req.url.split('?')[0].split('#')[0];
  if (req.method === 'GET' && files[urlPath]) {
    const filePath = files[urlPath];
    if (!fs.existsSync(filePath)) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(filePath));
    return;
  }

  // Serve static assets (logo, etc.)
  if (req.method === 'GET' && /\.(png|jpg|jpeg|gif|svg|ico|webp)$/i.test(urlPath)) {
    const filePath = path.join(ROOT, urlPath);
    if (!fs.existsSync(filePath)) { res.writeHead(404); res.end('not found'); return; }
    const ext = path.extname(urlPath).slice(1).toLowerCase();
    const mime = { png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif', svg:'image/svg+xml', ico:'image/x-icon', webp:'image/webp' };
    res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
    res.end(fs.readFileSync(filePath));
    return;
  }

  // GET /products.csv
  if (req.method === 'GET' && urlPath === '/products.csv') {
    if (!fs.existsSync(PRODUCTS_CSV)) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8' });
    res.end(fs.readFileSync(PRODUCTS_CSV, 'utf8'));
    return;
  }

  // POST /products.csv  (admin save)
  if (req.method === 'POST' && urlPath === '/products.csv') {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try {
        fs.writeFileSync(PRODUCTS_CSV, Buffer.concat(chunks).toString('utf8'), 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      } catch (e) {
        res.writeHead(500); res.end(e.message);
      }
    });
    return;
  }

  res.writeHead(404); res.end('not found');
});

server.listen(PORT, () => {
  console.log(`\n🧊  Inicio       → http://localhost:${PORT}`);
  console.log(`🛒  Mayorista    → http://localhost:${PORT}/mayorista`);
  console.log(`🛍️  Minorista    → http://localhost:${PORT}/minorista`);
  console.log(`🔑  Admin        → http://localhost:${PORT}/mayorista#admin  (PIN: 2148)`);
  console.log(`📄  CSV          → ${PRODUCTS_CSV}\n`);
});
