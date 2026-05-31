# Sociaal Recht — examensamenvatting

Statische website (HTML/CSS/JS, geen build) met examensamenvatting Sociaal Recht (HoGent, 2025-2026):
uitgebreide samenvatting per deel, kernpunten, flashcards, quiz en uitgewerkte oefeningen.
Gratis: Deel 1 + Deel 2. Premium (€9,99 éénmalig via Stripe): de rest.

## Structuur

- `index.html` — startpagina
- `deel1-domein.html` … `deel7-sociale-zekerheid.html` — de delen (3-7 premium)
- `kernpunten.html` — korte samenvatting (Deel 1+2 gratis)
- `oefeningen.html` — uitgewerkte oefeningen (premium, 3 gratis preview)
- `flashcards.html` + `flashcards.js` + `flashcards.json` — flashcards
- `quiz.html` + `quiz-data.json` — quiz
- `examen-pack.html` — verkooppagina · `admin.html` — device-reset
- `auth.js` — paywall/unlock client · `gate.js` — afscherming deelpagina's
- `api/` — serverless functions (unlock, stripe-webhook, admin-reset)
- `valid-codes.json` — gehashte geldige codes (plaintext staat in `../codes-private.txt`, NIET in de repo)

## Lokaal bekijken

```bash
cd site && python3 -m http.server 8000
# open http://localhost:8000
```

## Deployen

Push deze `site/`-map als repo naar GitHub en koppel aan Vercel (framework: "Other", geen build).
Zet daarna de Stripe-link en env-vars zoals beschreven in `SETUP-STRIPE.md`.

> **Let op (paywall):** de afscherming gebeurt client-side. Dat houdt eerlijke kopers
> netjes uit het premium-deel, maar is technisch te omzeilen door iemand die de
> paginabron bekijkt — net als bij de vorige samenvattingssites. Voor een €9,99
> studiehulp is dat een bewuste, aanvaarde afweging.
