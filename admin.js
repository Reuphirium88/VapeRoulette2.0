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
  const res = await fetch(`${API_BASE.replace(/\/+$/, '')}/api/me`, { headers: { 'Content-Type': 'application/json' } });
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
    const me = await apiMe();
    if (!me || !me.is_admin) {
      document.getElementById('admin-info').textContent = 'You are not an admin or authentication failed.';
      return;
    }
    document.getElementById('admin-info').textContent = `Signed in as admin: ${me.name}`;
    const token = me.admin_token;
    if (!token) {
      document.getElementById('users-list').innerHTML = '<p>No admin token available.</p>';
      return;
    }
    const users = await fetchAdminUsers(token);
    renderUsers(users, token);
  } catch (err) {
    console.error('Admin init failed', err);
    document.getElementById('admin-info').textContent = 'Failed to initialize admin panel.';
  }
}

initAdmin().catch(err => console.error(err));
