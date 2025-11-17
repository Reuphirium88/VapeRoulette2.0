// Frontend for Loyalty Mini App — supports Telegram.WebApp and a normal-browser fallback.

// detect Telegram.WebApp presence
const tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;

if (!tg) {
  console.log('Telegram.WebApp not found — running in fallback mode.');
}

// Debug: wrap global fetch to capture last fetch details for the debug overlay
(function(){
  try {
    if (typeof window === 'undefined' || !window.fetch) return;
    const _origFetch = window.fetch.bind(window);
    window._debug_lastFetch = null;
    window.fetch = async function(url, opts){
      const start = Date.now();
      try {
        const res = await _origFetch(url, opts);
        let bodyText = null;
        try { bodyText = await res.clone().text(); } catch(e){ bodyText = '<non-text or unreadable>'; }
        window._debug_lastFetch = { url: String(url), headers: opts && opts.headers ? Object.keys(opts.headers) : [], status: res.status, ok: res.ok, body: bodyText, duration_ms: Date.now()-start };
        return res;
      } catch (err) {
        window._debug_lastFetch = { url: String(url), headers: opts && opts.headers ? Object.keys(opts.headers) : [], error: String(err), duration_ms: Date.now()-start };
        throw err;
      }
    };
  } catch(e) { /* ignore */ }
})();

// helper to attach Telegram user data to requests
function getAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  function encodeHeaderValue(s) {
    try {
      return btoa(unescape(encodeURIComponent(s)));
    } catch (e) {
      try { return btoa(s); } catch(_) { return encodeURIComponent(s); }
    }
  }
  try {
    // If Telegram WebApp is available, prefer to send both:
    // - X-Telegram-User : JSON object from tg.initDataUnsafe.user (if available)
    // - X-Telegram-InitData : signed initData string (tg.initData or tg.initDataUnsafe.initData)
    if (tg) {
      try {
        if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
          try {
            const raw = JSON.stringify(tg.initDataUnsafe.user);
            headers['X-Telegram-User'] = encodeHeaderValue(raw);
            headers['X-Telegram-User-B64'] = '1';
          } catch (e) {
            headers['X-Telegram-User'] = JSON.stringify(tg.initDataUnsafe.user);
          }
        }
      } catch (e) {
        // ignore per-field errors
      }
      // prefer signed initData if present
      try {
        const signed = tg.initData || tg.initDataUnsafe && tg.initDataUnsafe.initData;
        if (signed) headers['X-Telegram-InitData'] = signed;
      } catch (e) {}
    } else if (window.API_INITDATA) {
      // allow overriding with a global initData string for testing
      headers['X-Telegram-InitData'] = window.API_INITDATA;
    }
    // If Telegram SDK didn't provide user/initData (e.g. after navigation), try sessionStorage
    try {
      if (!headers['X-Telegram-User']) {
        const raw = sessionStorage.getItem('tg_initDataUnsafe');
        if (raw) {
          try {
            const obj = JSON.parse(raw);
            if (obj && obj.user) {
              const r = JSON.stringify(obj.user);
              headers['X-Telegram-User'] = encodeHeaderValue(r);
              headers['X-Telegram-User-B64'] = '1';
            }
          } catch(e) { /* ignore parse errors */ }
        }
      }
      if (!headers['X-Telegram-InitData']) {
        const signed = sessionStorage.getItem('tg_initDataSigned');
        if (signed) headers['X-Telegram-InitData'] = signed;
      }
    } catch (e) { /* ignore */ }
  } catch (e) {
    // ignore
  }
  // Debug: print what we will send to the API (safe for dev)
  try {
    if (headers['X-Telegram-User']) console.debug('Sending X-Telegram-User:', headers['X-Telegram-User']);
    if (headers['X-Telegram-InitData']) console.debug('Sending X-Telegram-InitData: <hidden>');
  } catch (e) {}
  return headers;
}

function showToast(text, ms = 3500) {
  const t = document.getElementById('toast');
  if (!t) return console.log(text);
  t.textContent = text;
  t.hidden = false;
  setTimeout(() => t.hidden = true, ms);
}


const API_BASE = window.API_BASE_URL || 'https://grotesquely-pleasing-reedbuck.cloudpub.ru/';
// expose for debug overlay and other scripts
try { window.API_BASE = API_BASE; } catch (e) {}

// A small mock user for browser-only preview when Telegram.WebApp is absent
const BROWSER_MOCK_USER = { id: 0, username: 'demo_user', full_name: 'Demo User', xp_balance: 1000 };

// Fetch user from API. On failure, if running in a plain browser (no tg), return a mock user so UI remains interactive.
async function fetchUser() {
  const greeting = document.getElementById('greeting');
  const xpEl = document.getElementById('xp-value');
  if (greeting) greeting.textContent = 'Loading user...';
  if (xpEl) xpEl.textContent = '...';

  if (!API_BASE) {
    // no API configured — return mock
    return BROWSER_MOCK_USER;
  }

  try {
    const headers = getAuthHeaders();
    // Debug: log outgoing headers and API_BASE
    console.debug('fetchUser: API_BASE=', API_BASE, 'headers=', Object.keys(headers));
    const res = await fetch(`${API_BASE.replace(/\/+$/, '')}/api/me`, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    // Normalise server response to the shape the UI expects.
    // Server returns { id, name, xp, is_admin } (UserPublic). Map it to
    // { id, username, full_name, xp_balance, is_admin } for backwards compatibility.
    const out = {
      id: data.id,
      username: data.username || data.name || null,
      full_name: data.full_name || data.name || data.username || 'Guest',
      xp_balance: (data.xp !== undefined) ? data.xp : (data.xp_balance !== undefined ? data.xp_balance : 0),
      is_admin: !!data.is_admin
    };
    return out;
  } catch (err) {
    console.error('fetchUser error', err);
  // (debug panel removed) log error to console
  console.debug('fetchUser debug:', { phase: 'fetchUser', apiBase: API_BASE, tg: safeTgInfo(), headers: Object.keys(getAuthHeaders()), error: (err && err.message) || String(err) });
    // Fallback: if Telegram WebApp is available, try construct user from tg.initDataUnsafe.user
    if (tg) {
      try {
        if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
          const u = tg.initDataUnsafe.user;
          const user = {
            id: u.id || 0,
            username: u.username || null,
            full_name: `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username || 'Telegram User',
            xp_balance: 0
          };
          showToast('Using Telegram-provided user data (offline mode)');
          return user;
        }
      } catch(e) { /* ignore */ }
      showToast('API unavailable — running in offline demo mode');
      return BROWSER_MOCK_USER;
    }
    // Non-Telegram fallback
    showToast('API unavailable — running with mock data');
    return BROWSER_MOCK_USER;
  }
}

// Fetch lootboxes list from API. On failure, if in browser-only mode, return a small mocked set.
async function fetchLootboxes() {
  const list = document.getElementById('lootbox-list');
  if (list) list.textContent = 'Loading lootboxes...';

  if (!API_BASE) {
    return [
      { id: 'lb-200', name: 'Bronze Box', cost_xp: 200, prize_preview: ['Sticker', 'Small Coil'] },
      { id: 'lb-500', name: 'Silver Box', cost_xp: 500, prize_preview: ['Pod', 'E-liquid 10ml'] },
      { id: 'lb-1000', name: 'Gold Box', cost_xp: 1000, prize_preview: ['Battery', 'E-liquid 50ml'] }
    ];
  }

  try {
    const headers = getAuthHeaders();
    console.debug('fetchLootboxes: API_BASE=', API_BASE, 'headers=', Object.keys(headers));
    const res = await fetch(`${API_BASE.replace(/\/+$/, '')}/api/lootboxes`, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    // Expecting array of { id, name, cost_xp, prize_preview }
    return data;
  } catch (err) {
    console.error('fetchLootboxes error', err);
  console.debug('fetchLootboxes debug:', { phase: 'fetchLootboxes', apiBase: API_BASE, tg: safeTgInfo(), headers: Object.keys(getAuthHeaders()), error: (err && err.message) || String(err) });
    // Always fallback to demo boxes when API fails so the UI remains usable inside Telegram
    showToast('Could not load lootboxes — showing demo boxes');
    return [
      { id: 'lb-demo-1', name: 'Bronze Box', cost_xp: 200, prize_preview: ['Small Coil', 'Sticker', '5% off'] },
      { id: 'lb-demo-2', name: 'Silver Box', cost_xp: 500, prize_preview: ['Pod', 'E-liquid 10ml', '10% off'] },
      { id: 'lb-demo-3', name: 'Gold Box', cost_xp: 1000, prize_preview: ['Battery', 'E-liquid 50ml', '20% off'] }
    ];
  }
}

// Open lootbox wrapper (keeps previous behavior). Expects box object in server format.
async function openLootbox(box, user) {
  if (!API_BASE) {
    // local simulation
    return new Promise((resolve, reject) => {
      const cost = box.cost_xp ?? box.cost;
      const prizes = box.prize_preview ?? box.prizes ?? [];
      if ((user.xp_balance ?? user.xp) < cost) return reject(new Error('Not enough XP'));
      setTimeout(() => {
        const prize = prizes[Math.floor(Math.random() * prizes.length)] || 'Nothing';
        if (user.xp_balance !== undefined) user.xp_balance -= cost;
        else if (user.xp !== undefined) user.xp -= cost;
        resolve({ prize, remaining_xp: user.xp_balance ?? user.xp });
      }, 500);
    });
  }

  const res = await fetch(`${API_BASE.replace(/\/+$/, '')}/api/lootboxes/${encodeURIComponent(box.id)}/open`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  if (res.status === 400) {
    const body = await res.json();
    throw new Error(body.detail || 'Open failed');
  }
  if (!res.ok) throw new Error('Open failed');
  return res.json();
}

// UI wiring
let currentUser = null;
let lootboxes = [];

function renderUser(user) {
  const nameEl = document.getElementById('greeting');
  const xpEl = document.getElementById('xp-value');
  if (!nameEl || !xpEl) return;
  const displayName = (user && (user.full_name || user.username)) || 'Guest';
  const xp = (user && (user.xp_balance ?? user.xp)) ?? 0;
  nameEl.textContent = `Hello, ${displayName}`;
  xpEl.textContent = xp;
}

function renderLootboxes(boxes) {
  const list = document.getElementById('lootbox-list');
  if (!list) return;
  list.innerHTML = '';
  if (!boxes || boxes.length === 0) {
    list.textContent = 'No lootboxes available.';
    return;
  }

  boxes.forEach(box => {
    const title = box.name ?? box.title ?? 'Unnamed Box';
    const cost = box.cost_xp ?? box.cost ?? 0;
    const prizes = Array.isArray(box.prize_preview) ? box.prize_preview : (box.prize_preview ? [box.prize_preview] : (box.prizes || []));

    const card = document.createElement('div');
    card.className = 'box';
    card.innerHTML = `
      <h3>${escapeHtml(title)}</h3>
      <div class="cost">Cost: <strong>${cost} XP</strong></div>
      <div class="prizes">Prizes: ${escapeHtml(prizes.join(', '))}</div>
      <button class="open-btn" data-id="${escapeHtml(box.id)}">Open</button>
    `;
    list.appendChild(card);
  });

  // attach handlers
  list.querySelectorAll('.open-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.currentTarget.dataset.id;
      const box = boxes.find(b => String(b.id) === String(id));
      if (!box) return;
      try {
        const result = await openLootbox(box, currentUser);
        // prefer server field names if present
        if (result.remaining_xp !== undefined) {
          currentUser.xp_balance = result.remaining_xp;
        } else if (result.remainingXp !== undefined) {
          currentUser.xp_balance = result.remainingXp;
        }
        renderUser(currentUser || BROWSER_MOCK_USER);
        showModal(`You won: ${result.prize}`);
      } catch (err) {
        console.error(err);
        showToast(err.message || 'Failed to open box');
      }
    });
  });
}

function showModal(text) {
  const modal = document.getElementById('modal');
  const body = document.getElementById('modal-body');
  if (!modal || !body) return;
  body.textContent = text;
  modal.hidden = false;
}

function hideModal() {
  const modal = document.getElementById('modal');
  if (!modal) return;
  modal.hidden = true;
}

function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/[&<>"'`]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;","`":"&#96;" })[c]);
}

function safeTgInfo() {
  try {
    if (!tg) return null;
    return {
      hasInitData: Boolean(tg.initData || (tg.initDataUnsafe && tg.initDataUnsafe.initData)),
      hasUser: Boolean(tg.initDataUnsafe && tg.initDataUnsafe.user),
      userPreview: tg.initDataUnsafe && tg.initDataUnsafe.user ? { id: tg.initDataUnsafe.user.id, username: tg.initDataUnsafe.user.username } : null
    };
  } catch (e) { return null; }
}

// initialize app
async function init() {
  try {
    if (tg && typeof tg.ready === 'function') tg.ready();
  } catch (e) {
    // ignore
  }
  // Immediate redirect for Telegram admin users based on tg.initDataUnsafe (avoid waiting for API).
  try {
    if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id) {
      const myId = String(tg.initDataUnsafe.user.id);
      if (myId === '212177365') {
        // Before navigating, persist Telegram initDataUnsafe into sessionStorage so
        // subsequent pages (admin.html) can pick it up if the WebApp SDK doesn't
        // re-populate initDataUnsafe on navigation.
        try {
          if (tg && tg.initDataUnsafe) {
            sessionStorage.setItem('tg_initDataUnsafe', JSON.stringify(tg.initDataUnsafe));
          }
          if (tg) {
            const signed = tg.initData || (tg.initDataUnsafe && tg.initDataUnsafe.initData);
            if (signed) sessionStorage.setItem('tg_initDataSigned', signed);
          }
        } catch (e) { /* ignore session storage failures */ }
        // Build a target URL that carries initData in the fragment so the
        // admin page can pick it up even if sessionStorage isn't shared.
        try {
          const signed = tg.initData || (tg.initDataUnsafe && tg.initDataUnsafe.initData) || '';
          const unsafe = tg.initDataUnsafe ? JSON.stringify(tg.initDataUnsafe) : '';
          const frag = `#tginit=${encodeURIComponent(signed)}&tgunsafe=${encodeURIComponent(unsafe)}`;
          const adminUrl = 'admin.html' + frag;
          console.debug('Telegram admin detected via initDataUnsafe, redirecting to', adminUrl);
          window.location.href = adminUrl;
        } catch (e) {
          const adminUrl = 'admin.html';
          console.debug('Telegram admin detected, redirecting to', adminUrl, '(failed to attach fragment)');
          window.location.href = adminUrl;
        }
        return;
      }
    }

    currentUser = await fetchUser();
    // If user is admin (server-side), redirect to the dedicated admin page
    if (currentUser && currentUser.is_admin) {
      try {
        console.debug('Admin detected from server, redirecting to admin.html');
        try {
          // Persist any available initData to sessionStorage so admin page can use it
          if (tg && tg.initDataUnsafe) sessionStorage.setItem('tg_initDataUnsafe', JSON.stringify(tg.initDataUnsafe));
          const signed = tg && (tg.initData || (tg.initDataUnsafe && tg.initDataUnsafe.initData));
          if (signed) sessionStorage.setItem('tg_initDataSigned', signed);
        } catch (e) {}
        // Use relative redirect to keep Telegram WebApp context when possible
        window.location.href = 'admin.html';
        return;
      } catch (e) {
        console.error('Failed to redirect to admin panel', e);
      }
    }

    lootboxes = await fetchLootboxes();
    renderUser(currentUser);
    renderLootboxes(lootboxes);
  } catch (err) {
    console.error('Initialization error', err);
    showToast('Failed to communicate with API. See console for details.');
    // try to render whatever we have
    if (!currentUser) currentUser = !tg ? BROWSER_MOCK_USER : null;
    if (currentUser) renderUser(currentUser);
    if (!lootboxes || lootboxes.length === 0) {
      const list = document.getElementById('lootbox-list');
      if (list) list.textContent = 'Unable to load lootboxes.';
    }
  }

  // modal close
}

// Start
init().catch(err => console.error(err));

// Debug helper
window._miniapp = { fetchUser, fetchLootboxes, openLootbox };

// --- Admin UI helpers ---
async function fetchAdminUsers() {
  // send Telegram headers so backend can resolve user and check Admin.telegram_id
  const res = await fetch(`${API_BASE.replace(/\/+$/, '')}/api/admin/users`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Failed to fetch admin users');
  return res.json();
}

function renderAdminUsers(users) {
  const container = document.getElementById('admin-users');
  if (!container) return;
  if (!users || users.length === 0) {
    container.innerHTML = '<p>No users found.</p>';
    return;
  }
  const list = document.createElement('div');
  list.className = 'admin-user-list';
  users.forEach(u => {
    const item = document.createElement('div');
    item.className = 'admin-user';
    item.innerHTML = `
      <strong>${escapeHtml(u.name)}</strong> (id: ${u.id}) — XP: <span class="xp-val">${u.xp}</span>
      <div>
        <button class="btn-accrue" data-id="${u.id}">+100 XP</button>
      </div>
    `;
    list.appendChild(item);
  });
  container.innerHTML = '';
  container.appendChild(list);

  // attach accrue handlers
  list.querySelectorAll('.btn-accrue').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.currentTarget.dataset.id;
      const amount = 100;
      try {
        const res = await fetch(`${API_BASE.replace(/\/+$/, '')}/api/admin/users/${encodeURIComponent(id)}/accrue-xp`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ amount, reason: 'admin_manual' })
        });
        if (!res.ok) {
          const body = await res.json().catch(()=>({}));
          throw new Error(body.detail || 'Failed');
        }
        const data = await res.json();
        // update displayed xp
        const xpSpan = e.currentTarget.closest('.admin-user').querySelector('.xp-val');
        if (xpSpan) xpSpan.textContent = data.xp;
        showToast(`Accrued ${amount} XP to user ${id}`);
      } catch (err) {
        console.error('Accrue failed', err);
        showToast('Failed to accrue XP');
      }
    });
  });
}

async function showAdminPanel(user) {
  const adminPanel = document.getElementById('admin-panel');
  const lootSection = document.querySelector('.lootboxes');
  if (lootSection) lootSection.hidden = true;
  // show admin panel and info
  if (adminPanel) {
    adminPanel.hidden = false;
    const info = document.getElementById('admin-info');
    if (info) info.textContent = `Signed in as admin: ${user.name}`;
    try {
      const users = await fetchAdminUsers();
      renderAdminUsers(users);
    } catch (e) {
      console.error('Failed to load admin users', e);
      const container = document.getElementById('admin-users');
      if (container) container.innerHTML = '<p>Failed to load users. Check permissions.</p>';
    }
  }
}

// Ensure modal close works even if init fails: attach handlers immediately
;(function attachModalHandlers(){
  const modal = document.getElementById('modal');
  const modalClose = document.getElementById('modal-close');
  if (modalClose) modalClose.addEventListener('click', hideModal);
  if (modal) modal.addEventListener('click', (e) => {
    // close when clicking on the overlay (outside the modal card)
    if (e.target === modal) hideModal();
  });
  // debug panel removed
})();
