# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for a security problem. Use GitHub's private reporting instead:
**Security → Report a vulnerability** on this repository
(https://github.com/JarssS8/ccdvf-practice/security/advisories/new).

If you cannot use that, email the contact address in the app's legal notice (https://exam.jarsss8.es/#/legal/aviso).

Include what you found, where (file and line, or URL), how to reproduce it with test accounts, and what an attacker gains.
Please do not test against other people's accounts, generate load, or spend the operator's AI budget.

You can expect an answer within 7 days. This is a personal, unpaid project: there is no bug bounty, but reporters are credited
in the fix unless they prefer otherwise.

## Scope

In scope: the Worker (`worker/`), the web app (`src/`), the database migrations and the configuration in this repository.
Out of scope: Cloudflare, Better Auth, DeepSeek, Google and GitHub themselves (report to them), social engineering, and denial of
service by sheer traffic volume.

## What has already been looked at

A security audit (source review plus sandboxed reproduction) was run on 2026-10-30. It covered tenant isolation, sessions, CSRF,
OAuth account linking, password reset, the AI tutor and its limits, client storage, headers and the supply chain. The findings were
fixed in the commit "Security audit fixes", and each has a regression test in `tests/`.
Known limits you do not need to report:

- Passwords use PBKDF2-SHA256 at 100,000 iterations, the most the Workers runtime allows.
- Sign-up does not require a verified email; the account-linking hook removes an unverified password identity when the real owner
  signs in with Google or GitHub.
- Exam scores are computed in the browser and trusted by the server; there is no ranking or certificate that depends on them.
