import { betterAuth } from 'better-auth'

export interface Env {
  ASSETS: Fetcher
  DB: D1Database
  BETTER_AUTH_URL: string
  BETTER_AUTH_SECRET: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  GITHUB_CLIENT_ID?: string
  GITHUB_CLIENT_SECRET?: string
  DEEPSEEK_API_KEY?: string
  DEEPSEEK_MODEL: string
  DEEPSEEK_CHECK_MODEL: string
  AI_USER_DAILY_LIMIT: string
  AI_GLOBAL_DAILY_LIMIT: string
}

export const SESSION_DAYS = 30

// ---------- passwords: PBKDF2 in WebCrypto (the default scrypt in JS is too heavy for a Worker's CPU budget) ----------

const enc = new TextEncoder()
const ITERATIONS = 100_000 // the most workerd allows
const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b)))
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function derive(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveBits'])
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256)
}

async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return `pbkdf2-sha256$${ITERATIONS}$${b64(salt)}$${b64(await derive(password, salt, ITERATIONS))}`
}

async function verifyPassword({ hash, password }: { hash: string; password: string }) {
  const [alg, iter, salt, expected] = hash.split('$')
  if (alg !== 'pbkdf2-sha256' || !iter || !salt || !expected) return false
  const got = new Uint8Array(await derive(password, unb64(salt), Number(iter)))
  const want = unb64(expected)
  return got.length === want.length && crypto.subtle.timingSafeEqual(got, want)
}

// ---------- auth ----------

export function createAuth(env: Env) {
  const socialProviders: Record<string, { clientId: string; clientSecret: string }> = {}
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) socialProviders.google = { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }
  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) socialProviders.github = { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET }

  return betterAuth({
    appName: 'CCDV-F Practice',
    baseURL: env.BETTER_AUTH_URL,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.BETTER_AUTH_URL],
    database: env.DB,
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      password: { hash: hashPassword, verify: verifyPassword },
    },
    socialProviders,
    session: { expiresIn: SESSION_DAYS * 86400, updateAge: 86400 },
    user: {
      additionalFields: {
        // Set by the server only: terms on account creation, AI consent through /api/ai/consent
        acceptedTermsAt: { type: 'number', required: false, input: false },
        aiConsentAt: { type: 'number', required: false, input: false },
      },
      deleteUser: { enabled: true },
    },
    account: {
      // Google/GitHub tokens are never needed after sign-in: don't keep them (data minimisation)
      updateAccountOnSignIn: false,
      accountLinking: {
        // Without email verification anyone can register someone else's email with a password. We let the real
        // owner in through Google/GitHub anyway and then cut the squatter out (see the account hook below).
        // Deprecated in 1.7 and removed in the next minor: revisit before upgrading better-auth.
        requireLocalEmailVerified: false,
      },
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 60,
      customRules: {
        // Per IP: generous enough for people behind a shared address (mobile CGNAT, campuses)
        '/sign-in/email': { window: 60, max: 10 },
        '/sign-up/email': { window: 600, max: 10 },
        '/delete-user': { window: 60, max: 3 },
        '/get-session': false,
      },
    },
    advanced: { ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] } },
    databaseHooks: {
      user: {
        // The sign-up form requires ticking the terms; OAuth buttons state that continuing accepts them
        create: { before: async (user) => ({ data: { ...user, acceptedTermsAt: Date.now() } }) },
      },
      account: {
        create: {
          before: async (account) => ({ data: { ...account, accessToken: null, refreshToken: null, idToken: null } }),
          after: async (account) => {
            if (account.providerId === 'credential') return
            const u = await env.DB.prepare('SELECT "emailVerified" AS v FROM "user" WHERE id = ?').bind(account.userId).first<{ v: number }>()
            if (!u || u.v) return
            // A verified Google/GitHub identity was linked to an unverified password account: whoever set that
            // password never proved they own the email. Remove it and every session it opened.
            await env.DB.batch([
              env.DB.prepare('DELETE FROM "account" WHERE "userId" = ? AND "providerId" = \'credential\'').bind(account.userId),
              env.DB.prepare('DELETE FROM "session" WHERE "userId" = ?').bind(account.userId),
              env.DB.prepare('UPDATE "user" SET "emailVerified" = 1 WHERE id = ?').bind(account.userId),
            ])
          },
        },
        update: { before: async (account) => ({ data: { ...account, accessToken: null, refreshToken: null, idToken: null } }) },
      },
    },
  })
}

export type Auth = ReturnType<typeof createAuth>
