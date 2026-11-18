# Deploying the MARS scaffold (Railway API + Render web)

End-to-end runbook for the deployed demo:

```
Railway project (environment: production)
├── Postgres     managed PostgreSQL (private network)
└── api          /backend/app   NestJS 12 + Prisma 6   → https://<api>.up.railway.app

Render (free web service)
└── web          /frontend/app  Next.js 16 App Router   → https://scaffold-e1bt.onrender.com

Browser ──HTTPS──> Render web ──fetch(credentials)──HTTPS──> Railway api ──private network──> Postgres
```

Email is sent from the Railway API through the **Gmail API over HTTPS**
(`EMAIL_TRANSPORT=gmail-api`, ADR 0005). Railway and Render block outbound SMTP, so
Mailtrap/Gmail SMTP cannot be used from the deployed backend; Gmail API over HTTPS is the
deployed transport. `smtp` and `resend` remain available for local development.

Current deployed URLs (confirm in the dashboards; they are what the Render build has baked in):

- Web: `https://scaffold-e1bt.onrender.com`
- API: `https://scaffold-production-feb0492c.up.railway.app`

> If the API domain changes, update `NEXT_PUBLIC_API_URL` on Render and **redeploy with a
> cleared build cache** (the value is inlined at build time), and update `CORS_ORIGIN` /
> `FRONTEND_URL` on Railway.

---

## 0. Prerequisites

- [ ] Railway account with an active plan/credit (an always-on API + Postgres needs Hobby
      or trial credit; an inactive service answers `502`).
- [ ] Render account with the `scaffold` web service already created (it is deployed).
- [ ] GitHub repo `kushirooo/scaffold` and the branch you will deploy. Railway builds from
      GitHub, not from your laptop; commit and push first.
- [ ] Google Cloud project `raf-consult-pms` (OAuth client already exists) with the Gmail API
      enabled and `rafconsultpms@gmail.com` available for consent.
- [ ] Node 24 is pinned by `.nvmrc` in `backend/app` and `frontend/app`.

---

## 1. Railway project and database

1. Railway → **New Project → Empty Project** (`raf-pms-staging` or similar).
2. **+ New → Database → PostgreSQL**; keep the service name `Postgres` (the variable
   reference below depends on it) and leave it on private networking.
3. Railway injects `DATABASE_URL` into that service; the API references it — never copy it.

## 2. Railway API service

1. **+ New → Empty Service**, name it `api`.
2. **Settings → Source → Connect Repo** → `kushirooo/scaffold` → your branch.
3. **Root Directory** = `/backend/app`.
4. **Settings → Deploy → Custom Start Command** = `npm run start:prod`
   (= `node dist/main`; do not use `npm start`, that is the Nest dev server).
5. **Pre-Deploy Command** = `npm run db:migrate` (`prisma migrate deploy`). It runs after the
   build, before traffic, and fails the deploy if a migration fails.
6. **Healthcheck Path** = `/health` (returns `200 {"status":"ok","db":"up"}` only when the DB
   answers `SELECT 1`).
7. Optional **Watch Paths** = `/backend/app/**`.
8. Pick a region near the users (e.g. Southeast Asia/Singapore) **before** the first deploy.
9. Do **not** set `PORT`; Railway injects it and the app reads it.

## 3. Railway API domain

Service `api` → **Settings → Networking → Public Networking → Generate Domain**.
Copy the HTTPS origin, e.g. `https://scaffold-production-feb0492c.up.railway.app`.

## 4. Railway API environment variables

Service `api` → **Variables → Raw Editor**. Set all of these, then redeploy:

| Variable | Value | Notes |
| --- | --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | **Add Reference Variable** (private network). |
| `JWT_SECRET` | `openssl rand -base64 48` | 32+ characters or boot fails. |
| `JWT_TTL_SECONDS` | `3600` | Session/access lifetime. |
| `CORS_ORIGIN` | `https://scaffold-e1bt.onrender.com` | Exact origin, no trailing slash, no `*`. |
| `FRONTEND_URL` | `https://scaffold-e1bt.onrender.com` | Same value; used in email links. |
| `COOKIE_SECURE` | `true` | Required in production. |
| `COOKIE_SAMESITE` | `none` | Render and Railway are different sites, so the cookie must be cross-site. |
| `EMAIL_TRANSPORT` | `gmail-api` | See §7; missing → the confirmed boot crash below. |
| `MAIL_FROM` | `RAF Consult PMS <rafconsultpms@gmail.com>` | Its address **must equal** `GMAIL_SENDER`. |
| `GMAIL_CLIENT_ID` | OAuth client id | From the client JSON (`…apps.googleusercontent.com`). |
| `GMAIL_CLIENT_SECRET` | OAuth client secret | Never commit this. |
| `GMAIL_REFRESH_TOKEN` | refresh token, scope `gmail.send` | Generate after publishing the OAuth app (§7). |
| `GMAIL_SENDER` | `rafconsultpms@gmail.com` | The authorised Gmail account. |
| `GMAIL_FROM_NAME` | `RAF Consult PMS` | Optional; defaults to `MAIL_FROM`'s display name. |
| `ADMIN_ALERT_EMAIL` | `rafconsultpms@gmail.com` (or a monitored inbox) | Required in production; receives send-failure alerts. |
| `INVITE_TTL_SECONDS` / `RESET_TTL_SECONDS` | `86400` / `900` | Optional defaults. |

Optional: `OBSERVE_APP_KEY` / `OBSERVE_APP_SECRET` for NestJS Observe telemetry.
Do not add `NODE_ENV` — Railpack sets `NODE_ENV=production` at runtime.

### Confirmed 502 root cause (18 Nov 2026)

The Railway API was returning `502 Application failed to respond`. The deploy log showed:

```
ERROR [ExceptionHandler] Error: EMAIL_TRANSPORT is required in production
  at parseEmailTransport (/app/src/config/env.validation.ts:127)
```

The app validates its environment at boot and exits when a production value is missing. The
earlier variables (`CORS_ORIGIN`, `FRONTEND_URL`, `JWT_SECRET`, `DATABASE_URL`, cookies)
passed; only the email variables were missing. Fix: deploy the Gmail transport code, then set
the email variables above and redeploy.

## 5. Render web service

Render → **scaffold** web service → Settings:

- **Root Directory**: `frontend/app`
- **Build Command**: `npm ci && npm run build`
- **Start Command**: `npm run start`
- **Environment**: `NEXT_PUBLIC_API_URL=https://<railway-api-domain>` (no trailing slash)
- **Node version**: 24 (Render `NODE_VERSION=24` if `.nvmrc` is not picked up)

`NEXT_PUBLIC_API_URL` is inlined at build time: after changing it, **Clear build cache &
deploy**. Render's free tier sleeps after ~15 minutes idle and takes ~1 minute to wake; its
512 MB instance can OOM on `next build` — retry or build locally to confirm the current commit
is green (`NEXT_PUBLIC_API_URL=… npm run build`).

## 6. First successful deploy

1. Redeploy `api` (or push the branch). Build log should show Node `24.x`,
   `npm install` → `prisma generate` → `nest build`; then the pre-deploy migration; then the
   app listening and `GET /health` succeeding.
2. Smoke:

```bash
curl -i https://<api>/health        # 200 {"status":"ok","db":"up"}
```

3. Seed the demo accounts once (only if the database is fresh). The seed refuses to run with
   `NODE_ENV=production` unless `ALLOW_DEMO_SEED=true`:
   - temporarily add `SEED_PASSWORD=<12+ chars>` and `ALLOW_DEMO_SEED=true`;
   - temporarily set Pre-Deploy Command to `npm run db:migrate && npm run db:seed`;
   - redeploy; confirm in logs; then revert the pre-deploy command to `npm run db:migrate`,
     remove `ALLOW_DEMO_SEED`, and redeploy.
4. Verify the frontend origin: `https://scaffold-e1bt.onrender.com/login` loads, and browser
   DevTools → Network shows no CORS errors calling the Railway API.

## 7. Gmail API setup (manual, one time)

The Google Cloud project and OAuth web client already exist
(`project_id: raf-consult-pms`, redirect URI `https://developers.google.com/oauthplayground`).

1. **Enable the Gmail API** (already confirmed): APIs & Services → Library → Gmail API → Enable.
2. **OAuth consent screen** → External:
   - add the scope `https://www.googleapis.com/auth/gmail.send`;
   - add `rafconsultpms@gmail.com` under **Test users**.
3. **Publish the app before demo day.** Click **Publish App** → status *In production*.
   With a *Testing* status Google expires refresh tokens after ~7 days; publication removes
   that cap. Because `gmail.send` is a restricted scope, Google may still show an
   "unverified app" warning and may ask for verification — for a course demo with the team's
   own accounts, continue past the warning. If publishing is blocked, keep the app in Testing
   and regenerate the refresh token the day before the demo (Friday 2026-11-20, UTC+8).
4. **Get the refresh token** after publishing:
   - open <https://developers.google.com/oauthplayground>;
   - ⚙️ → *Use your own OAuth credentials* → paste the client id + secret;
   - Step 1: scope `https://www.googleapis.com/auth/gmail.send` → **Authorize APIs** → sign in
     as `rafconsultpms@gmail.com` → allow;
   - Step 2: **Exchange authorization code for tokens** → copy the **Refresh token**.
5. Put the refresh token in Railway `GMAIL_REFRESH_TOKEN` (never in git). Add the other
   `GMAIL_*` variables from §4 and redeploy.
6. Confirm from the deploy logs that the validation error is gone, then send a test email
   (§8).

> If Rotate/revoke happens later, refresh fails with `invalid_grant`; email stops but accounts
> and password resets still succeed (ADR 0004/0005). Regenerate the token and update Railway.

## 8. End-to-end verification (demo evidence)

Use **real recipient addresses**: Gmail cannot deliver to the seeded `@rafconsult.test`
addresses. The seeded accounts are for logging in, not for receiving mail.

1. Log in as `admin@rafconsult.test` (password = `SEED_PASSWORD`) at the Render URL.
2. `/users` → create a user with a **real Gmail address** (e.g. a teammate's or
   `rafconsultpms@gmail.com`): the welcome/activation email should arrive from
   `RAF Consult PMS <rafconsultpms@gmail.com>`.
3. Open the activation link (built from `FRONTEND_URL`), set a password, sign in.
4. Forgot-password on that account → the reset email arrives → link opens
   `/reset-password?token=…` → set a new password → sign in.
5. Cookie check: DevTools → Application → Cookies → `mars_at` is `HttpOnly`, `Secure`,
   `SameSite=None`, `Path=/`; CSRF header is required on non-GET requests (`403` without it).
6. Capture: inbox screenshot(s), `/health` response, the deploy log excerpt, and the
   terminal output of the staging smoke script:

```bash
BASE_URL=https://<api> \
SMOKE_EMAIL=pm@rafconsult.test \
SMOKE_PASSWORD='<SEED_PASSWORD>' \
bash scripts/smoke-staging.sh
```

7. Record the result in `docs/qa/verification-us18.md` / `verification-us19.md` (inbox
   screenshot path, timestamp, recipient) **only after** the live send succeeds. Do not
   record "delivered" claims beyond what was seen.

## 9. Cross-site cookies and Render

Render (`onrender.com`) and Railway (`up.railway.app`) are different sites, so the httpOnly
session cookie must be `SameSite=None; Secure` (already configured above; the API also sets
`trust proxy`). Chrome's demo flow works; Safari/Firefox may block the third-party cookie. For
the demo, use Chrome. A custom domain pair (`app.example.com` + `api.example.com`) would make
the cookie first-party, but the team has no domain; record the limitation in the review.

## 10. Railway CLI (optional)

```bash
npm i -g @railway/cli
railway login
cd ~/Projects/scaffold
railway link                 # select project + environment
railway status
railway logs --service api
railway variable list --service api
railway variable set KEY=VALUE --service api
railway redeploy --service api
railway connect Postgres     # psql through an SSH tunnel
```

Local `npm run db:migrate`/`db:seed` cannot reach the Railway DB directly: the injected
`DATABASE_URL` uses `postgres.railway.internal`. Use the pre-deploy command, `railway ssh`, or
`railway connect Postgres` (or temporarily use the public TCP proxy URL).

## 11. Demo-day checklist (Friday 2026-11-20, UTC+8)

- [ ] OAuth app **In production**, refresh token generated **after** publishing and stored in
      Railway (`GMAIL_REFRESH_TOKEN`).
- [ ] Railway `api` deployment is Active; `/health` returns 200; no boot error in logs.
- [ ] Render web service awake (open it ~5 minutes before the demo; free tier sleeps).
- [ ] Browser is Chrome; login works from Render → Railway and the `mars_at` cookie is present.
- [ ] Create a user with a real Gmail address → welcome email arrives; open activation link.
- [ ] Forgot-password → reset email arrives; reset link works.
- [ ] Screenshots of the inbox (From, subject, link) and of the reset flow captured.
- [ ] `scripts/smoke-staging.sh` passes against the deployed API.
- [ ] If the refresh token was generated while the app was in Testing and is >7 days old,
      regenerate it before the demo.

## 12. Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| `502 Application failed to respond`; logs show `… is required in production` | Missing/invalid Railway variable. The log names it; set it and redeploy. Confirmed cause on 18 Nov: `EMAIL_TRANSPORT` unset. |
| Boot fails `MAIL_FROM address must match GMAIL_SENDER` | Set `MAIL_FROM="RAF Consult PMS <rafconsultpms@gmail.com>"` (same address as `GMAIL_SENDER`). |
| Boot fails `GMAIL_… is required when EMAIL_TRANSPORT=gmail-api` | Add the missing Gmail variable in Railway. |
| `/health` returns 503 `db: down` | `DATABASE_URL` not a reference to `${{Postgres.DATABASE_URL}}`, wrong service name, or Postgres starting; redeploy. |
| Emails fail with `invalid_grant` | Refresh token expired/revoked (Testing mode or password change). Regenerate via OAuth Playground and update Railway. |
| Gmail 403/400 about From/recipient | `GMAIL_SENDER` is not the authorised account, or the recipient is invalid (`@rafconsult.test` is not deliverable — use real Gmail addresses). |
| Gmail 429 / daily limit message | Account sending quota (~500 recipients/day); wait or use another account. |
| `Deployment failed` at pre-deploy | Migration failed; read pre-deploy logs, fix data/migration, redeploy. |
| Login fails / cookie missing in browser | `CORS_ORIGIN` not the exact Render origin (no trailing slash, https), or `COOKIE_SAMESITE=none` without `COOKIE_SECURE=true`. |
| Safari/Firefox login drops the session | Third-party cookie blocking; demo in Chrome or use same-site custom domains. |
| Frontend says "Unable to connect to the server" | `NEXT_PUBLIC_API_URL` wrong/empty at build time; fix and redeploy with a cleared build cache. |
| Render build OOM | Free instance 512 MB; retry or reduce build parallelism; confirm `npm run build` locally. |

## 13. Rollback, cost, secrets

- Rollback: Railway service → Deployments → previous deploy → Redeploy. Database migrations
  are not rolled back; keep them additive.
- Cost: Railway Hobby/trial credit for API + Postgres; Render free tier for web (sleeps).
- Secrets: only in Railway/Render variables. Never commit `GMAIL_CLIENT_SECRET`,
  `GMAIL_REFRESH_TOKEN`, `JWT_SECRET`, or `SEED_PASSWORD`; the OAuth client JSON stays outside
  the repository.
- Evidence: `docs/qa/evidence-template.md` and the per-story verification docs.
