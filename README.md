# Claude Cert Practice

**A free, open-source study app for the four Claude certification exams: _Associate – Foundations_ (CCAO-F), _Developer – Foundations_ (CCDV-F), _Architect – Foundations_ (CCAR-F) and _Architect – Professional_ (CCAR-P).** Pick one when you sign up and switch from the top bar at any time; each keeps its own progress, flashcards and exam date. Timed mock exams, domain drills, spaced-repetition flashcards, an AI tutor and charts of where you lose marks — in English and Spanish, synced across your devices.

**Try it:** https://exam.jarsss8.es · **Español:** [README.es.md](README.es.md)

> Independent community project. Not created, sponsored or endorsed by Anthropic. Passing a mock here does not guarantee passing the real exam.

<p>
  <img src="docs/screenshots/home.png" alt="Home: next step, readiness estimate and where to gain points" width="640">
  <img src="docs/screenshots/exam.png" alt="Exam simulation on a phone" width="200">
</p>
<p>
  <img src="docs/screenshots/where-you-miss.png" alt="Share of answers missed per domain" width="420">
  <img src="docs/screenshots/trend.png" alt="Hit rate trend per domain" width="420">
</p>
<p>
  <img src="docs/screenshots/pick.png" alt="First run: choosing the certification to prepare" width="200">
  <img src="docs/screenshots/switcher.png" alt="Switching certification from the top bar on a phone" width="200">
  <img src="docs/screenshots/plan.png" alt="Study plan: what to prioritise, the week you are in, the exam-week checklist" width="420">
</p>

## What it does

| | |
| --- | --- |
| **Mock exams** | Full mocks with the real length (60, 53, 60 or 63 questions, 120 minutes) weighted like each blueprint, a 15-question quick mock at the real pace, the repo's three mocks and the official guide's samples. Always in English, like the real exam. |
| **Domain drills** | 10 questions from one domain with instant feedback and an explanation, favouring what you have not seen. |
| **Readiness estimate** | A 100–1000 range from your *first* attempts only, re-weighted by domain, with the 720 pass mark. |
| **Charts** | Where you miss most (by marks lost), trend per domain, most-missed questions, history of mocks. |
| **Flashcards** | FSRS spaced repetition; questions you miss join the deck automatically. |
| **Study guide** | In Notes: the pairs the exams make you tell apart, the courses (and official prep path) for your certification with Anthropic's own videos, and a three-week plan that marks the week you are in from your exam date, with the exam-week checklist. |
| **AI tutor** *(optional)* | Ask why an option is wrong. It only talks about the question in front of you. |
| **AI questions** *(optional)* | Generates new items grounded in the notes, checked by a second model before they are kept. |
| **Two languages** | Interface, notes, flashcards, drills and tutor in English or Spanish. |
| **Your data** | Export everything as JSON or your answers as CSV; delete your account and all its data in one click. |
| **Works offline** | Progress is saved locally first and synced when you are back online. |

### Built to measure honestly

- **Options are shuffled on every attempt.** In the source bank the right answer follows fixed letter patterns and is often the longest option; without shuffling you pass by pattern.
- **Only first attempts count towards readiness.** Repeating a question measures memory, not readiness. Near-duplicate questions count once.
- **Exam simulations stay in English**, interface included, because the real exam is in English (or Japanese).

## How it works

```
Browser (React SPA, local-first)  ──HTTPS──▶  one Cloudflare Worker  ──▶  D1 (SQLite)
                                                  ├─ static assets (the SPA)
                                                  ├─ /api/auth/*  Better Auth (email + password, Google, GitHub)
                                                  ├─ /api/*       state, sync, AI tutor, question generation
                                                  └─ optional: DeepSeek API (AI), Cloudflare Email Service (password reset)
```

| Part | Technology |
| --- | --- |
| Frontend | React 19, Vite, TypeScript. No UI framework; one CSS file with design tokens (light and dark). |
| Backend | A single Cloudflare Worker with static assets. |
| Database | Cloudflare D1. Every row belongs to a user and is deleted with them. |
| Accounts | [Better Auth](https://www.better-auth.com) inside the Worker. Passwords hashed with PBKDF2-SHA256 (WebCrypto). |
| AI | [DeepSeek](https://platform.deepseek.com) API, optional, with per-user and global daily caps. |
| Email | Cloudflare Email Service, optional, only for password reset. |

The app is **local-first**: every action is applied to a local copy and queued; the queue is sent to `/api/sync`, validated on the server and written in one batch. The newest write wins across devices, and only the device holding an exam attempt can answer it.

## Run it locally

You need **Node.js 24+** and npm. No Cloudflare account is needed to run it locally.

```bash
git clone https://github.com/JarssS8/ccdvf-practice.git
cd ccdvf-practice
npm install

cp .dev.vars.example .dev.vars
# edit .dev.vars and set BETTER_AUTH_SECRET to a random value, e.g. the output of:
openssl rand -base64 32

npx wrangler d1 migrations apply ccdvf-practice --local
npm run build
npx wrangler dev --local-upstream localhost:8787
```

Open http://localhost:8787 and create an account. The local database lives in `.wrangler/`.

`--local-upstream` keeps the request host as `localhost`; without it Wrangler rewrites it to the production domain and sign-in fails the origin check. After changing frontend code, run `npm run build` again (Wrangler serves `dist/`).

## Deploy your own

1. **Cloudflare account and Wrangler login**
   ```bash
   npx wrangler login
   ```
2. **Create the database** and copy the `database_id` it prints:
   ```bash
   npx wrangler d1 create ccdvf-practice
   ```
3. **Edit `wrangler.jsonc`:**
   - `name`: your Worker's name.
   - `d1_databases[0].database_id`: the id from step 2.
   - **Domain:** with your own domain on Cloudflare, set `routes` to it. Without one, delete `routes` and set `"workers_dev": true`.
   - `vars.BETTER_AUTH_URL`: the public URL (`https://your.domain` or `https://<name>.<subdomain>.workers.dev`).
   - `vars.EMAIL_FROM`: a sender on your domain (only used for password reset).
4. **Set the auth secret:**
   ```bash
   openssl rand -base64 32 | npx wrangler secret put BETTER_AUTH_SECRET
   ```
5. **Create the tables and deploy:**
   ```bash
   npm run db:migrate
   npm run deploy
   ```
6. **Rewrite the legal pages** (`src/legal/info.ts`, `es.ts`, `en.ts`) with your own details before inviting anyone: they name the operator of the site.

### Optional features

| Feature | How to turn it on |
| --- | --- |
| **Google sign-in** | Google Cloud Console → *OAuth consent screen* (External, **Publish**) → *Credentials → OAuth client ID → Web application*. Authorised origin: your URL. Redirect URI: `https://<your-url>/api/auth/callback/google`. Then `npx wrangler secret put GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. |
| **GitHub sign-in** | github.com/settings/developers → *New OAuth App*. Callback URL: `https://<your-url>/api/auth/callback/github`. Then `npx wrangler secret put GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`. |
| **AI tutor and AI questions** | Get an API key at platform.deepseek.com, then `npx wrangler secret put DEEPSEEK_API_KEY`. Tune `AI_USER_DAILY_LIMIT`, `AI_IP_DAILY_LIMIT` and `AI_GLOBAL_DAILY_LIMIT`. Keep the account's prepaid balance low: it is your hard spending cap. |
| **Password reset by email** | Needs Workers Paid. Dashboard → **Compute → Email Service → Email Sending → Onboard Domain**, then set `ACCOUNT_RECOVERY` to `"on"` and deploy. |

Each sign-in provider appears on the sign-in screen only when both of its secrets exist; no redeploy needed.

### Configuration reference

| Name | Kind | Purpose |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | secret, **required** | Signs sessions and tokens. |
| `BETTER_AUTH_URL` | var, **required** | Public URL of the app (also the only trusted origin). |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | secrets | Google sign-in. |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | secrets | GitHub sign-in. |
| `DEEPSEEK_API_KEY` | secret | Enables the AI tutor and question generation. |
| `DEEPSEEK_MODEL` / `DEEPSEEK_CHECK_MODEL` | vars | Model for writing/tutoring and for the blind check. |
| `AI_USER_DAILY_LIMIT` / `AI_IP_DAILY_LIMIT` / `AI_GLOBAL_DAILY_LIMIT` | vars | AI calls per day per user / per network (IP, IPv6 /64) / for the whole app. The per-network cap stops one person multiplying the per-user cap with free accounts. |
| `EMAIL` | `send_email` binding | Cloudflare Email Service. |
| `EMAIL_FROM` | var | Sender address for password-reset emails. |
| `ACCOUNT_RECOVERY` | var | `"on"` shows "Forgot it?" (only after onboarding the sending domain). |

## Tests

```bash
npm test             # unit tests (Vitest): shuffling, scoring, chart data, CSV, i18n parity, translations, reset email
npm run lint:bank   # answer-pattern lint of the question banks (calibrated rules fail the exit code)
npm run test:e2e     # builds, starts the Worker on a throwaway local D1, runs API + headless-browser tests
npm run test:smoke   # checks a deployed instance with a self-deleting account (-- --base <url>, -- --ai)
```

Browser tests drive headless Chromium through `playwright-core`; set `CHROMIUM_PATH` if it is not at `/usr/bin/chromium` (they are skipped otherwise).

## Project structure

```
├─ worker/
│  ├─ index.ts        API: state, batched sync, AI tutor and generation, daily clean-up (cron)
│  ├─ auth.ts         Better Auth config: PBKDF2, rate limits, account linking, password reset
│  └─ email.ts        password-reset email (ES/EN)
├─ src/
│  ├─ views/          pages (Home, Exams, Exam, Results, Progress, Domains, Cards, Notes, Settings, Auth, Legal)
│  ├─ components/     question card, tutor, charts, shared UI
│  ├─ lib/            local-first store, attempt engine, flashcard scheduling, CSV export, auth client
│  ├─ i18n/           en.ts defines every UI string; es.ts must match it (checked by the tests)
│  ├─ legal/          legal notice, privacy, cookies, terms
│  ├─ content/        questions, flashcards, notes, news (+ es/ translations)
│  └─ shared/exam.ts  exam facts and option shuffling, shared with the Worker
├─ migrations/        D1 schema
├─ scripts/           content import, translation checks, local test runner
└─ tests/             unit/, e2e/, smoke.mjs
```

## Content and translations

The questions, flashcards, notes and news are imported from [Amey-Thakur/CLAUDE-CERTIFICATIONS](https://github.com/Amey-Thakur/CLAUDE-CERTIFICATIONS) with `npm run sync` (it expects this folder inside a clone of that repo), one folder per certification in `src/content/<cert-id>/`. The certifications themselves (codes, length, domains and weights) are declared once in `src/shared/certs.ts`; the official guide samples live in `scripts/guide-samples/<cert-id>.json`. Review the diff of `src/content/` and commit it before deploying: the imported text becomes the AI tutor's notes and the bank's answer keys. The guide pages (confusable pairs, courses, study plan, videos) go to `src/content/guide.json`; which certification each course serves is kept in `scripts/course-map.json`, and courses already on Claude Academy but not yet in the study repo in `scripts/extra-courses.json`.

A daily GitHub Action (`.github/workflows/sync-content.yml`) runs the sync against the latest study repo. When the content changes it opens or updates a `content-sync` pull request with the sync log and the Spanish still to translate, and starts CI on it; a person translates, merges and deploys.

Where the study repo has too few distinct questions for a full mock to follow the blueprint, the app adds its own items (`scripts/extra-questions/<cert-id>.json`, source `app`), written from the official exam guide and checked blind by a second model. They appear in mocks and drills with a "Written by the app" label and a link to report them, and never count towards the readiness estimate.

**Calibrated bank.** The study repo's questions were written so that the right option is usually the longest (89% of the Developer bank, 86–95% in the four), which makes scores meaningless. The repo's questions are rewritten without those cues (`scripts/question-overrides/<cert-id>.json`, applied on top of the import; the key and its letter never change, and each override names the upstream text it replaced, so an upstream edit is flagged instead of silently reverting it) and new items (`scripts/extra-questions/`, source `curated`: 125 Developer, 72 Associate, 70 Architect – Foundations, 71 Architect – Professional) add current API behaviour, code and trace reading, and multiple-response items. `npm run lint:bank` (also run by `npm test`) enforces what a calibrated item must satisfy: the key is the longest option in at most 30% of items, option lengths stay within 1.6×, no template distractors, rationales cite options only as "(B)", and every item carries an official `ref`. Once a bank has calibrated items, the readiness estimate counts only calibrated questions answered after their `calibrated` time. Each new draft is checked with `node scripts/lint-questions.mjs --candidates drafts.json`, answered blind by a second reader, and probed with the options alone to confirm the stem is needed.

**The calibrated bank is switched off.** `scripts/calibrated-bank.json` has one flag per certification and all four are `false`, so the app serves the study repo's questions exactly as before the rewrite (`src/content/` is identical to commit `8fc7a15`). The rewrites, the new items, the lint and their tests stay in the repo and keep being checked. To serve one: `node scripts/calibrated-bank.mjs enable <cert-id|all>` (flips the flag, re-runs the sync and swaps the Spanish from `scripts/question-overrides/es/<cert-id>.json`), then commit `src/content/` and deploy; `disable` goes back, and `status` shows which are on. Developer – Foundations has its Spanish ready; Associate, Architect – Foundations and Architect – Professional have the English but no Spanish for the new and rewritten items yet (translate them with the normal `node scripts/i18n.mjs list` flow before enabling; the unit tests require it).

Each certification's content (with its Spanish) is a separate chunk loaded on demand: the one being studied before the app renders, the others in idle time.

Spanish versions live in `src/content/<cert-id>/es/` (and `src/content/es/` for news and the guide pages). Each entry stores `src`, a hash of the English text it was translated from; when the English changes, the app shows English for that item until the translation is updated. `npm run sync` reports stale translations; after fixing them run `node scripts/i18n.mjs stamp`.

To add a language: copy `src/i18n/es.ts`, translate it, register it in `src/i18n/index.ts`, and add `src/content/<lang>/` files.

## Security

- Each account can only read and write its own rows; the sync endpoint validates every operation and rejects outboxes written by another account on the same device.
- Passwords are PBKDF2-SHA256 with a random salt and **100,000 iterations**, the maximum the Workers runtime allows. That is below OWASP's current recommendation for PBKDF2 (600,000); rate limits on sign-in mitigate online guessing.
- Per-IP rate limits on sign-in, sign-up, password reset and account deletion; per-user and global AI caps.
- Strict Content-Security-Policy (no third-party scripts, styles or fonts), HSTS, `frame-ancestors 'none'`.
- No OAuth access tokens are stored. Signing in with Google/GitHub on an email that someone registered with an unverified password removes that password and its sessions; a password reset does the same.

Found a vulnerability? Please follow [SECURITY.md](SECURITY.md) (private report) instead of opening a public issue.

## Contributing

Issues and pull requests are welcome. Before opening a PR, run `npm run lint`, `npm test` and `npm run test:e2e`. If you change what data is stored or who receives it, update `src/legal/` in both languages.

## License and credits

- Code: [MIT](LICENSE) © 2026 JarssS8.
- Study content: MIT © 2026 Amey Thakur. Excerpts of the official exam guide are © Anthropic and quoted for educational purposes. See [NOTICE](NOTICE).
- Fonts: Inter and Bricolage Grotesque (SIL Open Font License), bundled via Fontsource.
