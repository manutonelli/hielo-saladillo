const { put, list, download } = require('@vercel/blob');

const BLOB_KEY = 'hs-products.json';
const ADMIN_PIN = process.env.ADMIN_PIN || '2148';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-pin');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  // GET — devuelve los productos guardados (o null si todavía no hay nada)
  if (req.method === 'GET') {
    try {
      const { blobs } = await list({ prefix: BLOB_KEY, limit: 1 });
      if (blobs.length > 0) {
        const r = await download(blobs[0].url);
        const products = await r.json();
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json(products);
      }
    } catch {}
    return res.status(200).json(null);
  }

  // POST — guarda los productos (requiere PIN)
  if (req.method === 'POST') {
    if (req.headers['x-admin-pin'] !== ADMIN_PIN) {
      return res.status(401).json({ error: 'PIN incorrecto' });
    }
    const chunks = [];
    req.on('data', c => chunks.push(c));
    await new Promise(resolve => req.on('end', resolve));
    try {
      const body = Buffer.concat(chunks).toString('utf8');
      JSON.parse(body); // valida que sea JSON válido
      await put(BLOB_KEY, body, {
        access: 'private',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  res.status(404).end();
};
