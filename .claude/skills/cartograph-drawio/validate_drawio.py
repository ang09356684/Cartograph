#!/usr/bin/env python3
"""Validate a Cartograph architecture .drawio before handing it to drawio-to-html.

Checks (all structural — it can't see the rendered pixels, but it catches the
mistakes that make a diagram unreadable):
  1. file is raw mxfile XML (not compressed) and well-formed
  2. every edge source/target resolves to a real vertex id
  3. no two *content* nodes overlap (containers with fillColor=none and text
     labels are excluded; a node fully nested inside another is allowed)
  4. no edge waypoint lands inside a content node box (routes must use gutters)
  5. prints the drawn extent + node/edge counts as a sanity check

Handles drawio's `UserObject` / `object` wrappers (used when a node carries a
`link=` etc.): the id sits on the wrapper, the `vertex="1"` flag on its child
`mxCell`. Plain `<mxCell vertex="1">` nodes work too.

Usage:  python3 validate_drawio.py docs/<repo-id>.drawio
Exit:   0 = clean, 1 = problems (printed).
"""
import sys, xml.etree.ElementTree as ET


def cells(root):
    """Yield (id, mxCell-with-flags) for every cell, unwrapping UserObject/object."""
    consumed, out = set(), []
    for w in root.iter():
        if w.tag in ("UserObject", "object"):
            inner = w.find("mxCell")
            if inner is not None:
                consumed.add(id(inner))
                out.append((w.get("id"), inner))
    for c in root.iter("mxCell"):
        if id(c) not in consumed:
            out.append((c.get("id"), c))
    return out


def waypoints(cell):
    """Array waypoints only (skip source/targetPoint, which carry an `as` attr)."""
    g = cell.find("mxGeometry")
    if g is None:
        return []
    return [(float(p.get("x")), float(p.get("y")))
            for p in g.findall(".//mxPoint")
            if p.get("x") is not None and p.get("as") is None]


def main(path: str) -> int:
    raw = open(path, encoding="utf-8").read()
    if not raw.lstrip().startswith("<mxfile"):
        print("FAIL: not raw mxfile XML (compressed? decompress via draw.io "
              "Extras > Edit Diagram > uncheck compression)")
        return 1
    try:
        root = ET.fromstring(raw)
    except ET.ParseError as e:
        print(f"FAIL: XML parse error: {e}")
        return 1

    geo, style, vids, edges = {}, {}, set(), []
    for cid, cell in cells(root):
        if cell.get("vertex") == "1":
            vids.add(cid)
            style[cid] = cell.get("style") or ""
            g = cell.find("mxGeometry")
            if g is not None and g.get("x") is not None:
                geo[cid] = (float(g.get("x")), float(g.get("y")),
                            float(g.get("width")), float(g.get("height")))
        elif cell.get("edge") == "1":
            edges.append((cid, cell.get("source"), cell.get("target"), waypoints(cell)))

    problems = []

    # 2. edge refs
    for cid, src, tgt, _ in edges:
        for end, ref in (("source", src), ("target", tgt)):
            if ref and ref not in vids:
                problems.append(f"edge {cid}: {end}='{ref}' is not a vertex")

    # content nodes = real boxes (not text labels, not fillColor=none containers)
    content = [i for i in geo
               if not style[i].startswith("text;") and "fillColor=none" not in style[i]]

    def box(i):
        x, y, w, h = geo[i]; return x, y, x + w, y + h

    def contained(a, b):  # a fully inside b
        ax1, ay1, ax2, ay2 = box(a); bx1, by1, bx2, by2 = box(b)
        return bx1 <= ax1 and by1 <= ay1 and ax2 <= bx2 and ay2 <= by2

    # 3. partial overlaps (nesting allowed)
    for i, a in enumerate(content):
        for b in content[i + 1:]:
            ax1, ay1, ax2, ay2 = box(a); bx1, by1, bx2, by2 = box(b)
            if ax1 < bx2 and bx1 < ax2 and ay1 < by2 and by1 < ay2:
                if not (contained(a, b) or contained(b, a)):
                    problems.append(f"node overlap: {a} <-> {b}")

    # 4. waypoints inside a content box
    for cid, _, _, pts in edges:
        for px, py in pts:
            for n in content:
                x1, y1, x2, y2 = box(n)
                if x1 < px < x2 and y1 < py < y2:
                    problems.append(f"edge {cid}: waypoint ({px:.0f},{py:.0f}) "
                                    f"inside node {n} — route it through a gutter")

    if geo:
        x1 = min(geo[n][0] for n in geo); y1 = min(geo[n][1] for n in geo)
        x2 = max(geo[n][0] + geo[n][2] for n in geo)
        y2 = max(geo[n][1] + geo[n][3] for n in geo)
        print(f"extent x:[{x1:.0f},{x2:.0f}] y:[{y1:.0f},{y2:.0f}]  "
              f"({len(content)} content nodes, {len(edges)} edges)")

    if problems:
        print(f"FAIL: {len(problems)} problem(s):")
        for p in problems:
            print("  - " + p)
        return 1
    print("PASS: well-formed, edges resolve, no overlaps, waypoints in gutters.")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("usage: python3 validate_drawio.py <file.drawio>")
        sys.exit(2)
    sys.exit(main(sys.argv[1]))
