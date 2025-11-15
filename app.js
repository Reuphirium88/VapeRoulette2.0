// Minimal frontend for Loyalty Mini App (mocked data + Telegram WebApp guard)

// Telegram guard / lightweight mock so app works in normal browser
if (!window.Telegram || !window.Telegram.WebApp) {
  window.Telegram = window.Telegram || {};
  window.Telegram.WebApp = {
    initData: '',
    isExpanded: false,
    ready: function() {},
    close: function() { console.log('WebApp.close() mock'); },
    onEvent: function() {},
    MainButton: {
      show: function() {},
      hide: function() {},
      setText: function() {}
    }
  };
  console.log('Telegram.WebApp not found — using mock.');
}

const tg = window.Telegram.WebApp;

// Simple helper to show toast
function showToast(text, ms = 2500) {
  const t = document.getElementById('toast');
  t.textContent = text;
  t.hidden = false;
  setTimeout(() => t.hidden = true, ms);
}

// Mocked loadUser — would call backend later
export function loadUser() {
  // test user
  return Promise.resolve({ id: 1, name: 'DemoUser', xp: 1250 });
}

// Mocked lootboxes
export function loadLootboxes() {
  const boxes = [
    { id: 'lb-200', cost: 200, title: 'Bronze Box', prizes: ['Small Coil', 'Sticker', '5% off'] },
    { id: 'lb-500', cost: 500, title: 'Silver Box', prizes: ['Pod', 'E-liquid 10ml', '10% off'] },
    { id: 'lb-1000', cost: 1000, title: 'Gold Box', prizes: ['Battery', 'E-liquid 50ml', '20% off'] },
    { id: 'lb-5000', cost: 5000, title: 'Platinum Box', prizes: ['Device', 'Premium Kit', 'Full Refund Coupon'] }
  ];
  return Promise.resolve(boxes);
}

// Simulate opening a lootbox
export function openLootbox(box, user) {
  return new Promise((resolve, reject) => {
    if (user.xp < box.cost) {
      reject(new Error('Not enough XP'));
      return;
    }
    // simulate server delay
    setTimeout(() => {
      const prize = box.prizes[Math.floor(Math.random() * box.prizes.length)];
      // deduct xp locally (backend will validate later)
      user.xp -= box.cost;
      resolve({ prize, remainingXp: user.xp });
    }, 800);
  });
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
  // Telegram API ready (if real Telegram present)
  if (tg && typeof tg.ready === 'function') tg.ready();

  currentUser = await loadUser();
  lootboxes = await loadLootboxes();
  renderUser(currentUser);
  renderLootboxes(lootboxes);

  // modal close
  document.getElementById('modal-close').addEventListener('click', hideModal);
}

// Start
init().catch(err => console.error(err));

// For quick debugging in console
window._miniapp = { loadUser, loadLootboxes, openLootbox };
