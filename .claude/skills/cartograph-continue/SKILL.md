---
name: cartograph-continue
description: Continue implementing a Cartograph manifest batch plan. Reads `manifest-template-essentials.md` + `manifest-extraction-guide.md` + existing `batch_plan/<repo-id>/batch_plan.md` + `handover.md` (if present) first, then executes the next unchecked batch — writing yaml directly into `$CARTOGRAPH_HOME/data/<repo-id>/` (not into the source repo), updating service.yaml, validating, checking the box. Source repo is read-only input. At the end of each batch, if context usage exceeds ~50%, writes `handover.md` and suggests a fresh session. Use when user says 「繼續做 manifest」「做下一批」「continue batch plan」「implement next batch」.
---

# cartograph-continue

Execute the next unchecked batch from `$CARTOGRAPH_HOME/batch_plan/<repo-id>/batch_plan.md`. Output goes INTO Cartograph (`data/<repo-id>/`); source repo is only read.

## Architecture reminder

```
$CARTOGRAPH_HOME/              ← CWD (or $CARTOGRAPH_HOME env var)
├── data/<repo-id>/             ← we write here
├── batch_plan/<repo-id>/       ← we read plan + update checkboxes + write handover
└── docs/manifest-*.md

<source-path>/                   ← we only read from here (never write)
```

CARTOGRAPH_HOME resolution order:
1. `$CARTOGRAPH_HOME` env var
2. `git rev-parse --show-toplevel` (if CWD is inside a git repo)
3. default `/Users/angus/Documents/self_develop/Cartograph`

## Inputs

- `--repo <repo-id>` (required if multiple repos have plans) — which repo's plan to continue
- `--source <path>` (optional) — override source path from batch_plan header; useful if user moved the clone

## Step 0 — Read these FIRST (mandatory, in order)

1. `$CARTOGRAPH_HOME/docs/manifest-template-essentials.md` — single skill-facing spec (covers folder layout, all entity skeletons, step rules, sequence_mermaid rules, Pub/Sub triple-record, description rule, cross-ref, common pitfalls, aggregator-auto). Fits in one Read. **Do not** load the full `manifest-template.md` — it's frozen rationale-only and ~3× the tokens.
2. `$CARTOGRAPH_HOME/docs/manifest-extraction-guide.md` — "值從 source code 哪裡挖" (Go / Python / Node / Java patterns)
3. `$CARTOGRAPH_HOME/batch_plan/<repo-id>/batch_plan.md` — find first unchecked batch + the `## Source` header (source path + mode + `service.yaml#repo` value)
4. `$CARTOGRAPH_HOME/batch_plan/<repo-id>/handover.md` **if exists** — prior session state (authoritative when conflicting with batch_plan checkboxes)
5. `$CARTOGRAPH_HOME/data/<repo-id>/service.yaml` if already exists — current indices

Do not implement anything until all relevant reads are done. If `batch_plan/<repo-id>/batch_plan.md` is missing, redirect the user to `/cartograph-init` instead.

## Step 1 — Pick the next batch

- From `batch_plan.md` find the first `[ ]` batch under `## Batches`
- If `handover.md` says "Batch N in-progress", continue at N (don't skip forward)
- State clearly which batch + scope you're executing

## Step 2 — Execute the batch

Every batch follows the same pattern (details depend on scope):

1. `grep` / read from `<source>` to enumerate routes or entities in scope
2. For each entity:
   a. Read source handler/service/adapter to extract fields
   b. **Write** `$CARTOGRAPH_HOME/data/<repo-id>/<kind>/<id>.yaml`
3. Update `$CARTOGRAPH_HOME/data/<repo-id>/service.yaml` indices (`apis[] / tables[] / topics_produced[] / integrations[] / middlewares[] / workers[]`)
4. **Never touch `<source>`** — all writes go inside Cartograph
5. New tables: prefer staging DB `\d <table>` over migration files, if user has proxy access configured
6. Pub/Sub publish → triple-record rule
7. YAML parse check:
   ```bash
   python3 -c "import yaml,os; [yaml.safe_load(open(os.path.join(r,f))) for r,_,fs in os.walk(os.path.expandvars('$CARTOGRAPH_HOME/data/<repo-id>')) for f in fs if f.endswith('.yaml')]"
   ```
8. (Dev server running) curl sample pages:
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/repos/<repo-id>/apis/<new-id>
   ```

## Step 3 — Schema rules

All yaml-content rules live in `$CARTOGRAPH_HOME/docs/manifest-template-essentials.md` (read in Step 0). Continue-specific reminder only:

- **`service.yaml#repo`** must follow `batch_plan.md` `## Source` decision — github → `<org>/<repo-name>`; local-only / other-remote → omit. **Don't re-detect** per session.
- Zod enum elements must be strings (quote `"1001"`).

## Step 4 — Finalize the batch

1. Check the box for this batch in `batch_plan/<repo-id>/batch_plan.md`
2. Append one section to `batch_plan/<repo-id>/handover.md`:
   - Date + batch id
   - Entities added (counts)
   - New tables / topics / integrations / middlewares introduced
   - Surprises / drift discoveries
   - Anything deferred

**Do not** `git commit` the Cartograph repo unless the user explicitly asks.

## Step 5 — Context-watch (proactive handover)

After each batch, estimate context usage:

| Usage | Action |
|---|---|
| < 40% | If user wants, continue to next batch |
| 40–60% | Finish current batch → STOP → propose handover |
| > 60% | Stop immediately, write handover, strongly recommend fresh session |

Handover message template:
```
Context ~X%. Batch N done; Batch N+1 not started.
Updated: $CARTOGRAPH_HOME/batch_plan/<repo-id>/handover.md
Resume in a fresh session with:
  /cartograph-continue --repo <repo-id>
```

## `batch_plan/<repo-id>/handover.md` format

Create if missing; append each session. Keep ≤ 250 lines — trim older entries.

```markdown
# Manifest Handover — <repo-id>

> Last updated: <YYYY-MM-DD HH:MM>
> Resume with: `/cartograph-continue --repo <repo-id>`

## Read-first on resume

1. $CARTOGRAPH_HOME/docs/manifest-template-essentials.md
2. $CARTOGRAPH_HOME/docs/manifest-extraction-guide.md
3. $CARTOGRAPH_HOME/batch_plan/<repo-id>/batch_plan.md (checkbox state + ## Source)
4. $CARTOGRAPH_HOME/batch_plan/<repo-id>/handover.md (this file)
5. $CARTOGRAPH_HOME/data/<repo-id>/service.yaml

## Source

- Source path: `<absolute path>`
- Source mode: `github` / `other-remote` / `local-only`
- `service.yaml#repo` value: `<org>/<repo-name>` or `(omitted)`

## Current state (YYYY-MM-DD)

- Batch 0 — foundations: done / in-progress / not-started
- Batch 1 — <name>: done (N APIs)
- Batch 2 — <name>: in-progress (M/N APIs; see "WIP notes")
- Batch 3+ : not started

**Total indexed**: X APIs / Y tables / Z topics / W integrations / V middlewares

## WIP notes (Batch currently in flight)

- Files touched this session: ...
- Partial: `data/<repo-id>/apis/foo.yaml` drafted but not validated
- Blockers: ...

## Discoveries / drift (cumulative)

- <table_x>: migration said `foo` but DB had `bar` — yaml reflects DB
- handler.go:L200 Swagger annotation wrong method — yaml follows actual route
- <one bullet per quirk>

## Next batch to pick up

Batch N+1 — <name>
Scope: `<source>/<file>:<lines>`
Expected new entities: ...

## Not committed

Implementer has NOT run `git commit` per user policy. Changes sit in Cartograph working tree under `data/<repo-id>/` + `batch_plan/<repo-id>/`.
```

## Common pitfalls

- Writing yaml into `<source>/manifest/` — WRONG, it belongs in `$CARTOGRAPH_HOME/data/<repo-id>/`
- Re-detecting `service.yaml#repo` instead of honouring batch_plan's recorded decision
- Starting before reading handover.md — you'll re-do work or miss quirks
- Leaving `service.yaml` stale — always update index when an entity yaml is added
- Forgetting Pub/Sub triple-record for a single publish
- Letting context run past 60% without handover — next session can't recover
