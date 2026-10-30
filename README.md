# CCDV-F Practice

Free practice for the **Claude Certified Developer – Foundations** exam: timed mocks, domain drills, spaced-repetition flashcards, an AI tutor and progress synced across devices. English and Spanish.

**Live:** https://exam.jarsss8.es · *Independent project, not affiliated with Anthropic.* · [Español abajo](#español)

## How it works

One **Cloudflare Worker with static assets** serves the SPA (Vite + React) and the `/api/*` API. Data lives in **D1**. Accounts use **[Better Auth](https://www.better-auth.com)** inside the same Worker (email + password, Google, GitHub). AI runs on **DeepSeek**. Nothing else.

```
├─ scripts/sync-content.mjs   imports questions, flashcards, notes and news from the study repo → src/content/*.json
├─ scripts/i18n.mjs           checks the Spanish content (src/content/es) against the English source
├─ src/                       the app (local-first: localStorage + an outbox synced to D1, per account)
│  ├─ i18n/                   UI dictionaries (en.ts defines the shape, es.ts must match)
│  ├─ legal/                  legal notice, privacy, cookies and terms (es is the reference text)
│  ├─ shared/exam.ts          official exam facts, option shuffling (shared with the Worker)
│  └─ lib/engine.ts           question selection, scoring and readiness estimate
├─ worker/auth.ts             Better Auth config (PBKDF2 passwords, rate limits, account linking)
├─ worker/index.ts            API: state, sync, AI tutor and question generation
└─ migrations/                D1 schema
```

### Design decisions

- **Options are shuffled on every attempt.** The bank's keys follow fixed patterns and the right option is often the longest; without shuffling you pass by pattern.
- **The readiness estimate only uses first attempts** at bank questions (not AI), grouping near-duplicates and re-weighting by domain. It is shown as a 95% range; the conversion to the 100–1000 scale is linear and approximate.
- **Exam simulations are always in English**, interface included, like the real exam. Drills, notes, flashcards and the tutor follow the chosen language. A translation is only used while it matches the English text it was made from (`src` hash); otherwise the English text is shown.
- **AI is shared and capped**: a daily allowance per user plus a global cap. The tutor only receives a question id and rebuilds the question on the server, so it cannot be used as a general chatbot. It needs explicit consent because DeepSeek processes data in China.
- **Multi-device**: every answer is timestamped and the newest wins. Only the device holding an attempt can answer it.

## Running it

```bash
npm install
cp .dev.vars.example .dev.vars        # then fill BETTER_AUTH_SECRET (openssl rand -base64 32)
npx wrangler d1 migrations apply ccdvf-practice --local
npm run dev:worker -- --local-upstream localhost:8787   # http://localhost:8787
```

`npm run sync` re-imports content when this folder sits inside a clone of the study repo; otherwise the committed content is used.

### Deploying your own

1. Create a D1 database and put its id in `wrangler.jsonc`; set your domain in `routes` and `BETTER_AUTH_URL`.
2. Secrets: `npx wrangler secret put BETTER_AUTH_SECRET`, and optionally `DEEPSEEK_API_KEY`, `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` (OAuth callbacks: `https://<domain>/api/auth/callback/{google,github}`).
3. `npm run db:migrate && npm run deploy`.
4. Rewrite `src/legal/` with your own details before publishing.

## Content and licence

- Code: [MIT](LICENSE).
- Questions, flashcards, notes and news come from [Amey-Thakur/CLAUDE-CERTIFICATIONS](https://github.com/Amey-Thakur/CLAUDE-CERTIFICATIONS) (MIT, © 2026 Amey Thakur); Spanish translations are this project's. Exam-guide samples and blueprint text are © Anthropic. See [NOTICE](NOTICE).

---

## Español

Práctica gratuita para **Claude Certified Developer – Foundations**: mocks cronometrados, drills por dominio, flashcards con repetición espaciada, tutor IA y progreso sincronizado entre dispositivos, en español e inglés. Los simulacros de examen son siempre en inglés, como el real.

- **Arquitectura**: un Worker de Cloudflare con assets estáticos + D1. Cuentas con Better Auth (email y contraseña, Google, GitHub). IA con DeepSeek.
- **Desarrollo local**: copia `.dev.vars.example` a `.dev.vars`, rellena `BETTER_AUTH_SECRET`, aplica las migraciones con `--local` y lanza `npm run dev:worker -- --local-upstream localhost:8787`.
- **Traducciones**: `src/content/es/*.json` guarda solo textos con la huella (`src`) del inglés del que salen; `npm run sync` avisa de las desactualizadas, que se muestran en inglés hasta que se revisen (`node scripts/i18n.mjs stamp` tras corregirlas).
- **Textos legales**: `src/legal/` (la versión en español es la de referencia). Si cambias lo que se guarda o a quién se envía, actualízalos.
