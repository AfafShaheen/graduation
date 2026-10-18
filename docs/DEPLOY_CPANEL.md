# Deploying to the cPanel shared host (no Docker)

Written for someone with **cPanel only** (no shell, no Terminal). Where a step
can also be done from a laptop, that is noted.

Everything new is driven by env vars whose defaults equal the local dev /
Docker behaviour, so nothing here changes local development.

---

## 1. Server facts and layout

- Parahost, cPanel 136, package "1GB-Parahost", AlmaLinux-9-style,
  LiteSpeed/Apache-compatible, Python apps via Passenger ("Setup Python App").
- Home: `/home/sunionhomsuni`. Shared hosting: no root, no Docker, no shell.
- **One domain only: `sunion-homs-uni.sy`** — everything lives on sub-paths.
- **DO NOT TOUCH:** `/home/sunionhomsuni/wijhatak` (old Python app at `/api`),
  `public_html/app`, `public_html/api`, `guide`, `yawmi`, `public_html/.htaccess`.
- Python 3.11.17 chosen for the app.
- PostgreSQL via cPanel: database `sunionhomsuni_graduation`, user
  `sunionhomsuni_graduation_user`, **PostgreSQL 13.23** on `localhost:5432`.
- Redis via cPanel "Redis Server": `127.0.0.1`, port **51145**, DB index **1**.
  Never use "Flush Database". The server may stop unexpectedly.
- HTTPS via AutoSSL works for the main domain.

| Part | Where |
|---|---|
| Frontend | `https://sunion-homs-uni.sy/graduation/` → `public_html/graduation` |
| Backend | Python App URL `sunion-homs-uni.sy/gradapi`, root `/home/sunionhomsuni/graduation_back`, Python 3.11.17, startup file `passenger_wsgi.py`, entry point `application` |
| Database | `sunionhomsuni_graduation` on `localhost:5432` |
| Redis | `127.0.0.1:51145`, DB index 1 |

Public API: `https://sunion-homs-uni.sy/gradapi/api/...`

---

## 2. Backend upload

1. On your laptop, zip `back/` **without** `__pycache__`, `.env`, `tests/`,
   `.pytest_cache`:

   ```powershell
   # from the repo root, example using tar (PowerShell 5.1+ has no Compress-Archive filters)
   cd back
   tar -a -c -f ../back.zip --exclude=__pycache__ --exclude=.env --exclude=tests --exclude=.pytest_cache .
   ```

2. Upload `back.zip` in cPanel **File Manager** and extract it into
   `/home/sunionhomsuni/graduation_back` (so that
   `/home/sunionhomsuni/graduation_back/passenger_wsgi.py` exists).

3. In **Setup Python App** (`gradapi`):
   - Python version: **3.11.17**
   - Application root: `/home/sunionhomsuni/graduation_back`
   - Application startup file: `passenger_wsgi.py`
   - Application entry point: `application`
   - Application URL: `sunion-homs-uni.sy/gradapi`

4. Click **Run Pip Install** on `requirements.txt`. This can take several
   minutes because of `pandas` (it has wheels for Python 3.11, so it should
   not compile anything).

5. Add **every** env var from `back/.env.cpanel.example` on the Python App
   page. Generate real secrets first (see the file's comments): a new random
   64+ char `JWT_SECRET_KEY` (`openssl rand -hex 32`), the database user's
   password URL-encoded, the Redis password URL-encoded, and the mailbox
   password. Special characters in passwords must be URL-encoded:
   `@` → `%40`, `#` → `%23`, `/` → `%2F`, `:` → `%3A`.

6. **Restart** the Python app.

---

## 3. Database first-time setup

The Alembic baseline `0001_baseline` is intentionally empty — the real schema
comes from `back/migrations/0001_init_schema.sql`, which only runs
automatically under Docker. On cPanel, `scripts/run_migrations.py` applies it
itself, then upgrades. It never drops, truncates or downgrades anything.

First check the version the script prints (the server is expected to be
PostgreSQL 13.23): `gen_random_uuid()` is built in on 13+. On ≤ 12 the script
stops and asks support to run `CREATE EXTENSION pgcrypto;`.

How to run `scripts/run_migrations.py`, in order of preference:

1. **Ask support to enable the shell**, then run from the app's virtualenv:

   ```bash
   cd /home/sunionhomsuni/graduation_back
   source /home/sunionhomsuni/graduation_back/passengervenv/bin/activate  # path shown in Setup Python App
   python scripts/run_migrations.py
   ```

2. **cPanel "Execute python script"** on `scripts/run_migrations.py` (the
   Python App env vars, including `DATABASE_URL`, are available to it).

3. **From a laptop** with Remote PostgreSQL and your IP whitelisted
   (temporarily), setting `DATABASE_URL` to point at the server.

If the script fails with `permission denied for schema public`, fix it via
phpPgAdmin as the database owner (or ask support):

```sql
GRANT ALL ON SCHEMA public TO sunionhomsuni_graduation_user;
```

Then re-run the script.

It prints `SUCCESS` at the end (and the current revision before/after). Run it
again to confirm it is now a no-op that just upgrades to head.

### Creating the admin

`create_admin.py` is interactive (no terminal on cPanel), so use the env-based
variant. Set `ADMIN_USERNAME` and `ADMIN_PASSWORD` on the Python App page
(production requires ≥ 12 characters), then run
`scripts/create_admin_from_env.py` via "Execute python script". **Delete
`ADMIN_PASSWORD` afterwards** and restart the app.

---

## 4. Redis

- In cPanel **Redis Server**: Start Server, read the port (expected 51145),
  keep **DB index 1** in `REDIS_URL`. Never use "Flush Database".
- If Redis stops: logins, registration, OTP and token revocation stop working
  for a moment — details below. Everything else (rate limits, caches) already
  fails open.
- The auth token blacklist is checked in Redis on every authenticated request.
  It is designed to **fail closed** (HTTP 503) when Redis is unreachable, so a
  logged-out token cannot be replayed. On shared hosting where Redis may stop,
  this would break every logged-in user while Redis is down.
  `AUTH_REDIS_FAIL_OPEN=true` switches to **fail open**: a warning is logged
  and the request is allowed. **Trade-off:** while Redis is down, a token that
  was logged out could still be used until it expires.
- The Redis client also uses `socket_connect_timeout=2` / `socket_timeout=2`,
  so a hung Redis cannot hang requests.
- `DB_POOL_SIZE` / `DB_MAX_OVERFLOW` control the asyncpg pool (defaults 20/10;
  the example uses 3/2 for shared-host connection limits).

---

## 5. Email (OTP)

- Create a mailbox in cPanel (e.g. `no-reply@sunion-homs-uni.sy`).
- Use host `mail.sunion-homs-uni.sy` (or the server hostname if the
  certificate doesn't match the domain), **port 587 with STARTTLS**. The code
  uses plain `smtplib.SMTP` + `starttls()` — there is **no SSL on 465**.
- If `APP_ENV` is not `development`/`test` and SMTP is not configured, OTP
  sending returns failure. Set `APP_ENV=production` only after SMTP works.
- Test with the forgot-password flow.
- Note: the forgot-password email is sent from a fire-and-forget task. It
  normally works, but if Passenger recycles an idle process right after the
  response, that one email can be lost. The registration OTP is awaited and
  is not affected.

---

## 6. Frontend

```bash
cd front
npm ci
VITE_BASE_PATH=/graduation/ VITE_API_URL=/gradapi VITE_SITE_URL=https://sunion-homs-uni.sy/graduation npm run build
```

PowerShell (Windows):

```powershell
cd front
npm ci
$env:VITE_BASE_PATH="/graduation/"; $env:VITE_API_URL="/gradapi"; $env:VITE_SITE_URL="https://sunion-homs-uni.sy/graduation"; npm run build
Remove-Item Env:VITE_BASE_PATH, Env:VITE_API_URL, Env:VITE_SITE_URL
```

- Upload the **contents** of `dist/` (including the hidden `.htaccess`) into
  `public_html/graduation`. Make sure File Manager is set to **show hidden
  files**, otherwise `.htaccess` is not uploaded.
- `VITE_API_URL=/gradapi` is a relative, same-origin base: requests go to
  `https://sunion-homs-uni.sy/gradapi/api/...` with **no CORS** at all.
  `CORS_ORIGINS=https://sunion-homs-uni.sy` on the backend is a safety net.
- Upload limits: there is no nginx `client_max_body_size` on cPanel.
  LiteSpeed's limit is usually larger than 2 MB; if the university-file upload
  fails, ask support for the current limit.

---

## 7. Smoke tests and rollback

1. `https://sunion-homs-uni.sy/gradapi/health` → health JSON. On 404, compare
   with `/gradapi/gradapi/health` and report whether Passenger strips the
   prefix (the `passenger_wsgi.py` wrapper strips it defensively either way).
2. `https://sunion-homs-uni.sy/gradapi/api/registration/colleges` → JSON.
3. `https://sunion-homs-uni.sy/graduation/` loads. A hard refresh on
   `/graduation/login` and `/graduation/admin` still works, and the browser
   console shows no CORS or 404 asset errors.
4. Admin login; graduate registration with the OTP email; scanner login and
   camera over HTTPS.
5. Stop Redis in cPanel, then repeat admin login: it should work with
   `AUTH_REDIS_FAIL_OPEN=true`, or show 503 without it.

**Rollback:** delete `public_html/graduation`, stop/remove the `gradapi` Python
app, and drop the database if needed. The old event (`/api`, `public_html/app`)
is unaffected.

---

## 8. Updating later

1. Re-upload the changed files into `graduation_back` / `public_html/graduation`.
2. **Restart** the Python app.
3. If there are new migrations, run `scripts/run_migrations.py` again
   (it is a no-op when the database is already at head).
4. For frontend changes: rebuild (section 6) and re-upload `dist/`.

---

## 9. Security notes

- Everything on the domain shares one browser origin: an XSS bug anywhere on
  `sunion-homs-uni.sy` could read this app's `sessionStorage` tokens.
- Delete `ADMIN_PASSWORD` from the Python App env vars after creating the
  admin.
- `JWT_SECRET_KEY` must be new and unique (never reused from another install).
- Passwords in `DATABASE_URL` / `REDIS_URL` / `SMTP_PASSWORD` must be
  URL-encoded (`@` → `%40`, `#` → `%23`, `/` → `%2F`, `:` → `%3A`).
- Keep `back/.env.cpanel.example` placeholder-only; never commit real secrets.

---

## Approved optional hardening (already implemented)

- **6.1 `AUTH_REDIS_FAIL_OPEN`** — fail-open auth blacklist when Redis is down
  (section 4). When `REDIS_URL` is empty the Redis client now points at a
  closed port so every call fails fast; socket timeouts (2 s) keep a hung
  Redis from hanging requests. Default stays `false` (today's fail-closed
  behaviour); the example env file sets `true` for cPanel.
- **6.2 `DB_POOL_SIZE=3` / `DB_MAX_OVERFLOW=2`** — smaller asyncpg pool for
  shared-host PostgreSQL connection limits (code default stays 20 / 10).
