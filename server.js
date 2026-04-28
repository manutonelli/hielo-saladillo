const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const ROOT = __dirname;
const PRODUCTS_JSON = path.join(ROOT, 'products.json');

const htmlFiles = {
  '/':               'index.html',
  '/index.html':     'index.html',
  '/mayorista':      'mayorista.html',
  '/mayorista.html': 'mayorista.html',
  '/minorista':      'minorista.html',
  '/minorista.html': 'minorista.html',
};

const MIME = {
  png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg',
  gif:'image/gif', svg:'image/svg+xml', ico:'image/x-icon', webp:'image/webp',
};

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-pin');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const urlPath = req.url.split('?')[0].split('#')[0];

  // HTML pages
  if (req.method === 'GET' && htmlFiles[urlPath]) {
    const filePath = path.join(ROOT, htmlFiles[urlPath]);
    if (!fs.existsSync(filePath)) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(filePath));
    return;
  }

  // Static images (logo, etc.)
  if (req.method === 'GET' && /\.(png|jpg|jpeg|gif|svg|ico|webp)$/i.test(urlPath)) {
    const filePath = path.join(ROOT, urlPath);
    if (!fs.existsSync(filePath)) { res.writeHead(404); res.end('not found'); return; }
    const ext = path.extname(urlPath).slice(1).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(fs.readFileSync(filePath));
    return;
  }

  // GET /api/products
  if (req.method === 'GET' && urlPath === '/api/products') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(fs.existsSync(PRODUCTS_JSON) ? fs.readFileSync(PRODUCTS_JSON, 'utf8') : 'null');
    return;
  }

  // POST /api/products
  if (req.method === 'POST' && urlPath === '/api/products') {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString('utf8');
        JSON.parse(body); // valida JSON
        fs.writeFileSync(PRODUCTS_JSON, body, 'utf8');
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
  console.log(`📄  Productos    → ${PRODUCTS_JSON}\n`);
});
