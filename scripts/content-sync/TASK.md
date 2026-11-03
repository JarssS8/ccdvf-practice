# Content sync: finish what the study repo changed

You run unattended (scripts/content-sync/auto.sh). The study repo was just synced into `src/content/` on the
`content-sync` branch. Your job is to leave it shippable; the script then runs the tests, merges and deploys.
Work only inside this repository. Do not run git commands that change state, npm, wrangler or anything that deploys.

## 1. Courses and videos the sync could not place
If the sync log below warns that a course or video section "is not in scripts/course-map.json", add it there with
the certification ids it serves (associate-foundations, developer-foundations, architect-foundations,
architect-professional). Decide from the course's summary and section in ../guide/courses.md (or ../guide/videos.md)
and ../guide/course-notes.md, the same way the existing entries are mapped. If the log says an extra course is now
listed upstream, delete that entry from scripts/extra-courses.json. Then run `node scripts/sync-content.mjs` again.
Any other warning (blueprint, too-close app question, unknown domain): do not try to fix it; finish the rest.

## 2. Spanish
Run `node scripts/i18n.mjs list`. Each line is `kind  file  key  (English: where the source is)`.
- missing: add the entry to that file under that key. stale: the English changed; rewrite the Spanish to match the
  new English and delete its `src` field.
- Shapes, keyed like the English: questions `{ "question", "options": { "A": … }, "rationale" }`;
  flashcards `{ "front", "back" }`; notes `{ "cheatSheet": { "text" }, "notes": { "text" } }` per certification;
  news `{ "title", "body" }` under the key the list prints; guide `{ "text" }` under the key the list prints
  (the English for a guide key comes from src/shared/guide.ts `guideEntries`).
- Edit the JSON with a small python script (json.load → change only those keys → json.dump with ensure_ascii=False,
  indent=1 and a trailing newline), never by rewriting whole files by hand.
- When everything is translated run `node scripts/i18n.mjs stamp`, then `node scripts/i18n.mjs check`: it must say
  0 stale and 0 missing with no warnings. Fix and repeat if not.

Style: read a dozen existing entries of the same file next to their English first and match them. Spanish from
Spain, "tú", natural and concise. Keep in English the technical terms the existing entries keep (prompt, system
prompt, tool use, workflow, MCP, subagent, hook, token, batch, stakeholders, human-in-the-loop, few-shot,
plan mode, headless). "Committed" (to a repository) is "versionado en el repositorio". Thousands with a point (1.000).
Never change code, identifiers, API/tool names, CLI commands and flags, file names, URLs (translate only link text),
numbers, option letters or references such as "(B)". Do not add, drop or soften information. Options keep similar
lengths: never make the correct one longer or more specific than in English. Markdown keeps its structure: same
headings, lists, tables (same number of lines starting with "|") and code fences.

## 3. Finish
Reply with a short summary: what you translated (counts per file), courses you mapped, warnings you left.
