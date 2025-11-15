// Lightweight admin UI for Loyalty Mini App
const API_BASE = window.API_BASE_URL || 'https://grotesquely-pleasing-reedbuck.cloudpub.ru/';
// expose for debug overlay
try { window.API_BASE = API_BASE; } catch (e) {}

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

function showToast(text, ms = 3500) {
  const t = document.getElementById('toast');
  if (!t) return console.log(text);
  t.textContent = text;
  t.hidden = false;
  setTimeout(() => t.hidden = true, ms);
}

function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/[&<>"'`]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;","`":"&#96;" })[c]);
}

// Small helper: wait for Telegram SDK/init to appear (race inside WebView)
async function waitForTgInit(timeout = 1500, interval = 100) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      if (window.Telegram && window.Telegram.WebApp) {
        const tg = window.Telegram.WebApp;
        try { if (typeof tg.ready === 'function') tg.ready(); } catch (e) {}
        if ((tg.initDataUnsafe && tg.initDataUnsafe.user) || tg.initData) return true;
      }
    } catch (e) {}
    await new Promise(r => setTimeout(r, interval));
  }
  return false;
}

function buildTgHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  function encodeHeaderValue(s) {
    try {
      return btoa(unescape(encodeURIComponent(s)));
    } catch (e) {
      try { return btoa(s); } catch(_) { return encodeURIComponent(s); }
    }
  }
  try {
    // Prefer live Telegram SDK if available
    if (window.Telegram && window.Telegram.WebApp) {
      const tg = window.Telegram.WebApp;
      if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
        try {
          const raw = JSON.stringify(tg.initDataUnsafe.user);
          headers['X-Telegram-User'] = encodeHeaderValue(raw);
          headers['X-Telegram-User-B64'] = '1';
        } catch (e) {
          headers['X-Telegram-User'] = JSON.stringify(tg.initDataUnsafe.user);
        }
      }
      const signed = tg.initData || (tg.initDataUnsafe && tg.initDataUnsafe.initData);
      if (signed) headers['X-Telegram-InitData'] = signed;
    }
    // If headers are still missing (for example tg.initDataUnsafe was empty
    // even though the SDK exists), try reading values saved to sessionStorage
    // by the previous page. This covers cases where Telegram WebApp doesn't
    // re-populate initData on navigation. Also parse location.hash for
    // fragment-encoded initData if present (we may add this during redirect).
    try {
      if (!headers['X-Telegram-User']) {
        let raw = sessionStorage.getItem('tg_initDataUnsafe');
        if (!raw && location && location.hash) {
          // parse fragment like #tginit=<signed>&tgunsafe=<json>
          try {
            const m = location.hash.match(/tgunsafe=([^&]+)/);
            if (m) raw = decodeURIComponent(m[1]);
          } catch(e) { raw = null; }
        }
        if (raw) {
          try {
            const obj = JSON.parse(raw);
            if (obj && obj.user) {
              const r = JSON.stringify(obj.user);
              headers['X-Telegram-User'] = encodeHeaderValue(r);
              headers['X-Telegram-User-B64'] = '1';
            }
          } catch (e) { /* ignore parse errors */ }
        }
      }
      if (!headers['X-Telegram-InitData']) {
        let signed = sessionStorage.getItem('tg_initDataSigned');
        if (!signed && location && location.hash) {
          try {
            const m = location.hash.match(/tginit=([^&]+)/);
            if (m) signed = decodeURIComponent(m[1]);
          } catch(e) { signed = null; }
        }
        if (signed) headers['X-Telegram-InitData'] = signed;
      }
    } catch (e) { /* ignore parse errors */ }
  } catch (e) {}
  return headers;
}

async function fetchAdminUsers() {
  // ensure Telegram init data (best-effort)
  await waitForTgInit(1500, 100);
  const res = await fetch(`${API_BASE.replace(/\/+$/, '')}/api/admin/users`, {
    headers: buildTgHeaders()
  });
  if (!res.ok) throw new Error('Failed to fetch admin users');
  return res.json();
}

function renderUsers(users, token) {
  const container = document.getElementById('users-list');
  if (!container) return;
  if (!users || users.length === 0) {
    container.innerHTML = '<p>No users.</p>';
    return;
  }
  const list = document.createElement('div');
  list.className = 'admin-user-list';
  users.forEach(u => {
    const item = document.createElement('div');
    item.className = 'admin-user';
    item.innerHTML = `
      <div><strong>${escapeHtml(u.name)}</strong> (id: ${u.id}) — XP: <span class="xp-val">${u.xp}</span></div>
      <div style="margin-top:6px;">
        <button class="btn-accrue" data-id="${u.id}">+100 XP</button>
      </div>
    `;
    list.appendChild(item);
  });
  container.innerHTML = '';
  container.appendChild(list);

  list.querySelectorAll('.btn-accrue').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.currentTarget.dataset.id;
      const amount = 100;
      try {
        await waitForTgInit(1500, 100);
        const res = await fetch(`${API_BASE.replace(/\/+$/, '')}/api/admin/users/${encodeURIComponent(id)}/accrue-xp`, {
          method: 'POST',
          headers: Object.assign({}, buildTgHeaders()),
          body: JSON.stringify({ amount, reason: 'admin_manual' })
        });
        if (!res.ok) {
          const body = await res.json().catch(()=>({}));
          throw new Error(body.detail || 'Failed');
        }
        const data = await res.json();
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

async function initAdmin() {
  try {
  // Debug: show whether Telegram SDK/global is present before calling /api/me
    try {
      const dbgRoot = document.getElementById('admin-info');
      const pre = document.createElement('div');
      pre.style.marginTop = '6px';
      pre.style.fontSize = '12px';
      pre.style.opacity = '0.9';
      const hasTelegram = !!(window.Telegram || window.Telegram && window.Telegram.WebApp);
      let tgPreview = null;
      try {
        const tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : (window.Telegram || null);
        if (tg) {
          tgPreview = {
            hasInitData: Boolean(tg.initData || (tg.initDataUnsafe && tg.initDataUnsafe.initData)),
            hasUser: Boolean(tg.initDataUnsafe && tg.initDataUnsafe.user),
            userPreview: tg.initDataUnsafe && tg.initDataUnsafe.user ? { id: tg.initDataUnsafe.user.id, username: tg.initDataUnsafe.user.username } : null
          };
        }
      } catch (e) { tgPreview = null }
      pre.textContent = `telegram_present=${hasTelegram} tg_preview=${JSON.stringify(tgPreview)}`;
      if (dbgRoot) dbgRoot.appendChild(pre);
    } catch (e) { console.debug('dbg render fail', e) }

    // Instead of token-based flow, ask backend for admin users using Telegram headers.
    const users = await fetchAdminUsers().catch(()=>null);
    if (!users) {
      document.getElementById('admin-info').textContent = 'You are not an admin or authentication failed.';
      document.getElementById('users-list').innerHTML = '<p>Admin access not available.</p>';
      return;
    }
    document.getElementById('admin-info').textContent = `Signed in as admin`;
    renderUsers(users);
  } catch (err) {
    console.error('Admin init failed', err);
    document.getElementById('admin-info').textContent = 'Failed to initialize admin panel.';
  }
}

initAdmin().catch(err => console.error(err));

// Expose helpers for the debug overlay to call directly
window._admin = window._admin || {};
window._admin.fetchAdminUsers = fetchAdminUsers;
window._admin.buildTgHeaders = buildTgHeaders;
