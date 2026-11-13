# Author spec: Developer Foundations, Lote 2 and Lote 3

You write practice items for the **Claude Certified Developer – Foundations (CCDV-F)** exam in the style of two new "lotes". Lote 1 is the existing bank: short stems, and the right option is the longest in 89% of the items. Those items can be answered on autopilot. Lotes 2 and 3 exist so that **the candidate has to read the scenario to answer**.

Read `scripts/lotes/developer-foundations/lote2.json` and `lote3.json` first: the 10 items in each are the approved style. Match their register, length and care.

## The two lotes

- **Lote 2, "decision under constraints".** A team, a realistic context and several reasonable-looking actions. One constraint stated in the stem decides which action is best. The tempting wrong answer is usually "more power" (bigger model, more retries, more prompt) or a sound practice that does not meet the constraint.
- **Lote 3, "diagnosis and review".** Something odd happened, or someone proposes a fix, and the candidate must find the most likely cause, the flaw in the plan, or the right first step. The obvious culprit is not the right one. Symptoms are described in sentences: **no logs, traces, code, tables or exhibits**.

Each slot in `plan.json` says which lote it is for. Write the item in that lote's style.

## Anatomy of an item

**Stem** (one plain paragraph, 330 to 480 characters; hard limits 280 and 560):
1. Who and where: a team, product or situation. Vary industries (logistics, health scheduling, education, energy, media, legal, retail, HR, public sector, games, travel, manufacturing...). Do not make everything a bank or an online shop.
2. What is happening or what they want.
3. **One deciding detail in the middle of the stem** (a number, a constraint, a who-waits, a deadline, a side effect). Never leave it for the last sentence, never make it the only unusual word.
4. The question, in one sentence, last.

No code, backticks, logs, bullet lists, tables or file contents. You may name API features in plain words (retry-after header, max_tokens, stop reason, cache_control, settings.local.json) but without backticks.

**Options**: exactly four, one sentence each, 85 to 135 characters, no letters or numbering, similar grammar and rhythm. The longest option must not be systematically the key: `plan.json` gives the key's **length rank** for each slot (1 = longest ... 4 = shortest). Make the lengths come out that way naturally by giving every option the same amount of concrete detail; never pad with filler.

**Distractors** are the heart of the item. Each one must be **a real practice that a competent engineer might choose in some other situation, and that fails this stem's deciding detail**. Test every distractor: "In which scenario would this be right?" If you cannot answer, rewrite it.
- No silly options, no strawmen, no "do nothing", no options the stem already rules out.
- No absolute or overbroad words in distractors (always, never, every, all, only, guarantee, completely, simply, just, any) unless the key uses the same kind of wording. Test-wise readers use them.
- No justification tails ("since...", "because...") on distractors if the key has none, and vice versa. All four options have the same shape.
- Give the distractors the same concreteness as the key: named features, numbers, mechanisms. If only the key names a mechanism, the item is solved without reading.
- **Flip test**: if the deciding detail in the stem changed, at least two distractors should become defensible. If the key would win whatever the stem said, the stem is decoration: redesign the item.
- Do not write "all of the above", "none of the above", "capital letters" or temperature tweaks as distractors.

**Rationale**: 3 to 5 sentences. Say why the key satisfies the deciding detail, then one sentence per distractor saying which constraint it fails. Refer to options only as `[K]` (the key) and `[1]`, `[2]`, `[3]` (your distractors in the order you listed them in `ds`). Never write letters.

## Facts

Everything in the key and in the rationale must be true **today** about Claude, the Claude API, Claude Code, the Agent SDK or MCP. This is the Claude 5 era: adaptive thinking and effort levels exist next to the older fixed-budget extended thinking; model names and limits change. Rules:
- Verify every non-obvious claim against official docs before you write it: platform.claude.com/docs, code.claude.com/docs, modelcontextprotocol.io, anthropic.com/engineering. Use your web tools to fetch the page. Put that page's URL in `ref`.
- If you cannot verify a claim, change the angle of the item so it does not depend on it. Do not rely on specific numeric limits, prices or model names unless the docs state them and the stem needs them.
- Test one rule per item. Do not bundle two ideas into the key.
- Stay inside the CCDV-F blueprint (`developer-foundations/README.md`, "Skills measured"), at the level of a developer who has built with the API for a few months.
- Do not copy or closely paraphrase any existing exam or practice item from anywhere. Invent the scenario. Do not repeat a scenario, product type or deciding detail of the items already in `lote2.json` or `lote3.json`, or of another slot in the plan.

## Output

For your slice write a JSON array to `scripts/lotes/developer-foundations/drafts/<SLICE>.json`, one object per slot assigned to you, in this shape:

```
{
  "id": "l2-11",
  "task": "Claude API mechanics: prompt caching",
  "stem": "...",
  "key": "...",
  "ds": ["distractor 1", "distractor 2", "distractor 3"],
  "rationale": "... [K] ... [1] ... [2] ... [3] ...",
  "ref": "https://platform.claude.com/docs/en/..."
}
```

`id`, the domain, the key letter and the key length rank come from `plan.json`; you only write the text. The assembler puts the key in the planned letter and your distractors in the remaining letters in order.

Check your work until it reports no `!` problems (`~` lines are warnings: fix them too unless you have a reason):

```
python3 scripts/lotes/tools/lotes.py check scripts/lotes/developer-foundations/drafts/<SLICE>.json
```

Do not edit any other file.
