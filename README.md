# Groceries

A shared grocery list for two phones: list sections, saved recipes, a weekly meal plan, and price history from the stores you shop at (Aldi, Walmart, Target, or any you add).

It's an installable web app (PWA) backed by Supabase for email-code sign-in and live sync.

## Features

- **List** grouped by section (Produce, Meat & Seafood, Dairy & Eggs, Pantry, Frozen, Household, Other). New items land in a best-guess section, or the one you used last time. Tap an item to change its section or quantity.
- **Shopping at** picks a store; each item shows its last price there, flags a cheaper store, and the list shows an estimated total.
- **In the cart**: check items off and type what you paid to build price history.
- **Recipes**: save ingredients (one per line, quantities like "2 cups" are split out) and add them all to the list in one tap.
- **Meals**: plan the week and add every planned recipe's ingredients at once.
- **Prices**: log a price by hand, compare stores per item, and fix mistakes.
- **Sharing**: one person creates the household, the other joins with its 6-letter code (⚙️ on any screen). Changes sync live.

## One-time Supabase setup

1. Supabase dashboard → **SQL Editor** → New query → paste `supabase/schema.sql` → **Run**.
2. **Authentication → Emails → Magic Link** template: add the line `Your code: {{ .Token }}` so sign-in emails include the 6-digit code the app asks for.
3. **Authentication → URL Configuration**: set Site URL to the app's address (e.g. `https://retrosplurge.github.io/Groceries/`) and add the same to Redirect URLs. Add `http://localhost:5173/` too if you run it locally.

## Run locally

```sh
npm install
cp .env.example .env.local   # fill in your Supabase URL and publishable key
npm run dev
```

With no `.env.local`, the app runs in demo mode: data stays in that browser, and two tabs sync with each other.

## Deploy

Pushing to `main` builds and publishes to GitHub Pages via `.github/workflows/deploy.yml` (repo Settings → Pages → Source: GitHub Actions).

## Install on a phone

Open the app's address, then **Share → Add to Home Screen** (iPhone Safari) or **⋮ → Install app** (Android Chrome).
