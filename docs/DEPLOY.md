# Putting Nomen live on Render

Nomen runs as one web service and one Postgres database on [Render](https://render.com), set up from `render.yaml`.
Every push to `main` on GitHub redeploys it automatically.

**Cost:** roughly US$13 a month at Render's current list prices (Starter web service plus the smallest paid
Postgres). Check Render's pricing page for today's figures. AI and Google costs only start once you go fully live.

## 1. Create it (about 10 minutes, once)

1. Sign in at [dashboard.render.com](https://dashboard.render.com) and connect your GitHub account if you haven't.
2. **New → Blueprint**, pick the `sankeerth452-netizen/nomen` repository and the `main` branch.
3. Render reads `render.yaml` and shows two things to create: **nomen** (the website) and **nomen-db** (the database).
4. It asks for the values marked "sync: false":
   - **OWNER_USERNAME**: the username you'll sign in with, e.g. `sankeerth`.
   - **OWNER_PASSWORD**: at least 12 characters. Use a password manager; don't reuse one.
   - **ANTHROPIC_API_KEY, ANTHROPIC_MODEL, DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD**: leave these **blank** for now.
     The first deploy is a preview with example results.
5. **Apply.** The first build takes about 5 to 10 minutes. The database is created, the tables are set up, the
   Sportsgirl brand and your owner login are added automatically.
6. Open the address Render gives the **nomen** service (something like `https://nomen-xxxx.onrender.com`) and
   sign in.

## 2. Get it ready for people

1. **Keywords** page: upload the brand's keyword export (Ahrefs or Keyword Planner, CSV or Excel), tell it what
   each column is, save, then **Use this list**. For a quick demo, `tests/fixtures/keywords.csv` works.
2. **Logins** page: create a login for each buyer (role Buyer, brand Sportsgirl). Copy the password it shows;
   it isn't shown again.

## 3. Going fully live (real AI and real Google results)

Do this when you have the keys, ideally after one test run on your computer with them.

1. In Render, open **nomen → Environment** and fill in `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (`claude-opus-5-5`,
   the model it was tested with), `DATAFORSEO_LOGIN` and `DATAFORSEO_PASSWORD` (the API password from DataForSEO's
   dashboard, not the website password).
2. In `render.yaml`, change `PROVIDER_MODE` from `mock` to `live`, commit and push. Render redeploys, and the
   "Preview version" strip disappears.
3. Name one real piece and check the result by eye before telling the team. The AI and Google connections have
   only been tested against stand-ins so far.

## If something goes wrong

- **Deploy failed:** open the failed deploy in Render and read the log. A missing setting is named there.
- **Can't sign in:** check OWNER_USERNAME/OWNER_PASSWORD in Environment, then look for "Owner login not created" in
  the deploy log (usually a password under 12 characters). Fix it and click **Manual Deploy**.
- **Site asleep or slow:** the Starter plan doesn't sleep; the first page after a deploy can take a few seconds.
