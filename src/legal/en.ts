// Legal texts in English. The Spanish version (es.ts) is the reference; keep both in sync with the code.
import { LEGAL_INFO as I } from './info'

const note = '*This is a translation. If it differs from the Spanish version, the Spanish version prevails.*\n\n'

export const en: Record<string, string> = {
  aviso: note + `
## Owner

- **Owner**: ${I.owner} (individual, personal project)
- **Contact**: [${I.email}](mailto:${I.email})
- **Website**: ${I.site}
- **Source code**: [${I.repo}](${I.repo})

${I.siteName} is a personal, free, non-profit project: no advertising, no charges and no economic activity.

## Purpose

This website offers practice material for the *Claude Certified Developer – Foundations* exam: mock exams, domain drills, review flashcards, notes and an AI tutor.

## Not affiliated with Anthropic

This is an **independent** project. It is not created, sponsored, reviewed or endorsed by Anthropic PBC. “Claude” and “Anthropic” are trademarks of their respective owners and are mentioned only to identify the exam. The questions are not the official exam questions and do not guarantee a pass. For official information, use Anthropic's channels.

## Intellectual property

- The app's **code** is published under the MIT licence in the repository above.
- The **questions, flashcards, notes and news** come from the community repository [Amey-Thakur/CLAUDE-CERTIFICATIONS](https://github.com/Amey-Thakur/CLAUDE-CERTIFICATIONS) (MIT licence, © ${I.contentYear} Amey Thakur). The Spanish translations are our own.
- The **samples and the per-domain blueprint** come from the official exam guide published by Anthropic (© Anthropic) and are quoted for educational purposes. If you own any of this content and want it removed, write to the contact email.

## Liability

The content is provided “as is”, with no guarantee that it is accurate or up to date. AI-generated questions and answers may contain errors. The owner is not liable for damage arising from the use of the website, except where the law does not allow that liability to be excluded.

## Governing law

This website is governed by Spanish law. The conditions of use are in the [terms of use](#/legal/terminos) and data processing in the [privacy policy](#/legal/privacidad).
`,

  privacidad: note + `
This policy explains which personal data ${I.siteName} (${I.site}) processes, why, and what rights you have, under Regulation (EU) 2016/679 (GDPR) and Spanish Organic Law 3/2018 (LOPDGDD).

## Controller

- **Controller**: ${I.owner}
- **Contact**: [${I.email}](mailto:${I.email})

## What data we process

| Data | When |
| --- | --- |
| Name and email | When you create the account. |
| Password | Only if you sign up with email. Never stored in plain text: only an irreversible salted hash (PBKDF2-SHA256). |
| Your Google or GitHub account identifier, name, email and profile picture | Only if you sign in with Google or GitHub. Their access tokens are not kept. |
| Study progress: attempts, answers, flagged questions, flashcard reviews, your exam date and the questions you generate with AI | While you use the app. |
| IP address and browser (user agent) of each session | When you sign in. |
| IP address in attempt and AI-usage counters | When you sign in, sign up, delete the account or use the AI, to slow down attacks and abuse. |
| Number of AI uses per day | When you use the tutor or generate questions. |
| Your email and a one-time link | Only if you ask to reset your password. |
| The question you are reviewing, your answer and the messages you write to the tutor | Only if you use the AI tutor and have accepted it. |

## Purposes and legal bases

1. **Providing the service**: creating and keeping your account, saving your progress and syncing it across devices, and sending you a password-reset link when you ask for one. Basis: performance of the terms of use you accept when signing up (Art. 6(1)(b) GDPR).
2. **Security and abuse prevention**: sessions, limits on sign-in attempts and AI use. Basis: legitimate interest in protecting the service and its users (Art. 6(1)(f) GDPR).
3. **AI tutor**: sending the question and your messages to the AI provider to get an answer. Basis: your consent (Art. 6(1)(a) GDPR), given the first time you use the tutor and withdrawable at any time in Settings. Withdrawing it does not affect processing carried out before.

There is no advertising, analytics or profiling, no data is sold or shared, and no automated decisions with effects on you are taken.

## Who else processes your data

- **Cloudflare, Inc.** hosts the website and the database (Cloudflare Workers and D1) and sends password-reset emails (Cloudflare Email Service). It acts as a processor. It may process data in the US: it participates in the EU-US Data Privacy Framework and its data processing agreement includes standard contractual clauses.
- **Google** and **GitHub** (Microsoft), only if you choose to sign in with them. They identify you through their own service and give us your name, email and picture. Their processing is governed by their own policies.
- **DeepSeek**, the AI provider for the tutor and for question generation, with servers in the **People's Republic of China**. It only receives the bank question, your answer and the messages you write to the tutor. It never receives your name, your email or any identifier of your account.

## International transfer to China

China has no European Commission adequacy decision, so your data is not protected there to a level equivalent to the EU's. Among other risks, Chinese authorities could access it and it could be harder for you to exercise your rights. That is why the tutor only works with your **explicit consent**, given after being informed of these risks (Art. 49(1)(a) GDPR). This mechanism is meant for occasional transfers: each one happens only when you ask the tutor. **Do not write personal data in the tutor chat.** You can use everything else in the app without accepting this.

## How long data is kept

- **Account and progress**: until you delete the account. Deleting it immediately removes all your data from the database.
- **Sessions** (with their IP and browser): expire after ${I.sessionDays} days without use and are removed by the daily clean-up.
- **Password-reset links**: expire after 1 hour, work only once and are removed by the daily clean-up.
- **Per-IP attempt counters**: under 48 hours.
- **AI usage counters (per user and per IP)**: 30 days.
- **Tutor messages**: this service does not keep them on its server. The conversation is stored only on your device and is wiped when you sign out. DeepSeek keeps them under its own policy.
- **Recovery copies**: Cloudflare keeps a recovery history of the database for up to 30 days. After that, deleted data also disappears from it.

## Your rights

You can at any time exercise your rights of access, rectification, erasure, objection, restriction and portability, and withdraw your consent:

- **In the app**, in Settings: “Download my data” (access and portability, as JSON), “Delete my account” (erasure) and “Withdraw consent” for the AI tutor.
- **By email**, writing to [${I.email}](mailto:${I.email}) from your account's address.

If you believe your rights have not been respected, you can complain to the **Spanish Data Protection Agency** ([www.aepd.es](https://www.aepd.es)) or to the authority of your country of residence.

## Minors

You must be at least **14 years old** to sign up (Art. 7 LOPDGDD).

## Security

The connection is always encrypted (HTTPS). Passwords are stored as salted PBKDF2 hashes. The session cookie is HttpOnly and Secure. Each account can only read and write its own data. The code is public and can be reviewed.

## Changes

If this policy changes, the new version will be published here with its date. Important changes will be announced in the app.
`,

  cookies: note + `
## What is stored in your browser

${I.siteName} only uses **technical cookies** and local storage that are essential for the service to work. There are no advertising, analytics or third-party cookies, and the fonts are served from this same domain.

| Name | Type | Purpose | Lifetime |
| --- | --- | --- | --- |
| \`better-auth.session_token\` (with the \`__Secure-\` prefix) | First-party cookie, HttpOnly | Keep you signed in | ${I.sessionDays} days |
| \`better-auth.*\` (OAuth state and verification) | First-party cookie | Complete Google or GitHub sign-in securely | Minutes |
| \`ccdvf_*\` | Local storage | Language, theme, device identifier, local copy of your progress for offline use, position in an exam and tutor conversations | Until you sign out or clear your browser data |

## Consent

These cookies and this storage are **exempt from consent** (Art. 22(2) of Spanish Law 34/2002, LSSI) because they are strictly necessary to provide the service you request. That is why no banner is shown. If any non-essential cookie were ever added, your consent would be asked before using it.

## How to remove them

**Signing out** removes the session cookie and your account's local data. You can also clear everything in your browser settings. If you block these cookies, you will not be able to sign in.
`,

  terminos: note + `
## What it is

${I.siteName} is a **free** practice service for the *Claude Certified Developer – Foundations* exam, offered by ${I.owner} as a personal project. By creating an account you accept these terms and the [privacy policy](#/legal/privacidad).

## Your account

- You must be at least 14 years old.
- Use an email address that belongs to you. Keep your password secret: you are responsible for what is done with your account.
- If you forget your password, you can reset it with the link we email you (it expires after 1 hour). Resetting it signs you out everywhere.
- If you sign in with Google or GitHub using an email that was registered with a password and never verified, that password is removed for security.
- You can delete your account at any time in Settings.

## Acceptable use

You may not:

- abuse the AI, try to get around the usage limits, or use the tutor for anything unrelated to the exam;
- automate requests, scrape or overload the service;
- try to access other people's data or non-public parts of the system;
- write illegal or offensive content, or other people's personal data, in the tutor.

Accounts that break these rules may be suspended or deleted.

## Content and AI

- The material comes from community sources and the official guide (details in the [legal notice](#/legal/aviso)). It may contain errors or become outdated.
- Tutor answers and AI-generated questions may be wrong. Always check them against official sources.
- **It is not official Anthropic material** and does not guarantee a pass. Score estimates are approximate.

## Availability

The service is provided “as is”, without warranties. It may change, be interrupted or close at any time. If it closes, reasonable notice will be given so you can download your data.

## Liability

To the extent permitted by law, the owner is not liable for indirect damage or for damage arising from the use of the content. Nothing here limits your rights under consumer protection law.

## Changes and governing law

These terms may be updated: the new version will be published here with its date. They are governed by Spanish law. If you are a consumer, the courts of your place of residence have jurisdiction.
`,
}
