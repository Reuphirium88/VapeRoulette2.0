// Frontend for Loyalty Mini App — supports Telegram.WebApp and a normal-browser fallback.

// detect Telegram.WebApp presence
const tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;

if (!tg) {
  console.log('Telegram.WebApp not found — running in fallback mode.');
}

// helper to attach Telegram user data to requests
function getAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  try {
    if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
      headers['X-Telegram-User'] = JSON.stringify(tg.initDataUnsafe.user);
    } else if (window.API_INITDATA) {
      // allow overriding with a global initData string
      headers['X-Telegram-InitData'] = window.API_INITDATA;
    }
  } catch (e) {
    // ignore
  }
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
    const res = await fetch(`${API_BASE.replace(/\/+$/, '')}/api/me`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    // Expecting { id, username, full_name, xp_balance }
    return data;
  } catch (err) {
    console.error('fetchUser error', err);
    if (!tg) {
      showToast('API unavailable — running with mock data');
      return BROWSER_MOCK_USER;
    }
    throw err;
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
    const res = await fetch(`${API_BASE.replace(/\/+$/, '')}/api/lootboxes`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    // Expecting array of { id, name, cost_xp, prize_preview }
    return data;
  } catch (err) {
    console.error('fetchLootboxes error', err);
    if (!tg) {
      showToast('Could not load lootboxes — showing demo boxes');
      return [
        { id: 'lb-demo-1', name: 'Demo Box A', cost_xp: 100, prize_preview: ['Sample A', 'Sample B'] }
      ];
    }
    throw err;
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

// initialize app
async function init() {
  try {
    if (tg && typeof tg.ready === 'function') tg.ready();
  } catch (e) {
    // ignore
  }

  try {
    currentUser = await fetchUser();
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

// Ensure modal close works even if init fails: attach handlers immediately
;(function attachModalHandlers(){
  const modal = document.getElementById('modal');
  const modalClose = document.getElementById('modal-close');
  if (modalClose) modalClose.addEventListener('click', hideModal);
  if (modal) modal.addEventListener('click', (e) => {
    // close when clicking on the overlay (outside the modal card)
    if (e.target === modal) hideModal();
  });
})();
