console.log("Vape Roulette 2.0 Loaded");

// Initialize Telegram WebApp if available
if (window.Telegram && window.Telegram.WebApp) {
    Telegram.WebApp.ready();
    Telegram.WebApp.expand();
    // Set background color to match Telegram theme
    document.body.style.backgroundColor = Telegram.WebApp.themeParams.bg_color;
    document.body.style.color = Telegram.WebApp.themeParams.text_color;
    console.log("Telegram WebApp initialized.");
} else {
    console.log("Running outside Telegram WebApp environment.");
}

// Mock user data
let currentUserXP = 10000; // Initial mock XP

/**
 * Loads user data (mock for now).
 * @returns {Object} Mock user data.
 */
function loadUser() {
    console.log("Loading user data (mock)...");
    return {
        xp: currentUserXP
    };
}

/**
 * Loads lootbox data (mock for now).
 * @returns {Array} Mock lootbox data.
 */
function loadLootboxes() {
    console.log("Loading lootbox data (mock)...");
    return [
        { id: 1, cost: 200, name: "Лутбокс за 200 XP", prizes: ["Наклейка", "Брелок", "Скидка 5%"] },
        { id: 2, cost: 500, name: "Лутбокс за 500 XP", prizes: ["Жидкость для вейпа (маленькая)", "Скидка 10%", "Фирменная футболка"] },
        { id: 3, cost: 1000, name: "Лутбокс за 1000 XP", prizes: ["Жидкость для вейпа (большая)", "Скидка 20%", "Новый испаритель"] },
        { id: 4, cost: 5000, name: "Лутбокс за 5000 XP", prizes: ["Вейп-устройство", "Большой запас жидкостей", "Эксклюзивный мерч"] }
    ];
}

/**
 * Simulates opening a lootbox (mock for now).
 * @param {number} id - The ID of the lootbox to open.
 * @returns {Object} Mock result of opening the lootbox.
 */
function openLootbox(id) {
    console.log(`Attempting to open lootbox with ID: ${id} (mock)...`);
    const lootboxes = loadLootboxes();
    const lootbox = lootboxes.find(lb => lb.id === id);

    if (!lootbox) {
        return { success: false, message: "Lootbox not found." };
    }

    if (currentUserXP < lootbox.cost) {
        return { success: false, message: "Недостаточно XP для открытия этого лутбокса." };
    }

    // Simulate prize selection
    const prize = lootbox.prizes[Math.floor(Math.random() * lootbox.prizes.length)];
    currentUserXP -= lootbox.cost; // Deduct XP

    // Update the displayed XP
    document.getElementById('current-xp').textContent = currentUserXP;

    return { success: true, message: `Вы получили: ${prize}!`, prize: prize, remainingXP: currentUserXP };
}
