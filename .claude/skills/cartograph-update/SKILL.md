---
name: cartograph-update
description: Incrementally update a Cartograph manifest based on recent git history of the source repo. Reads `manifest-template-essentials.md` + `manifest-extraction-guide.md` first, determines a baseline (last time `data/<repo-id>/` was updated, or source-repo commit recorded in batch_plan), scans source-repo commits since then for changed files (handlers / middlewares / migrations / publishers / adapters), classifies them by entity kind, and patches the corresponding yaml files under `$CARTOGRAPH_HOME/data/<repo-id>/`. Automatically runs `manifest-validate` (Class A+B whole-tree scan + Class C handler/service audit on only the yaml it just patched) before advancing the baseline marker. Source repo is read-only input; all writes go into Cartograph. Supports `--api <id>` / `--scope <pattern>` / `--since <ref>` to target specific entities. Use when user says 「更新 manifest」「manifest 同步 code 變更」「update manifest since last run」「只更新 <某支 api>」.
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

1. `$CARTOGRAPH_HOME/docs/manifest-template-essentials.md` — single skill-facing spec (folder layout, all entity skeletons, step rules, sequence_mermaid rules, Pub/Sub triple-record, common pitfalls, aggregator-auto). Fits in one Read.
2. `$CARTOGRAPH_HOME/docs/manifest-extraction-guide.md` — "code 為真" extraction patterns used by Class C audit
3. `$CARTOGRAPH_HOME/data/<repo-id>/service.yaml` — know what's currently indexed
4. `$CARTOGRAPH_HOME/batch_plan/<repo-id>/batch_plan.md` (for `## Source` header) if present

Abort if essentials and extraction-guide are missing.

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

# Otherwise: check for a "last-updated" marker we maintain (yaml-ish; parse sha:)
LAST_MARKER="$CARTOGRAPH_HOME/data/<repo-id>/.cartograph-last-source-head"
[ -f "$LAST_MARKER" ] && BASE=$(awk -F': *' '/^sha:/{print $2; exit}' "$LAST_MARKER")

# Fallback: batch_plan.md "Source git HEAD at init time" field
# Last fallback: ask user
```

Marker file format (human-readable yaml — all fields are informational except `sha:` which the skill parses):

```
# Cartograph manifest last-update marker — read by /cartograph-update as baseline.
sha: <40-char SHA>
source_commit_date: <iso date of that SHA in source repo>
source_commit_subject: <commit subject of that SHA>
marker_updated_at: <iso datetime when this marker was written>
marker_updated_by: cartograph-update (<mode>)   # "bootstrap" | "auto" | "--api <id>"
```

Show `source_commit_date` + `marker_updated_at` in the Step 8 report so the user can eyeball the window.

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

## Step 5 — Patch each identified yaml (single pass)

**Single-pass rule**: for each yaml you touch, fix EVERYTHING that needs fixing in this one edit — `steps[]` + `sequence_mermaid` + `uses.*` + `response[].fields[]` + index entries — before moving to the next yaml. Do NOT defer mermaid drift to Step 7b and patch it on a second pass; that creates churn and dirty intermediate states.

For every identified yaml, re-derive the drift-prone fields:

| Yaml kind | Fields to re-derive |
|---|---|
| `apis/<id>.yaml` | `code_ref`, `path`, `method`, `middlewares[]`, `request.schema_ref`, `response[]`, `steps[]`, `uses.*`, **`sequence_mermaid` arrows** |
| `middlewares/<id>.yaml` | `code_ref`, `config.env_vars[]`, `reads_context[]`, `writes_context[]`, `error_responses[]` |
| `tables/<id>.yaml` | `columns[]`, `indexes[]`, `migration_ref` (prefer staging `\d` if accessible) |
| `topics/<id>.yaml` | `message_schema.fields[]`, `attributes[]`, `produced_by[]` |
| `workers/<id>.yaml` | `code_ref`, `subscribes_topic`, `processors[]`, `steps[]`, **`sequence_mermaid` arrows** |
| `integrations/<id>.yaml` | `operations[]`, `outbound.operations[].url`, `code_ref` |

**Do not rewrite the whole file** — only diverged fields. But within each diverged field, get it fully right in this pass.

### `sequence_mermaid`: what to change vs preserve

Mermaid has two layers; treat them differently:

| Layer | Examples | Action when `steps[]` changes |
|---|---|---|
| **Logical (must co-update with steps)** | arrows themselves: `A->>S: ServiceMethod()` / `S->>DB: insert ...` / `S->>PS: Publish ...`; arrow order; participant set when a new external actor enters | Add / remove / reword to match the new `steps[]` exactly. Use the §9 arrow ↔ step mapping in essentials. |
| **Visual (preserve)** | participant aliases (`Svc as ConversionService`), `Note over` annotations, branch labels, comment lines | Keep as-is unless they directly contradict reality. |

Concretely: if you add `step: action: publish, target: topic:foo` you MUST add a corresponding `S->>PS: Publish FooMsg{...}` arrow (and a `Note over S,PS: failure_semantic=<sem>` if non-block). If you remove a step, remove its arrow. If `steps[]` count and arrows count diverge in the patched file, you broke the single-pass rule.

`description` / `notes` are pure prose — preserve unless they contradict the new code reality.

### New / removed entities

For **new** routes / middlewares / tables / etc. not yet indexed: create the yaml from scratch following the relevant entity skeleton in essentials (`apis` §2 / `workers` §3 / `tables` §4 / `topics` §5 / `integrations` §6 / `middlewares` §7).

For **removed** entities (handler deleted from source): ASK USER before deleting yaml. It may be a rename.

## Step 6 — Sweep `service.yaml`

- Add new entities to the appropriate `apis[] / tables[] / topics_produced[] / integrations[] / middlewares[] / workers[]` index
- Remove only after user confirmation
- If `cmd/*/main.go` env reading changed, update `service.yaml#env_config[]`

## Step 7 — Validate (syntax + manifest-validate, scoped)

### 7a — yaml syntax parse (cheap, always)

```bash
python3 -c "import yaml,os; [yaml.safe_load(open(os.path.join(r,f))) for r,_,fs in os.walk(os.path.expandvars('$CARTOGRAPH_HOME/data/<repo-id>')) for f in fs if f.endswith('.yaml')]"
```

### 7b — Invoke `manifest-validate` scoped to this run's changes (MANDATORY)

Build `CHANGED_YAMLS` from what Step 5 + Step 6 actually wrote (patched + newly created). This is the **only** set that needs Class C code-vs-yaml audit — do not re-audit the whole `apis/` tree.

- **Class A + B (mermaid parser / flow / activation)** — run the scan script (source inlined in the `manifest-validate` skill; typically saved at `$CARTOGRAPH_HOME/tools/scan_manifest.py`) once across the whole `apis/` (cheap, regex-only; catches any collateral regressions):
  ```bash
  python3 $CARTOGRAPH_HOME/tools/scan_manifest.py $CARTOGRAPH_HOME/data/<repo-id>/apis
  ```
- **Class C (steps + mermaid vs handler + service code)** — follow the manifest-validate skill's "Audit flow per yaml" steps 1–6 for **each** yaml in `CHANGED_YAMLS` only:
  1. grep handler body
  2. read each invoked service method
  3. compare yaml `steps[]` vs code using the 7 splitting points
  4. compare `sequence_mermaid` arrows vs code (every `<X>Service.M()` in the handler layer → `A->>S:`; every DB / external → `S->>DB:` / `S->>X:`)
  5. fix `uses.tables` / `uses.integrations` / `uses.topics_produced` to match
  6. apply fixes in-place before moving on

7b is a **safety net**, not the primary place to fix mermaid drift — with single-pass Step 5 you should already have arrows aligned with steps. If 7b flags arrow drift, that means Step 5 missed something for that yaml; go back, fix it inline, and re-run 7b. Do not accumulate "known mermaid drift to fix in next pass."

If manifest-validate reports unresolved Class A / B / C issues, **do NOT proceed to Step 8** (marker stays on old baseline so next run can retry). Surface the issues in the Step 8 report under "needs manual review".

### 7c — curl sample changed URLs (if aggregator dev server up)

```bash
for id in <CHANGED_APIS>; do
  curl -s -o /dev/null -w "%{http_code} $id\n" "http://localhost:3000/repos/<repo-id>/apis/$id"
done
```

200 is necessary but not sufficient — Class B3 (browser-only render failures) still needs user eyeball if flagged by 7b.

## Step 8 — Update baseline marker + report

```bash
# Record new baseline so next run can compute the delta
cd <source>
NEW_SHA=$(git rev-parse HEAD)
NEW_DATE=$(git show -s --format=%ai "$NEW_SHA")
NEW_SUBJECT=$(git show -s --format=%s "$NEW_SHA")
NOW=$(date "+%Y-%m-%d %H:%M:%S %z")
MODE=<bootstrap|auto|--api id>

cat > "$CARTOGRAPH_HOME/data/<repo-id>/.cartograph-last-source-head" <<EOF
# Cartograph manifest last-update marker — read by /cartograph-update as baseline.
# Do not edit by hand unless overriding the baseline. The skill rewrites this
# file at end of every successful update run.
sha: $NEW_SHA
source_commit_date: $NEW_DATE
source_commit_subject: $NEW_SUBJECT
marker_updated_at: $NOW
marker_updated_by: cartograph-update ($MODE)
EOF
```

Report to user:
- Baseline used — SHA + `source_commit_date` + `source_commit_subject` from the OLD marker (so user sees "window covered: <old date> → <new date>")
- New marker now points to SHA + date + subject
- Number of changed source files classified
- Per-kind summary: APIs / middlewares / tables / topics / integrations / workers → updated M / created K / flagged-for-deletion L
- Any yaml that COULD NOT be auto-resolved — list for manual review
- Whether `service.yaml` was touched

Do NOT `git commit` anything. Leave the Cartograph working tree dirty for the user to review.

## Schema rules

All yaml-content rules in `$CARTOGRAPH_HOME/docs/manifest-template-essentials.md` (read in Step 0). Update-specific reminders only:

- `service.yaml#repo`: don't change; already fixed at init
- Zod enum elements must be strings (quote `"1001"`)

## Targeted mode: `--api <id>`

1. Skip git log + classification
2. Read `$CARTOGRAPH_HOME/data/<repo-id>/apis/<id>.yaml`
3. Re-derive drift-prone fields against current source state (whatever the handler / service / middleware looks like right now)
4. Patch + Step 7 validate (Class A+B scan whole tree, Class C audit just this one yaml)
5. Report only changes for that one API
6. Update `.cartograph-last-source-head` marker (only if Step 7 clean)

## Common pitfalls

- Writing into `<source>/manifest/` — WRONG, output is `$CARTOGRAPH_HOME/data/<repo-id>/`
- Using file mtime instead of git log + marker — mtime is unreliable after clone/rebase
- Missing handler → yaml mapping because `code_ref` moved — fall back to path+method match
- Overwriting user-authored `description` / `notes` / `sequence_mermaid`
- Treating a code-only service-layer refactor as an API change — check `code_ref` / steps actually shifted
- Deleting a yaml because its handler got renamed — always prompt before deletion
- Forgetting to update `service.yaml` after adding a new entity yaml
- Not updating `.cartograph-last-source-head` marker — next run re-scans from same baseline
- Writing bare SHA into the marker (old format) — new format is yaml with `sha: / source_commit_date: / source_commit_subject: / marker_updated_at: / marker_updated_by:` so humans can eyeball last-update time; Step 2 parses only the `sha:` line
- Skipping Step 7b (`manifest-validate` scoped to changed yaml) and going straight to Step 8 — marker should NOT advance if Class A/B/C issues are unresolved. Next run will otherwise re-encounter the drift silently.
