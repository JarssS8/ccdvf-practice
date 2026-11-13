#!/usr/bin/env python3
"""Authoring tools for lotes 2 and 3 (Developer - Foundations).

  python3 scripts/lotes/tools/lotes.py plan              (re)write plan.json: one slot per new question, with domain, topic hint,
                                                         key letter and key length rank, balanced across each lote
  python3 scripts/lotes/tools/lotes.py check FILE...     check author drafts against their slots (what authors run before handing in)
  python3 scripts/lotes/tools/lotes.py assemble          merge existing items + drafts/*.json into lote2.json / lote3.json
  python3 scripts/lotes/tools/lotes.py check-sets FILE   check contrastive sets (twins and quads sharing one option list; see SPEC.md)
  python3 scripts/lotes/tools/lotes.py assemble-sets FILE LOTE   add a file of sets to lote<LOTE>.json, each set's stems sharing a group

Draft item (an author writes a JSON array of these in scripts/lotes/developer-foundations/drafts/<slice>.json):
  {"id": "l2-11", "task": "...", "stem": "...", "key": "...", "ds": ["...", "...", "..."], "rationale": "... [K] ... [1] ... [2] ... [3] ...", "ref": "https://..."}
The distractors fill the remaining letters in order; the plan decides the key letter and where the key's length ranks among the options.
"""
import json, random, re, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DIR = HERE.parent / "developer-foundations"
CERT = "developer-foundations"
DOMAIN = {
    "apps": "Applications and Integration", "model": "Model Selection and Optimization", "agents": "Agents and Workflows",
    "prompt": "Prompt and Context Engineering", "tools": "Tools and MCPs", "sec": "Security and Safety",
    "code": "Claude Code", "eval": "Eval, Testing, and Debugging",
}
# New items needed per lote (the first 10 of each lote already exist): 53 per lote in all, by the official domain weights
NEED = {
    2: dict(apps=14, model=7, agents=7, prompt=5, tools=5, sec=3, code=1, eval=1),
    3: dict(apps=14, model=8, agents=7, prompt=5, tools=5, sec=3, code=1, eval=0),
}
# (slice, blueprint skill, topic hint). Hints name a topic to test, never wording; authors invent the scenario and the deciding detail.
H = {
 "apps": [
  ("S1", "Understanding requirements", "decide between synchronous, streaming and batch processing from who waits for the result, the volume and the deadline"),
  ("S1", "Understanding requirements", "turn a vague business request into testable acceptance criteria before building anything with Claude"),
  ("S1", "Understanding requirements", "decide whether a feature should use Claude at all or deterministic code, given the cost of an error"),
  ("S1", "Systems life cycle management", "release a prompt or tool-schema change that can hurt customers: staged rollout, monitoring of the right signal, rollback"),
  ("S1", "Systems life cycle management", "plan the move off a model version that is being retired, with regression evidence before cutover"),
  ("S1", "Claude API mechanics", "multi-turn conversations: the API is stateless, so who stores and resends the history, and what that costs"),
  ("S1", "Claude API mechanics", "the tool-use loop: stop reason, returning the tool result in the right turn, keeping the loop correct"),
  ("S1", "Claude API mechanics", "an error or disconnect in the middle of a streamed response and what the application should keep or discard"),
  ("S1", "Claude API mechanics", "choosing how to send documents or images (PDF, vision, files) given page count, cost and accuracy"),
  ("S1", "Claude API mechanics", "prompt caching when several requests with the same long prefix run at the same time or minutes apart"),
  ("S1", "Claude API mechanics", "batch versus real-time when a workload mixes urgent and non-urgent requests with a hard deadline"),
  ("S1", "Claude API mechanics", "using Claude through a third-party cloud platform instead of the first-party API: what stays the same and what to check"),
  ("S1", "Software engineering foundations", "REST/HTTP retries: which calls are safe to repeat and how to avoid doing an action twice"),
  ("S1", "Software engineering foundations", "handling JSON from a model defensively: parse, validate shape, handle partial or extra fields"),
  ("S2", "Software engineering foundations", "async concurrency: capping parallel Claude calls so a burst respects rate limits without losing work"),
  ("S2", "Software engineering foundations", "version control and reproducibility: what must be committed together so a past answer can be reproduced (prompt, model, parameters)"),
  ("S2", "Software engineering foundations", "code review of AI-assisted changes: what a reviewer must still verify and what tests must exist"),
  ("S2", "Software engineering foundations", "refactoring prompt-building code safely: what tests protect behaviour while the code is restructured"),
  ("S2", "Claude application design", "where an instruction should live across Claude Code, the desktop app, claude.ai, the API and the SDKs, and why the same words behave differently"),
  ("S2", "Claude application design", "content boundaries: keeping untrusted user or document text separate from the developer's instructions"),
  ("S2", "Claude application design", "designing a structured-output schema: required versus optional fields, enums, and allowing the model to say it does not know"),
  ("S2", "Claude application design", "evolving a response schema shared by two teams without breaking consumers"),
  ("S2", "Claude application design", "session hygiene: when to continue a long conversation and when to start fresh with a summary"),
  ("S2", "Claude application design", "plugin and extension management: scope, trust and what to install for a team"),
  ("S2", "Claude application design", "multi-tenant application: keeping one customer's data and instructions from leaking into another's calls"),
  ("S2", "Configuration management", "what belongs in CLAUDE.md versus a Skill versus a prompt in code, given size and how often it is needed"),
  ("S2", "Configuration management", "settings.json scopes (managed, user, project, local) and which wins when they conflict"),
  ("S2", "Configuration management", "plugin or dependency versions: pinning so every developer and the CI see the same behaviour"),
 ],
 "model": [
  ("S3", "LLM fundamentals", "a document or conversation exceeds the context window: summarise, chunk, retrieve or change the model, given the task"),
  ("S3", "LLM fundamentals", "non-determinism: a team expects identical outputs for identical inputs; what is realistic and how to test"),
  ("S3", "LLM fundamentals", "latency options such as fast mode, smaller models, shorter outputs: which fits an interactive feature"),
  ("S3", "LLM fundamentals", "adaptive thinking and effort levels: when more reasoning pays for itself and when it only adds latency and cost"),
  ("S3", "LLM fundamentals", "zero-shot versus few-shot: when examples help and when they bias or waste tokens"),
  ("S3", "Technical fundamentals", "SDK versus raw REST calls: what the SDK handles (retries, timeouts, streaming helpers) and when raw HTTP is justified"),
  ("S3", "Technical fundamentals", "server-sent events versus websockets for pushing a streamed answer to a browser"),
  ("S3", "Technical fundamentals", "reading HTTP error classes correctly: client mistake versus rate limit versus overload, and what each retry policy should be"),
  ("S3", "Technical fundamentals", "SDK timeouts and requests with a very large max_tokens, which need streaming"),
  ("S3", "Model selection and tradeoffs", "a pipeline with several stages: routing easy work to a small model and hard work to a larger one, with a safety net"),
  ("S3", "Model selection and tradeoffs", "behaviour changes between model releases: how to detect a breaking change before switching production traffic"),
  ("S3", "Cost and token management", "usage tracking: attributing token cost to features or customers and spotting a cost regression"),
  ("S3", "Cost and token management", "cost modelling of prompt caching (write premium, discounted reads, lifetime): when it pays and when it does not"),
  ("S3", "Cost and token management", "where to place cache checkpoints (cache_control breakpoints) in a prompt with static and changing parts"),
  ("S3", "Cost and token management", "cutting cost without hurting quality: output length, batching, model downshift, trimmed context; which first"),
 ],
 "agents": [
  ("S4", "Agent architecture", "workflow versus agent: a process with fixed steps and strict exception handling versus open-ended investigation"),
  ("S4", "Agent architecture", "a hybrid: a fixed pipeline where only one step needs open-ended reasoning"),
  ("S4", "Agent architecture", "manager or supervisor hierarchies: when adding a coordinator helps and when it only adds hops"),
  ("S4", "Agent architecture", "the role of subagents: parallel research versus isolating a noisy task's context"),
  ("S4", "Agent construction", "a custom agent loop or harness: stop conditions, maximum turns, handling a tool that keeps failing"),
  ("S4", "Agent construction", "self-hosted agent versus Anthropic-hosted managed agent: data location, operations and control trade-offs"),
  ("S4", "Agent construction", "hooks for deterministic actions: something that must always happen (formatting, audit logging) versus asking nicely in a prompt"),
  ("S4", "Agent construction", "permissions and approval in an agent harness: which actions run freely and which need a person"),
  ("S4", "Agent construction", "an agent pauses for a customer upload and may resume on a different worker: what state must be persisted"),
  ("S4", "Agent patterns and frameworks", "recovering from a failed tool call inside a loop without repeating the same mistake"),
  ("S4", "Agent patterns and frameworks", "memory: what to persist across sessions versus what to keep only in the current context"),
  ("S4", "Agent patterns and frameworks", "context management in an agent that runs for hours: compaction versus clearing versus note-taking"),
  ("S4", "Agent patterns and frameworks", "abstraction frameworks (Strands, LangGraph, PydanticAI): when one helps and when direct API calls are simpler"),
  ("S4", "Agent patterns and frameworks", "independent tool calls that can run in parallel versus dependent ones that must be sequential"),
 ],
 "prompt": [
  ("S5", "Context engineering", "context bloat and drift in a long task: pruning tool output before it accumulates"),
  ("S5", "Context engineering", "choosing between compaction, clearing and a subagent's separate context for a given situation"),
  ("S5", "Context engineering", "laying out a long document plus a question: ordering, tags and where the instruction goes"),
  ("S5", "Prompt engineering", "instruction clarity: replacing an ambiguous instruction with an explicit, testable one"),
  ("S5", "Prompt engineering", "few-shot example selection: coverage and diversity of examples versus several near-identical ones"),
  ("S5", "Prompt engineering", "system versus user placement for role, format rules and per-request data"),
  ("S5", "Prompt engineering", "input sanitization: user text that contains delimiter-like markers or instructions"),
  ("S5", "Output handling", "structured output that passes schema validation but violates a business rule: where the extra check lives"),
  ("S5", "Output handling", "defensive parsing and retry: feeding the validation error back versus retrying blindly"),
  ("S5", "Output handling", "skepticism toward confident output: verifying numbers, citations or identifiers the model produced"),
 ],
 "tools": [
  ("S5", "Tool implementation", "writing descriptions for two tools the model keeps confusing"),
  ("S5", "Tool implementation", "tool error handling: returning a failure the model can act on instead of a stack trace or silence"),
  ("S5", "Tool implementation", "client-side tools versus Anthropic-run server-side tools: who executes, who sees the data"),
  ("S5", "Tool implementation", "approval patterns for a tool with irreversible side effects"),
  ("S5", "MCP server development", "MCP resources versus tools versus prompts: what each primitive is for and who controls it"),
  ("S5", "MCP server development", "stdio versus remote (HTTP) transport: where the server runs, who connects, how it is deployed"),
  ("S5", "MCP server development", "scoping an MCP server's tools and credentials to least privilege"),
  ("S5", "Agentic customization", "built-in tools versus custom tools versus MCP versus Skills: choosing the lightest mechanism that works"),
  ("S5", "Agentic customization", "Skill versus subagent versus slash command for a repeatable team procedure"),
  ("S5", "Agentic customization", "a case where building an MCP server is overkill"),
 ],
 "sec": [
  ("S4", "AI application security", "indirect prompt injection through a retrieved document, web page or MCP resource, and what limits the damage"),
  ("S4", "AI application security", "jailbreak defence: layering controls instead of relying on one prompt instruction"),
  ("S4", "AI application security", "data leakage across users or tenants through shared context, caches or memory"),
  ("S4", "Guardrails and safe deployment", "layered guardrails: input checks, output checks and human approval, and which layer catches what"),
  ("S4", "Claude hooks for guardrails", "a PreToolUse hook meant to block a command: what makes the block actually take effect"),
  ("S4", "Identity, secrets and key management", "where API keys and customer tokens may live, rotation, and why they never go in a prompt"),
 ],
 "code": [
  ("S3", "Claude Code core components", "rules versus skills versus commands versus agents: choosing the component for a given need"),
  ("S3", "Claude Code session and headless", "running Claude Code in CI or a script: permissions, scoping what it may change, and getting parseable output"),
 ],
 "eval": [
  ("S3", "Error identification and trace analysis", "isolating whether a wrong result came from the integration layer or from the model by reading a described tool trace"),
 ],
}


def load(name):
    f = DIR / name
    return json.loads(f.read_text(encoding="utf-8")) if f.exists() else []


def rank_of(opts, keyL):
    return 1 + sum(1 for L, t in opts.items() if len(t) > len(opts[keyL]))


def plan():
    rnd = random.Random(20261113)
    slots = []
    for lote in (2, 3):
        existing = load(f"lote{lote}.json")
        n0 = len(existing)
        mine = []
        for dom, need in NEED[lote].items():
            mine += [dom] * need
        # hints per domain, shared between the two lotes, interleaved in list order
        for dom in NEED[lote]:
            pass
        slots_l = []
        for dom in H:
            n2, n3 = NEED[2].get(dom, 0), NEED[3].get(dom, 0)
            order = sorted([(((k + 0.25) / n2), 2) for k in range(n2)] + [(((k + 0.75) / n3), 3) for k in range(n3)])
            hints = H[dom]
            assert len(hints) == n2 + n3, (dom, len(hints), n2 + n3)
            for (pos, lt), h in zip(order, hints):
                if lt == lote:
                    slots_l.append(dict(domain=dom, slice=h[0], skill=h[1], hint=h[2]))
        rnd.shuffle(slots_l)
        assert len(slots_l) == len(mine), (lote, len(slots_l), len(mine))
        # key letters and key length ranks: balance the whole lote (existing + new)
        letters_have = {L: 0 for L in "ABCD"}
        ranks_have = {r: 0 for r in (1, 2, 3, 4)}
        for q in existing:
            letters_have[q["answer"][0]] += 1
            ranks_have[rank_of(q["options"], q["answer"][0])] += 1
        total = n0 + len(slots_l)
        def fill(have, targets):
            out = []
            for k in have:
                out += [k] * max(0, targets[k] - have[k])
            rnd.shuffle(out)
            return out
        base, extra = divmod(total, 4)
        lt = {L: base + (1 if i < extra else 0) for i, L in enumerate("DCBA")}  # extra goes to D, then C...
        rt = {1: base, 2: base + 1, 3: base + 1, 4: base}
        rt = {r: rt[r] for r in rt}
        while sum(rt.values()) != total:
            rt[2 if sum(rt.values()) < total else 1] += 1 if sum(rt.values()) < total else -1
        L_list, R_list = fill(letters_have, lt), fill(ranks_have, rt)
        assert len(L_list) == len(slots_l) == len(R_list), (lote, len(L_list), len(R_list), len(slots_l))
        for i, s in enumerate(slots_l):
            slots.append(dict(id=f"l{lote}-{n0 + i + 1:02d}", lote=lote, domainName=DOMAIN[s["domain"]], keyLetter=L_list[i], keyRank=R_list[i], **s))
    (DIR / "plan.json").write_text(json.dumps(slots, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    from collections import Counter
    for lote in (2, 3):
        ss = [s for s in slots if s["lote"] == lote]
        print(f"lote {lote}: {len(ss)} new slots", dict(Counter(s["domain"] for s in ss)), "letters", dict(Counter(s["keyLetter"] for s in ss)), "ranks", dict(Counter(s["keyRank"] for s in ss)))
    print("slices", dict(Counter(s["slice"] for s in slots)))


STEM_MIN, STEM_MAX = 280, 560
ABSOLUTE = re.compile(r"\b(always|never|every|all|only|guarantee[sd]?|completely|simply|just|entirely|any)\b", re.I)


def problems(d, slot):
    out, warn = [], []
    say = out.append
    for k in ("task", "stem", "key", "ds", "rationale", "ref"):
        if k not in d:
            say(f"missing field {k}")
    if out:
        return out, warn
    stem, key, ds = d["stem"], d["key"], d["ds"]
    if not (isinstance(ds, list) and len(ds) == 3 and all(isinstance(x, str) for x in ds)):
        say("ds must be a list of exactly three strings"); return out, warn
    opts = dict(zip([L for L in "ABCD" if L != slot["keyLetter"]], ds)); opts[slot["keyLetter"]] = key
    lens = {L: len(t) for L, t in opts.items()}
    r = rank_of(opts, slot["keyLetter"])
    if r != slot["keyRank"]:
        say(f"key length rank is {r} but the slot wants {slot['keyRank']} (key {lens[slot['keyLetter']]} chars; distractors {sorted(len(x) for x in ds)}): "
            f"rank 1 = longest, so exactly {slot['keyRank'] - 1} distractor(s) must be STRICTLY longer than the key")
    if max(lens.values()) / min(lens.values()) > 1.6:
        say(f"options differ {max(lens.values()) / min(lens.values()):.2f}x in length (max 1.6)")
    if min(lens.values()) < 70:
        warn.append(f"shortest option is {min(lens.values())} chars (aim for 85-135)")
    if not STEM_MIN <= len(stem) <= STEM_MAX:
        say(f"stem is {len(stem)} chars (want {STEM_MIN}-{STEM_MAX}; aim for 330-480)")
    if "`" in stem + key + "".join(ds) + d["rationale"]:
        say("no backticks or code anywhere")
    if re.search(r"\n|^\s*[-*]\s", stem):
        say("stem must be one plain paragraph")
    if len(d["rationale"]) < 120:
        say("rationale too short (explain the key and each distractor)")
    for tok in ("[K]", "[1]", "[2]", "[3]"):
        if tok not in d["rationale"]:
            say(f"rationale lacks {tok}")
    if re.search(r"\([A-D]\)|\boption [A-D]\b", d["rationale"]):
        say("do not write letters in the rationale; use [K] [1] [2] [3]")
    if not re.match(r"^https://\S+$", d["ref"]):
        say("ref must be an https URL of the official page that supports the key")
    if re.search(r"all of the above|none of the above|capital letters|\b(raise|increase|lower|reduce)\w* the temperature|temperature (to|of) (zero|0)\b", " ".join([key] + ds), re.I):
        say("template distractor (all/none of the above, capital letters, temperature tweaks)")
    kabs = len(ABSOLUTE.findall(key))
    for i, x in enumerate(ds, 1):
        n = len(ABSOLUTE.findall(x))
        if n > kabs + 0:
            warn.append(f"distractor {i} uses absolute/overbroad wording ({', '.join(m.lower() for m in ABSOLUTE.findall(x))}) that the key does not: a test-wise reader spots it")
    if re.search(r"\bsince\b|\bbecause\b", " ".join(ds), re.I) and not re.search(r"\bsince\b|\bbecause\b", key, re.I):
        warn.append("only distractors carry a since/because justification: give every option the same shape")
    return out, warn


def check(files):
    slots = {s["id"]: s for s in json.loads((DIR / "plan.json").read_text(encoding="utf-8"))}
    bad = 0
    for f in files:
        items = json.loads(Path(f).read_text(encoding="utf-8"))
        seen = set()
        for d in items:
            s = slots.get(d.get("id"))
            if not s:
                print(f"{d.get('id')}: not a slot in plan.json"); bad += 1; continue
            if d["id"] in seen:
                print(f"{d['id']}: duplicated"); bad += 1
            seen.add(d["id"])
            out, warn = problems(d, s)
            for m in out:
                print(f"  ! {d['id']} ({s['domain']}): {m}"); bad += 1
            for m in warn:
                print(f"  ~ {d['id']}: {m}")
        print(f"{f}: {len(items)} items, {bad} problem(s)")
    return bad


def assemble():
    plan_slots = {s["id"]: s for s in json.loads((DIR / "plan.json").read_text(encoding="utf-8"))}
    drafts = {}
    for f in sorted((DIR / "drafts").glob("*.json")):
        for d in json.loads(f.read_text(encoding="utf-8")):
            drafts[d["id"]] = d
    missing = [i for i in plan_slots if i not in drafts]
    extra = [i for i in drafts if i not in plan_slots]
    if missing or extra:
        print("missing slots:", missing, "unknown ids:", extra); sys.exit(1)
    for lote in (2, 3):
        items = [q for q in load(f"lote{lote}.json") if not q["id"].startswith(f"{CERT}-l{lote}-") or True]
        keep = {q["id"]: q for q in items}
        for sid, s in plan_slots.items():
            if s["lote"] != lote:
                continue
            d = drafts[sid]
            out, _ = problems(d, s)
            if out:
                print(sid, out); sys.exit(1)
            keyL = s["keyLetter"]; rest = [L for L in "ABCD" if L != keyL]
            opts = {keyL: d["key"], **{L: t for L, t in zip(rest, d["ds"])}}
            rat = d["rationale"].replace("[K]", f"({keyL})")
            for i, L in enumerate(rest, 1):
                rat = rat.replace(f"[{i}]", f"({L})")
            qid = f"{CERT}-{sid}"
            keep[qid] = {"id": qid, "cert": CERT, "source": "lote", "lote": lote, "domain": s["domainName"], "task": d["task"],
                         "question": d["stem"], "options": {L: opts[L] for L in "ABCD"}, "answer": [keyL], "rationale": rat, "ref": d["ref"]}
        ordered = [keep[k] for k in sorted(keep, key=lambda x: int(x.rsplit("-", 1)[1]))]
        (DIR / f"lote{lote}.json").write_text(json.dumps(ordered, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"lote{lote}.json: {len(ordered)} items")


# ---------- contrastive sets (SPEC.md, "Contrastive sets"): one option list shared by 2 (twin) or 4 (quad) stems ----------

def set_problems(s):
    out = []
    sid = s.get("set", "?")
    say = lambda m: out.append(f"{sid}: {m}")
    for k in ("set", "kind", "domain", "task", "ref", "options", "stems"):
        if k not in s:
            say(f"missing field {k}")
    if out:
        return out
    if s["domain"] not in DOMAIN.values():
        say(f"unknown domain {s['domain']!r}")
    opts = s["options"]
    if list(opts) != list("ABCD"):
        say("options must be exactly A, B, C, D"); return out
    lens = [len(v) for v in opts.values()]
    if max(lens) / min(lens) > 1.6:
        say(f"options differ {max(lens) / min(lens):.2f}x in length (max 1.6)")
    if min(lens) < 70:
        say(f"shortest option is {min(lens)} chars (aim for 85-135)")
    if any("`" in v for v in opts.values()):
        say("no backticks or code in options")
    if re.search(r"all of the above|none of the above|capital letters|\b(raise|increase|lower|reduce)\w* the temperature", " ".join(opts.values()), re.I):
        say("template option (all/none of the above, capital letters, temperature tweaks)")
    if not re.match(r"^https://\S+$", s["ref"]):
        say("ref must be an https URL")
    stems = s["stems"]
    keys = [st.get("answer") for st in stems]
    if s["kind"] == "quad":
        if len(stems) != 4 or sorted(keys) != list("ABCD"):
            say(f"a quad has 4 stems and each option is the key of exactly one (keys {keys})")
    elif s["kind"] == "twin":
        if len(stems) != 2 or len(set(keys)) != 2:
            say(f"a twin has 2 stems with different keys (keys {keys})")
    else:
        say("kind must be quad or twin")
    for st in stems:
        i = st.get("id", "?")
        for k in ("id", "stem", "answer", "rationale"):
            if k not in st:
                say(f"{i}: missing {k}")
        if not all(k in st for k in ("id", "stem", "answer", "rationale")):
            continue
        if not re.match(r"^l\d+-\d\d$", st["id"]):
            say(f"{i}: id must look like l4-01")
        if not STEM_MIN <= len(st["stem"]) <= STEM_MAX:
            say(f"{i}: stem is {len(st['stem'])} chars (want {STEM_MIN}-{STEM_MAX}; aim for 330-480)")
        if "`" in st["stem"] + st["rationale"] or re.search(r"\n", st["stem"]):
            say(f"{i}: stem must be one plain paragraph without code")
        if st["answer"] not in "ABCD" or len(st["answer"]) != 1:
            say(f"{i}: answer must be one letter")
        if len(st["rationale"]) < 120:
            say(f"{i}: rationale too short")
        cited = set(re.findall(r"\(([A-D])\)", st["rationale"]))
        if cited != set("ABCD"):
            say(f"{i}: the rationale must cite every option as (A)..(D); it cites {sorted(cited)}")
    if len({st.get("id") for st in stems}) != len(stems):
        say("duplicate stem ids")
    return out


def check_sets(files):
    bad = 0
    for f in files:
        sets = json.loads(Path(f).read_text(encoding="utf-8"))
        for s in sets:
            for m in set_problems(s):
                print("  ! " + m); bad += 1
        print(f"{f}: {len(sets)} sets, {sum(len(s.get('stems', [])) for s in sets)} stems, {bad} problem(s)")
    return bad


def assemble_sets(file, lote):
    sets = json.loads(Path(file).read_text(encoding="utf-8"))
    probs = [m for s in sets for m in set_problems(s)]
    if probs:
        print("\n".join(probs)); sys.exit(1)
    target = DIR / f"lote{lote}.json"
    keep = {q["id"]: q for q in load(target.name)}
    for s in sets:
        for st in s["stems"]:
            if not st["id"].startswith(f"l{lote}-"):
                print(f"{st['id']} does not belong to lote {lote}"); sys.exit(1)
            qid = f"{CERT}-{st['id']}"
            keep[qid] = {"id": qid, "cert": CERT, "source": "lote", "lote": lote, "domain": s["domain"], "task": s["task"],
                         "question": st["stem"], "options": dict(s["options"]), "answer": [st["answer"]], "rationale": st["rationale"],
                         "ref": st.get("ref", s["ref"]), "group": f"{CERT}-set-{s['set']}"}
    ordered = [keep[k] for k in sorted(keep, key=lambda x: int(x.rsplit("-", 1)[1]))]
    target.write_text(json.dumps(ordered, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{target.name}: {len(ordered)} items")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "plan": plan()
    elif cmd == "check": sys.exit(1 if check(sys.argv[2:]) else 0)
    elif cmd == "assemble": assemble()
    elif cmd == "check-sets": sys.exit(1 if check_sets(sys.argv[2:]) else 0)
    elif cmd == "assemble-sets": assemble_sets(sys.argv[2], int(sys.argv[3]))
    else: print(__doc__)
