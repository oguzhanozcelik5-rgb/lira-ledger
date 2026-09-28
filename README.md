# Lira Ledger

A phone app (PWA) for everyday spending in Turkish lira, with every amount also shown in pounds.

- **Home**: this month's spending in ₺ and £, spend per day, how it compares with last month so far,
  your regulars (one tap to add Kahve again) and recent entries. Tap the dark card to swap ₺ and £.
- **Add** (red +): keypad, lira or pounds, category, date. Typing a note picks the category for you.
- **Stats**: week, month or year. Bar chart with the average, categories with their change vs the last period,
  and the biggest entries.
- **History**: search and filter by category.
- **Settings**: exchange rate (updates itself), monthly budget in £, categories, backup and import.

Each entry keeps the exchange rate of the day it was added, so older months stay accurate.
Imported Dime history uses the Bank of England monthly average rate for its month.

## Where the data lives

Only on the phone (browser storage). Nothing is uploaded, and this repository holds no personal data.
Use Settings → Save backup now and then, and Import file to restore it or bring in a Dime CSV export.

## Exchange rate

The app fetches GBP/TRY from open.er-api.com (falls back to the ECB rate via frankfurter.app) when opened,
at most every few hours. Offline, it keeps the last rate. You can also type a rate in Settings.

## Install

Open the GitHub Pages link in Safari on the iPhone → Share → Add to Home Screen.
