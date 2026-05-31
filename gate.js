// Premium content gating for deel-pages.
// A premium page sets <body data-premium> and wraps the gated part in
// <div class="premium-content">…</div>. Everything before it (incl. an
// optional .free-preview) stays visible to everyone. Free users see a
// paywall card instead of the gated content; unlocking reveals it.

(function() {
  function isUnlocked() { return window.Auth && window.Auth.isUnlocked(); }

  function paywallHtml() {
    return `
      <div class="paywall" id="paywallCard">
        <div class="paywall-icon">💎</div>
        <h3>Dit deel zit in het Examen-pack</h3>
        <p>Deel 1 (Domein) en Deel 2 (Collectieve arbeidsverhoudingen) zijn volledig gratis.
        Dit deel — en alle andere delen, de kernpunten, flashcards, quiz en oefeningen —
        ontgrendel je éénmalig voor <strong>€9,99</strong>.</p>
        <button class="paywall-btn" data-open-unlock type="button">💎 Examen-pack ontgrendelen — €9,99</button>
      </div>`;
  }

  function apply() {
    const gated = document.querySelectorAll('.premium-content');
    if (!gated.length) return;
    const unlocked = isUnlocked();

    gated.forEach(el => { el.style.display = unlocked ? '' : 'none'; });

    let card = document.getElementById('paywallCard');
    if (!unlocked) {
      if (!card) {
        const first = gated[0];
        const div = document.createElement('div');
        div.innerHTML = paywallHtml();
        first.parentNode.insertBefore(div.firstElementChild, first);
      }
    } else if (card) {
      card.remove();
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!document.body.hasAttribute('data-premium')) return;
    apply();
    if (window.Auth && window.Auth.onChange) window.Auth.onChange(apply);
  });
})();
