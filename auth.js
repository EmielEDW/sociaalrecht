// Client-side access control for the Examen-pack (Sociaal Recht).
// Calls /api/unlock to validate code + track device count (max 3 per code).

(function() {
  const STORAGE_KEY = 'sr-pack-unlocked-v1';
  const STORAGE_CODE_KEY = 'sr-pack-code-v1';
  const STORAGE_TOKEN_KEY = 'sr-pack-token-v2';
  const STORAGE_DEVICE_KEY = 'sr-pack-device-v1';

  const STRIPE_LINK = 'STRIPE_PAYMENT_LINK_HERE';

  // === Crypto helpers ===
  async function sha256Hex(text) {
    const enc = new TextEncoder().encode(text);
    const hash = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // === Device fingerprint ===
  async function computeDeviceId() {
    const cached = sessionStorage.getItem('sr-deviceid');
    if (cached) return cached;

    const parts = [
      navigator.userAgent || '',
      `${screen.width}x${screen.height}x${screen.colorDepth}`,
      (Intl.DateTimeFormat().resolvedOptions().timeZone) || '',
      navigator.language || '',
      String(navigator.hardwareConcurrency || 0),
      navigator.platform || '',
    ];

    try {
      const canvas = document.createElement('canvas');
      canvas.width = 220; canvas.height = 50;
      const ctx = canvas.getContext('2d');
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillStyle = '#f60';
      ctx.fillRect(0, 0, 220, 50);
      ctx.fillStyle = '#069';
      ctx.fillText('Examen-pack SR · 2026', 2, 2);
      ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
      ctx.fillText('Emiel ★', 4, 30);
      parts.push(canvas.toDataURL());
    } catch (e) {}

    const full = await sha256Hex(parts.join('|'));
    const id = full.slice(0, 16);
    sessionStorage.setItem('sr-deviceid', id);
    return id;
  }

  function normalize(code) {
    return (code || '').toUpperCase().replace(/[\s-]/g, '');
  }

  // === State ===
  function isUnlocked() {
    return localStorage.getItem(STORAGE_KEY) === '1';
  }
  function getSavedCode() {
    return localStorage.getItem(STORAGE_CODE_KEY) || '';
  }
  function setUnlocked(code, token, deviceId) {
    localStorage.setItem(STORAGE_KEY, '1');
    localStorage.setItem(STORAGE_CODE_KEY, normalize(code));
    if (token) localStorage.setItem(STORAGE_TOKEN_KEY, token);
    if (deviceId) localStorage.setItem(STORAGE_DEVICE_KEY, deviceId);
    _emit('unlock');
  }
  function lock() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_CODE_KEY);
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    localStorage.removeItem(STORAGE_DEVICE_KEY);
    _emit('lock');
  }

  // === API call ===
  async function unlock(code) {
    const norm = normalize(code);
    if (norm.length < 6) return { ok: false, reason: 'invalid', message: 'Code te kort.' };

    let deviceId;
    try { deviceId = await computeDeviceId(); }
    catch (e) { deviceId = 'unknown-' + Math.random().toString(36).slice(2, 10); }

    try {
      const r = await fetch('/api/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: norm, deviceId }),
      });

      if (r.status === 403) {
        const data = await r.json().catch(() => ({}));
        if (data.error === 'device_limit') {
          return {
            ok: false,
            reason: 'device_limit',
            message: data.message || 'Deze code is al actief op het maximum aantal apparaten.',
            current: data.current,
            maxDevices: data.maxDevices,
          };
        }
        return { ok: false, reason: 'forbidden', message: data.message || data.error || 'Forbidden' };
      }
      if (r.status === 404) {
        return { ok: false, reason: 'invalid', message: 'Deze code is niet geldig. Check de spelling of mail mij.' };
      }
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        return { ok: false, reason: 'error', message: data.error || `Server fout (${r.status})` };
      }
      const data = await r.json();
      setUnlocked(norm, data.token, deviceId);
      return {
        ok: true,
        devices: data.devices,
        maxDevices: data.maxDevices,
        isNewDevice: data.isNewDevice,
        degraded: data.degraded,
      };
    } catch (e) {
      return { ok: false, reason: 'network', message: 'Geen verbinding met de server. Probeer opnieuw of mail mij.' };
    }
  }

  // === Event bus ===
  const _listeners = new Set();
  function onChange(cb) { _listeners.add(cb); return () => _listeners.delete(cb); }
  function _emit(ev) { _listeners.forEach(cb => { try { cb(ev); } catch (e) {} }); }

  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) _emit(e.newValue === '1' ? 'unlock' : 'lock');
  });

  // === Unlock modal ===
  function buildModal() {
    if (document.getElementById('unlockModal')) return;
    const html = `
<div class="unlock-modal" id="unlockModal" hidden role="dialog" aria-labelledby="unlockTitle">
  <div class="unlock-backdrop" data-unlock-close></div>
  <div class="unlock-content">
    <button class="unlock-close" data-unlock-close aria-label="Sluiten">✕</button>
    <div class="unlock-badge">💎 EXAMEN-PACK</div>
    <h2 id="unlockTitle">Ontgrendel de volledige samenvatting</h2>
    <p class="unlock-lead">Deel 1 (Domein) en Deel 2 (Collectieve arbeidsverhoudingen) zijn gratis. Wil je <strong>álle delen</strong>, de volledige flashcards, de hele quiz, de kernpunten én alle examenoefeningen? Dat zit in het pack.</p>
    <ul class="unlock-features">
      <li><strong>Alle delen</strong> — AO-begrippen, schorsing, einde AO, loonwet, arbeidswet, welzijn, sociale zekerheid</li>
      <li><strong>Korte samenvatting / kernpunten</strong> — alle delen</li>
      <li><strong>Alle flashcards</strong> — gratis: Deel 1 + 2 · pack: alles</li>
      <li><strong>Volledige quiz</strong> — alle onderwerpen</li>
      <li><strong>Alle examenoefeningen</strong> met uitwerking</li>
      <li>Toegang voor altijd · betaal éénmalig</li>
    </ul>
    <div class="unlock-actions">
      <a class="unlock-buy" id="unlockBuyBtn" href="${STRIPE_LINK}" target="_blank" rel="noopener">
        <span class="price">€9,99</span>
        <span class="label">Koop nu via Stripe →</span>
      </a>
      <div class="unlock-divider"><span>of</span></div>
      <form class="unlock-form" id="unlockForm">
        <label for="unlockInput">Heb je al een toegangscode?</label>
        <div class="unlock-input-row">
          <input type="text" id="unlockInput" placeholder="bv. 5KP3-X7QM" autocomplete="off" maxlength="20">
          <button type="submit">Ontgrendel</button>
        </div>
        <div class="unlock-feedback" id="unlockFeedback"></div>
      </form>
    </div>
    <p class="unlock-footer">
      Na betaling krijg je <strong>automatisch je code per mail</strong> (check ook je <strong>spam-folder</strong>!).<br>
      Code werkt op max 3 apparaten · Limit bereikt? Mail <a href="mailto:info@emieldewaele.com">info@emieldewaele.com</a>.
    </p>
  </div>
</div>`;
    const div = document.createElement('div');
    div.innerHTML = html;
    document.body.appendChild(div.firstElementChild);

    const modal = document.getElementById('unlockModal');
    modal.addEventListener('click', (e) => {
      if (e.target.matches('[data-unlock-close]')) closeModal();
    });
    document.getElementById('unlockForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = document.getElementById('unlockInput');
      const fb = document.getElementById('unlockFeedback');
      const code = input.value.trim();
      if (!code) return;
      fb.textContent = 'Bezig met activeren…';
      fb.className = 'unlock-feedback';

      const result = await unlock(code);

      if (result.ok) {
        const devInfo = result.maxDevices
          ? ` (${result.devices}/${result.maxDevices} apparaten gebruikt)`
          : '';
        fb.innerHTML = `✓ Code geactiveerd${devInfo}. Pagina wordt herladen…`;
        fb.className = 'unlock-feedback ok';
        setTimeout(() => { closeModal(); window.location.reload(); }, 1100);
      } else if (result.reason === 'device_limit') {
        fb.innerHTML = `⚠ ${result.message}`;
        fb.className = 'unlock-feedback err';
      } else if (result.reason === 'network') {
        fb.innerHTML = `✗ ${result.message}`;
        fb.className = 'unlock-feedback err';
      } else {
        fb.textContent = '✗ ' + (result.message || 'Code niet geldig.');
        fb.className = 'unlock-feedback err';
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modal.hidden) closeModal();
    });
  }

  function openModal() {
    buildModal();
    document.getElementById('unlockModal').hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(() => {
      const i = document.getElementById('unlockInput');
      if (i) i.focus();
    }, 50);
  }
  function closeModal() {
    const m = document.getElementById('unlockModal');
    if (m) m.hidden = true;
    document.body.style.overflow = '';
  }

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-open-unlock]');
    if (t) { e.preventDefault(); openModal(); }
  });

  // === Status badge in header ===
  function updateHeaderBadge() {
    const span = document.querySelector('[data-pack-status]');
    if (!span) return;
    if (isUnlocked()) {
      span.innerHTML = '<span class="pack-badge unlocked">💎 Pack actief</span>';
      span.title = 'Examen-pack ontgrendeld';
    } else {
      span.innerHTML = '<button class="pack-badge locked" data-open-unlock>💎 Ontgrendel pack</button>';
    }
  }

  window.Auth = {
    isUnlocked, unlock, lock, onChange,
    openUnlockModal: openModal, closeUnlockModal: closeModal,
    getSavedCode, computeDeviceId,
  };

  document.addEventListener('DOMContentLoaded', () => {
    updateHeaderBadge();
    onChange(updateHeaderBadge);

    const url = new URL(window.location.href);
    const codeParam = url.searchParams.get('code');
    if (codeParam && !isUnlocked()) {
      openModal();
      setTimeout(() => {
        const input = document.getElementById('unlockInput');
        if (input) input.value = codeParam;
        url.searchParams.delete('code');
        history.replaceState({}, '', url.toString());
        const form = document.getElementById('unlockForm');
        if (form) form.dispatchEvent(new Event('submit'));
      }, 200);
    }
  });
})();
