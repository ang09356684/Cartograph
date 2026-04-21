# Cartograph

> **English** · [繁體中文](./README.zh-TW.md)

A **service-catalog / architecture atlas** for polyglot microservice
organisations. Point it at a set of repos — local clones or GitHub — and get an
interactive drill-down site for APIs, workers, tables, topics, integrations,
and middlewares across every repo, with cross-repo links resolved automatically.

Think **Backstage / Cortex / OpsLevel**, but: single static site, no backend,
no database, no CRD. All manifest YAML is **owned by this Cartograph repo**
under `data/<repo-id>/` — the source repos stay untouched.

## Architecture at a glance

```
$CARTOGRAPH_HOME/
├── data/<repo-id>/         ← manifest lives here (one folder per source repo)
│   ├── service.yaml
│   ├── apis/ workers/ tables/ topics/ integrations/ middlewares/
├── batch_plan/<repo-id>/   ← init + continue skills write plan + handover here
├── docs/
│   ├── manifest-template.md        ← schema spec (what fields to fill)
│   ├── manifest-extraction-guide.md ← how to extract each field from source code
│   └── manifest-plan.md            ← design rationale
├── .claude/skills/         ← Claude Code skills that write the manifest
│   ├── cartograph-init/
│   ├── cartograph-continue/
│   └── cartograph-update/
└── src/                    ← Next.js aggregator (reads data/ → renders site)

<anywhere>/<source-repo>/   ← cloned source repo (read-only; never modified)
```

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind
- `yaml` for parsing, `zod` for runtime validation + type inference
- `mermaid` for sequence diagrams
- `lucide-react` for icons

No backend. Build output is static SSG — deploy anywhere that serves static
files (Cloudflare Pages / Vercel / GitHub Pages / S3).

## Quick start

```bash
# 1. Install dependencies
make install                 # or: npm install

# 2. Start dev server (defaults to port 3000; override with PORT=...)
make dev                     # http://localhost:3000
make dev PORT=3010           # http://localhost:3010

# Other dev helpers
make dev-attach              # attach to tmux session
make dev-logs                # last 40 lines of dev-server output
make dev-stop                # stop the tmux session

# 3. Production
make build                   # prerender all pages
make start PORT=8080         # serve the prod build on a chosen port
make typecheck               # tsc --noEmit
make lint                    # next lint
```

Once running, open the URL printed by `make dev`. You will see two fictional
demo repos shipped with this project so the UI works out of the box — see the
next section.

## Demo data (shipped with the repo)

`data/demo-A/` and `data/demo-B/` are **fictional test fixtures** that exist
only so you can explore the UI without setting up a real source repo:

- **`demo-A`** — a pretend URL-shortener service (`example-org/demo-A` on
  "GitHub" so `code_ref` renders as clickable GitHub links — the links 404
  because the org is fake, but the rendering behaviour is real)
- **`demo-B`** — a pretend image-processing service (no `repo:` field set
  → local-only mode, `code_ref` renders as plain text)
- **Cross-repo link** — `demo-A/apis/create-link` step 5 calls
  `demo-B/apis/create-thumbnail` via `target_api_ref`; open that step to see
  the live cross-repo link in action

What the demo covers: 4 APIs per repo split into 2 groups, workers, tables,
topics, integrations (inbound webhook + outbound HTTP), middlewares, Pub/Sub
producer/consumer join, cross-repo forward link.

**When you actually start using Cartograph**, delete both demo folders:

```bash
rm -rf data/demo-A data/demo-B
```

Your own `data/<repo-id>/` output (from `cartograph-init` /
`cartograph-continue`) is tracked by git — commit it alongside the rest of
your changes like any other file.

## How to use (adding a new source repo)

Cartograph ships with three Claude Code skills under `.claude/skills/` that
handle manifest creation and maintenance. You do not edit YAML by hand.

### 0. Requirements

- The source repo must be **cloned locally** first. Cartograph never clones
  for you.
- If it's a GitHub repo, after cloning the skill auto-detects
  `git remote get-url origin` and wires up clickable GitHub links for every
  `code_ref`.
- Local-only repos (no remote, or non-GitHub remote) also work — `code_ref`
  just renders as plain text instead of a clickable link.

### 1. Bootstrap a batch plan — `/cartograph-init`

```
/cartograph-init --source /absolute/path/to/source-repo
```

This skill:

1. Reads the three canonical docs in `docs/` (template / extraction-guide / plan).
2. Detects whether the source is GitHub / other-remote / local-only.
3. Scans the source to count APIs, workers, tables, topics, integrations,
   middlewares, and pipelines.
4. Writes `batch_plan/<repo-id>/batch_plan.md` with:
   - source path + mode (so later skills don't re-detect)
   - per-entity-kind counts
   - a per-batch checklist sized for ~15–35 APIs each
   - a schema-rules cheatsheet

It does **not** write any YAML yet — review the plan first.

### 2. Execute the plan — `/cartograph-continue`

```
/cartograph-continue --repo <repo-id>
```

Run as many times as needed. Each invocation:

1. Reads the canonical docs + `batch_plan/<repo-id>/batch_plan.md` +
   `handover.md` (if present).
2. Picks the first unchecked batch.
3. Writes YAML directly into `data/<repo-id>/...`, updates `service.yaml`,
   validates.
4. Ticks the batch box + appends a short handover entry.
5. Watches its own context window — if usage exceeds ~50% it writes
   `handover.md` and asks you to open a fresh session before the next batch.

Open Cartograph in the browser while you go and watch entities appear.

### 3. Keep it in sync — `/cartograph-update`

```
/cartograph-update --repo <repo-id>                     # incremental
/cartograph-update --repo <repo-id> --api <api-id>      # only this API
/cartograph-update --repo <repo-id> --scope 'internal/router/handler_chat_*.go'
```

This skill:

1. Reads the canonical docs.
2. Resolves the baseline commit from
   `data/<repo-id>/.cartograph-last-source-head` (written by the last update)
   or the source HEAD recorded at init time.
3. Runs `git log <base>..HEAD --name-only` in the source repo + checks
   uncommitted source changes.
4. Classifies changed files → specific YAML IDs → patches drift-prone fields
   (`code_ref`, `steps[]`, `uses.*`, columns, etc.).
5. Leaves hand-written `description` / `notes` / `sequence_mermaid` alone.
6. Updates the baseline marker.

Good to run after every sync pull on your source checkout.

## What the UI shows

- **Left sidebar** per repo — APIs / Middlewares / Workers / Tables / Topics /
  Integrations; APIs and Tables auto-group by path / id prefix; collapsible.
- **List pages** — URL-driven filter + grouping (`?method=POST&q=audio`);
  chip options derived from data; shareable bookmarks.
- **Detail pages** — sequence diagrams (mermaid), middleware pipeline with
  clickable chips, step timeline with cross-repo links, reverse indices
  (which APIs read this table, which workers subscribe this topic, which
  pipelines / APIs use this middleware, …).
- **Cmd+K palette** — cross-repo fuzzy search over every entity.
- **Cross-repo API links** — a caller API step writes
  `target_api_ref: "<repo>:<api-id>"`; aggregator renders a live link if the
  callee is indexed, or a "pending" badge otherwise (graceful degradation —
  no coordinated rollout needed).
- **`code_ref` rendering** — if `service.yaml#repo` is set (GitHub mode), each
  `code_ref` becomes `https://github.com/<org>/<repo>/blob/main/<path>`;
  otherwise it's plain text.

Design decisions / how to extend the UI: [`docs/ui-architecture.md`](docs/ui-architecture.md).

## Routes

- `/` — repo list
- `/repos/<repo>` — repo overview (tech, components, env, deployments, counts)
- `/repos/<repo>/{apis,workers,tables,topics,integrations,middlewares}` — list
- `/repos/<repo>/{kind}/<id>` — entity detail

## Folder map

```
data/                              # manifest snapshots (one folder per source repo)
batch_plan/                        # one folder per source repo — plan + handover
.claude/skills/
  cartograph-init/SKILL.md
  cartograph-continue/SKILL.md
  cartograph-update/SKILL.md
src/
  types/manifest.ts                # Zod schemas + inferred TS types (the contract)
  lib/loader.ts                    # reads YAML → validates → returns typed Repo[]
  lib/resolver.ts                  # reverse indices / producer-consumer lookups
  lib/paths.ts                     # URL builders
  lib/sidebar.ts                   # sidebar tree + auto-group rules
  lib/searchIndex.ts               # Cmd+K palette index
  lib/crossRepo.ts                 # target_api_ref resolver
  app/                             # App Router pages
  components/                      # Breadcrumb, EntityCard, MiddlewarePipeline,
                                   #   StepsTimeline, MermaidDiagram, SchemaTable,
                                   #   UsesPanel, CodeRef, CommandPalette, RepoSidebar
docs/
  manifest-template.md             # schema spec — authoritative
  manifest-extraction-guide.md     # how to fill each field from source code
  manifest-plan.md                 # design rationale
  plan.md                          # project rationale
  ui-architecture.md               # UI 3-layer navigation + extension guide
```

## Extending the schema

Schema gaps — add them via this flow:

1. Add the new field to `src/types/manifest.ts` as `.optional()` (stays
   backwards-compatible).
2. Document it in `docs/manifest-template.md` (+ extraction rule in
   `manifest-extraction-guide.md` if it maps to source code).
3. Pilot on one repo; once stable, include in the skill behaviour if relevant.

Everything can go in the same PR — Zod contract, docs, skill instructions.

## Licence

MIT.
