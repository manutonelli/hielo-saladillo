const { put, list } = require('@vercel/blob');
const { downloadCSV, uploadCSV, parseCSV, serializeCSV } = require('./lib/gdrive');
const STOCK_MAP = require('./lib/stock-map');

const BLOB_KEY = 'hs-products.json';
const ADMIN_PIN = process.env.ADMIN_PIN || '2148';
const STOCK_FILE_ID = process.env.GOOGLE_DRIVE_STOCK_FILE_ID || '10IsnhqAOY263GgtYnu1EeqkZn7HA39Bb';

// Reverse map: csvCodigo → appId
const CSV_TO_APP = {};
for (const [appId, csvId] of Object.entries(STOCK_MAP)) {
  if (csvId != null) CSV_TO_APP[csvId] = appId;
}

// Códigos del CSV que no deben aparecer como productos en la app
const SKIP_CSV = new Set([
  '15KG +', '15KG MIN',          // variantes hielo 15kg (la app solo muestra H15 → 15KGMA)
  '3KG REV', '3KG +',            // variantes hielo 3kg (la app solo muestra H03 → 3KG)
  '5',                            // hielo eventos reventa
  'CARRO',                        // alquiler de carro
]);

// Returns { [csvCodigo]: { stock, retail, mayor, nombre } } or null on error
async function fetchDriveData() {
  try {
    const csv = await downloadCSV(STOCK_FILE_ID);
    const { rows } = parseCSV(csv);
    const map = {};
    rows.forEach(r => {
      if (!r.codigo) return;
      map[r.codigo] = {
        stock: parseInt(r.stock, 10) || 0,
        retail: parseFloat(r.precio_minorista) || null,
        mayor: parseFloat(r.precio_comercio) || null,
        nombre: r.nombre || '',
      };
    });
    return map;
  } catch (e) {
    console.error('[gdrive] fetchDriveData:', e.message);
    return null;
  }
}

async function pushStockToDrive(updates) {
  const csv = await downloadCSV(STOCK_FILE_ID);
  const { headers, rows, sep } = parseCSV(csv);
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  rows.forEach(r => {
    if (r.codigo in updates) {
      r.stock = String(updates[r.codigo]);
      r.actualizado = now;
    }
  });
  await uploadCSV(STOCK_FILE_ID, serializeCSV(headers, rows, sep));
}

// Limpia el nombre del CSV: quita el código numérico inicial ("1082 ACAPULCO..." → "ACAPULCO...")
function cleanCsvName(nombre) {
  return nombre.replace(/^\d+\s+/, '').trim();
}

function detectBrand(nombre) {
  return nombre.toUpperCase().includes('HIELO') ? 'hielo' : 'helados';
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-pin');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  // GET — catálogo construido desde CSV, enriquecido con metadata del Blob
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    try {
      // Carga metadata guardada (nombres, fotos, etc.)
      let blobById = {};
      try {
        const { blobs } = await list({ prefix: BLOB_KEY, limit: 1 });
        if (blobs.length > 0) {
          const r = await fetch(blobs[0].url, {
            headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
          });
          if (r.ok) {
            const arr = await r.json();
            if (Array.isArray(arr)) arr.forEach(p => { blobById[p.id] = p; });
          }
        }
      } catch (_) {}

      const driveData = await fetchDriveData();
      if (!driveData) {
        // Sin Drive: devuelve el Blob tal cual como fallback
        const fallback = Object.values(blobById);
        return res.status(200).json(fallback.length ? fallback : null);
      }

      // Construye el catálogo desde el CSV (solo stock > 0)
      const products = [];
      for (const [csvId, data] of Object.entries(driveData)) {
        if (data.stock <= 0) continue;
        if (SKIP_CSV.has(csvId)) continue;

        const appId = CSV_TO_APP[csvId] || csvId;
        const existing = blobById[appId];

        if (existing) {
          // Producto conocido: usa metadata del Blob + precios/stock del CSV
          products.push({
            ...existing,
            stock: data.stock,
            ...(data.retail !== null && { retail: data.retail }),
            ...(data.mayor !== null && { mayor: data.mayor }),
          });
        } else {
          // Producto nuevo en el CSV: se crea automáticamente
          const nombre = cleanCsvName(data.nombre);
          products.push({
            id: appId,
            name: nombre,
            brand: detectBrand(data.nombre),
            retail: data.retail || 0,
            mayor: data.mayor || 0,
            stock: data.stock,
            photo: '',
            desc: '',
            visible: true,
          });
        }
      }

      return res.status(200).json(products);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // POST — guarda metadata en Blob y sincroniza stock en Drive
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

      await put(BLOB_KEY, body, {
        access: 'private',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: true,
      });

      // Sincroniza stock con Google Drive
      const updates = {};
      products.forEach(p => {
        const csvId = STOCK_MAP[p.id] || (CSV_TO_APP[p.id] ? p.id : null);
        if (csvId) {
          updates[csvId] = typeof p.stock === 'number' ? p.stock : parseInt(p.stock, 10) || 0;
        }
      });

      let driveError = null;
      if (Object.keys(updates).length > 0) {
        try {
          await pushStockToDrive(updates);
        } catch (e) {
          driveError = e.message;
          console.error('[gdrive] pushStockToDrive:', e.message);
        }
      }

      return res.status(200).json({ ok: true, driveError });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  res.status(404).end();
};
