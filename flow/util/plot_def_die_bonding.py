#!/usr/bin/env python3
"""
Parse a DEF file and plot DIEAREA, Bonding_layer pin rectangles, and (optional)
macro / BLOCK instance bounding boxes from COMPONENTS + LEF MACRO SIZE.

Bonding pins (PINS section):
  - pinname + NET ...
    + PORT
      + LAYER <Layer> ( dx1 dy1 ) ( dx2 dy2 )
      + FIXED|PLACED ( x y ) ...

Macros: requires one or more --lef files that define MACRO ... SIZE wx BY wy ;
COMPONENT lines: - inst master ... + PLACED|FIXED ( x y ) orient ;

Usage:
  python util/plot_def_die_bonding.py design.def -o out.png \\
    --lef path/to/macro.lef --lef path/to/other.lef
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

import matplotlib.pyplot as plt
from matplotlib.patches import Patch, Rectangle
from matplotlib.collections import PatchCollection

# Default: IP / SRAM / cache macros (exclude standard cells like gf180mcu_fd_sc_*)
_DEFAULT_MACRO_RE = r"(?i)(fd_ip_|^mem_|^l1[di]|sram)"

# Orientations where the instance is rotated 90° in the plane (swap W/H for bbox)
_SWAP_WH = frozenset({"E", "W", "FE", "FW"})


def parse_units_microns(header: str) -> int:
    """Return database units per micron (e.g. 2000 for UNITS DISTANCE MICRONS 2000)."""
    m = re.search(r"UNITS\s+DISTANCE\s+MICRONS\s+(\d+)\s*;", header, re.I)
    if not m:
        return 1000
    return int(m.group(1))


def parse_diearea(header: str) -> tuple[int, int, int, int] | None:
    m = re.search(
        r"DIEAREA\s*\(\s*(-?\d+)\s+(-?\d+)\s*\)\s*\(\s*(-?\d+)\s+(-?\d+)\s*\)\s*;",
        header,
        re.I,
    )
    if not m:
        return None
    return tuple(int(m.group(i)) for i in range(1, 5))


def parse_lef_macro_sizes(lef_paths: list[Path]) -> dict[str, tuple[float, float]]:
    """
    Map LEF MACRO name -> (width_um, height_um) from SIZE wx BY wy ;
    """
    sizes: dict[str, tuple[float, float]] = {}
    macro: str | None = None
    for lef in lef_paths:
        if not lef.is_file():
            print(f"[WARN] LEF not found, skip: {lef}", file=sys.stderr)
            continue
        with lef.open(encoding="utf-8", errors="replace") as f:
            for line in f:
                line = line.strip()
                if line.startswith("MACRO "):
                    parts = line.split()
                    macro = parts[1] if len(parts) > 1 else None
                    continue
                if macro and line.startswith("SIZE "):
                    m = re.match(
                        r"SIZE\s+([\d.]+)\s+BY\s+([\d.]+)\s*;",
                        line,
                        re.I,
                    )
                    if m:
                        sizes[macro] = (float(m.group(1)), float(m.group(2)))
                    macro = None
                    continue
                if line.startswith("END MACRO") or (
                    line.startswith("MACRO ") and macro
                ):
                    macro = None
    return sizes


def extract_section_lines(path: Path, start_prefix: str, end_prefix: str) -> list[str]:
    lines: list[str] = []
    inside = False
    with path.open(encoding="utf-8", errors="replace") as f:
        for line in f:
            if line.startswith(start_prefix):
                inside = True
            if inside:
                lines.append(line)
                if line.startswith(end_prefix):
                    break
    return lines


def extract_pins_section_lines(path: Path, max_scan_lines: int = 500_000) -> list[str]:
    lines: list[str] = []
    in_pins = False
    with path.open(encoding="utf-8", errors="replace") as f:
        for i, line in enumerate(f):
            if i > max_scan_lines and not in_pins:
                break
            if line.startswith("PINS "):
                in_pins = True
            if in_pins:
                lines.append(line)
                if line.startswith("END PINS"):
                    break
    return lines


_COMPONENT_LINE = re.compile(
    r"^\s*-\s+(\S+)\s+(\S+)\s+.*?\+\s+(?:PLACED|FIXED)\s+"
    r"\(\s*(-?\d+)\s+(-?\d+)\s*\)\s+(\S+)\s*;"
)


def parse_component_placements(components_text: str) -> list[tuple[str, str, int, int, str]]:
    """(inst, master, x_dbu, y_dbu, orient) per line."""
    out: list[tuple[str, str, int, int, str]] = []
    for line in components_text.splitlines():
        m = _COMPONENT_LINE.match(line)
        if m:
            inst, master = m.group(1), m.group(2)
            x, y = int(m.group(3)), int(m.group(4))
            orient = m.group(5)
            out.append((inst, master, x, y, orient))
    return out


def parse_pin_rects(pins_text: str) -> list[tuple[str, str, tuple[int, int, int, int]]]:
    """(pin_name, layer, (llx,lly,urx,ury)) in DEF DBU."""
    results: list[tuple[str, str, tuple[int, int, int, int]]] = []
    lines = pins_text.splitlines()
    i = 0
    while i < len(lines):
        m = re.match(r"\s*-\s+(\S+)\s+\+ NET", lines[i])
        if not m:
            i += 1
            continue
        pin_name = m.group(1)
        start_i = i
        i += 1
        layer: str | None = None
        dx1 = dy1 = dx2 = dy2 = None
        px = py = None
        while i < len(lines):
            ln = lines[i]
            if re.match(r"\s*-\s+\S+\s+\+ NET", ln) and i > start_i:
                break
            if ln.startswith("END PINS"):
                break
            lm = re.search(
                r"\+ LAYER (\S+) \(\s*(-?\d+)\s+(-?\d+)\s*\) \(\s*(-?\d+)\s+(-?\d+)\s*\)",
                ln,
            )
            if lm:
                layer = lm.group(1)
                dx1, dy1, dx2, dy2 = map(int, lm.groups()[1:5])
            pm = re.search(r"\+ (?:FIXED|PLACED) \(\s*(-?\d+)\s+(-?\d+)\s*\)", ln)
            if pm:
                px, py = map(int, pm.groups())
            i += 1
        if layer and px is not None and dx1 is not None:
            llx, lly = px + dx1, py + dy1
            urx, ury = px + dx2, py + dy2
            results.append((pin_name, layer, (llx, lly, urx, ury)))
    return results


def bonding_layer_rects(
    pins: list[tuple[str, str, tuple[int, int, int, int]]],
) -> list[tuple[int, int, int, int]]:
    return [rect for _n, layer, rect in pins if layer == "Bonding_layer"]


def macro_rects_from_components(
    placements: list[tuple[str, str, int, int, str]],
    lef_sizes: dict[str, tuple[float, float]],
    dbu_per_um: int,
    macro_re: re.Pattern[str],
) -> list[tuple[int, int, int, int]]:
    rects: list[tuple[int, int, int, int]] = []
    for _inst, master, x, y, orient in placements:
        if master not in lef_sizes:
            continue
        if not macro_re.search(master):
            continue
        w_um, h_um = lef_sizes[master]
        if orient in _SWAP_WH:
            w_um, h_um = h_um, w_um
        w_dbu = int(round(w_um * dbu_per_um))
        h_dbu = int(round(h_um * dbu_per_um))
        llx, lly = x, y
        urx, ury = x + w_dbu, y + h_dbu
        rects.append((llx, lly, urx, ury))
    return rects


def dbu_to_um(v: float, dbu_per_um: int) -> float:
    return v / dbu_per_um


def _rect_patches(
    rects: list[tuple[int, int, int, int]], dbu_per_um: int
) -> list[Rectangle]:
    return [
        Rectangle(
            (dbu_to_um(r[0], dbu_per_um), dbu_to_um(r[1], dbu_per_um)),
            dbu_to_um(r[2] - r[0], dbu_per_um),
            dbu_to_um(r[3] - r[1], dbu_per_um),
        )
        for r in rects
    ]


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Plot DEF DIEAREA, Bonding_layer pins, and macro bboxes (LEF+COMPONENTS)."
    )
    ap.add_argument("def_path", type=Path, help="Path to .def")
    ap.add_argument("-o", "--output", type=Path, default=None, help="Output image (png/pdf/svg)")
    ap.add_argument("--dpi", type=int, default=150)
    ap.add_argument(
        "--lef",
        type=Path,
        action="append",
        default=[],
        help="LEF file(s) containing MACRO SIZE (repeat for multiple)",
    )
    ap.add_argument(
        "--macro-regex",
        default=_DEFAULT_MACRO_RE,
        help=f"Regex on master cell name to draw as macro (default: {_DEFAULT_MACRO_RE!r})",
    )
    args = ap.parse_args()

    path = args.def_path
    if not path.is_file():
        print(f"Not a file: {path}", file=sys.stderr)
        return 1

    macro_re = re.compile(args.macro_regex)

    with path.open(encoding="utf-8", errors="replace") as f:
        head = "".join(f.readline() for _ in range(40))

    dbu_per_um = parse_units_microns(head)
    die = parse_diearea(head)
    if die is None:
        print("DIEAREA not found in first 40 lines.", file=sys.stderr)
        return 1

    lef_sizes = parse_lef_macro_sizes(args.lef) if args.lef else {}

    pin_lines = extract_pins_section_lines(path)
    pins_text = "".join(pin_lines)
    all_pins = parse_pin_rects(pins_text)
    rects_bonding = bonding_layer_rects(all_pins)

    rects_macro: list[tuple[int, int, int, int]] = []
    if lef_sizes:
        comp_lines = extract_section_lines(path, "COMPONENTS ", "END COMPONENTS")
        comp_text = "".join(comp_lines)
        placements = parse_component_placements(comp_text)
        rects_macro = macro_rects_from_components(
            placements, lef_sizes, dbu_per_um, macro_re
        )

    llx, lly, urx, ury = die
    die_w = urx - llx
    die_h = ury - lly

    fig, ax = plt.subplots(figsize=(12, 10))
    die_um = Rectangle(
        (dbu_to_um(llx, dbu_per_um), dbu_to_um(lly, dbu_per_um)),
        dbu_to_um(die_w, dbu_per_um),
        dbu_to_um(die_h, dbu_per_um),
        linewidth=1.5,
        edgecolor="black",
        facecolor="none",
        label="DIEAREA",
    )
    ax.add_patch(die_um)

    legend_handles: list[Patch] = [die_um]

    if rects_macro:
        pc_m = PatchCollection(
            _rect_patches(rects_macro, dbu_per_um),
            facecolor="steelblue",
            edgecolor="navy",
            alpha=0.35,
            linewidth=0.4,
        )
        ax.add_collection(pc_m)
        legend_handles.append(
            Patch(
                facecolor="steelblue",
                edgecolor="navy",
                alpha=0.35,
                label=f"Macro ({len(rects_macro)})",
            )
        )

    if rects_bonding:
        pc_b = PatchCollection(
            _rect_patches(rects_bonding, dbu_per_um),
            facecolor="coral",
            edgecolor="darkred",
            alpha=0.5,
            linewidth=0.25,
        )
        ax.add_collection(pc_b)
        legend_handles.append(
            Patch(
                facecolor="coral",
                edgecolor="darkred",
                alpha=0.5,
                label=f"Bonding_layer ({len(rects_bonding)})",
            )
        )

    ax.set_aspect("equal")
    ax.set_xlabel("x (µm)")
    ax.set_ylabel("y (µm)")
    title = f"{path.name}\nDIEAREA + Bonding_layer ({len(rects_bonding)})"
    if args.lef:
        title += f" + macro ({len(rects_macro)})"
    elif not rects_macro:
        title += " + macro (0 — pass --lef with MACRO SIZE)"
    ax.set_title(title)
    ax.grid(True, alpha=0.3)
    ax.legend(handles=legend_handles, loc="upper right")

    margin_um = max(die_w, die_h) / dbu_per_um * 0.02
    ax.set_xlim(
        dbu_to_um(llx, dbu_per_um) - margin_um,
        dbu_to_um(urx, dbu_per_um) + margin_um,
    )
    ax.set_ylim(
        dbu_to_um(lly, dbu_per_um) - margin_um,
        dbu_to_um(ury, dbu_per_um) + margin_um,
    )

    plt.tight_layout()
    out = args.output
    if out:
        plt.savefig(out, dpi=args.dpi)
        print(
            f"Wrote {out.resolve()} (bonding={len(rects_bonding)}, macro={len(rects_macro)}, dbu_per_um={dbu_per_um})"
        )
    else:
        plt.show()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
