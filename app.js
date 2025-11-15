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

function showToast(text, ms = 2500) {
  const t = document.getElementById('toast');
  t.textContent = text;
  t.hidden = false;
  setTimeout(() => t.hidden = true, ms);
}

const API_BASE = window.API_BASE_URL || 'https://grotesquely-pleasing-reedbuck.cloudpub.ru/';

export async function loadUser() {
  if (!API_BASE) {
    return { id: 1, name: 'DemoUser', xp: 1250 };
  }
  const res = await fetch(`${API_BASE}/api/me`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error('Failed to load user');
  return res.json();
}

export async function loadLootboxes() {
  if (!API_BASE) {
    return [
      { id: 'lb-200', cost: 200, title: 'Bronze Box', prizes: ['Small Coil', 'Sticker', '5% off'] },
      { id: 'lb-500', cost: 500, title: 'Silver Box', prizes: ['Pod', 'E-liquid 10ml', '10% off'] },
      { id: 'lb-1000', cost: 1000, title: 'Gold Box', prizes: ['Battery', 'E-liquid 50ml', '20% off'] },
      { id: 'lb-5000', cost: 5000, title: 'Platinum Box', prizes: ['Device', 'Premium Kit', 'Full Refund Coupon'] }
    ];
  }
  const res = await fetch(`${API_BASE}/api/lootboxes`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error('Failed to load lootboxes');
  return res.json();
}

export async function openLootbox(box, user) {
  if (!API_BASE) {
    // local simulation
    return new Promise((resolve, reject) => {
      if (user.xp < box.cost) return reject(new Error('Not enough XP'));
      setTimeout(() => {
        const prize = box.prizes[Math.floor(Math.random() * box.prizes.length)];
        user.xp -= box.cost;
        resolve({ prize, remainingXp: user.xp });
      }, 500);
    });
  }

  const res = await fetch(`${API_BASE}/api/lootboxes/${encodeURIComponent(box.id)}/open`, {
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
  const name = document.getElementById('greeting');
  const xp = document.getElementById('xp-value');
  name.textContent = `Hello, ${user.name}`;
  xp.textContent = user.xp;
}

function renderLootboxes(boxes) {
  const list = document.getElementById('lootbox-list');
  list.innerHTML = '';
  boxes.forEach(box => {
    const card = document.createElement('div');
    card.className = 'box';
    card.innerHTML = `
      <h3>${box.title}</h3>
      <div class="cost">Cost: <strong>${box.cost} XP</strong></div>
      <div class="prizes">Prizes: ${box.prizes.join(', ')}</div>
      <button class="open-btn" data-id="${box.id}">Open</button>
    `;
    list.appendChild(card);
  });

  // attach handlers
  list.querySelectorAll('.open-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.currentTarget.dataset.id;
      const box = boxes.find(b => b.id === id);
      if (!box) return;
      try {
        const result = await openLootbox(box, currentUser);
        // if server returned remaining_xp, respect it
        if (result.remaining_xp !== undefined) currentUser.xp = result.remaining_xp;
        renderUser(currentUser);
        showModal(`You won: ${result.prize}`);
      } catch (err) {
        showToast(err.message);
      }
    });
  });
}

function showModal(text) {
  const modal = document.getElementById('modal');
  document.getElementById('modal-body').textContent = text;
  modal.hidden = false;
}

function hideModal() {
  document.getElementById('modal').hidden = true;
}

// initialize app
async function init() {
  try {
    if (tg && typeof tg.ready === 'function') tg.ready();
  } catch (e) {
    // ignore
  }

  currentUser = await loadUser();
  lootboxes = await loadLootboxes();
  renderUser(currentUser);
  renderLootboxes(lootboxes);

  // modal close
  document.getElementById('modal-close').addEventListener('click', hideModal);
}

// Start
init().catch(err => console.error(err));

// Debug helper
window._miniapp = { loadUser, loadLootboxes, openLootbox };
