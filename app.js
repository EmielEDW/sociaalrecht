// Theme toggle, mobile menu, sidebar scrollspy, reading progress.

(function() {
  // ---- Theme ----
  const THEME_KEY = 'sr-theme';
  const root = document.documentElement;
  const saved = localStorage.getItem(THEME_KEY);
  const initial = saved || 'light';
  root.setAttribute('data-theme', initial);

  function updateThemeButton() {
    const btn = document.querySelector('.theme-toggle');
    if (!btn) return;
    const isDark = root.getAttribute('data-theme') === 'dark';
    btn.innerHTML = isDark ? '☀️ Licht' : '🌙 Donker';
  }

  document.addEventListener('DOMContentLoaded', () => {
    updateThemeButton();

    const themeBtn = document.querySelector('.theme-toggle');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const current = root.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        root.setAttribute('data-theme', next);
        localStorage.setItem(THEME_KEY, next);
        updateThemeButton();
      });
    }

    // Mobile menu
    const menuBtn = document.querySelector('.menu-toggle');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    if (menuBtn && sidebar) {
      menuBtn.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        if (overlay) overlay.classList.toggle('show');
      });
    }
    if (overlay) {
      overlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('show');
      });
    }
    document.querySelectorAll('.sidebar a').forEach(a => {
      a.addEventListener('click', () => {
        if (window.innerWidth <= 920) {
          sidebar.classList.remove('open');
          if (overlay) overlay.classList.remove('show');
        }
      });
    });

    // Scrollspy + reading progress (in-page anchors)
    const tocLinks = document.querySelectorAll('.sidebar a[href^="#"]');
    const sections = Array.from(tocLinks)
      .map(a => document.getElementById(a.getAttribute('href').slice(1)))
      .filter(Boolean);
    const progressBar = document.querySelector('.progress-bar');

    function onScroll() {
      if (progressBar) {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        const pct = max > 0 ? (window.scrollY / max) * 100 : 0;
        progressBar.style.width = pct + '%';
      }
      if (sections.length) {
        let activeId = sections[0]?.id;
        const scrollPos = window.scrollY + 120;
        for (const s of sections) {
          if (s.offsetTop <= scrollPos) activeId = s.id;
        }
        tocLinks.forEach(a => {
          a.classList.toggle('active', a.getAttribute('href') === '#' + activeId);
        });
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  });
})();
