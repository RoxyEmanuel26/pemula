/**
 * LustHub V2.0 — Deferred Zero-Dependency Interactive Client Engine
 * Handles: Theme persistence, Language switcher, Command Search + Autocomplete,
 * Zero-Login Favorites & Watch History (Navboost retention), Quick Filters,
 * Multi-Frame Hover Preview, Cinema Theater Mode & Facade Playback.
 */
(function () {
  'use strict';

  const FAVORITES_KEY = 'lh_v2_favorites';
  const HISTORY_KEY = 'lh_v2_history';
  const THEME_KEY = 'lusthub_theme';

  const LOCALE_MATCH = window.location.pathname.match(/^\/(de|fr|es|it|nl|pt|pl)(\/|$)/i);
  const LOCALE_PREFIX = LOCALE_MATCH ? '/' + LOCALE_MATCH[1].toLowerCase() : '';

  const QUICK_CATEGORIES = [
    'milf', 'blonde', 'brunette', 'latina', 'ebony', 'amateur', 'pov', 'onlyfans',
    'european', 'british', 'german', 'french', 'spanish', 'italian', 'czech', 'russian',
    'stepmom', 'stepsis', 'massage', 'casting', 'squirt', 'deepthroat', 'bbw', 'college',
    'big-tits', 'big-ass', 'pawg', 'anal', 'double-penetration', 'blowjob', 'handjob',
    'cumshot', 'hardcore', 'lesbian', 'threesome', 'group-sex', 'creampie', 'interracial',
    'hotwife', 'cuckold', 'pornstar', 'solo', 'lingerie', 'redhead', '4k-uhd', 'cosplay',
    'public', 'japanese', 'asian', 'indian', 'korean', 'homemade', 'mature', 'outdoor', 'viral',
  ];

  function slugify(str) {
    return String(str || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatLabel(slug) {
    const upper = new Set(['milf', 'pov', 'bbw', 'pawg', '4k', 'uhd', 'jav', 'hd']);
    if (slug === 'onlyfans') return 'OnlyFans';
    if (slug === '4k-uhd') return '4K UHD';
    return slug.split('-').map(w => upper.has(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  // ─── 1. THEME PERSISTENCE ───
  function getSavedTheme() {
    try {
      const ls = localStorage.getItem(THEME_KEY);
      if (ls === 'light' || ls === 'dark') return ls;
    } catch {}
    const m = document.cookie.match(/(?:^|; )lusthub_theme=([^;]+)/);
    return m && m[1] === 'light' ? 'light' : 'dark';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch {}
    document.cookie = `lusthub_theme=${theme};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
    document.querySelectorAll('[data-theme-toggle]').forEach(btn => {
      btn.setAttribute('aria-pressed', String(theme === 'light'));
      const moon = btn.querySelector('[data-icon-dark]');
      const sun = btn.querySelector('[data-icon-light]');
      if (moon && sun) {
        moon.style.display = theme === 'dark' ? 'inline-flex' : 'none';
        sun.style.display = theme === 'light' ? 'inline-flex' : 'none';
      }
    });
  }

  // ─── 2. ZERO-LOGIN RETENTION STORE (FAVORITES + HISTORY) ───
  function readList(key) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }

  function writeList(key, list) {
    try { localStorage.setItem(key, JSON.stringify(list)); } catch {}
  }

  const Store = {
    getFavorites() { return readList(FAVORITES_KEY); },
    getHistory() { return readList(HISTORY_KEY); },
    isSaved(id) { return this.getFavorites().some(item => item.id === id); },
    toggleFavorite(item) {
      if (!item || !item.id) return false;
      const list = this.getFavorites();
      const idx = list.findIndex(x => x.id === item.id);
      let saved;
      if (idx >= 0) {
        list.splice(idx, 1);
        saved = false;
      } else {
        list.unshift({
          id: item.id,
          title: item.title || 'Untitled',
          href: item.href || `/v/${item.id}`,
          thumb: item.thumb || '',
          duration: item.duration || '',
          savedAt: Date.now(),
        });
        saved = true;
      }
      writeList(FAVORITES_KEY, list.slice(0, 120));
      syncSavedUI();
      return saved;
    },
    recordHistory(item) {
      if (!item || !item.id) return;
      const list = this.getHistory().filter(x => x.id !== item.id);
      list.unshift({
        id: item.id,
        title: item.title || 'Untitled',
        href: item.href || `/v/${item.id}`,
        thumb: item.thumb || '',
        duration: item.duration || '',
        watchedAt: Date.now(),
      });
      writeList(HISTORY_KEY, list.slice(0, 80));
    },
  };
  window.LustHubStore = Store;

  function syncSavedUI() {
    const favs = Store.getFavorites();
    const favIds = new Set(favs.map(x => x.id));
    document.querySelectorAll('[data-saved-count]').forEach(el => {
      el.textContent = String(favs.length);
      el.classList.toggle('has-items', favs.length > 0);
    });
    document.querySelectorAll('[data-save-id]').forEach(btn => {
      const id = btn.getAttribute('data-save-id');
      const active = favIds.has(id);
      btn.classList.toggle('is-saved', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  }

  // ─── 3. LANGUAGE DROPDOWN ───
  function initLangDropdown() {
    const btn = document.getElementById('lhLangBtn');
    const menu = document.getElementById('lhLangMenu');
    if (!btn || !menu) return;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = menu.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', () => {
      if (menu.classList.contains('is-open')) {
        menu.classList.remove('is-open');
        btn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // ─── 4. COMMAND SEARCH + LIVE AUTOCOMPLETE ───
  function initSearch() {
    const form = document.getElementById('lhSearchForm');
    const input = document.getElementById('lhSearchInput');
    const dropdown = document.getElementById('lhSearchDropdown');
    if (!form || !input || !dropdown) return;

    let suggestTimer = null;

    function renderSuggestions(query, remoteData) {
      const q = query.trim().toLowerCase();
      if (!q) {
        dropdown.classList.remove('is-open');
        dropdown.innerHTML = '';
        return;
      }
      const remoteHubs = Array.isArray(remoteData?.hubs) ? remoteData.hubs : [];
      const remoteItems = Array.isArray(remoteData?.items) ? remoteData.items : [];

      let html = '';
      if (remoteHubs.length > 0) {
        html += '<div class="lh-suggest-group-label">Categories &amp; Niches</div>';
        html += remoteHubs.slice(0, 6).map(h =>
          `<a class="lh-suggest-item" href="${escapeHtml(h.href)}"><span>${escapeHtml(h.title)}</span><span class="lh-suggest-tag">${escapeHtml(h.badge || 'HUB')}</span></a>`
        ).join('');
      } else {
        const catMatches = QUICK_CATEGORIES
          .filter(s => s.includes(q) || s.replace(/-/g, ' ').includes(q))
          .slice(0, 5);
        if (catMatches.length > 0) {
          html += '<div class="lh-suggest-group-label">Categories</div>';
          html += catMatches.map(s =>
            `<a class="lh-suggest-item" href="${LOCALE_PREFIX}/c/${encodeURIComponent(s)}"><span>${escapeHtml(formatLabel(s))}</span><span class="lh-suggest-tag">HUB</span></a>`
          ).join('');
        }
      }
      if (remoteItems.length > 0) {
        html += '<div class="lh-suggest-group-label">Videos</div>';
        html += remoteItems.slice(0, 6).map(v =>
          `<a class="lh-suggest-item" href="${escapeHtml(v.href)}"><span>${escapeHtml(v.title)}</span><span class="lh-suggest-tag">${escapeHtml(v.badge || 'HD')}</span></a>`
        ).join('');
      }
      const fallbackSlug = slugify(q);
      if (fallbackSlug) {
        html += `<a class="lh-suggest-item" href="${LOCALE_PREFIX}/c/${encodeURIComponent(fallbackSlug)}"><span>Search &ldquo;${escapeHtml(query.trim())}&rdquo;</span><span class="lh-suggest-tag">GO</span></a>`;
      }
      dropdown.innerHTML = html;
      dropdown.classList.add('is-open');
    }

    input.addEventListener('input', () => {
      const val = input.value;
      renderSuggestions(val, null);
      clearTimeout(suggestTimer);
      if (val.trim().length >= 2) {
        suggestTimer = setTimeout(() => {
          fetch(`/api/suggest?q=${encodeURIComponent(val.trim())}`)
            .then(r => (r.ok ? r.json() : null))
            .then(data => {
              if (data && input.value === val) {
                renderSuggestions(val, data);
              }
            })
            .catch(() => {});
        }, 160);
      }
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const s = slugify(input.value);
      if (s) window.location.href = `${LOCALE_PREFIX}/c/${encodeURIComponent(s)}`;
    });

    document.addEventListener('click', (e) => {
      if (!form.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.remove('is-open');
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        input.focus();
      } else if (e.key === 'Escape') {
        dropdown.classList.remove('is-open');
        input.blur();
      }
    });
  }

  // ─── 5. HOME QUICK-FILTER CHIPS & ZERO-CLS LIVE LOAD MORE ───
  function renderCardHtml(v) {
    const title = escapeHtml(v.title || 'Untitled');
    const href = v.href || `/v/${encodeURIComponent(v.id)}-${slugify(v.title) || v.id}`;
    const thumb = escapeHtml(v.thumb || '/assets/icons/favicon-32x32.png');
    const dur = escapeHtml(v.duration || '');
    const views = escapeHtml(v.views || '');
    const date = escapeHtml(v.date || '');
    const saved = Store.isSaved(v.id);
    const relAttr = v.nofollow ? ' rel="nofollow"' : '';
    return `<article class="lh-card" data-video-id="${escapeHtml(v.id)}" data-title="${title}" data-href="${escapeHtml(href)}" data-thumb="${thumb}" data-duration="${dur}">
      <div class="lh-thumb-wrap">
        <a href="${escapeHtml(href)}"${relAttr} aria-label="${title}">
          <img src="${thumb}" alt="${title}" loading="lazy" decoding="async" width="320" height="180">
        </a>
        <div class="lh-thumb-badges-top"><span class="lh-badge-hd">HD</span></div>
        ${dur ? `<span class="lh-badge-dur">${dur}</span>` : ''}
        <button type="button" class="lh-save-btn${saved ? ' is-saved' : ''}" data-save-id="${escapeHtml(v.id)}" aria-label="Save video" aria-pressed="${saved}">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="${saved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
        </button>
      </div>
      <div class="lh-card-body">
        <a href="${escapeHtml(href)}"${relAttr} class="lh-card-title">${title}</a>
        <div class="lh-card-meta">
          ${views ? `<span class="lh-meta-item">${views} views</span>` : ''}
          ${date ? `<span class="lh-meta-item">${date}</span>` : ''}
        </div>
      </div>
    </article>`;
  }

  function formatCompactViews(n) {
    const num = parseInt(String(n || '0').replace(/\D/g, ''), 10) || 0;
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 1_000) return (num / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
    return num > 0 ? String(num) : '';
  }

  function initHomeFilters() {
    const grid = document.getElementById('lhHomeGrid');
    const filterBar = document.getElementById('lhHomeFilters');
    const loadMoreBtn = document.getElementById('lhLoadMoreBtn');
    if (!grid) return;

    const initialSsrHtml = grid.innerHTML;
    let activeQuery = 'all';
    let activeOrder = 'top-weekly';
    let currentPage = 1;

    async function fetchLiveVideos(query, order, page, append) {
      if (!append) {
        grid.innerHTML = Array.from({ length: 12 }, () => '<div class="lh-skeleton-card"></div>').join('');
      }
      try {
        const url = `https://www.eporner.com/api/v2/video/search/?query=${encodeURIComponent(query)}&per_page=24&page=${page}&order=${encodeURIComponent(order)}&thumbsize=big&gay=0&lq=1&format=json`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(res.status);
        const data = await res.json();
        const items = (data.videos || []).map(v => ({
          id: v.id,
          title: v.title || 'Untitled',
          href: `/v/${encodeURIComponent(v.id)}-${slugify(v.title) || v.id}`,
          thumb: v.default_thumb?.src || v.thumbs?.[0]?.src || '',
          duration: v.length_min || '',
          views: formatCompactViews(v.views),
          date: (v.added || '').slice(0, 10),
          nofollow: true,
        }));
        const html = items.map(renderCardHtml).join('');
        if (append) grid.insertAdjacentHTML('beforeend', html);
        else grid.innerHTML = html || '<div class="lh-empty-box">No videos found for this filter.</div>';
        syncSavedUI();
      } catch {
        if (!append) grid.innerHTML = initialSsrHtml;
      }
    }

    if (filterBar) {
      filterBar.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-filter-query]');
        if (!btn) return;
        filterBar.querySelectorAll('.lh-filter-btn').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        const q = btn.getAttribute('data-filter-query') || 'all';
        const ord = btn.getAttribute('data-filter-order') || 'top-weekly';
        activeQuery = q;
        activeOrder = ord;
        currentPage = 1;
        if (btn.getAttribute('data-ssr-default') === '1') {
          grid.innerHTML = initialSsrHtml;
          syncSavedUI();
          return;
        }
        fetchLiveVideos(activeQuery, activeOrder, 1, false);
      });
    }

    if (loadMoreBtn) {
      loadMoreBtn.addEventListener('click', () => {
        currentPage += 1;
        loadMoreBtn.disabled = true;
        const origText = loadMoreBtn.textContent;
        loadMoreBtn.textContent = 'Loading...';
        fetchLiveVideos(activeQuery, activeOrder, currentPage, true).finally(() => {
          loadMoreBtn.disabled = false;
          loadMoreBtn.textContent = origText;
        });
      });
    }
  }

  // ─── 6. WATCH PAGE FACADE + THEATER MODE + SAVE/HISTORY ───
  function initWatchPage() {
    const facade = document.querySelector('[data-lh-player-facade]');
    if (facade) {
      const videoMeta = {
        id: facade.getAttribute('data-video-id') || '',
        title: facade.getAttribute('data-title') || document.title,
        href: window.location.pathname,
        thumb: facade.querySelector('img')?.src || '',
        duration: facade.getAttribute('data-duration') || '',
      };

      const mountIframe = () => {
        const embed = facade.getAttribute('data-embed');
        if (!embed) return;
        const shell = facade.parentElement;
        const iframe = document.createElement('iframe');
        iframe.src = embed;
        iframe.allowFullscreen = true;
        iframe.allow = 'autoplay; fullscreen; encrypted-media';
        iframe.title = videoMeta.title;
        shell.innerHTML = '';
        shell.appendChild(iframe);
        Store.recordHistory(videoMeta);
      };

      facade.addEventListener('click', mountIframe);
      facade.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          mountIframe();
        }
      });
    }

    const theaterBtn = document.getElementById('lhTheaterBtn');
    const watchLayout = document.getElementById('lhWatchLayout');
    if (theaterBtn && watchLayout) {
      const toggleTheater = () => {
        const active = watchLayout.classList.toggle('is-theater');
        theaterBtn.setAttribute('aria-pressed', String(active));
      };
      theaterBtn.addEventListener('click', toggleTheater);
      document.addEventListener('keydown', (e) => {
        if (e.key === 't' && !e.ctrlKey && !e.metaKey && document.activeElement?.tagName !== 'INPUT') {
          toggleTheater();
        }
      });
    }

    const copyBtn = document.getElementById('lhShareCopyBtn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        const url = copyBtn.getAttribute('data-copy-url') || window.location.href;
        navigator.clipboard?.writeText(url).then(() => {
          const orig = copyBtn.textContent;
          copyBtn.textContent = 'Link Copied';
          setTimeout(() => { copyBtn.textContent = orig; }, 1800);
        }).catch(() => {});
      });
    }
  }

  // ─── 7. SAVED & WATCH HISTORY PAGE (/saved) ───
  function initSavedPage() {
    const grid = document.getElementById('lhSavedGrid');
    if (!grid) return;
    const tabs = document.getElementById('lhSavedTabs');
    const clearBtn = document.getElementById('lhClearSavedBtn');
    let activeTab = 'favorites';

    function renderSavedList() {
      const favs = Store.getFavorites();
      const hist = Store.getHistory();
      document.querySelectorAll('[data-history-count]').forEach(el => { el.textContent = String(hist.length); });
      const items = activeTab === 'history' ? hist : favs;
      if (!items.length) {
        grid.innerHTML = activeTab === 'history'
          ? '<div class="lh-empty-box" style="grid-column:1/-1;">No watch history yet. Play any video and it will appear here privately for instant resume. <a href="/trending" style="color:var(--accent);font-weight:700;">Browse Trending</a></div>'
          : '<div class="lh-empty-box" style="grid-column:1/-1;">No saved favorites yet. Tap the bookmark icon on any video card to build your private list — no signup needed. <a href="/trending" style="color:var(--accent);font-weight:700;">Explore Trending</a></div>';
        return;
      }
      grid.innerHTML = items.map(item => renderCardHtml({
        id: item.id,
        title: item.title,
        href: item.href,
        thumb: item.thumb,
        duration: item.duration,
        views: '',
        date: item.savedAt ? new Date(item.savedAt).toISOString().slice(0, 10) : (item.watchedAt ? new Date(item.watchedAt).toISOString().slice(0, 10) : ''),
        nofollow: false,
      })).join('');
      syncSavedUI();
    }

    if (tabs) {
      tabs.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-saved-tab]');
        if (!btn) return;
        tabs.querySelectorAll('.lh-filter-btn').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        activeTab = btn.getAttribute('data-saved-tab') || 'favorites';
        renderSavedList();
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (activeTab === 'history') writeList(HISTORY_KEY, []);
        else writeList(FAVORITES_KEY, []);
        syncSavedUI();
        renderSavedList();
      });
    }

    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-save-id]') && activeTab === 'favorites') {
        setTimeout(renderSavedList, 10);
      }
    });

    renderSavedList();
  }

  // ─── 8. GLOBAL DELEGATED SAVE / BOOKMARK HANDLER ───
  function initGlobalDelegates() {
    document.addEventListener('click', (e) => {
      const saveBtn = e.target.closest('[data-save-id]');
      if (saveBtn) {
        e.preventDefault();
        e.stopPropagation();
        const card = saveBtn.closest('[data-video-id]');
        const item = {
          id: saveBtn.getAttribute('data-save-id'),
          title: saveBtn.getAttribute('data-save-title') || card?.getAttribute('data-title') || document.title,
          href: saveBtn.getAttribute('data-save-href') || card?.getAttribute('data-href') || window.location.pathname,
          thumb: saveBtn.getAttribute('data-save-thumb') || card?.getAttribute('data-thumb') || '',
          duration: saveBtn.getAttribute('data-save-duration') || card?.getAttribute('data-duration') || '',
        };
        const isNowSaved = Store.toggleFavorite(item);
        const svg = saveBtn.querySelector('svg');
        if (svg) svg.setAttribute('fill', isNowSaved ? 'currentColor' : 'none');
        return;
      }

      const themeBtn = e.target.closest('[data-theme-toggle]');
      if (themeBtn) {
        const cur = document.documentElement.getAttribute('data-theme') || 'dark';
        applyTheme(cur === 'dark' ? 'light' : 'dark');
      }
    });
  }

  // ─── INIT ───
  function init() {
    applyTheme(getSavedTheme());
    initLangDropdown();
    initSearch();
    initGlobalDelegates();
    initHomeFilters();
    initWatchPage();
    initSavedPage();
    syncSavedUI();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
