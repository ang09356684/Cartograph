---
name: cartograph-init
description: Bootstrap a Cartograph manifest for a source repo from zero. Reads the canonical templates (manifest-template / manifest-extraction-guide / manifest-plan) first, then scans the source repo's code to enumerate APIs / workers / tables / topics / integrations / middlewares, and produces a batch plan. Output is written INTO the Cartograph repo (`$CARTOGRAPH_HOME/batch_plan/<repo-id>/batch_plan.md`) — the source repo is never modified. Supports local-only repos (no GitHub remote) and cloned GitHub repos. Use when the user says 「init manifest」「初始化 manifest」「建立 batch plan」「從零開始做 manifest」.
---

# cartograph-init

Bootstrap a manifest for a **source repo** from zero. Plan only — `cartograph-continue` does the yaml writing.

## Architecture (read this once)

Cartograph owns every manifest yaml and every batch_plan. The source repo is **only an input** (read-only):

```
$CARTOGRAPH_HOME/              ← this is where we write
├── data/
│   └── <repo-id>/              ← manifest yaml lives here (cartograph-continue writes this)
│       ├── service.yaml
│       ├── apis/
│       ├── middlewares/
│       └── ...
├── batch_plan/
│   └── <repo-id>/              ← this skill writes here
│       ├── batch_plan.md
│       └── handover.md          (created by cartograph-continue when needed)
└── docs/
    ├── manifest-template.md
    ├── manifest-extraction-guide.md
    └── manifest-plan.md

<source-path>/                   ← user's local clone of the source repo (read-only from our side)
├── internal/... (or app/, src/, ...)
└── .git/
```

Never write to `<source-path>` — only read.

## Inputs

- `--source <absolute-path>` (required) — path to a local clone of the source repo. e.g. `~/Documents/repo/foo`.
- `--id <repo-id>` (optional) — the id under `data/` and `batch_plan/`. Defaults to the source folder's basename.
- `CARTOGRAPH_HOME` env var (optional; default `/Users/angus/Documents/self_develop/Cartograph`).

## Source requirement

The source **must already be a working copy on local disk** — this skill does NOT clone for the user.

| User said | What to do |
|---|---|
| "source is at ~/repos/foo" | Verify `~/repos/foo` exists and `~/repos/foo/.git` exists |
| "it's a GitHub repo" but no local path | STOP. Ask user to `git clone <url> <target>` first, then re-invoke with `--source <target>` |
| source has no `.git` folder | Accept (local-only scratch dir); proceed |

```bash
# Must not be empty
test -d <source>
# If a git repo, this tells us if GitHub
[ -d <source>/.git ] && (cd <source> && git remote get-url origin 2>/dev/null)
```

## Step 0 — Read templates FIRST (mandatory, non-negotiable)

In order, fully:

1. `$CARTOGRAPH_HOME/docs/manifest-template.md`
2. `$CARTOGRAPH_HOME/docs/manifest-extraction-guide.md`
3. `$CARTOGRAPH_HOME/docs/manifest-plan.md`

If `$CARTOGRAPH_HOME` is missing or templates don't exist, ABORT and ask the user for the correct path. Never run from stale memory.

## Step 1 — Detect source mode

Run inside `<source>`:

```bash
cd <source>
git rev-parse --is-inside-work-tree 2>/dev/null && echo GIT || echo NO_GIT
git remote get-url origin 2>/dev/null
```

Classify:

| `origin` URL | Source mode | `service.yaml#repo` value |
|---|---|---|
| `git@github.com:<org>/<repo>.git` / `https://github.com/<org>/<repo>(.git)?` | **github** | `<org>/<repo>` (strip `.git`) |
| Other git host (GitLab / Bitbucket / self-hosted) | **other-remote** | omit (aggregator would 404 on github.com link) |
| No origin / not a git repo | **local-only** | omit |

Record this decision in `batch_plan.md` header so `cartograph-continue` can write the right `service.yaml` without re-detecting.

## Step 2 — Scan the source for entities

Detect language + framework, then enumerate:

| Entity | Look in (Go / Python / Node / Java) |
|---|---|
| APIs | Gin `router.GET/POST/...`; FastAPI `@router.post`; Django `urls.py`; Express `app.get`; Spring `@GetMapping` |
| Workers | Pub/Sub `Receive(...)`; Celery `@shared_task`; node-cron; Spring `@Scheduled`; `cmd/worker`; handler_workertask.go |
| Tables | `migrations/*.sql` (authoritative) + ORM models; prefer staging DB `\d <table>` if accessible |
| Topics | Publisher code (`publisher.Publish` / `broker.Submit*` / `pubsub.Topic(...)`) |
| Integrations | `internal/adapter/` / `pkg/client/` / `app/integrations/`; webhook receivers count as inbound |
| Middlewares | `internal/router/middleware_*.go` / FastAPI `app.add_middleware` / Django `MIDDLEWARE` |
| Pipelines | Routing chain (`router.Group(...).Use(...)`) |

Count per kind. Big router files → note line ranges for later batch split.

## Step 3 — Decide batch strategy

- **Big Gin handler.go (100+ routes)** → batch by **line range**
- **FastAPI / Django** → batch by **router file** / **urls.py block**
- **Feature-flat repo** → batch by **feature area**

Each batch ≈ 15–35 APIs (single-session doable). If total ≤ 30 APIs, one batch is fine.

## Step 4 — Write `batch_plan/<repo-id>/batch_plan.md`

Create `$CARTOGRAPH_HOME/batch_plan/<repo-id>/batch_plan.md` with this structure:

```markdown
# Manifest Batch Plan — <repo-id>

> Generated <YYYY-MM-DD> by cartograph-init.

## Source

- Source path (local clone): `<absolute path to source repo>`
- Source mode: `github` / `other-remote` / `local-only`
- `service.yaml#repo` value: `<org>/<repo>` or `(omit)`
- Source git HEAD at init time: `<commit hash>` (for cartograph-update baseline fallback)

## Output

- Manifest will be written to: `$CARTOGRAPH_HOME/data/<repo-id>/`
- Handover on long sessions: `$CARTOGRAPH_HOME/batch_plan/<repo-id>/handover.md`

## Templates to read (every session)

1. `$CARTOGRAPH_HOME/docs/manifest-template.md`
2. `$CARTOGRAPH_HOME/docs/manifest-extraction-guide.md`
3. `$CARTOGRAPH_HOME/docs/manifest-plan.md`

## Summary

- Language / framework: <detected>
- Entity counts:
  - APIs: N
  - Workers: N
  - Tables: N
  - Topics: N
  - Integrations: N
  - Middlewares: N
  - Pipelines: N

## Per-batch workflow (every batch follows this)

1. `grep` the scope in `<source>` to enumerate routes
2. Read handler + service layer
3. Write `$CARTOGRAPH_HOME/data/<repo-id>/apis/<id>.yaml`
4. New table: prefer staging DB `\d <table>` over migration files
5. Update `$CARTOGRAPH_HOME/data/<repo-id>/service.yaml` indices
6. Pub/Sub publish → triple-record (`steps[]` + `uses.topics_produced[]` + `topics/<id>.yaml`)
7. YAML validate:
   ```bash
   python3 -c "import yaml,os; [yaml.safe_load(open(os.path.join(r,f))) for r,_,fs in os.walk('$CARTOGRAPH_HOME/data/<repo-id>') for f in fs if f.endswith('.yaml')]"
   ```
8. (If Cartograph dev server running) curl sample pages:
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/repos/<repo-id>/apis/<new-id>
   ```
9. Check off the batch + commit Cartograph repo (user policy: don't auto-commit)

## Schema rules reminder

- Pub/Sub triple-record: `steps[]` + `uses.topics_produced[]` + `topics/<id>.yaml`
- One handler → multiple event types: **each its own step**, don't merge
- `failure_semantic`: block / best_effort / log_only
- `inline_auth_checks[]` for non-middleware auth
- `schema_ref` inline type: `<file>#<OuterFunc>.<InnerType>`
- Zod enum elements must be strings (quote `"1001"`)
- Cross-repo: `steps[].target_api_ref: "<repo>:<api-id>"`
- `apis[].middlewares[]` only `{ id }`; internals in `middlewares/<id>.yaml`
- `service.yaml#repo` per source mode recorded above

## Batches

### Batch 0 — foundations
- [ ] `service.yaml` (set `repo:` per source mode above)
- [ ] `middlewares/*.yaml` (N files)
- [ ] `tables/*.yaml` (N files)
- [ ] `topics/*.yaml` (N files)
- [ ] `integrations/*.yaml` (N files)
- [ ] `workers/*.yaml` (N files)

### Batch 1 — <feature area / line range>
**Scope**: `<source>/<file>:<lines>` or `<glob>`
- [ ] `<file>:<lines>` — ~N APIs
  - expected new tables: ...
  - expected new integrations: ...
  - expected cross-repo refs: ...

### Batch 2 — ...

## Overall progress

- [ ] Batch 0 — foundations
- [ ] Batch 1 — ...
- [ ] Batch N — ...
- [ ] `service.yaml#topics_consumed[]` + `workers[]` final sweep
- [ ] Full aggregator smoke test
```

## Step 5 — Also write `batch_plan/<repo-id>/README.md` (short)

One-screen pointer for future sessions:

```markdown
# <repo-id> — Manifest batch plan

- Source: `<source-path>` (<mode>)
- Manifest output: `$CARTOGRAPH_HOME/data/<repo-id>/`
- Plan: `./batch_plan.md`
- Handover: `./handover.md` (if present)

Resume with: `/cartograph-continue --repo <repo-id>`
```

## Step 6 — Report to user

- Total entity counts
- Number of batches
- Size of Batch 0 (usually heaviest)
- **Path to the generated plan**: `$CARTOGRAPH_HOME/batch_plan/<repo-id>/batch_plan.md`
- Next: `/cartograph-continue --repo <repo-id>` (or `--source <path>`)
- Reminder: source repo was NOT modified; nothing was committed

## What this skill does NOT do

- Does NOT write any yaml under `data/<repo-id>/`
- Does NOT modify the source repo
- Does NOT git clone for the user
- Does NOT commit

## Common pitfalls

- Writing batch_plan into the source repo (wrong — always under `$CARTOGRAPH_HOME/batch_plan/`)
- Missing cross-service HTTP adapters (check `internal/adapter/` for integrations, not just direct HTTP client code in handlers)
- Treating Cloud Logging sinks as Pub/Sub topics (they're `integrations/<id>.yaml kind: cloud-logging-sink`)
- Over-batching a small repo
- Skipping template read — spec drift is silent and cumulative
