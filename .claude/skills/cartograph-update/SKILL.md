---
name: cartograph-update
description: Incrementally update a Cartograph manifest based on recent git history of the source repo. Reads the canonical templates first, determines a baseline (last time `data/<repo-id>/` was updated, or source-repo commit recorded in batch_plan), scans source-repo commits since then for changed files (handlers / middlewares / migrations / publishers / adapters), classifies them by entity kind, and patches the corresponding yaml files under `$CARTOGRAPH_HOME/data/<repo-id>/`. Source repo is read-only input; all writes go into Cartograph. Supports `--api <id>` / `--scope <pattern>` / `--since <ref>` to target specific entities. Use when user says 「更新 manifest」「manifest 同步 code 變更」「update manifest since last run」「只更新 <某支 api>」.
---

# cartograph-update

Keep an existing `data/<repo-id>/` manifest in sync with new commits on the source repo. Incremental, not wholesale.

## Architecture reminder

```
$CARTOGRAPH_HOME/              ← CWD / $CARTOGRAPH_HOME
├── data/<repo-id>/             ← we patch yaml files here
├── batch_plan/<repo-id>/       ← optional; has `## Source` header with source path
└── docs/manifest-*.md

<source-path>/                   ← read-only; `git log` runs here
```

## Inputs

- `--repo <repo-id>` (required) — which manifest to update
- `--source <path>` (optional) — source repo absolute path. If omitted, read from `$CARTOGRAPH_HOME/batch_plan/<repo-id>/batch_plan.md` header (`## Source` section). If still missing, ask user.
- Optional scope flags:
  - `--api <id>` — only update this single API yaml (skip git-log scan)
  - `--scope <glob>` — only consider source files matching glob (e.g. `internal/router/handler_chat_*.go`)
  - `--since <ref-or-date>` — explicit baseline (default: auto)

## Step 0 — Read templates FIRST (mandatory)

1. `$CARTOGRAPH_HOME/docs/manifest-template.md`
2. `$CARTOGRAPH_HOME/docs/manifest-extraction-guide.md`
3. `$CARTOGRAPH_HOME/docs/manifest-plan.md`
4. `$CARTOGRAPH_HOME/data/<repo-id>/service.yaml` — know what's currently indexed
5. `$CARTOGRAPH_HOME/batch_plan/<repo-id>/batch_plan.md` (for `## Source` header) if present

Abort if templates missing.

## Step 1 — Resolve source path

```bash
# Priority:
#   1. --source flag
#   2. batch_plan.md ## Source -> `Source path`
#   3. ask user
test -d <source-path> || ABORT("source path invalid")
```

## Step 2 — Determine baseline (source-repo perspective)

The baseline is the source commit at the time of the last manifest update. Candidates:

```bash
cd <source>
# Prefer explicit flag
[ -n "<since>" ] && BASE=<since>

# Otherwise: check for a "last-updated" marker we maintain
LAST_MARKER="$CARTOGRAPH_HOME/data/<repo-id>/.cartograph-last-source-head"
[ -f "$LAST_MARKER" ] && BASE=$(cat "$LAST_MARKER")

# Fallback: batch_plan.md "Source git HEAD at init time" field
# Last fallback: ask user
```

If no baseline can be found and user won't give one, ABORT — cannot safely determine "since when".

## Step 3 — Enumerate changed source files

```bash
cd <source>
# Committed changes since baseline
git log <BASE>..HEAD --name-only --pretty=format: | sort -u | grep -v '^$'

# Also: uncommitted (staged + unstaged + untracked) relevant source files
git status --porcelain | awk '{print $2}'
```

De-dupe. Apply `--scope <glob>` filter if given.

## Step 4 — Classify each changed file by affected entity kind

Example mappings (adjust per repo stack — get hints from batch_plan's `## Summary` section):

| Changed file pattern | Affected entity kind(s) |
|---|---|
| `internal/router/handler_*.go` / `app/routes/*.py` / `src/routes/*.ts` | APIs |
| `internal/router/middleware_*.go` | Middlewares |
| `internal/router/router.go` / main.go routing section | Possibly new pipelines or new routes |
| `migrations/*.sql` / `alembic/versions/*.py` / Django migrations | Tables |
| `internal/domain/*.go` / SQLAlchemy / Django models | Tables |
| `internal/adapter/*_repo.go` / repository layer | Tables (possibly uses.* drift) |
| `internal/app/service/*` | Step-level drift in APIs or workers |
| `internal/adapter/eventbroker/*` / publisher | Topics |
| `internal/adapter/server/*.go` / HTTP client | Integrations |
| `cmd/worker/*` / Celery tasks / subscriber handlers | Workers |
| `cmd/*/main.go` | service.yaml env_config / components |

For each classified source file, map to **specific yaml ids** in `$CARTOGRAPH_HOME/data/<repo-id>/`:
- APIs: read source handler, grep registered path/method → find yaml whose `path + method` match (or `code_ref` match)
- Middlewares: filename → `middlewares/<id>.yaml` (bearer-auth.yaml etc.)
- Tables: migration filename / model → `tables/<table-name>.yaml`

If `--api <id>` was given, **skip classification** — go straight to Step 5 for that single yaml.

## Step 5 — Patch each identified yaml

For every identified yaml, re-derive only the drift-prone fields:

| Yaml kind | Fields to re-derive |
|---|---|
| `apis/<id>.yaml` | `code_ref`, `path`, `method`, `middlewares[]`, `request.schema_ref`, `response[]`, `steps[]`, `uses.*` |
| `middlewares/<id>.yaml` | `code_ref`, `config.env_vars[]`, `reads_context[]`, `writes_context[]`, `error_responses[]` |
| `tables/<id>.yaml` | `columns[]`, `indexes[]`, `migration_ref` (prefer staging `\d` if accessible) |
| `topics/<id>.yaml` | `message_schema.fields[]`, `attributes[]`, `produced_by[]` |
| `workers/<id>.yaml` | `code_ref`, `subscribes_topic`, `processors[]`, `steps[]` |
| `integrations/<id>.yaml` | `operations[]`, `outbound.operations[].url`, `code_ref` |

**Do not rewrite the whole file**. Patch only fields that diverged. Preserve `description` / `notes` / `sequence_mermaid` unless they now conflict with reality.

For **new** routes / middlewares / tables / etc. not yet indexed: create the yaml from scratch following template §4–§8.

For **removed** entities (handler deleted from source): ASK USER before deleting yaml. It may be a rename.

## Step 6 — Sweep `service.yaml`

- Add new entities to the appropriate `apis[] / tables[] / topics_produced[] / integrations[] / middlewares[] / workers[]` index
- Remove only after user confirmation
- If `cmd/*/main.go` env reading changed, update `service.yaml#env_config[]`

## Step 7 — Validate

```bash
python3 -c "import yaml,os; [yaml.safe_load(open(os.path.join(r,f))) for r,_,fs in os.walk(os.path.expandvars('$CARTOGRAPH_HOME/data/<repo-id>')) for f in fs if f.endswith('.yaml')]"
```

If dev server running, curl sample:
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/repos/<repo-id>/apis/<changed-api-id>
```

## Step 8 — Update baseline marker + report

```bash
# Record new baseline so next run can compute the delta
cd <source>
git rev-parse HEAD > "$CARTOGRAPH_HOME/data/<repo-id>/.cartograph-last-source-head"
```

Report to user:
- Baseline used (commit hash + date)
- Number of changed source files classified
- Per-kind summary: APIs / middlewares / tables / topics / integrations / workers → updated M / created K / flagged-for-deletion L
- Any yaml that COULD NOT be auto-resolved — list for manual review
- Whether `service.yaml` was touched

Do NOT `git commit` anything. Leave the Cartograph working tree dirty for the user to review.

## Schema rules

Same as `cartograph-continue`:
- Pub/Sub triple-record
- One event type → one step
- `failure_semantic`: block / best_effort / log_only
- `inline_auth_checks[]` for non-middleware auth
- `schema_ref` inline type: `<file>#<OuterFunc>.<InnerType>`
- Zod enum elements must be strings
- Cross-repo: `steps[].target_api_ref`
- `apis[].middlewares[]` carries only `{ id }`
- `service.yaml#repo`: don't change; already fixed at init

## Targeted mode: `--api <id>`

1. Skip git log + classification
2. Read `$CARTOGRAPH_HOME/data/<repo-id>/apis/<id>.yaml`
3. Re-derive drift-prone fields against current source state (whatever the handler / service / middleware looks like right now)
4. Patch + validate
5. Report only changes for that one API
6. Update `.cartograph-last-source-head` marker

## Common pitfalls

- Writing into `<source>/manifest/` — WRONG, output is `$CARTOGRAPH_HOME/data/<repo-id>/`
- Using file mtime instead of git log + marker — mtime is unreliable after clone/rebase
- Missing handler → yaml mapping because `code_ref` moved — fall back to path+method match
- Overwriting user-authored `description` / `notes` / `sequence_mermaid`
- Treating a code-only service-layer refactor as an API change — check `code_ref` / steps actually shifted
- Deleting a yaml because its handler got renamed — always prompt before deletion
- Forgetting to update `service.yaml` after adding a new entity yaml
- Not updating `.cartograph-last-source-head` marker — next run re-scans from same baseline
