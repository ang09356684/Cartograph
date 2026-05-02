---
name: drawio-to-html
description: Convert a `.drawio` file in this repo into the Cartograph interactive viewer HTML — drawio viewer-static does the rendering, a hover/click layer dims unrelated cells. Output is written to BOTH `docs/<basename>.html` (canonical) and `public/<basename>.html` (Next.js static asset, served at `/<basename>.html`). Use when the user says 「把 drawio 轉成 html」「重新產生 service-flow.html」「rebuild <foo>.html from drawio」「sync drawio to public」「regenerate <foo>.html from <foo>.drawio」, or any time the user has just edited a `.drawio` and wants the live HTML refreshed.
---

# drawio-to-html

Wraps a drawio mxfile XML in the same self-contained interactive HTML viewer as `docs/service-flow.html`:
- drawio's `viewer-static.min.js` (loaded from `https://viewer.diagrams.net/`) renders the diagram natively — line layout / waypoints / jetty offsets are pixel-perfect against draw.io desktop. Do **not** roll a custom SVG router.
- a small JS layer on top hooks `mouseenter` / `mouseleave` / `click` on each vertex; on focus it dims unrelated cells to `opacity: 0.12`. Click pins the focus, click same node / Esc / Reset clears.

## When to invoke

Any of:
- 「把 drawio 轉成 html」/「重新產生 service-flow html」/「rebuild <foo>.html」/「sync drawio to public」
- "regenerate `<foo>.html` from `<foo>.drawio`"
- The user just edited a `.drawio` (in draw.io desktop or via the drawio-mcp) and wants the served HTML refreshed
- The user adds a brand-new `.drawio` under `docs/` and wants its HTML scaffolded

## How to run

One command — the bundled Python script handles template substitution and the docs↔public sync:

```bash
python3 scripts/drawio-to-html/build.py docs/<name>.drawio [--title "Custom Heading"]
```

Defaults:
- **Output dirs**: `docs/`, `public/` (both written every run)
- **Heading**: humanized basename. `service-flow` → `Service Flow`, `payment-flow` → `Payment Flow`. Pass `--title` to override.

Examples:
```bash
# service-flow: keep the existing "Cartograph Service Flow" heading
python3 scripts/drawio-to-html/build.py docs/service-flow.drawio --title "Cartograph Service Flow"

# new diagram: humanized default is fine
python3 scripts/drawio-to-html/build.py docs/data-flow.drawio

# write to a custom location instead of docs/+public/
python3 scripts/drawio-to-html/build.py docs/foo.drawio --out /tmp/preview
```

## What gets produced

```
docs/<name>.html      ← canonical, sits next to <name>.drawio for git diff visibility
public/<name>.html    ← copy that Next.js serves at /<name>.html
```

Re-running overwrites both. The two files are always byte-identical right after a run.

## Linking from the Next.js home page

The skill does NOT auto-edit `src/app/layout.tsx` — adding header navigation is a separate decision per diagram. To expose a new HTML, add an `<a href="/<name>.html">` next to the existing "Service Flow ↗" link in `src/app/layout.tsx`, e.g.:

```tsx
<a href="/data-flow.html" className="text-sm text-sky-600 ...">Data Flow ↗</a>
```

## Files this skill owns

```
scripts/drawio-to-html/
├── template-pre.html        # head + opening header markup, with __HEADING__ placeholder; ends right before the inline drawio XML
├── template-post.html       # </script> closer + viewer-static load + interactivity IIFE + closing tags
└── build.py                 # template substitution + docs/public sync
```

The pre/post templates are a verbatim split of `docs/service-flow.html` (the reference). To change the page styling or hover behavior, **edit the templates, then re-run the script on each `.drawio`** — every HTML you've already generated will need to be regenerated to pick up the new styling.

## Common pitfalls

- **Wrong file extension**: the script rejects anything that isn't `*.drawio`. Don't pass `.xml` or `.html`.
- **Compressed drawio**: this skill expects raw mxfile XML inside the `.drawio` (the file should start with `<mxfile`). If the drawio file was saved with "compress diagram" enabled, decompress it via the draw.io editor (`Extras > Edit Diagram… > uncheck compression`) before running.
- **Serving offline**: the HTML loads `viewer-static.min.js` from `viewer.diagrams.net`. For an air-gapped deploy, vendor the script under `public/` and patch `template-post.html`.
