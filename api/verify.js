// Lightweight check: is this access code still valid (not revoked)?
// Used by the client on each load to re-validate an already-unlocked session,
// so a revoked code loses access on the next page view.
//
// Endpoint: POST /api/verify   Body: { code }
// Returns: 200 { valid: true } | 200 { valid: false }

const { createHash } = require('crypto');
const path = require('path');
const fs = require('fs');

const VALID_CODES_PATH = path.join(__dirname, '..', 'valid-codes.json');
let validCodesData = { salt: '', hashes: [] };
try {
  validCodesData = JSON.parse(fs.readFileSync(VALID_CODES_PATH, 'utf-8'));
} catch (e) { console.error('verify: failed to load valid-codes.json', e); }

function sha256(s) { return createHash('sha256').update(s).digest('hex'); }
function normalizeCode(s) { return String(s || '').toUpperCase().replace(/[\s-]/g, ''); }

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  const code = normalizeCode(body.code);
  if (!code) return res.status(200).json({ valid: false });

  const codeHash = sha256(validCodesData.salt + code);
  return res.status(200).json({ valid: validCodesData.hashes.includes(codeHash) });
};
