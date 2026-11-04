# Question overrides

Rewrites of study-repo questions without answer-pattern cues (the key used to be the longest option in ~89% of items).
`npm run sync` applies them on top of `../question-bank.json`; the key itself always comes from upstream, so answers
already stored keep their meaning. Duplicate groups are computed on the upstream wording, so a rewrite never regroups
what someone has already seen.

`<cert-id>.json` maps a question id to:

| field | |
| --- | --- |
| `src` | `upstreamHash()` (src/shared/exam.ts) of the upstream question, options and key it rewrote |
| `calibrated` | ISO time (UTC) the rewrite shipped; only answers after it count for readiness |
| `question`, `options`, `rationale` | the rewrite (same option letters, same key letter and meaning) |
| `evidence`, `ref` | short quote and official URL that settle the key |
| `task` | blueprint task statement (informational) |

When upstream edits a rewritten question, the sync warns `upstream changed, re-review its override`, ships the upstream
text uncalibrated and `scripts/content-sync/auto.sh` stops before deploying. Re-review the rewrite against the new
upstream text, then set its `src` to the new hash:

```sh
node -e "import('./src/shared/exam.ts').then(({ upstreamHash }) => { const b = require('../question-bank.json'); const q = b.questions.find((x) => x.id === process.argv[1]); console.log(upstreamHash({ ...q, answer: [].concat(q.answer).join('').replace(/[^A-E]/g, '').split('') })) })" <id>
```

Keep `scripts/lint-questions.mjs` green (`npm test` runs it through `tests/unit/bank.test.ts`).
