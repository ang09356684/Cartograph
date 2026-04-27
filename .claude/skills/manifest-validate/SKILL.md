---
name: manifest-validate
description: Validate that a Cartograph manifest yaml (api / worker) is CORRECT — both against the source code it describes AND as a renderable mermaid diagram. Catches (a) steps[] that drift from the real handler + service code (missing pre-check, hallucinated repo-internal detail, wrong method name, skipped validate, step description contradicts code); (b) sequence_mermaid parser breakers (`<=`, `>=`, `;` in arrow labels, `?(`); (c) flow / activation problems (missing `A->>S` bridge, unclosed `S-->>A` between two service calls, nested `opt`/`alt`/`loop` that split the client-side render into two disconnected blocks, orphan `A-->>C`). Workflow re-reads handler + service from the source repo, compares line-by-line against yaml steps + mermaid, then runs parser + activation scans. Runs at the end of any batch of manifest edits before sync / commit. Use when the user says 「檢查 manifest」「驗證 yaml 正確性」「檢查 step 是否正確」「mermaid render 錯誤」「yaml 寫完檢查」「check manifest」「validate manifest」「重新檢查流程」.
---

# manifest-validate

End-to-end correctness check for a manifest `apis/<id>.yaml` (or `workers/<id>.yaml`). Three failure classes — this skill catches all three in one pass:

1. **Class C — Steps drift from code** (most dangerous; does not fail any linter)
   - Steps describe behaviour the code no longer does, or never did.
   - Spec source of truth: `manifest-extraction-guide.md §0` "code 為真, docs 為輔" and `§2.3` (the 7 step-splitting points).

2. **Class A — Mermaid parser breakers**
   - Specific char combos break mermaid grammar, producing a red `Mermaid error: Parse error on line N` banner.

3. **Class B — Mermaid flow / activation problems**
   - yaml parses fine, aggregator returns HTTP 200, but the rendered SVG splits into two disconnected blocks or has a floating activation bar. `curl 200` will NOT catch this.

**Neither the Zod schema nor the aggregator's HTTP route catches C or B**. Run this skill (or its logic) manually.

---

## When to invoke

- At the end of any batch of manifest yaml edits, before `git commit` / sync to aggregator data dir.
- After `curl` reports 200 but the user reports "diagram is broken" / "render 成兩段" / "Mermaid error" / "steps 跟 code 不符".
- When a new yaml is added.
- Before writing HANDOFF / session-close notes (so notes don't ship broken yaml).

## Inputs

- `--repo <repo-id>` (required when more than one manifest tree exists).
- `--source <absolute-path>` (required for Class C — we need the source repo to grep). Default: infer from `$CARTOGRAPH_HOME/batch_plan/<repo-id>/batch_plan.md` header.
- `--manifest-root <path>` (optional). Default: `$CARTOGRAPH_HOME/data/<repo-id>/apis` (or the source repo's `manifest/apis/` if running locally).
- `--file <yaml-path>` (optional) — validate a single file.
- `--fix` (optional; default off) — auto-rewrite only the deterministic Class A substitutions (`<=` → `≤`, `;` → `,`). Never auto-rewrite Class B/C — human judgement required.

---

## Class C — Steps / mermaid drift from code (run this FIRST)

This class automated greps cannot catch. Past systematic audits have surfaced **6 recurring drift types** — use them as a review checklist:

| # | Drift type | Example | Spec hook |
|---|---|---|---|
| C1 | Missing `A->>S: <ServiceMethod>(...)` bridge arrow in mermaid | handler clearly calls `app.OrganizationService.ListAutoAssignmentRules`, yaml jumps from `A->>A: acl` straight to `S->>DB: ...` | `essentials §9` arrow type table |
| C2 | Cross-layer arrows collapsed into one line | `A->>A: base + bearer-auth + inline org-scope check` (middleware + handler-layer inline check on one line) | `essentials §9` 「必須獨立 arrow」 |
| C3 | Service-layer pre-check step skipped | `list-auto-assignment-rules` only wrote a `JOIN` but the real code does **two** queries: `GetAssignmentGeneralSettingByOrgID` then `ListAutoAssignmentRuleBySettingID` | `extraction-guide §2.3` + `essentials §9` |
| C4 | Repo-internal implementation hallucinated into a service step | `switch-priority` yaml wrote "offset to dodge unique (setting_id, order_of_priority)" — that's a repo-layer trick the service layer doesn't surface | `extraction-guide §0` "code 為真" + `§2.3.1` "抄進來" |
| C5 | Description contradicts actual code semantics | yaml says "for each condition, fetch keywords if any"; real code only reads `conditions[0]` (multi-element only logs a warning) | `extraction-guide §0` |
| C6 | Business-rule validate steps missing | `switch-priority` had no `isRuleLenEqual` / `areRulesExist` / `isRuleDuplicate` steps even though the service explicitly calls all three | `essentials §9` + `extraction-guide §2.3` |

### Audit flow per yaml (do not skip steps)

For each yaml you changed (or that Class A/B scans surfaced):

1. **Locate the handler**:
   ```bash
   grep -n "func <HandlerName>" <source>/internal/router/handler_*.go
   ```

2. **Read handler body** (one function's worth of lines). Note:
   - Which `app.<X>Service.Method()` calls it makes, in order.
   - Any inline validations (param shape, cross-org checks, path/body mismatches).
   - Final `respondWithJSON` / `respondWithError` / `respondWithoutBody` status codes per branch.

3. **Read each service method body**. Note:
   - Each DB call (repo method name + entity).
   - Each external / adapter call (`s.<adapter>Server.X` or `s.<x>Repo.Y`).
   - Validate-then-error patterns (each is its own step + its own error code).
   - Any `errgroup` / `sync.WaitGroup` concurrency.
   - Any publish / cache write / log-sink.

4. **Compare against yaml `steps[]`** using the 7 splitting points (`extraction-guide §2.3`):
   `Parse → Validate → Auth inline → DB → External → State transition → Respond`.
   Add missing steps. Delete steps the code doesn't have. Fix step descriptions that paraphrase incorrectly.

5. **Compare against `sequence_mermaid`**:
   - Every `app.<X>Service.Method` call in the handler must appear as an `A->>S:` arrow.
   - Every repo / external call must appear as `S->>DB:` or `S->>X:`.
   - DB arrow SQL granularity: `essentials §9` — action-phrase by default; keep SQL only for soft-delete filter / JOIN / UPSERT / partial unique dup / cursor ORDER BY / subquery / CTE / window.
   - `Note over X,Y: failure_semantic=<sem>` whenever a publish / external call has non-`block` failure behaviour.

6. **Update `uses.tables` / `uses.integrations` / `uses.topics_produced`** so they match what the code touches — no more, no less.

### Anti-patterns the user has called out (incident log)

- **Don't bulk-edit** — don't sweep 10 yaml in one pass with a generic fix. Each yaml needs handler + service re-read. Generic labels like `A->>S: invoke service` = hallucination = C4.
- **Don't invent integrations** — if a handler calls `s.mixerServer.X`, that's `mixer-server`, not `infobip`. Confirm the adapter source file actually exists before naming an integration.
- **Don't 腦補 repo 內部** — repo-layer tx, offset tricks, suffix expressions are implementation noise; the service layer is the right abstraction. Exception: when spec §4 flags the SQL pattern as "語意關鍵" (subquery / CTE / soft-delete / etc.), preserve the SQL fragment.
- **不中途加規則** — if the spec is ambiguous, stop and ask; don't invent a new convention mid-audit.

---

## Class A — Mermaid parser-breaking chars (deterministic, auto-detectable)

| Pattern | Why it breaks | Safe rewrite |
|---|---|---|
| `<=` | `<` immediately followed by `=` — tokenised as invalid HTML tag start | `≤`, `at most N`, `up to N` |
| `>=` | mirror of `<=` | `≥`, `reaches N`, `at least N` |
| `<` + no space + letter/digit | parser reads as HTML tag open | add spaces: `len < 5` |
| `>` + no space + letter/digit | same | `len > 0` |
| `?` immediately followed by `(` | `?` ends arrow label, parser expects new arrow on same line but sees `(` | split into two arrows, drop the `?`, or rephrase so the clause doesn't end with `?` |
| `;` anywhere in an arrow label | some mermaid builds treat `;` as statement terminator inside labels | use `,` or split into two arrows |

### SAFE — do NOT "fix" these

- `>` / `<` with spaces on both sides (`len > 0`, `a < b`) — fine.
- `→` (U+2192) inside labels — fine. A prior session wasted cycles reverting `→`; don't repeat.
- `?` in a label as long as the next non-space token is NOT `(`. `WHERE id=?` alone is fine.
- `=` alone (`status=active`).
- Parens in labels, as long as nothing like `?(` or `;(` appears immediately before.

### Auto-scan (Class A)

```bash
grep -nE '^\s{4,}[A-Za-z0-9_]+\s*-{1,2}>>?\s*[A-Za-z0-9_]+\s*:.*(<=|>=|\?\(|;)' <manifest-root>/*.yaml
grep -nE '^\s{4,}Note .*(<=|>=|\?\(|;)' <manifest-root>/*.yaml
```

Surface each hit as `<file>:<line>: <matched-text>`. `--fix` handles ONLY `;` → `,` and `<=` / `>=` → `≤` / `≥`; never the `?(` case (needs human judgement).

---

## Class B — Mermaid flow / activation problems (need reasoning)

HTTP 200 does not mean "renders correctly". Four canonical failures:

### B1. Missing `A->>S:` bridge

First `S->>…` appears before any arrow has activated `S`. Client splits into two disconnected diagrams.

**Detect**: activation walk. Treat the **src of the first arrow** as the initial activated participant (NOT `{C, A}` hard-coded — that misfires on Pub/Sub push consumer yaml where entry is `PS->>A:`). Then walk forward; every subsequent arrow's src must already be live.

### B2. Missing `S-->>A:` return between two `A->>S:` calls

Handler makes two service calls (e.g. `CreateX` then re-read via `GetX`). If the first activation on `S` is not closed with `S-->>A:`, the second `A->>S:` nests a new activation inside and the final `A-->>C:` renders detached.

**Rule**: every `A->>S:` needs a matching `S-->>A:` before the next `A->>S:` or the terminal `A-->>C:`.

**Fix shape**:
```
A->>S: CreateFoo(...)
...service work...
S-->>A: newFoo            ← required
A->>S: GetFoo(newFoo.ID)
...re-fetch...
S-->>A: FooWithDetails    ← required
A-->>C: 201 + body
```

### B3. Nested blocks that break client-side render

Server-side yaml parse passes (200), but mermaid.js in the browser fails layout. Observed bad shapes:

| Pattern | Flatten into |
|---|---|
| `opt X { alt Y / else Z }` (opt containing alt) | two parallel `opt`s: `opt X AND Y` + `opt X AND Z` |
| `alt ... else { opt W }` (alt branch containing opt) | inline the opt condition into the preceding arrow's label: `S->>FB: Y (only if not subscribed)` |
| `loop { insert X; opt cat==keywords { insert kw } }` | collapse into inline label: `loop per cond { S->>DB: insert cond (+ insert kw if category==keywords) }` |
| `Note over X,Y:` placed **between** two arrows from the same active participant | move the note info into the preceding arrow's label `(foo log-only)`, OR move the Note up to right after the `participant` declarations |

#### B3 標準 flatten 樣板：mutually-exclusive dispatch + 內部多決策

**當 yaml 真的有一組互斥 dispatch（例：feature flag primary vs legacy、webhook vs internal、kind=a/b/c）**，mermaid 只留**一層最外 `alt / else`** 呈現，內部所有條件判斷壓成線性 arrow + `Note over`：

```
alt primary implementation (flag on)
  W->>P: RunWorkflow(param)
  P->>DB: loadSessionContext
  P->>P: checkQuota
  Note over P: if quota exceeded, handover and return
  P->>P: needHandoverCheck
  Note over P: if needHandover, executeHandover and return
  P->>X: callExternalOrToolLoop
  Note over P,X: handover triggers (sentinel / errHandoverNeeded / other err) → executeHandover and return
  P->>Y: sendReplyAdapter
  P-->>W: err or nil
else legacy (flag off)
  W->>L: RunLegacyWorkflow(param)
  ...
end
```

關鍵原則：
- 外層 `alt / else` 只放**真正互斥**（讀 flag 後二選一）的 dispatch。
- 內部的「quota exceeded / needHandover / Delivered」等條件點，一律用 `Note over <participant>: if <cond>, <behavior> and return` 線性敘述。
- 完整條件 / 錯誤碼語意保留在 `steps[]` 的 `note` / `rule` — mermaid 只畫 happy path + 最外層互斥。
- 沒有互斥 dispatch 時（大多數 API）甚至可以**完全不用** `alt`，只用線性 arrow + Note。

**反例**（不要這樣寫）：
```
alt flag on
  opt CheckDebounce
    alt debounced ... end
  end
  alt quota exceeded ...
  else within cap
    alt needHandover ...
    else
      alt self-hosted ...     ← 5 層 nesting，renderer 會斷
```

### B4. Orphan `A-->>C:` with no `S-->>A:` before it

Any terminal `A-->>C: <status + body>` (200 / 201 / 204 / 4xx / 5xx — status code doesn't matter) whose immediately preceding arrow is `S->>DB:` or `S->>X:`. The activation on `S` never closed; response line renders detached.

Common shapes this catches:
- `A-->>C: 201 Created + {id}` after a `S->>DB: INSERT …` (POST create)
- `A-->>C: 204 No Content` after `S->>DB: DELETE …` (DELETE)
- `A-->>C: 400 ErrInvalidPayload` inside a validate branch with no service return
- `A-->>C: 409 ErrDuplicate` after the unique-violation check
- `A-->>C: 500 ErrInternal` after an unhandled external call

**Fix**: insert `S-->>A: <result or err>` before the final `A-->>C:`, regardless of status code.

---

## Validation flow (run every step, in order)

```
0. Identify changed / new yaml files (git status, or user's explicit list).

1. CLASS C — for each file, redo the handler+service audit:
     - grep handler, read body
     - read each invoked service method
     - compare yaml steps vs code (7 splitting points)
     - compare sequence_mermaid vs code (every service call = A->>S; every DB/external = S->>DB/X)
     - fix uses.tables / integrations / topics_produced to match code

2. CLASS A — run grep scans for `<=`, `>=`, `?(`, `;` in mermaid arrow labels and Notes.
   - Optionally --fix for the deterministic cases.
   - `?(` never auto-fixed.

3. CLASS B — run activation walker + nesting detector (script below).
   - B1/B2/B4 reported line-accurate.
   - B3 surfaced as "verify in browser" (cannot be decided by regex alone).

4. Curl every flagged / changed URL:
     curl -s -o /dev/null -w "%{http_code} %s\n" "$AGGREGATOR/repos/<repo>/apis/<id>"
   200 is necessary but NOT sufficient.

5. Browser eyeball every flagged URL:
     - diagram is ONE connected unit (no vertical white gap),
     - no red "Mermaid error" banner,
     - activation bars close before response arrows.

6. Only after 1-5 pass: sync to aggregator data dir / commit.
```

---

## Scan script (drop-in)

Save as `<repo>/scripts/scan_manifest.py` or `$CARTOGRAPH_HOME/tools/scan_manifest.py`. Handles Class A + B1 + B2 + B3 + B4 in one pass. Class C is code-review and cannot be scripted — audit flow step 1 above handles it.

```python
#!/usr/bin/env python3
"""
Scan manifest/apis/*.yaml for Class A (parser-breakers) + Class B (flow problems).
Usage: scan_manifest.py <path-to-apis-dir-or-single-yaml>
"""
import os, re, sys
import yaml

ARROW_FWD = re.compile(r'^\s*([A-Za-z0-9_]+)\s*(?:->>|->|-\))\s*([A-Za-z0-9_]+)\s*:(.*)$')
ARROW_RET = re.compile(r'^\s*([A-Za-z0-9_]+)\s*(?:-->>|-->|--\))\s*([A-Za-z0-9_]+)\s*:(.*)$')

CLASS_A_PATTERNS = [
    ('<=', '<= : use ≤ / at most N'),
    ('>=', '>= : use ≥ / at least N'),
    ('?(', '?( : ? immediately followed by ( — rewrite, do not auto-fix'),
    (';',  '; in arrow label — use , or split into two arrows'),
]

NESTING_KEYWORDS = ('alt', 'opt', 'loop', 'par')

def scan_yaml(path):
    with open(path) as f:
        doc = yaml.safe_load(f) or {}
    if not isinstance(doc, dict): return []
    m = doc.get('sequence_mermaid', '')
    if not m: return []
    lines = m.split('\n')
    issues = []

    # --- Class A ---
    for i, line in enumerate(lines, 1):
        s = line.strip()
        is_arrow = ARROW_FWD.match(s) or ARROW_RET.match(s)
        is_note = s.startswith('Note ')
        if not (is_arrow or is_note): continue
        for pat, reason in CLASS_A_PATTERNS:
            if pat in s:
                issues.append((i, 'A', reason, s))

    # --- Class B walk ---
    first_src = None
    activated = set()
    a_s_stack = []
    block_stack = []

    for i, line in enumerate(lines, 1):
        s = line.strip()
        if not s: continue
        low = s.lower()
        if low.startswith(('participant ', 'actor ')): continue

        first_word = low.split(' ', 1)[0].rstrip(':')
        if first_word in NESTING_KEYWORDS:
            if block_stack:
                issues.append((i, 'B3', f'nested {first_word} inside {block_stack[-1]} — verify in browser', s))
            block_stack.append(first_word)
            continue
        if first_word == 'else': continue
        if first_word == 'end':
            if block_stack: block_stack.pop()
            continue
        if low.startswith('note '): continue

        mret = ARROW_RET.match(s)
        if mret:
            src, dst = mret.group(1), mret.group(2)
            if first_src is None:
                first_src = src; activated = {src}
            if src not in activated:
                issues.append((i, 'B1', f'return src {src!r} never activated', s))
            if a_s_stack and a_s_stack[-1] == ('A', src):
                a_s_stack.pop()
            continue

        mfwd = ARROW_FWD.match(s)
        if mfwd:
            src, dst = mfwd.group(1), mfwd.group(2)
            if first_src is None:
                first_src = src; activated = {src}
            if src not in activated:
                issues.append((i, 'B1', f'src {src!r} not activated — missing A->>S bridge?', s))
            if src == 'A' and dst not in ('A', 'C'):
                if any(p[1] == dst for p in a_s_stack):
                    issues.append((i, 'B2', f'second A->>{dst} without prior S-->>A return', s))
                a_s_stack.append((src, dst))
            if src == 'A' and dst == 'C' and a_s_stack:
                issues.append((i, 'B4', f'A-->>C with {len(a_s_stack)} unclosed A->>S activation(s)', s))
            activated.add(src); activated.add(dst)
    return issues

def main(argv):
    if len(argv) < 2:
        print("usage: scan_manifest.py <apis-dir-or-yaml>"); sys.exit(2)
    target = argv[1]
    files = []
    if os.path.isdir(target):
        for f in sorted(os.listdir(target)):
            if f.endswith('.yaml'): files.append(os.path.join(target, f))
    else:
        files = [target]
    total = 0
    for p in files:
        try: issues = scan_yaml(p)
        except Exception as e:
            print(f"!! {p}: {e}"); continue
        if issues:
            total += 1
            print(f"\n== {os.path.basename(p)} ({len(issues)} issue(s)) ==")
            for ln, cls, reason, s in issues:
                print(f"  L{ln} [{cls}] {reason}")
                print(f"       {s[:120]}")
    print(f"\nBroken yaml: {total}/{len(files)}")
    sys.exit(1 if total else 0)

if __name__ == '__main__':
    main(sys.argv)
```

---

## Output format

```
<repo>/<file>.yaml
  L<n> [A|B1|B2|B3|B4|C1|C2|C3|C4|C5|C6] <short reason>
       <offending line, trimmed to 120 chars>
```

Group by file. Always end with a total count summary:
```
Broken yaml: <files-with-issues>/<total-files>
  Class C: <count>   ← code-drift (manual audit results)
  Class A: <count>
  Class B: <count>
```

If `--fix` ran, list auto-rewrites separately from human-required issues.

---

## Don'ts (accumulated from real incidents)

- **Don't skip the code re-read**. "yaml looks fine" without re-reading handler + service is how drift survives across sessions.
- **Don't auto-rewrite `?(`** — the correct fix depends on what the `?` was standing in for.
- **Don't auto-flatten nested blocks** — flattening loses information; human decides which detail to keep.
- **Don't claim "validated" based on `curl 200` alone** — say explicitly "200 OK, B3/B4 not verifiable without browser render."
- **Don't remove `→` from labels** — it's safe.
- **Don't waste cycles testing `<` / `>` with surrounding spaces** — that's fine.
- **Don't invent integrations** — if a service calls `s.XServer.Y`, confirm `internal/adapter/server/x_server.go` exists and has `Y` before naming it.
- **Don't bulk-edit** — each yaml needs its own handler + service re-read. No generic `A->>S: invoke service` labels.
- **Don't add new spec rules mid-audit** — if template / guide is ambiguous, stop and ask.
