// Flashcards: load JSON, filter, shuffle, flip, track progress (localStorage).
// Free users get full access to FREE_CATEGORIES; others show a paywall.

(function() {
  const STORAGE_KEY = 'sr-flashcards-v1';
  const FILTER_KEY = 'sr-flashcards-filter';
  const STUDY_KEY = 'sr-flashcards-study';
  const FREE_CATEGORIES = ['deel1', 'deel2'];

  function unlocked() { return window.Auth && window.Auth.isUnlocked(); }
  function isCategoryFree(catId) {
    if (unlocked()) return true;
    if (catId === 'all') return true;
    return FREE_CATEGORIES.includes(catId);
  }

  let data = null;
  let deck = [];
  let pos = 0;
  let activeCategory = 'all';
  let progress = {};
  let studyMode = false;

  function loadProgress() {
    try { progress = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch (e) { progress = {}; }
  }
  function saveProgress() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); } catch (e) {}
  }
  function loadFilter() {
    activeCategory = localStorage.getItem(FILTER_KEY) || 'all';
    studyMode = localStorage.getItem(STUDY_KEY) === '1';
    if (!isCategoryFree(activeCategory)) activeCategory = 'all';
  }
  function saveFilter() {
    localStorage.setItem(FILTER_KEY, activeCategory);
    localStorage.setItem(STUDY_KEY, studyMode ? '1' : '0');
  }

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function mdToHtml(text) {
    let s = escapeHtml(text);
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
    const lines = s.split(/\n+/);
    const out = [];
    let listType = null;
    for (const line of lines) {
      const olMatch = /^\s*\d+\.\s+(.*)/.exec(line);
      const ulMatch = /^\s*[-•]\s+(.*)/.exec(line);
      if (olMatch) {
        if (listType !== 'ol') { if (listType) out.push(`</${listType}>`); out.push('<ol>'); listType = 'ol'; }
        out.push(`<li>${olMatch[1]}</li>`);
      } else if (ulMatch) {
        if (listType !== 'ul') { if (listType) out.push(`</${listType}>`); out.push('<ul>'); listType = 'ul'; }
        out.push(`<li>${ulMatch[1]}</li>`);
      } else {
        if (listType) { out.push(`</${listType}>`); listType = null; }
        if (line.trim()) out.push(`<p>${line}</p>`);
      }
    }
    if (listType) out.push(`</${listType}>`);
    return out.join('');
  }

  function rebuildDeck() {
    const allIndices = data.cards.map((_, i) => i);
    let filtered;
    if (activeCategory === 'all') {
      if (!unlocked()) filtered = allIndices.filter(i => FREE_CATEGORIES.includes(data.cards[i].cat));
      else filtered = allIndices;
    } else {
      if (!isCategoryFree(activeCategory)) { deck = []; pos = 0; return; }
      filtered = allIndices.filter(i => data.cards[i].cat === activeCategory);
    }
    if (studyMode) filtered = filtered.filter(i => progress[i] !== 'known');
    deck = filtered;
    pos = 0;
  }

  function shuffleDeck() {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    pos = 0;
  }

  const card = () => document.getElementById('fcCard');
  const $ = (id) => document.getElementById(id);

  function updateStats() {
    const total = data.cards.length;
    const freeTotal = unlocked() ? total : data.cards.filter(c => FREE_CATEGORIES.includes(c.cat)).length;
    let known = 0, unknown = 0, unseen = 0;
    for (let i = 0; i < total; i++) {
      const s = progress[i];
      if (s === 'known') known++;
      else if (s === 'unknown') unknown++;
      else unseen++;
    }
    $('fcStatKnown').textContent = known;
    $('fcStatUnknown').textContent = unknown;
    $('fcStatUnseen').textContent = unseen;
    const denom = unlocked() ? total : freeTotal;
    $('fcStatProgress').textContent = denom > 0 ? Math.round(known / denom * 100) + '%' : '0%';
    $('fcTotalCount').textContent = unlocked() ? `${total} kaarten` : `${freeTotal} gratis (van ${total})`;
  }

  function renderFilters() {
    const total = data.cards.length;
    const counts = {};
    for (const cat of data.categories) counts[cat.id] = 0;
    for (const c of data.cards) counts[c.cat] = (counts[c.cat] || 0) + 1;
    counts.all = unlocked() ? total : data.cards.filter(c => FREE_CATEGORIES.includes(c.cat)).length;

    const wrap = $('fcFilterChips');
    wrap.innerHTML = '';
    const allOption = unlocked() ? { id: 'all', label: 'Alle delen' } : { id: 'all', label: 'Alle gratis delen' };
    const items = [allOption, ...data.categories];
    for (const cat of items) {
      const isFree = isCategoryFree(cat.id);
      const btn = document.createElement('button');
      btn.className = 'fc-chip' + (activeCategory === cat.id ? ' active' : '') + (isFree ? '' : ' locked');
      btn.dataset.cat = cat.id;
      const lockIcon = isFree ? '' : '<span style="margin-right:.3em">🔒</span>';
      btn.innerHTML = `${lockIcon}${cat.label} <span class="fc-chip-count">${counts[cat.id] || 0}</span>`;
      btn.addEventListener('click', () => {
        if (!isFree) { if (window.Auth) window.Auth.openUnlockModal(); return; }
        activeCategory = cat.id;
        saveFilter(); rebuildDeck(); renderFilters(); renderCard();
      });
      wrap.appendChild(btn);
    }
  }

  function showLockedCategoryCard() {
    const deckEl = $('fcDeck');
    deckEl.style.display = '';
    $('fcEmpty').hidden = true;
    const cat = data.categories.find(c => c.id === activeCategory);
    const label = cat ? cat.label : activeCategory;
    const lockedHtml = `
      <div style="text-align:center; width:100%;">
        <div style="font-size:3rem; margin-bottom:0.6rem;">💎</div>
        <div style="font-family:'Lora',serif; font-size:1.4rem; margin-bottom:0.6rem;">${label}</div>
        <div style="font-size:0.95rem; color:var(--text-soft); margin-bottom:1.4rem; line-height:1.5;">
          Deze flashcards zitten in het Examen-pack.<br>
          De kaarten van <strong>Deel 1</strong> en <strong>Deel 2</strong> kun je gratis oefenen.
        </div>
        <button class="paywall-btn" data-open-unlock type="button">💎 Examen-pack ontgrendelen — €9,99</button>
      </div>`;
    $('fcCardTag').textContent = 'Examen-pack vereist';
    $('fcCardTagBack').textContent = 'Examen-pack vereist';
    $('fcCardQ').innerHTML = lockedHtml;
    $('fcCardA').innerHTML = lockedHtml;
    $('fcCounter').textContent = '— · vergrendeld';
    card().classList.remove('flipped');
    $('fcPrevBtn').disabled = true;
    $('fcNextBtn').disabled = true;
    $('fcKnownBtn').disabled = true;
    $('fcUnknownBtn').disabled = true;
  }

  function renderCard() {
    const empty = $('fcEmpty');
    const deckEl = $('fcDeck');
    if (!isCategoryFree(activeCategory)) { showLockedCategoryCard(); return; }
    if (deck.length === 0) { deckEl.style.display = 'none'; empty.hidden = false; return; }
    deckEl.style.display = '';
    empty.hidden = true;
    if (pos < 0) pos = 0;
    if (pos >= deck.length) pos = deck.length - 1;
    const idx = deck[pos];
    const c = data.cards[idx];
    const cat = data.categories.find(x => x.id === c.cat);
    const tag = cat ? cat.label : c.cat;
    $('fcCardTag').textContent = tag;
    $('fcCardTagBack').textContent = tag;
    $('fcCardQ').textContent = c.q;
    $('fcCardA').innerHTML = mdToHtml(c.a);
    $('fcCounter').textContent = `${pos + 1} / ${deck.length}`;
    card().classList.remove('flipped');
    $('fcPrevBtn').disabled = pos === 0;
    $('fcNextBtn').disabled = pos === deck.length - 1;
    $('fcKnownBtn').disabled = false;
    $('fcUnknownBtn').disabled = false;
    const state = progress[idx];
    $('fcKnownBtn').classList.toggle('active', state === 'known');
    $('fcUnknownBtn').classList.toggle('active', state === 'unknown');
  }

  function flipCard() {
    if (deck.length === 0) return;
    if (!isCategoryFree(activeCategory)) return;
    card().classList.toggle('flipped');
  }
  function next() { if (isCategoryFree(activeCategory) && pos < deck.length - 1) { pos++; renderCard(); } }
  function prev() { if (isCategoryFree(activeCategory) && pos > 0) { pos--; renderCard(); } }
  function rate(state) {
    if (!isCategoryFree(activeCategory) || deck.length === 0) return;
    const idx = deck[pos];
    progress[idx] = state;
    saveProgress();
    updateStats();
    if (studyMode && state === 'known') { rebuildDeck(); renderFilters(); renderCard(); }
    else if (pos < deck.length - 1) setTimeout(() => { pos++; renderCard(); }, 180);
    else renderCard();
  }
  function resetProgress() {
    if (!confirm('Alle voortgang wissen? Dit kan niet ongedaan gemaakt worden.')) return;
    progress = {};
    saveProgress(); rebuildDeck(); renderFilters(); renderCard(); updateStats();
  }

  async function init() {
    loadProgress();
    loadFilter();
    try {
      const res = await fetch('flashcards.json');
      data = await res.json();
    } catch (e) {
      $('fcCardQ').textContent = 'Kon flashcards niet laden. Open de site via een webserver.';
      return;
    }
    rebuildDeck(); renderFilters(); renderCard(); updateStats();

    card().addEventListener('click', flipCard);
    $('fcNextBtn').addEventListener('click', next);
    $('fcPrevBtn').addEventListener('click', prev);
    $('fcKnownBtn').addEventListener('click', () => rate('known'));
    $('fcUnknownBtn').addEventListener('click', () => rate('unknown'));
    $('fcShuffleBtn').addEventListener('click', () => { if (isCategoryFree(activeCategory)) { shuffleDeck(); renderCard(); } });
    $('fcResetBtn').addEventListener('click', resetProgress);
    const sm = $('fcStudyMode');
    sm.checked = studyMode;
    sm.addEventListener('change', () => {
      studyMode = sm.checked;
      saveFilter(); rebuildDeck(); renderFilters(); renderCard();
    });

    if (window.Auth && window.Auth.onChange) {
      window.Auth.onChange(() => { rebuildDeck(); renderFilters(); renderCard(); updateStats(); });
    }

    document.addEventListener('keydown', (e) => {
      if (e.target.matches('input, textarea')) return;
      const unlockModal = document.getElementById('unlockModal');
      if (unlockModal && !unlockModal.hidden) return;
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flipCard(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
      else if (e.key === '1') { rate('unknown'); }
      else if (e.key === '2') { rate('known'); }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
