# Gambo — fake-money casino

Static site (HTML/JS) + Supabase auth. Games: Coin Flip, Dice, Slots. Coins are fake.

## Setup
1. Create a project at supabase.com.
2. SQL Editor → paste and run `supabase.sql`.
3. Project Settings → API → copy the URL and anon key into `config.js`.
4. Authentication → URL Configuration → set Site URL to `https://reallyconnorc.com/gambo/`.

## Host at reallyconnorc.com/gambo
If reallyconnorc.com is already a GitHub Pages site (repo `<you>/<you>.github.io` with a custom domain),
put these files in a `gambo/` folder in that repo and push.
Or make a new repo named `gambo`, push these files, and enable Pages (Settings → Pages → main branch).
User/org Pages with a custom domain serve project repos at `reallyconnorc.com/gambo/`.

Run locally: `npx serve .` then open http://localhost:3000
