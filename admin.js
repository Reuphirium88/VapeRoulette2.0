// Lightweight admin UI for Loyalty Mini App
const API_BASE = window.API_BASE_URL || 'https://grotesquely-pleasing-reedbuck.cloudpub.ru/';

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

async function apiMe() {
  // Build headers that include Telegram WebApp user/initData if available so backend
  // can identify the user inside the WebApp. Wait for tg.ready() when possible
  // because the SDK may initialize slightly after the page script runs.
  const headers = { 'Content-Type': 'application/json' };
  try {
    if (window.Telegram && window.Telegram.WebApp) {
      const tg = window.Telegram.WebApp;
      try { if (typeof tg.ready === 'function') tg.ready(); } catch (e) {}

      // Wait briefly for initDataUnsafe to populate (race condition in some WebView builds)
      const waitForTgUser = async (timeout = 1000, interval = 100) => {
        const start = Date.now();
        while (Date.now() - start < timeout) {
          try {
            if (tg.initDataUnsafe && tg.initDataUnsafe.user) return tg.initDataUnsafe.user;
          } catch (e) {}
          await new Promise(r => setTimeout(r, interval));
        }
        return null;
      };

      const maybeUser = await waitForTgUser(1000, 100);
      if (maybeUser) {
        headers['X-Telegram-User'] = JSON.stringify(maybeUser);
      }
      const signed = tg.initData || (tg.initDataUnsafe && tg.initDataUnsafe.initData);
      if (signed) headers['X-Telegram-InitData'] = signed;
    }
  } catch (e) {}

  const res = await fetch(`${API_BASE.replace(/\/+$/, '')}/api/me`, { headers });
  if (!res.ok) throw new Error('Failed to fetch /api/me');
  return res.json();
}

async function fetchAdminUsers(token) {
  const res = await fetch(`${API_BASE.replace(/\/+$/, '')}/api/admin/users`, {
    headers: { 'Authorization': `Bearer ${token}` }
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
        const res = await fetch(`${API_BASE.replace(/\/+$/, '')}/api/admin/users/${encodeURIComponent(id)}/accrue-xp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
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
    const urlParams = new URLSearchParams(location.search);
    const tokenFromUrl = urlParams.get('token');

    const me = await apiMe().catch(()=>null);

    // Prefer explicit token in URL (developer convenience). Otherwise take token from /api/me
    const token = tokenFromUrl || (me && me.admin_token);

    if (!me || !me.is_admin) {
      // If /api/me didn't identify the user as admin but a token was provided via URL,
      // allow proceeding (useful for local dev when headers/initData aren't forwarded).
      if (!token) {
        document.getElementById('admin-info').textContent = 'You are not an admin or authentication failed.';
        return;
      }
      document.getElementById('admin-info').textContent = `Signed in as admin (token provided)`;
    } else {
      document.getElementById('admin-info').textContent = `Signed in as admin: ${me.name}`;
    }
    // Debug: show raw /api/me response (masked token) for troubleshooting inside the WebApp.
    try {
      const dbg = document.createElement('div');
      dbg.style.marginTop = '8px';
      dbg.style.fontSize = '12px';
      dbg.style.opacity = '0.9';
      dbg.textContent = 'api/me: ' + JSON.stringify(Object.assign({}, me || {}, { admin_token: me && me.admin_token ? '[redacted]' : null }));
      document.getElementById('admin-info').appendChild(dbg);
    } catch (e) {}

    // If we don't have a token but are inside Telegram, try the dev helper endpoint
    let finalToken = token;
    if (!finalToken) {
      try {
        if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe && window.Telegram.WebApp.initDataUnsafe.user) {
          const tg = window.Telegram.WebApp.initDataUnsafe.user;
          const devRes = await fetch(`${API_BASE.replace(/\/+$/, '')}/api/admin/dev/admin-token/${encodeURIComponent(tg.id)}`);
          if (devRes.ok) {
            const devBody = await devRes.json();
            finalToken = devBody.token;
          }
        }
      } catch (e) {
        console.debug('dev token fetch failed', e);
      }
    }

    if (!finalToken) {
      document.getElementById('users-list').innerHTML = '<p>No admin token available.</p>';
      return;
    }

    const users = await fetchAdminUsers(finalToken);
    renderUsers(users, finalToken);
  } catch (err) {
    console.error('Admin init failed', err);
    document.getElementById('admin-info').textContent = 'Failed to initialize admin panel.';
  }
}

initAdmin().catch(err => console.error(err));
