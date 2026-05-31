# Setup — Stripe Payment Link + code-distributie (Sociaal Recht)

Eénmalige opzet. Prijs: **€9,99**. Codes: max 3 apparaten per code. Plaintext codes staan in
`../codes-private.txt` (200 stuks, NIET in de repo); de gehashte versie in `valid-codes.json`.

## Overzicht van de flow

1. Klant klikt **"Koop nu via Stripe"** → Stripe Checkout → betaalt.
2. Met de webhook + Resend krijgt de klant **automatisch een code per mail**.
   (Zonder die automatisering stuur je zelf een code uit `codes-private.txt`.)
3. Klant plakt de code op de site (of klikt de magic-link `?code=XXXX`) → alles ontgrendeld.

---

## Stap 1 — Stripe Payment Link (€9,99)

1. Stripe Dashboard → **Payment Links** → **+ New**.
2. Product: `Examen-pack Sociaal Recht` · prijs `€9,99` · one-time.
3. After payment → "Show confirmation page" met een bericht dat de code binnen het uur per mail komt.
4. Zet **"Collect customer email"** AAN (anders heb je geen adres om de code te sturen).
5. Maak de link en kopieer de URL (`https://buy.stripe.com/...`).

## Stap 2 — Stripe-link invullen

Vervang de placeholder `STRIPE_PAYMENT_LINK_HERE` (1× in `auth.js`, 2× in `examen-pack.html`):

```bash
cd site
LINK='https://buy.stripe.com/JOUW_LINK'
sed -i '' "s|STRIPE_PAYMENT_LINK_HERE|$LINK|g" auth.js examen-pack.html   # macOS
```

Commit + push → Vercel deployt automatisch.

## Stap 3 — Testen

Gebruik testkaart `4242 4242 4242 4242` (12/30, CVC 123). Plak nadien een code uit
`codes-private.txt` op de site → moet ontgrendelen.

---

## Device-limiet (Vercel KV) — aanbevolen

1. Vercel → project → **Storage** → **Create Database** → **KV (Upstash)** → regio Frankfurt.
   Dit koppelt automatisch `KV_REST_API_URL` en `KV_REST_API_TOKEN`.
2. Settings → Environment Variables → voeg toe (alle environments):
   | Naam | Waarde |
   |---|---|
   | `HMAC_SECRET` | random string (`openssl rand -hex 32`) |
   | `ADMIN_SECRET` | sterk wachtwoord (voor `/admin.html`) |
   | `MAX_DEVICES` | `3` |
   | `TOKEN_TTL_DAYS` | `365` |
3. **Redeploy**. Vanaf nu telt `/api/unlock` de apparaten (max 3). Reset via `/admin.html`.

> Zonder KV werkt unlock nog steeds (degraded mode), maar zonder device-limiet.

---

## Automatische code-levering (Stripe webhook + Resend) — optioneel

1. **Resend** account → API key (`re_...`).
2. Env-vars op Vercel: `RESEND_API_KEY`, `FROM_EMAIL` (bv. `Examen-pack Sociaal Recht <onboarding@resend.dev>`),
   `REPLY_TO_EMAIL` (`info@emieldewaele.com`), `SITE_URL` (`https://sociaalrecht.emieldewaele.com`),
   en straks `STRIPE_WEBHOOK_SECRET`.
3. Seed de codes in KV (vanuit de projectroot, naast `codes-private.txt`):
   ```bash
   export KV_REST_API_URL='https://...upstash.io'
   export KV_REST_API_TOKEN='AY...'
   python3 seed-codes.py
   ```
4. Stripe → Developers → **Webhooks** → + endpoint:
   - URL: `https://sociaalrecht.emieldewaele.com/api/stripe-webhook`
   - Event: enkel `checkout.session.completed`
   - Kopieer de **Signing secret** (`whsec_...`) → env-var `STRIPE_WEBHOOK_SECRET`.
5. **Redeploy** en test via "Send test webhook" (verwacht 200 OK).

> Heb je meerdere sites op één Stripe-account? Zet `SR_PAYMENT_LINK_IDS` = de `plink_...`-id('s)
> van deze site, zodat de webhook alleen Sociaal Recht-betalingen verwerkt.

## Code laten vervallen (lek)

Verwijder de hash van die code uit `valid-codes.json` (commit + push). Welke hash bij welke code hoort:

```bash
python3 -c "import hashlib;c=input('code? ').strip().upper().replace('-','');print(hashlib.sha256(('sr-examen-pack-2026-v1'+c).encode()).hexdigest())"
```
