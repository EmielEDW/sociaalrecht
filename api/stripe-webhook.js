// Stripe webhook handler: on successful checkout, pop a fresh code from the
// Upstash 'unused-codes' list and email it to the buyer via Resend.
//
// Endpoint: POST /api/stripe-webhook (configure in Stripe dashboard)
// Listens for: checkout.session.completed
//
// Required env vars:
//   STRIPE_WEBHOOK_SECRET, RESEND_API_KEY, FROM_EMAIL, SITE_URL,
//   KV_REST_API_URL, KV_REST_API_TOKEN
//
// IMPORTANT: this endpoint disables Vercel's body parser because Stripe needs
// the raw body to verify the signature.

const { createHmac } = require('crypto');

module.exports.config = { api: { bodyParser: false } };

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'Examen-pack Sociaal Recht <onboarding@resend.dev>';
const REPLY_TO = process.env.REPLY_TO_EMAIL || 'info@emieldewaele.com';
const SITE_URL = process.env.SITE_URL || 'https://sociaalrecht.emieldewaele.com';
const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const POOL_KEY = process.env.UNUSED_CODES_KEY || 'unused-codes';

// Optional: comma-separated Stripe payment_link IDs (plink_xxx) for this site.
// Stripe sends every event to every registered endpoint; filter so this site
// only processes its own payments. Empty → no filter.
const SR_PAYMENT_LINK_IDS = (process.env.SR_PAYMENT_LINK_IDS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function verifyStripeSignature(rawBody, header, secret, toleranceSec = 300) {
  if (!header) return false;
  const parts = header.split(',').reduce((acc, p) => {
    const [k, v] = p.split('=');
    if (k && v) acc[k.trim()] = v.trim();
    return acc;
  }, {});
  const t = parts.t, v1 = parts.v1;
  if (!t || !v1) return false;
  const age = Math.abs(Date.now() / 1000 - parseInt(t, 10));
  if (age > toleranceSec) return false;
  const signed = `${t}.${rawBody.toString('utf8')}`;
  const expected = createHmac('sha256', secret).update(signed).digest('hex');
  if (expected.length !== v1.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) mismatch |= expected.charCodeAt(i) ^ v1.charCodeAt(i);
  return mismatch === 0;
}

async function kvCmd(args) {
  if (!KV_URL || !KV_TOKEN) return null;
  const p = args.map(encodeURIComponent).join('/');
  const r = await fetch(`${KV_URL}/${p}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
  if (!r.ok) { console.error('KV cmd failed:', args, r.status); return null; }
  const data = await r.json();
  return data.result === undefined ? null : data.result;
}

async function sendEmail({ to, subject, html, text, replyTo }) {
  if (!RESEND_API_KEY) { console.error('RESEND_API_KEY not set — email NOT sent'); return { ok: false, error: 'no-api-key' }; }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html, text, reply_to: replyTo || REPLY_TO }),
    });
    const data = await r.json();
    if (!r.ok) { console.error('Resend error:', r.status, data); return { ok: false, error: data }; }
    return { ok: true, id: data.id };
  } catch (e) { console.error('Email fetch error:', e); return { ok: false, error: String(e) }; }
}

function buildEmail(code, customerName) {
  const greeting = customerName ? `Hey ${customerName},` : 'Hey,';
  const unlockUrl = `${SITE_URL}/?code=${encodeURIComponent(code)}`;
  const html = `<!DOCTYPE html>
<html><body style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; background: #fbfbf9; padding: 20px; color: #1a1a1a;">
  <div style="max-width: 540px; margin: 0 auto; background: white; border-radius: 12px; padding: 32px; box-shadow: 0 4px 12px rgba(0,0,0,0.06);">
    <h1 style="font-family: Lora, Georgia, serif; color: #1d6a5f; font-size: 24px; margin: 0 0 16px;">Bedankt voor je aankoop! 🎉</h1>
    <p style="font-size: 16px; line-height: 1.6;">${greeting}</p>
    <p style="font-size: 16px; line-height: 1.6;">Hier is je persoonlijke toegangscode voor het <strong>Examen-pack Sociaal Recht</strong>:</p>
    <div style="background: linear-gradient(135deg, #e3f0ed, #fbfbf9); border: 2px solid #1d6a5f; padding: 20px; border-radius: 10px; text-align: center; margin: 24px 0;">
      <div style="font-family: 'JetBrains Mono', Menlo, monospace; font-size: 28px; font-weight: 700; color: #1d6a5f; letter-spacing: 4px;">${code}</div>
    </div>
    <p style="font-size: 16px; line-height: 1.6;">Of klik gewoon op deze link om alles automatisch te ontgrendelen:</p>
    <p style="text-align: center; margin: 24px 0;">
      <a href="${unlockUrl}" style="display: inline-block; background: #1d6a5f; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">Open en activeer mijn pack →</a>
    </p>
    <p style="font-size: 14px; color: #666; line-height: 1.5;">Je code werkt op max 3 apparaten (laptop + telefoon + tablet bv.). Limit bereikt? Antwoord op deze mail.</p>
    <p style="font-size: 16px; line-height: 1.6; margin-top: 24px;">Succes met studeren! 📚<br>— Emiel</p>
    <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
    <p style="font-size: 12px; color: #999; line-height: 1.4;">Vragen of problemen? Antwoord gewoon op deze mail. Site: <a href="${SITE_URL}" style="color: #1d6a5f;">${SITE_URL.replace('https://', '')}</a></p>
  </div>
</body></html>`;
  const text = `${greeting}

Bedankt voor je aankoop! Hier is je code voor het Examen-pack Sociaal Recht:

    ${code}

Of klik direct: ${unlockUrl}

Je code werkt op max 3 apparaten. Limit bereikt? Antwoord op deze mail.

Succes met studeren!
— Emiel`;
  return { html, text };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let rawBody;
  try { rawBody = await readRawBody(req); }
  catch (e) { return res.status(400).json({ error: 'Could not read body' }); }

  if (!STRIPE_WEBHOOK_SECRET) { console.error('STRIPE_WEBHOOK_SECRET not configured!'); return res.status(500).json({ error: 'Webhook secret missing' }); }
  const sigHeader = req.headers['stripe-signature'];
  if (!verifyStripeSignature(rawBody, sigHeader, STRIPE_WEBHOOK_SECRET)) {
    console.error('Invalid Stripe signature');
    return res.status(400).json({ error: 'Invalid signature' });
  }

  let event;
  try { event = JSON.parse(rawBody.toString('utf8')); }
  catch (e) { return res.status(400).json({ error: 'Invalid JSON' }); }

  if (event.type !== 'checkout.session.completed') {
    return res.status(200).json({ ok: true, ignored: event.type });
  }

  const session = event.data && event.data.object;
  if (!session) return res.status(400).json({ error: 'Missing session object' });

  if (SR_PAYMENT_LINK_IDS.length > 0) {
    const linkId = session.payment_link;
    if (!linkId || !SR_PAYMENT_LINK_IDS.includes(linkId)) {
      console.log(`Ignoring session (payment_link=${linkId || 'none'}, not in SR allowlist)`);
      return res.status(200).json({ ok: true, ignored: 'not-sr' });
    }
  }

  const customerEmail = session.customer_email || (session.customer_details && session.customer_details.email);
  const customerName = session.customer_details && session.customer_details.name;

  if (!customerEmail) {
    console.error('No customer email in session', session.id);
    await kvCmd(['SET', `failed-no-email:${session.id}`, JSON.stringify({ ts: Date.now(), session: session.id })]);
    return res.status(200).json({ ok: true, warning: 'no-email' });
  }

  const dedupKey = `processed:${session.id}`;
  const already = await kvCmd(['GET', dedupKey]);
  if (already) return res.status(200).json({ ok: true, idempotent: true });

  const code = await kvCmd(['LPOP', POOL_KEY]);
  if (!code) {
    console.error('Code pool is EMPTY! Session:', session.id, 'Email:', customerEmail);
    await sendEmail({
      to: REPLY_TO,
      subject: '⚠ Sociaal Recht code pool LEEG',
      html: `<p>Een betaling kwam binnen maar er zijn geen codes meer in de pool.</p>
             <p>Customer: <strong>${customerEmail}</strong> (${customerName || 'geen naam'})</p>
             <p>Session: ${session.id}</p>`,
      text: `Code pool LEEG! Customer ${customerEmail} betaalde, geen code beschikbaar. Session ${session.id}.`,
    });
    await kvCmd(['SET', `failed-no-code:${session.id}`, JSON.stringify({ ts: Date.now(), email: customerEmail, name: customerName })]);
    return res.status(200).json({ ok: false, error: 'no-codes-left' });
  }

  const { html, text } = buildEmail(code, customerName);
  const emailResult = await sendEmail({ to: customerEmail, subject: '🎉 Je Examen-pack toegangscode (Sociaal Recht)', html, text });

  if (!emailResult.ok) {
    await kvCmd(['LPUSH', POOL_KEY, code]);
    await sendEmail({
      to: REPLY_TO,
      subject: '⚠ Sociaal Recht email failed',
      html: `<p>Stripe-betaling ontvangen maar email kon niet verzonden worden.</p>
             <p>Customer: <strong>${customerEmail}</strong></p>
             <p>Code (manueel sturen): <strong>${code}</strong></p>
             <p>Session: ${session.id}</p>`,
      text: `Email failed for ${customerEmail}. Code to send manually: ${code}. Session ${session.id}.`,
    });
    return res.status(200).json({ ok: false, error: 'email-failed' });
  }

  await kvCmd(['SET', dedupKey, JSON.stringify({ code, email: customerEmail, ts: Date.now() }), 'EX', '7776000']);
  await kvCmd(['SET', `sold:${code}`, JSON.stringify({ email: customerEmail, name: customerName, session: session.id, ts: Date.now() })]);

  console.log(`✓ Sent code ${code} to ${customerEmail}`);
  return res.status(200).json({ ok: true, code: code.slice(0, 3) + '***' });
};
