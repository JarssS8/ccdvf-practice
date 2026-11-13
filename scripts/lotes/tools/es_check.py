#!/usr/bin/env python3
"""Check Spanish drafts of lote items before they are merged into src/content/developer-foundations/es/questions.json.

  python3 scripts/lotes/tools/es_check.py scripts/lotes/developer-foundations/es-drafts/T1.json [more files]
  python3 scripts/lotes/tools/es_check.py --merge          merge every es-drafts/*.json into es/questions.json (then run i18n.mjs stamp)

A draft is a JSON object {"developer-foundations-l2-01": {"question": "...", "options": {"A": ...}, "rationale": "..."}, ...}.
Rules: same option letters, the rationale cites the same letters as the English, no code, and the key keeps its length rank
among the options (so the Spanish does not bring back the "the longest option wins" cue).
"""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
EN = json.loads((ROOT / "src/content/developer-foundations/questions.json").read_text(encoding="utf-8"))
EN = {q["id"]: q for q in EN if q.get("source") == "lote"}
ES_FILE = ROOT / "src/content/developer-foundations/es/questions.json"


def rank(opts, key):
    return 1 + sum(1 for t in opts.values() if len(t) > len(opts[key]))


def problems(qid, t):
    out = []
    q = EN.get(qid)
    if not q:
        return [f"{qid}: not a lote question"]
    if set(t) - {"question", "options", "rationale"} or not all(k in t for k in ("question", "options", "rationale")):
        out.append(f"{qid}: needs exactly question, options, rationale")
        return out
    if list(t["options"]) != list(q["options"]):
        out.append(f"{qid}: option letters must be {list(q['options'])}")
        return out
    letters = lambda s: sorted(re.findall(r"\(([A-D])\)", s))
    if letters(t["rationale"]) != letters(q["rationale"]):
        out.append(f"{qid}: rationale cites {letters(t['rationale'])}, the English cites {letters(q['rationale'])} (keep the '(B)' references)")
    if "`" in t["question"] + "".join(t["options"].values()):
        out.append(f"{qid}: no backticks")
    k = q["answer"][0]
    re_en, re_es = rank(q["options"], k), rank(t["options"], k)
    if re_es != re_en:
        lens = {L: len(v) for L, v in t["options"].items()}
        out.append(f"{qid}: key {k} has length rank {re_es} in Spanish but {re_en} in English (1 = longest); Spanish lengths {lens}: "
                   f"exactly {re_en - 1} option(s) must be strictly longer than the key")
    lens = [len(v) for v in t["options"].values()]
    if max(lens) / min(lens) > 1.7:
        out.append(f"{qid}: Spanish options differ {max(lens) / min(lens):.2f}x in length (max 1.7)")
    if len(t["question"]) < 0.8 * len(q["question"]):
        out.append(f"{qid}: the Spanish stem looks shortened ({len(t['question'])} vs {len(q['question'])} chars): translate everything")
    return out


def main():
    if sys.argv[1:] == ["--merge"]:
        es = json.loads(ES_FILE.read_text(encoding="utf-8"))
        n = 0
        for f in sorted((ROOT / "scripts/lotes/developer-foundations/es-drafts").glob("*.json")):
            for qid, t in json.loads(f.read_text(encoding="utf-8")).items():
                p = problems(qid, t)
                if p:
                    print("\n".join(p)); sys.exit(1)
                es[qid] = {"question": t["question"], "options": t["options"], "rationale": t["rationale"]}
                n += 1
        ES_FILE.write_text(json.dumps(es, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"merged {n} translations into {ES_FILE.relative_to(ROOT)}; now run: node scripts/i18n.mjs stamp")
        return
    bad = 0
    for f in sys.argv[1:]:
        d = json.loads(Path(f).read_text(encoding="utf-8"))
        for qid, t in d.items():
            for p in problems(qid, t):
                print("  ! " + p); bad += 1
        print(f"{f}: {len(d)} translations, {bad} problem(s)")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
