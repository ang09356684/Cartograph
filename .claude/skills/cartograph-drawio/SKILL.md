---
name: cartograph-drawio
description: Draw a service's system architecture as a `.drawio` (mxfile XML) FROM its manifest under `$CARTOGRAPH_HOME/data/<repo-id>/`. Produces `docs/<repo-id>.drawio` — a C4-style L1 system landscape (frontend → system containers → infra/datastores → external backends) using controlled edge routing (explicit exit/entry points + waypoints in gutter lanes), short edge labels, generous column spacing, and BE↔BE-emphasised / FE↔BE-de-emphasised edges. Pairs with `drawio-to-html` (renders the .drawio to the interactive viewer) and the `cartograph-*` skills (which build the manifest). Use when the user says 「把架構畫成 drawio」「從 manifest 產生 drawio 系統圖」「畫系統架構圖」「manifest to drawio」「draw the architecture diagram」「generate <repo>.drawio」.
---

# cartograph-drawio

Turn a manifest (the structured truth produced by `cartograph-init/continue/update`) into a hand-routed architecture **`.drawio`**. The manifest is the input; a clean `docs/<repo-id>.drawio` is the output. `drawio-to-html` then renders it.

> **Why a skill, not freehand:** the first draft of any of these diagrams comes out cramped — lines auto-route and stack, long edge labels collide, boxes sit too close. This skill encodes the conventions that fix that (proven against `docs/service-flow.drawio` / `docs/demo-A.drawio`). Follow them; don't improvise the layout.

## Pipeline position

```
cartograph-init/continue/update   →   $CARTOGRAPH_HOME/data/<repo-id>/ (yaml truth)
            │
            ▼   cartograph-drawio  (THIS skill)
docs/<repo-id>.drawio              (hand-routed mxfile XML)
            │
            ▼   drawio-to-html
docs/<repo-id>.html + public/<repo-id>.html   (interactive viewer)
```

## Inputs

- `--repo <repo-id>` (required) — which manifest under `$CARTOGRAPH_HOME/data/<repo-id>/` to draw.
- `--level L1` (default) — system landscape (this skill's focus). `--level L2` — component diagram inside one binary (finer nodes: routes / services / repos / adapters, à la `demo-A.drawio`); same conventions, more nodes.
- `CARTOGRAPH_HOME` env var (optional; default `/Users/angus/Documents/self_develop/Cartograph`).

Output always goes to `$CARTOGRAPH_HOME/docs/<repo-id>.drawio` (NOT into the `data/` manifest tree, NOT into the source repo).

## Step 0 — Read first

1. `$CARTOGRAPH_HOME/docs/manifest-template-essentials.md` — the entity model (components / apis / workers / tables / topics / integrations / middlewares + `uses.*` cross-refs). You're visualising these.
2. **`$CARTOGRAPH_HOME/docs/service-flow.drawio`** (and `docs/demo-A.drawio`) — the canonical layout/routing references. Open one and copy its mechanics (explicit `exitX/exitY`+`entryX/entryY`, waypoint `<Array>`s, short labels, column spacing, C4 colours, `fillColor=none` containers, `fontFamily=Helvetica Neue`).
3. `$CARTOGRAPH_HOME/data/<repo-id>/service.yaml` + skim the entity yaml — this is what you draw.

## Step 1 — Decide the L1 cast from the manifest

| Diagram element | Pull from manifest |
|---|---|
| **Frontend actor** (left) | the human/browser caller, if any (often implicit — e.g. a widget / SPA / CLI). One box. |
| **System boundary** (centre) | `service.yaml#id` + `repo` + deployment (`environments[].deployment_type`). One dashed `fillColor=none` box. |
| **Containers** (inside boundary) | `service.yaml#components[]` — one box per deployed binary. |
| **Components / workers** (nested) | `workers[]` whose `component:` is a container → nest inside it (e.g. an in-process consumer). |
| **Internal topics** | `topics[]` produced AND consumed within the repo → a topic box inside/near the boundary. |
| **External backends** (right) | `integrations[]` (kind outbound/messaging) + topics' `known_external_consumers` → one box per peer service. |
| **Datastores / infra** (centre-right) | `depends_on_infra[]` + `tables[]` (Postgres) + cloud-storage integrations (GCS / S3) + Redis. |

## Step 2 — Key flows = edges (from `steps[]` + `uses.*`)

Each edge is a real relationship in the manifest. Derive direction + semantic:

| manifest signal | edge |
|---|---|
| api/worker `uses.topics_produced` + a `steps[] action: publish` | container → topic (publish) |
| worker `subscribes_topic` / `uses.topics_consumed` | topic → worker (consume) |
| `uses.integrations` + outbound op, caller returns err | container → external (solid; the **outbound** direction) |
| inbound webhook api (`endpoint_type: webhook`) / ingest endpoint | external → container (the **inbound** direction) |
| `uses.tables` | container → datastore (read/write) |
| frontend calling an api / holding a socket | frontend ↔ container (**de-emphasise**, see §4) |

## Step 3 — Layout discipline (the anti-cramming rules)

- **Left → right layers**, each its own column with a small blue bold section label above:
  `FRONTEND` → `<SYSTEM> (boundary)` → `INFRA / DATASTORES` → `EXTERNAL BACKENDS`.
- **Column gutters ≥ 180px.** Canvas `pageWidth` ≥ 1700, `pageHeight` ≥ 900. Spread nodes; empty space is good.
- **Stack peers vertically** within a column with ≥ 40px gaps (e.g. datastores; external backends).
- **All cells flat under `parent="1"`** with absolute geometry (don't use drawio parent-nesting — position nested boxes inside their container by coordinates, like the reference diagrams).
- A `LEGEND` box (edge colour key) in an empty corner.

## Step 4 — Edge routing (THE core technique — this is what fixes the mess)

1. **Every edge gets explicit connection points**: `exitX;exitY` on the source, `entryX;entryY` on the target (fractions 0..1; 0 = left/top, 1 = right/bottom, 0.5 = centre). Never leave an edge to auto-route — that's what stacks lines on top of each other.
2. **Fan multiple edges out of one box at different fractions** so they don't overlap — e.g. three datastore edges leaving a container at `exitY = 0.2 / 0.5 / 0.85` to three stores at increasing depth.
3. **Long / back / against-the-grain edges get explicit waypoints** (`<mxGeometry><Array as="points"><mxPoint .../></Array></mxGeometry>`) routed through **dedicated lanes** — the gutters between columns, or a top/bottom margin lane. Run parallel back-edges in parallel lanes offset by ~30px. **A waypoint must never land inside a node box** (the validator checks this).
4. `edgeStyle=orthogonalEdgeStyle;rounded=1` on every edge.
5. **Edge labels are 1–3 words** (`REST`, `publish`, `R/W`, `webhook`, `consume`). All detail lives in the node box (multi-line `value` with `&#xa;`) or stays in the manifest — never long text on an edge.

## Step 5 — Colour / shape palette (C4-ish, matches the existing diagrams)

Nodes (`fontFamily=Helvetica Neue` on everything):

| Element | Style fragment |
|---|---|
| Frontend actor / person | `rounded=1;fillColor=#08427b;strokeColor=#073a6e;fontColor=#ffffff` |
| Internal container (binary) | `rounded=1;fillColor=#1168bd;strokeColor=#0b4884;fontColor=#ffffff` |
| Internal component / adapter / worker | `rounded=1;fillColor=#85bbf0;strokeColor=#5e8eb8;fontColor=#000000` |
| External system (peer service) | `rounded=1;fillColor=#999999;strokeColor=#6c6c6c;fontColor=#ffffff` |
| Pub/Sub topic | `rounded=0;fillColor=#7b3a73;strokeColor=#532052;fontColor=#ffffff;fontStyle=1` |
| Datastore | `shape=cylinder3;fillColor=#bbbbbb;strokeColor=#666;dashed=1` |
| System boundary | `rounded=1;fillColor=none;strokeColor=#0b4884;dashed=1;verticalAlign=top;align=left;spacingLeft=12;spacingTop=6;fontColor=#0b4884;fontStyle=1` |
| Section label | `text;fontSize=10;fontStyle=1;fontColor=#1168bd;align=left` |

Edges encode the **relationship type** by colour, and **emphasis** by weight/dash:

| Relationship | Colour | Weight |
|---|---|---|
| internal Pub/Sub (publish/consume) | purple `#7b3a73` | solid, `strokeWidth=2` |
| outbound → a peer service | red `#b85450` | solid, `strokeWidth=2` |
| inbound ← a peer service | green `#82b366` (font `#2d6a2d`) | solid, `strokeWidth=2` |
| other cross-repo call (peer internal service) | orange `#d79b00` (font `#996a00`) | solid, `strokeWidth=2` |
| datastore read/write | dark `#3a3a3a` | solid |
| **frontend ↔ backend** | gray `#9aa5b1` (font `#6b7280`) | **`dashed=1`, thin, `endArrow=open`** |

## Step 6 — BE↔BE emphasis, FE↔BE de-emphasis (recommended default)

Architecture / service diagrams read best when they **prioritise backend↔backend data-flow direction and downplay frontend→backend edges**. Concretely: BE↔BE edges are solid, coloured, `strokeWidth=2`, labelled; FE↔BE edges are thin gray **dashed** with an open arrow and a one-word label. Keep FE edges short and out of the way (they should not dominate or cross the BE flows). Always include the legend so the emphasis reads clearly.

## Step 7 — Validate

```bash
python3 .claude/skills/cartograph-drawio/validate_drawio.py docs/<repo-id>.drawio
```

Checks: raw (uncompressed) well-formed mxfile · every edge source/target resolves · **no content-node overlaps** · **no waypoint inside a box** · prints the drawn extent. Fix any FAIL before handing off. (It can't see rendered pixels, so also eyeball it — see Step 8.)

## Step 8 — Hand off / preview

- Render to the interactive viewer: invoke **`drawio-to-html`** → `python3 scripts/drawio-to-html/build.py docs/<repo-id>.drawio`. The viewer's hover-dim makes a busy diagram readable (unrelated cells fade to 0.12).
- Or open the raw `.drawio` in draw.io desktop / `mcp__drawio__open_drawio_xml` to eyeball routing and nudge waypoints.
- Don't `git commit` unless the user asks.

## Common pitfalls (each one is a first-draft mistake this skill exists to prevent)

| Symptom | Cause | Fix |
|---|---|---|
| Lines cross / stack on each other | edges with no `exit/entry` points (auto-routed) | give every edge explicit `exitX/exitY` + `entryX/entryY`; fan out at different fractions |
| Labels overlap boxes / each other | long edge labels | 1–3 word labels; detail goes in node boxes |
| Everything cramped | columns too close, canvas too small | ≥180px gutters, `pageWidth` ≥ 1700, stack with ≥40px gaps |
| A line runs through a box | waypoint inside a node | route waypoints in gutter/margin lanes (validator catches this) |
| Boundary hides content | filled boundary box | boundary = `fillColor=none` dashed container |
| `drawio-to-html` won't read it | compressed diagram | save raw mxfile (draw.io: Extras > Edit Diagram > uncheck compression); file must start with `<mxfile` |
| Mixed look | ad-hoc colours/fonts | use the §5 palette + `fontFamily=Helvetica Neue` everywhere |

## Files this skill owns

```
.claude/skills/cartograph-drawio/
├── SKILL.md             # this spec
└── validate_drawio.py   # structural validator (refs / overlaps / waypoint-in-box)
```
