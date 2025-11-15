# loyalty-miniapp — Frontend (GitHub Pages)

This repository contains a static front-end for a Telegram Mini App (WebApp) that demonstrates a loyalty system and lootboxes. It's intended to be served from GitHub Pages (or any static host). The backend (Python + FastAPI + SQLModel) will be connected later.

What is included

- `index.html` — static Mini App UI
- `app.js` — mock functions: `loadUser`, `loadLootboxes`, `openLootbox` and UI wiring
- `styles.css` — minimal styling
- `.nojekyll` — prevents GitHub Pages from ignoring files

Features

- Greeting and mocked XP balance
- List of lootboxes (200/500/1000/5000 XP) with example prizes
- "Open" buttons that use mocked `openLootbox` to simulate prize awards
- Telegram WebApp SDK included and guarded — works in normal browsers with a lightweight mock

How to publish on GitHub Pages

1. Create a new public repository named `loyalty-miniapp` on GitHub (or rename remote if you already have one).
2. Commit and push these files to the repository (main branch). Example commands (PowerShell):

```powershell
git init
git add .
git commit -m "Initial frontend for loyalty miniapp"
git remote add origin https://github.com/<your-username>/loyalty-miniapp.git
git branch -M main
git push -u origin main
```

3. Enable GitHub Pages in repository settings: set "Source" to the `main` branch (root). After a minute or two your site will be available at:

```
https://<your-username>.github.io/loyalty-miniapp/
```

Notes & next steps

- I cannot create the GitHub repository or enable Pages from here — you'll need to run the steps above locally.
- Next iterations will add the Python FastAPI backend with proper APIs, persistent users, transactions and server-side lootbox resolution.

Enjoy!