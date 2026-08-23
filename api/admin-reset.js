// Admin endpoint: reset the device list for a specific code.
// Requires ADMIN_SECRET env var.
//
// Endpoint: POST /api/admin-reset
// Body: { secret: "...", code: "XXXXXXXX" }

const { createHash } = require('crypto');
const path = require('path');
const fs = require('fs');

const VALID_CODES_PATH = path.join(__dirname, '..', 'valid-codes.json');
let validCodesData = { salt: '', hashes: [] };
try {
  validCodesData = JSON.parse(fs.readFileSync(VALID_CODES_PATH, 'utf-8'));
} catch (e) {}

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const MASTER_HASHES = String(process.env.MASTER_CODE_HASH || '')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

function sha256(s) { return createHash('sha256').update(s).digest('hex'); }
function normalizeCode(s) { return String(s || '').toUpperCase().replace(/[\s-]/g, ''); }

async function kvDel(key) {
  if (!KV_URL || !KV_TOKEN) return false;
  try {
    const r = await fetch(`${KV_URL}/del/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
    });
    return r.ok;
  } catch (e) { console.error('KV del error:', e); return false; }
}

async function kvGet(key) {
  if (!KV_URL || !KV_TOKEN) return null;
  try {
    const r = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
    });
    if (!r.ok) return null;
    const data = await r.json();
    if (!data.result) return null;
    if (typeof data.result === 'string') {
      try { return JSON.parse(data.result); } catch (e) { return data.result; }
    }
    return data.result;
  } catch (e) { return null; }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!ADMIN_SECRET) return res.status(500).json({ error: 'ADMIN_SECRET not configured on server' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  if (body.secret !== ADMIN_SECRET) return res.status(403).json({ error: 'Unauthorized' });

  const code = normalizeCode(body.code);
  if (!code) return res.status(400).json({ error: 'Missing code' });

  const codeHash = sha256(validCodesData.salt + code);

  if (MASTER_HASHES.includes(codeHash)) {
    return res.status(200).json({
      ok: true, code, devicesBefore: 0,
      message: 'Dit is de mastercode — die heeft geen device-limiet, dus een reset is niet nodig.',
    });
  }

  if (!validCodesData.hashes.includes(codeHash)) {
    return res.status(404).json({ error: 'Code not in valid set' });
  }

  const key = `code:${codeHash}`;
  const before = (await kvGet(key)) || [];
  const ok = await kvDel(key);

  return res.status(200).json({
    ok, code,
    devicesBefore: Array.isArray(before) ? before.length : 0,
    message: ok ? `Devices reset voor code ${code}. De koper kan opnieuw activeren.` : 'KV delete failed.',
  });
};
