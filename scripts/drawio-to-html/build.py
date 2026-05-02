#!/usr/bin/env python3
"""Convert a .drawio file into the cresclab-map interactive viewer HTML.

Wraps the drawio mxfile XML in a self-contained HTML page that loads
drawio's viewer-static.min.js for native rendering, plus a hover/click
highlight layer (hover a node to dim unrelated cells, click to pin,
Esc/Reset to clear).

Default outputs:
  docs/<basename>.html      — canonical, lives next to the source .drawio
  public/<basename>.html    — Next.js static asset, served at /<basename>.html
"""
from __future__ import annotations

import argparse
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent.parent  # scripts/drawio-to-html/.. /..
TEMPLATE_PRE = HERE / "template-pre.html"
TEMPLATE_POST = HERE / "template-post.html"


def humanize(name: str) -> str:
    """Convert a kebab/snake_case basename to Title Case ("service-flow" -> "Service Flow")."""
    return re.sub(r"[-_]+", " ", name).strip().title()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("drawio", type=pathlib.Path, help="Path to the .drawio source file")
    ap.add_argument(
        "--title",
        help="Heading override; appears in <title> and <header><strong>. "
        "Default: humanized basename (e.g. service-flow -> 'Service Flow').",
    )
    ap.add_argument(
        "--out",
        action="append",
        default=[],
        help="Output directory (repeatable). Default: docs/, public/ relative to repo root.",
    )
    args = ap.parse_args()

    drawio_path = args.drawio.resolve()
    if not drawio_path.is_file():
        print(f"error: {drawio_path} not found", file=sys.stderr)
        return 1
    if drawio_path.suffix != ".drawio":
        print(
            f"error: expected .drawio file, got '{drawio_path.suffix}' ({drawio_path.name})",
            file=sys.stderr,
        )
        return 1

    name = drawio_path.stem
    title = args.title or humanize(name)
    out_dirs = (
        [pathlib.Path(d).resolve() for d in args.out]
        if args.out
        else [ROOT / "docs", ROOT / "public"]
    )

    pre = TEMPLATE_PRE.read_text(encoding="utf-8")
    post = TEMPLATE_POST.read_text(encoding="utf-8")
    xml = drawio_path.read_text(encoding="utf-8").strip()

    # Templates: pre ends with the open <script id="drawio-xml" ...> tag
    # (followed by a newline so the embedded XML starts on its own line).
    # post starts with </script>.
    html = pre.replace("__HEADING__", title) + xml + "\n" + post

    for d in out_dirs:
        d.mkdir(parents=True, exist_ok=True)
        out_path = d / f"{name}.html"
        out_path.write_text(html, encoding="utf-8")
        print(f"wrote {out_path}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
