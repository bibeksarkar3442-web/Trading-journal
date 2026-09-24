# Tradebook – Trading Journal

A simple, mobile-first trading journal for Forex, Indian market, and crypto traders.
No server, no login, no build step. Your data stays in your own browser.

## Features
- Trade journal: date, market, symbol, long/short, timeframe, strategy, P&L, R:R, notes and review
- Attach a screenshot to any trade (auto-resized to keep storage small)
- Win rate, net P&L, profit factor, average R:R, best and worst trade
- Equity curve and a monthly P&L calendar (tap a day to log a trade)
- Strategy performance table
- Position size / risk calculator (Tools tab)
- Search and filter by market, direction, and period (week, month, year, all)
- Import trades from a Notion database export (CSV)
- Export to CSV, backup and restore as JSON
- Light and dark mode follow your phone

## Files
- `index.html` – page structure
- `style.css` – design
- `app.js` – all the logic

## Put it online with GitHub Pages (works from a phone)
1. Create a new repository on github.com (for example `tradebook`).
2. Tap **Add file → Upload files** and upload `index.html`, `style.css`, `app.js`, and `README.md` to the top level (not in a folder).
3. Tap **Commit changes**.
4. Go to **Settings → Pages**. Under **Branch**, choose `main` and `/ (root)`, then **Save**.
5. After a minute, your app is live at `https://YOUR-USERNAME.github.io/tradebook/`.
6. Open it on your phone and use **Add to Home Screen** for an app-like icon.

## Importing from Notion
1. In Notion, open your trades database.
2. Tap the **···** menu → **Export** → format **CSV** (not Markdown/PDF).
3. In Tradebook, go to **Settings → Import from Notion (CSV)** and pick that file.
4. Columns named things like Date, Market, Symbol, Direction, P&L, R:R, Notes and Review are matched automatically, however you named them in Notion. Rows without a usable P&L value are skipped, and you'll see how many were imported.
5. Import only adds trades — it never replaces or deletes what you already have.

## Screenshots
When adding or editing a trade, tap **+ Add** under Screenshot to attach a chart image (camera or gallery). Images are shrunk automatically before saving, but they still add up — a phone can typically hold a few thousand trades with photos before local storage fills up. Back up (Settings → Backup everything) if you rely on screenshots.

## App lock
Settings → **App lock** lets you set a passcode for this device. It's a screen lock only — there's no account, and it doesn't sync or encrypt your data; anyone with direct access to your browser's storage could still read it. If you forget the passcode, the only way back in is to clear the site's storage in your browser settings, which also erases your trades — so keep backups.

## Notes
- Data is stored per browser and per device. Use **Settings → Backup** to move it between devices.
- Clearing browser data deletes your trades. Back up first.
- This is a record-keeping tool, not financial advice.
