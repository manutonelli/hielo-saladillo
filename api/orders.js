const { put, list } = require('@vercel/blob');
const { downloadCSV, uploadCSV, parseCSV, serializeCSV } = require('./lib/gdrive');
const STOCK_MAP = require('./lib/stock-map');

const ORDERS_PREFIX = 'hs-order-';
const ADMIN_PIN = process.env.ADMIN_PIN || '2148';
const STOCK_FILE_ID = process.env.GOOGLE_DRIVE_STOCK_FILE_ID || '10IsnhqAOY263GgtYnu1EeqkZn7HA39Bb';

async function fetchBlob(url) {
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
    cache: 'no-store',
  });
  if (!r.ok) return null;
  return r.json();
}

async function loadOrders() {
  try {
    // Lista todos los blobs individuales de pedidos
    let cursor;
    const blobs = [];
    do {
      const res = await list({ prefix: ORDERS_PREFIX, limit: 1000, cursor });
      blobs.push(...res.blobs);
      cursor = res.cursor;
    } while (cursor);

    if (!blobs.length) return [];

    // Fetch en paralelo y ordena por fecha desc
    const orders = (await Promise.all(blobs.map(b => fetchBlob(b.url).catch(() => null))))
      .filter(Boolean)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return orders;
  } catch (_) { return []; }
}

async function saveOrder(order) {
  const key = `${ORDERS_PREFIX}${order.id}.json`;
  await put(key, JSON.stringify(order), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

async function adjustStock(items, sign) {
  try {
    const csv = await downloadCSV(STOCK_FILE_ID);
    const { headers, rows, sep } = parseCSV(csv);
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const byCode = {};
    items.forEach(i => {
      const csvId = STOCK_MAP[i.id] || STOCK_MAP[i.csvId] || i.csvId || i.id;
      if (csvId) byCode[csvId] = (byCode[csvId] || 0) + i.qty;
    });
    rows.forEach(r => {
      if (r.codigo in byCode) {
        const current = parseInt(r.stock, 10) || 0;
        r.stock = String(Math.max(0, current + sign * byCode[r.codigo]));
        r.actualizado = now;
      }
    });
    await uploadCSV(STOCK_FILE_ID, serializeCSV(headers, rows, sep));
  } catch (e) {
    console.error('[orders] adjustStock:', e.message);
    throw e;
  }
}

function restoreStock(items) { return adjustStock(items, +1); }
function deductStock(items)  { return adjustStock(items, -1); }

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-pin');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  // GET — lista pedidos (solo admin)
  if (req.method === 'GET') {
    if (req.headers['x-admin-pin'] !== ADMIN_PIN) {
      return res.status(401).json({ error: 'PIN incorrecto' });
    }
    const orders = await loadOrders();
    return res.status(200).json(orders);
  }

  // POST — crear pedido (público)
  if (req.method === 'POST') {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    await new Promise(resolve => req.on('end', resolve));
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const order = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        createdAt: new Date().toISOString(),
        status: 'confirmado',
        name: body.name || '',
        delivery: body.delivery || 'retiro',
        address: body.address || '',
        mode: body.mode || 'mayorista',
        items: body.items || [],
        total: body.total || 0,
      };

      // Cada pedido se guarda en su propio blob — sin race condition
      let driveError = null;
      try { await deductStock(order.items); order.stockDeducted = true; } catch (e) { driveError = e.message; order.stockDeducted = false; }

      await saveOrder(order);

      return res.status(200).json({ ok: true, id: order.id, driveError });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // PATCH — cancelar pedido y restaurar stock (solo admin)
  if (req.method === 'PATCH') {
    if (req.headers['x-admin-pin'] !== ADMIN_PIN) {
      return res.status(401).json({ error: 'PIN incorrecto' });
    }
    const chunks = [];
    req.on('data', c => chunks.push(c));
    await new Promise(resolve => req.on('end', resolve));
    try {
      const { id } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const orders = await loadOrders();
      const order = orders.find(o => o.id === id);
      if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
      if (order.status === 'cancelado') return res.status(400).json({ error: 'El pedido ya está cancelado' });

      order.status = 'cancelado';
      order.cancelledAt = new Date().toISOString();

      let driveError = null;
      if (order.stockDeducted !== false) {
        try { await restoreStock(order.items); } catch (e) { driveError = e.message; }
      }

      await saveOrder(order);

      return res.status(200).json({ ok: true, driveError });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  res.status(404).end();
};
