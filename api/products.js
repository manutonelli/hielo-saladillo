const { put, list } = require('@vercel/blob');
const { downloadCSV, uploadCSV, parseCSV, serializeCSV } = require('./lib/gdrive');
const STOCK_MAP = require('./lib/stock-map');

const BLOB_KEY = 'hs-products.json';
const ADMIN_PIN = process.env.ADMIN_PIN || '2148';
const STOCK_FILE_ID = process.env.GOOGLE_DRIVE_STOCK_FILE_ID || '111TXPvhraqZrzEd252OuChiUzhn0LvfA';

// Returns { [csvCodigo]: stock } or null on error
async function fetchDriveStock() {
  try {
    const csv = await downloadCSV(STOCK_FILE_ID);
    const { rows } = parseCSV(csv);
    const map = {};
    rows.forEach(r => { if (r.codigo) map[r.codigo] = parseInt(r.stock, 10) || 0; });
    return map;
  } catch (e) {
    console.error('[gdrive] fetchDriveStock:', e.message);
    return null;
  }
}

// Writes updated stock values back to the Drive CSV
async function pushStockToDrive(updates) {
  // updates: { [csvCodigo]: newStock }
  try {
    const csv = await downloadCSV(STOCK_FILE_ID);
    const { headers, rows } = parseCSV(csv);
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    rows.forEach(r => {
      if (r.codigo in updates) {
        r.stock = String(updates[r.codigo]);
        r.actualizado = now;
      }
    });
    await uploadCSV(STOCK_FILE_ID, serializeCSV(headers, rows));
  } catch (e) {
    console.error('[gdrive] pushStockToDrive:', e.message);
  }
}

const UNMAPPED = new Set(['--', '---', null, undefined]);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-pin');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  // GET — devuelve productos (metadata desde Blob, stock desde Drive)
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    try {
      let products = null;

      const { blobs } = await list({ prefix: BLOB_KEY, limit: 1 });
      if (blobs.length > 0) {
        const r = await fetch(blobs[0].url, {
          headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
        });
        if (r.ok) products = await r.json();
      }

      if (products) {
        const driveStock = await fetchDriveStock();
        if (driveStock) {
          products = products.map(p => {
            const csvId = STOCK_MAP[p.id];
            if (csvId && !UNMAPPED.has(csvId) && csvId in driveStock) {
              return { ...p, stock: driveStock[csvId] };
            }
            return p;
          });
        }
      }

      return res.status(200).json(products);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // POST — guarda productos y sincroniza stock en Drive
  if (req.method === 'POST') {
    if (req.headers['x-admin-pin'] !== ADMIN_PIN) {
      return res.status(401).json({ error: 'PIN incorrecto' });
    }
    const chunks = [];
    req.on('data', c => chunks.push(c));
    await new Promise(resolve => req.on('end', resolve));
    try {
      const body = Buffer.concat(chunks).toString('utf8');
      const products = JSON.parse(body);

      // Guarda metadata + stock actual en Blob (fallback)
      await put(BLOB_KEY, body, {
        access: 'private',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: true,
      });

      // Sincroniza stock con Google Drive
      const updates = {};
      products.forEach(p => {
        const csvId = STOCK_MAP[p.id];
        if (csvId && !UNMAPPED.has(csvId)) {
          updates[csvId] = typeof p.stock === 'number' ? p.stock : parseInt(p.stock, 10) || 0;
        }
      });
      if (Object.keys(updates).length > 0) {
        await pushStockToDrive(updates);
      }

      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  res.status(404).end();
};
