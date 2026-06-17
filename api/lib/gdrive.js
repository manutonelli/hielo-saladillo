const { GoogleAuth } = require('google-auth-library');

const SCOPES = ['https://www.googleapis.com/auth/drive'];

function getAuth() {
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!keyJson) return null;
  return new GoogleAuth({ credentials: JSON.parse(keyJson), scopes: SCOPES });
}

async function getAccessToken() {
  const auth = getAuth();
  if (!auth) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON no configurado');
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  return token;
}

async function downloadCSV(fileId) {
  const token = await getAccessToken();
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`Drive download ${res.status}`);
  return res.text();
}

async function uploadCSV(fileId, csvContent) {
  const token = await getAccessToken();
  const boundary = `b${Date.now()}`;
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify({ mimeType: 'text/csv' }),
    `--${boundary}`,
    'Content-Type: text/csv; charset=UTF-8',
    '',
    csvContent,
    `--${boundary}--`,
  ].join('\r\n');

  const res = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );
  if (!res.ok) {
    const err = await res.text().catch(() => res.status);
    throw new Error(`Drive upload ${res.status}: ${err}`);
  }
}

function parseCSV(text) {
  const lines = text.replace(/^﻿/, '').trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = lines[0].split(',').map(h => h.trim());
  const rows = lines.slice(1).map(line => {
    const vals = line.split(',');
    const row = {};
    headers.forEach((h, i) => { row[h] = (vals[i] ?? '').trim(); });
    return row;
  });
  return { headers, rows };
}

function serializeCSV(headers, rows) {
  const lines = [
    '﻿' + headers.join(','),
    ...rows.map(r => headers.map(h => r[h] ?? '').join(',')),
  ];
  return lines.join('\r\n');
}

module.exports = { downloadCSV, uploadCSV, parseCSV, serializeCSV };
