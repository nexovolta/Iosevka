#!/usr/bin/env python3
"""Dump filled vector outlines and PNG screenshots for every changed glyph variant.

Also writes a pull-request sample block (see .github/pull_request_template.md).

By default rebuilds all Iosevka build plans (not Nexsevka), then tests changed glyphs
in Iosevka Regular / Italic / Oblique using OpenType features for character variants.

Usage (from repo root):
  python tools/test-changed-glyphs.py
  python tools/test-changed-glyphs.py --no-build
  python tools/test-changed-glyphs.py --manifest tools/changed-glyphs.json
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import unicodedata
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path

import uharfbuzz as hb
from fontTools.misc.transform import Transform
from fontTools.pens.freetypePen import FreeTypePen
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

REPO = Path(__file__).resolve().parent
if REPO.name == "tools":
    REPO = REPO.parent
DEFAULT_MANIFEST = REPO / "tools" / "changed-glyphs.json"
DEFAULT_OUT = REPO / ".glyph-test-output"
BUILD_PLANS = REPO / "build-plans.toml"
BLOCKS_CACHE = REPO / "tools" / "unicode-blocks.txt"
BLOCKS_URL = "https://www.unicode.org/Public/UNIDATA/Blocks.txt"

SLOPE_FONTS = [
    ("upright", "Regular"),
    ("oblique", "Oblique"),
    ("italic", "Italic"),
]

# One-image specimen rows, in this exact order.
TEST_STYLE_ROWS = [
    ("sans regular", "IosevkaTestSans", "Regular"),
    ("sans italic", "IosevkaTestSans", "Italic"),
    ("slab regular", "IosevkaTestSlab", "Regular"),
    ("slab italic", "IosevkaTestSlab", "Italic"),
    ("aile regular", "IosevkaTestAile", "Regular"),
    ("aile italic", "IosevkaTestAile", "Italic"),
    ("etoile regular", "IosevkaTestEtoile", "Regular"),
    ("etoile italic", "IosevkaTestEtoile", "Italic"),
]

# Print-size cells: same em-scale for every glyph, large enough to inspect tails.
MATRIX_CELL_W = 200
MATRIX_CELL_H = 260
MATRIX_HEADER_H = 72
MATRIX_ROW_LABEL_W = 150
MATRIX_PREVIEW_TITLE_PX = 28
MATRIX_PREVIEW_SUBTITLE_PX = 20
MATRIX_PREVIEW_COL_HEADER_PX = 20
MATRIX_PREVIEW_ROW_LABEL_PX = 17


def matrix_annotation_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in (
        REPO / "dist/IosevkaTestAile/TTF-Unhinted/IosevkaTestAile-Regular.ttf",
        Path("C:/Windows/Fonts/segoeui.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    ):
        if path.is_file():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


def wrap_header(name: str, max_len: int = 16) -> str:
    parts = name.split("-")
    lines: list[str] = []
    cur = ""
    for part in parts:
        cand = f"{cur}-{part}" if cur else part
        if cur and len(cand) > max_len:
            lines.append(cur)
            cur = part
        else:
            cur = cand
    if cur:
        lines.append(cur)
    return "\n".join(lines) if lines else name


@dataclass
class VariantSetting:
    tag: str
    name: str
    value: int


@dataclass
class CharacterRecord:
    code: str
    label: str
    kind: str
    glyph_names: list[str] = field(default_factory=list)
    composites: list[tuple[str, str]] = field(default_factory=list)
    variant_features: list[VariantSetting] = field(default_factory=list)
    variant_matrix: str = ""


@dataclass
class FontRunResult:
    font_path: Path
    out_dir: Path
    skipped: bool = False
    skip_reason: str = ""
    characters: list[CharacterRecord] = field(default_factory=list)
    artifact_count: int = 0


def load_manifest(path: Path) -> dict:
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def parse_iosevka_build_plans(path: Path) -> list[str]:
    plans: list[str] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        match = re.match(r"\[buildPlans\.(Iosevka[^\]]*)\]", line)
        if match:
            plans.append(match.group(1))
    return plans


def build_all_iosevka(plans: list[str], batch_size: int = 5) -> None:
    if not plans:
        print("No Iosevka build plans found in build-plans.toml", file=sys.stderr)
        return
    npm = shutil.which("npm")
    if not npm:
        raise FileNotFoundError("npm not found on PATH")
    print(f"Building {len(plans)} Iosevka font groups (ttf-unhinted)...")
    for start in range(0, len(plans), batch_size):
        batch = plans[start : start + batch_size]
        targets = [f"ttf-unhinted::{plan}" for plan in batch]
        print(f"  batch {start // batch_size + 1}: {', '.join(batch)}")
        subprocess.run([npm, "run", "build", "--", *targets], cwd=REPO, check=True)


def load_unicode_blocks() -> list[tuple[int, int, str]]:
    if not BLOCKS_CACHE.is_file():
        print(f"Downloading Unicode block data to {BLOCKS_CACHE.relative_to(REPO)}...")
        BLOCKS_CACHE.write_bytes(urllib.request.urlopen(BLOCKS_URL, timeout=60).read())
    blocks: list[tuple[int, int, str]] = []
    for line in BLOCKS_CACHE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        range_part, name = line.split(";", 1)
        start_s, end_s = range_part.strip().split("..")
        blocks.append((int(start_s, 16), int(end_s, 16), name.strip()))
    return blocks


def unicode_block_name(code: str, blocks: list[tuple[int, int, str]]) -> str:
    cp = int(code, 16)
    for start, end, name in blocks:
        if start <= cp <= end:
            return name
    return "Unknown"


def collect_unicode_blocks(manifest: dict, blocks: list[tuple[int, int, str]]) -> list[tuple[str, list[str]]]:
    by_block: dict[str, list[str]] = {}
    for section in ("marks", "letters"):
        for entry in manifest.get(section, []):
            code = entry["code"].upper()
            block = unicode_block_name(code, blocks)
            by_block.setdefault(block, []).append(code)
    return sorted((block, sorted(codes)) for block, codes in by_block.items())


def format_unicode_blocks_report(block_groups: list[tuple[str, list[str]]]) -> str:
    lines = ["## Unicode blocks with changed glyphs", ""]
    for block, codes in block_groups:
        code_list = ", ".join(format_code(c) for c in codes)
        lines.append(f"- **{block}**: {code_list}")
    lines.append("")
    return "\n".join(lines)


def discover_slope_fonts(family: str = "Iosevka") -> list[Path]:
    fonts: list[Path] = []
    for _slope, suffix in SLOPE_FONTS:
        path = REPO / f"dist/{family}/TTF-Unhinted/{family}-{suffix}.ttf"
        if path.is_file():
            fonts.append(path)
    return fonts


def flatten_glyph(gs, gname: str, pen) -> None:
    g = gs[gname]
    components = getattr(g, "components", None) or []
    if components:
        if getattr(g, "numberOfContours", 0) > 0:
            g.draw(pen)
            return
        for comp_name, tr in components:
            tpen = TransformPen(pen, tr)
            flatten_glyph(gs, comp_name, tpen)
        return
    g.draw(pen)


def split_contours(recording: list) -> list[list[tuple]]:
    contours: list[list[tuple]] = []
    current: list[tuple] = []
    for cmd, args in recording:
        if cmd == "moveTo":
            if current:
                contours.append(current)
            current = [("moveTo", args)]
        elif cmd in ("lineTo", "curveTo", "qCurveTo", "closePath"):
            current.append((cmd, args))
        else:
            current.append((cmd, args))
    if current:
        contours.append(current)
    return contours


def contour_to_svg_d(contour: list[tuple]) -> str:
    parts: list[str] = []
    for cmd, args in contour:
        if cmd == "moveTo":
            x, y = args[0]
            parts.append(f"M{x:.2f},{y:.2f}")
        elif cmd == "lineTo":
            x, y = args[0]
            parts.append(f"L{x:.2f},{y:.2f}")
        elif cmd == "curveTo":
            (x1, y1), (x2, y2), (x3, y3) = args
            parts.append(f"C{x1:.2f},{y1:.2f} {x2:.2f},{y2:.2f} {x3:.2f},{y3:.2f}")
        elif cmd == "qCurveTo":
            pts = args
            if len(pts) == 2:
                (x1, y1), (x2, y2) = pts
                parts.append(f"Q{x1:.2f},{y1:.2f} {x2:.2f},{y2:.2f}")
            else:
                for pt in pts:
                    parts.append(f"L{pt[0]:.2f},{pt[1]:.2f}")
        elif cmd == "closePath":
            parts.append("Z")
    return " ".join(parts)


def bbox_of_recording(recording: list) -> tuple[float, float, float, float] | None:
    xs: list[float] = []
    ys: list[float] = []
    for cmd, args in recording:
        if cmd == "moveTo":
            xs.append(args[0][0])
            ys.append(args[0][1])
        elif cmd == "lineTo":
            xs.append(args[0][0])
            ys.append(args[0][1])
        elif cmd in ("curveTo", "qCurveTo"):
            for pt in args:
                xs.append(pt[0])
                ys.append(pt[1])
    if not xs:
        return None
    return min(xs), min(ys), max(xs), max(ys)


def write_outline_txt(path: Path, gname: str, recording: list) -> None:
    lines = [f"# {gname}", ""]
    for cmd, args in recording:
        lines.append(f"{cmd} {args}")
    bb = bbox_of_recording(recording)
    if bb:
        cx = (bb[0] + bb[2]) / 2
        lines.append("")
        lines.append(
            f"bbox x=[{bb[0]:.1f},{bb[2]:.1f}] y=[{bb[1]:.1f},{bb[3]:.1f}] center_x={cx:.1f}"
        )
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_filled_svg(path: Path, recording: list, padding: float = 30) -> None:
    contours = split_contours(recording)
    bb = bbox_of_recording(recording)
    if not bb:
        path.write_text('<svg xmlns="http://www.w3.org/2000/svg"/>', encoding="utf-8")
        return
    minx, miny, maxx, maxy = bb
    w = maxx - minx + 2 * padding
    h = maxy - miny + 2 * padding
    paths = []
    for contour in contours:
        d = contour_to_svg_d(contour)
        if d:
            paths.append(f'  <path d="{d}" fill="#000" fill-rule="evenodd"/>')
    tx = padding - minx
    ty = padding + maxy
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w:.1f}" height="{h:.1f}" '
        f'viewBox="0 0 {w:.1f} {h:.1f}">\n'
        f'  <g transform="scale(1,-1) translate({tx},{ty})">\n'
        + "\n".join(paths)
        + "\n  </g>\n</svg>\n"
    )
    path.write_text(svg, encoding="utf-8")


def write_filled_png_from_glyph(gs, gname: str, path: Path, height: int = 320) -> None:
    pen = FreeTypePen(gs)
    flatten_glyph(gs, gname, pen)
    raw = pen.image(height=height, contain=True)
    if raw.mode == "LA":
        alpha = raw.getchannel("A")
        out = Image.new("RGB", raw.size, "white")
        black = Image.new("RGB", raw.size, "black")
        out.paste(black, mask=alpha)
    else:
        out = raw.convert("RGB")
    out.save(path)


def discover_glyphs(order: list[str], code: str, extra_prefixes: list[str] | None = None) -> list[str]:
    code = code.upper()
    names: list[str] = []
    for prefix in [f"uni{code}."] + list(extra_prefixes or []):
        names.extend(g for g in order if g.startswith(prefix))
    exact = f"uni{code}"
    if exact in order:
        names.append(exact)
    return sorted(set(names))


def pick_primary_glyph(gnames: list[str]) -> str | None:
    if not gnames:
        return None
    plain = [g for g in gnames if g.endswith(".join-l") and "TieMark" not in g]
    if plain:
        return sorted(plain)[0]
    return gnames[0]


def replay_recording(recording: list, pen: RecordingPen, dx: float = 0, dy: float = 0) -> None:
    for cmd, args in recording:
        if cmd == "moveTo":
            pen.moveTo((args[0][0] + dx, args[0][1] + dy))
        elif cmd == "lineTo":
            pen.lineTo((args[0][0] + dx, args[0][1] + dy))
        elif cmd == "curveTo":
            pen.curveTo(
                (args[0][0] + dx, args[0][1] + dy),
                (args[1][0] + dx, args[1][1] + dy),
                (args[2][0] + dx, args[2][1] + dy),
            )
        elif cmd == "qCurveTo":
            pen.qCurveTo(*[(pt[0] + dx, pt[1] + dy) for pt in args])
        elif cmd == "closePath":
            pen.closePath()
        elif cmd == "addComponent":
            glyph_name, transformation = args
            if dx or dy:
                t = list(transformation)
                t[4] += dx
                t[5] += dy
                transformation = tuple(t)
            pen.addComponent(glyph_name, transformation)
        elif hasattr(pen, "value"):
            pen.value.append((cmd, args))
        else:
            raise TypeError(f"Unsupported pen command {cmd!r} for {type(pen).__name__}")


def shape_text(
    glyph_order: list[str],
    font_path: Path,
    text: str,
    features: dict[str, int] | None = None,
) -> tuple[list[tuple[str, float, float]], float]:
    data = font_path.read_bytes()
    face = hb.Face(data)
    font = hb.Font(face)
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    hb.shape(font, buf, features or {})
    infos = buf.glyph_infos
    positions = buf.glyph_positions
    out: list[tuple[str, float, float]] = []
    x_cursor = 0.0
    for i, info in enumerate(infos):
        gname = glyph_order[info.codepoint]
        pos = positions[i]
        x_off = x_cursor + pos.x_offset
        y_off = pos.y_offset
        out.append((gname, x_off, y_off))
        x_cursor += pos.x_advance
    return out, x_cursor


def composite_recording(
    gs,
    glyph_order: list[str],
    font_path: Path,
    text: str,
    features: dict[str, int] | None = None,
) -> list:
    combined = RecordingPen()
    glyphs, _advance = shape_text(glyph_order, font_path, text, features)
    for gname, dx, dy in glyphs:
        part = RecordingPen()
        flatten_glyph(gs, gname, part)
        replay_recording(part.value, combined, dx, dy)
    return combined.value


def freetype_to_rgb(raw: Image.Image) -> Image.Image:
    if raw.mode == "LA":
        alpha = raw.getchannel("A")
        out = Image.new("RGB", raw.size, "white")
        black = Image.new("RGB", raw.size, "black")
        out.paste(black, mask=alpha)
        return out
    return raw.convert("RGB")


def render_text_png(
    path: Path,
    font_path: Path,
    text: str,
    size: int = 160,
    features: dict[str, int] | None = None,
) -> None:
    features = features or {}
    with TTFont(font_path) as font:
        order = font.getGlyphOrder()
        gs = font.getGlyphSet()
        combined = RecordingPen()
        glyphs, _advance = shape_text(order, font_path, text, features)
        for gname, dx, dy in glyphs:
            part = RecordingPen()
            flatten_glyph(gs, gname, part)
            replay_recording(part.value, combined, dx, dy)
        fp = FreeTypePen(gs)
        replay_recording(combined.value, fp)
        raw = fp.image(height=size, contain=True)
    freetype_to_rgb(raw).save(path)


def font_vertical_metrics(font: TTFont) -> dict[str, int]:
    hhea = font["hhea"]
    os2 = font.get("OS/2")
    asc = int(hhea.ascent)
    desc = int(hhea.descent)
    cap = int(getattr(os2, "sCapHeight", 0) or asc)
    xh = int(getattr(os2, "sxHeight", 0) or round(asc * 0.72))
    return {
        "ascender": asc,
        "descender": desc,
        "cap_height": cap,
        "x_height": xh,
        "baseline": 0,
    }


def font_y_to_pixel(y: float, scale: float, desc: int) -> int:
    """Map font units to PIL row using the same Y convention as FreeTypePen."""
    return int(round(scale * (y - desc)))


def draw_metric_lines(
    img: Image.Image,
    metrics: dict[str, int],
    scale: float,
) -> None:
    draw = ImageDraw.Draw(img)
    w = img.width
    desc = metrics["descender"]
    lines = [
        ("descender", metrics["descender"], "#cccccc"),
        ("baseline", metrics["baseline"], "#888888"),
        ("x-height", metrics["x_height"], "#bbbbbb"),
        ("cap-height", metrics["cap_height"], "#aaaaaa"),
        ("ascender", metrics["ascender"], "#cccccc"),
    ]
    for _name, y_font, color in lines:
        y_px = font_y_to_pixel(y_font, scale, desc)
        if 0 <= y_px < img.height:
            draw.line([(0, y_px), (w - 1, y_px)], fill=color, width=1)


def render_em_cell(
    font_path: Path,
    text: str,
    cell_w: int,
    cell_h: int,
    features: dict[str, int] | None = None,
    pad: int = 16,
) -> Image.Image:
    """Render text centered on x; y aligned to shared font metrics with guide lines."""
    features = features or {}
    with TTFont(font_path) as font:
        order = font.getGlyphOrder()
        gs = font.getGlyphSet()
        metrics = font_vertical_metrics(font)
        asc = metrics["ascender"]
        desc = metrics["descender"]
        combined = RecordingPen()
        glyphs, _advance = shape_text(order, font_path, text, features)
        for gname, dx, dy in glyphs:
            part = RecordingPen()
            flatten_glyph(gs, gname, part)
            replay_recording(part.value, combined, dx, dy)
        fp = FreeTypePen(gs)
        replay_recording(combined.value, fp)
        em_h = max(asc - desc, 1)
        scale = (cell_h - 2 * pad) / em_h
        xmin, ymin, xmax, ymax = fp.bbox
        tx = (cell_w - (xmax + xmin) * scale) / 2
        # FreeTypePen rasterizes with y-up outline coords into a top-down bitmap
        # using a positive Y scale. Do not negate scale or the glyph flips.
        ty = -scale * desc
        transform = Transform(scale, 0, 0, scale, tx, ty)
        raw = fp.image(width=cell_w, height=cell_h, transform=transform, contain=False)
        out = freetype_to_rgb(raw)
        draw_metric_lines(out, metrics, scale)
    return out


def process_composite(
    out_dir: Path,
    gs,
    glyph_order: list[str],
    font_path: Path,
    base: str,
    code: str,
    label: str,
    features: dict[str, int] | None = None,
    suffix: str = "",
) -> Path:
    cp = chr(int(code, 16))
    text = base + cp
    feat_label = suffix or "default"
    sub = out_dir / "composite" / f"{base}+U{code}" / label / feat_label
    sub.mkdir(parents=True, exist_ok=True)
    recording = composite_recording(gs, glyph_order, font_path, text, features)
    write_outline_txt(sub / "outline.txt", text, recording)
    write_filled_svg(sub / "filled.svg", recording)
    render_text_png(sub / "filled.png", font_path, text, features=features)
    return sub / "filled.png"


def font_slug(font_path: Path) -> str:
    return font_path.stem


def unicode_name(code: str, label: str = "") -> str:
    try:
        return unicodedata.name(chr(int(code, 16)))
    except ValueError:
        if label:
            return label.replace("-", " ").upper()
        return f"U+{code.upper()}"


def format_code(code: str) -> str:
    return f"U+{code.upper()}"


def display_character(code: str, kind: str, base: str) -> str:
    ch = chr(int(code, 16))
    if kind == "mark":
        return f"{base}{ch}"
    return ch


def parse_variant_settings(entry: dict) -> list[VariantSetting]:
    settings: list[VariantSetting] = []
    for item in entry.get("variant_features", []):
        settings.append(VariantSetting(tag=item["tag"], name=item["name"], value=item["value"]))
    return settings


def variant_columns(variants: list[VariantSetting]) -> list[tuple[str, dict[str, int]]]:
    if not variants:
        return [("default", {})]
    by_tag: dict[str, list[VariantSetting]] = {}
    for v in variants:
        by_tag.setdefault(v.tag, []).append(v)
    if len(by_tag) != 1:
        cols: list[tuple[str, dict[str, int]]] = [("default", {})]
        for v in sorted(variants, key=lambda item: (item.tag, item.value)):
            cols.append((f"{v.tag}={v.value} ({v.name})", {v.tag: v.value}))
        return cols
    tag, tag_variants = next(iter(by_tag.items()))
    cols = [("default", {})]
    for v in sorted(tag_variants, key=lambda item: item.value):
        cols.append((f"{v.name}", {tag: v.value}))
    return cols


def test_style_font(family: str, suffix: str) -> Path:
    return REPO / f"dist/{family}/TTF-Unhinted/{family}-{suffix}.ttf"


def render_character_matrix(
    out_dir: Path,
    code: str,
    label: str,
    kind: str,
    sample_base: str,
    variants: list[VariantSetting],
    cell_w: int = MATRIX_CELL_W,
    cell_h: int = MATRIX_CELL_H,
    header_h: int = MATRIX_HEADER_H,
    row_label_w: int = MATRIX_ROW_LABEL_W,
    section_code: str | None = None,
    section_subtitle: str | None = None,
) -> Image.Image:
    sample = display_character(code, kind, sample_base)
    cols = variant_columns(variants)
    title_font = matrix_annotation_font(MATRIX_PREVIEW_TITLE_PX)
    subtitle_font = matrix_annotation_font(MATRIX_PREVIEW_SUBTITLE_PX)
    col_header_font = matrix_annotation_font(MATRIX_PREVIEW_COL_HEADER_PX)
    row_label_font = matrix_annotation_font(MATRIX_PREVIEW_ROW_LABEL_PX)

    title_h = 0
    if section_code:
        top = 8
        tb = title_font.getbbox(section_code)
        title_h = top + (tb[3] - tb[1]) + 8
        if section_subtitle:
            sb = subtitle_font.getbbox(section_subtitle)
            title_h += 4 + (sb[3] - sb[1])
        title_h += 8

    img_w = row_label_w + len(cols) * cell_w + 10
    img_h = title_h + header_h + len(TEST_STYLE_ROWS) * cell_h + 10
    img = Image.new("RGB", (img_w, img_h), "white")
    draw = ImageDraw.Draw(img)

    if section_code:
        y = 8
        draw.text((8, y), section_code, font=title_font, fill="#222222")
        tb = title_font.getbbox(section_code)
        y += tb[3] - tb[1] + 4
        if section_subtitle:
            draw.text((8, y), section_subtitle, font=subtitle_font, fill="#555555")

    for col_idx, (col_name, _features) in enumerate(cols):
        x0 = row_label_w + col_idx * cell_w + 8
        draw.multiline_text(
            (x0, title_h + 4),
            wrap_header(col_name),
            font=col_header_font,
            fill="#444444",
            spacing=3,
        )

    tmp_dir = out_dir / "variant-matrix" / f"U{code}"
    tmp_dir.mkdir(parents=True, exist_ok=True)

    for row_idx, (row_name, family, suffix) in enumerate(TEST_STYLE_ROWS):
        font_path = test_style_font(family, suffix)
        y0 = title_h + header_h + row_idx * cell_h
        rb = row_label_font.getbbox(row_name)
        row_y = y0 + (cell_h - (rb[3] - rb[1])) // 2 - rb[1]
        draw.text((8, row_y), row_name, font=row_label_font, fill="#666666")
        if not font_path.is_file():
            continue
        for col_idx, (col_name, features) in enumerate(cols):
            x0 = row_label_w + col_idx * cell_w
            cell = render_em_cell(
                font_path,
                sample,
                cell_w,
                cell_h,
                features=features or None,
            )
            safe = re.sub(r"[^\w.\-+]+", "-", col_name).strip("-")
            cell.save(tmp_dir / f"{family}-{suffix}-{safe}.png")
            img.paste(cell, (x0, y0))
            draw.rectangle(
                [x0, y0, x0 + cell_w - 1, y0 + cell_h - 1],
                outline="#dddddd",
            )

    path = tmp_dir / f"{label}-matrix.png"
    img.save(path)
    return img


def render_combined_variant_sheet(
    out_dir: Path,
    manifest: dict,
    sample_base: str,
) -> Path:
    sections: list[Image.Image] = []
    for kind, section_name in (("marks", "marks"), ("letters", "letters")):
        for entry in manifest.get(section_name, []):
            code = entry["code"].upper()
            label = entry.get("label", code)
            variants = parse_variant_settings(entry)
            sections.append(
                render_character_matrix(
                    out_dir,
                    code,
                    label,
                    kind,
                    sample_base,
                    variants,
                    section_code=format_code(code),
                    section_subtitle=label,
                )
            )
    if not sections:
        raise ValueError("manifest has no marks or letters to render")

    gap = 24
    width = max(img.width for img in sections)
    height = sum(img.height for img in sections) + gap * (len(sections) - 1)
    combined = Image.new("RGB", (width, height), "white")
    y = 0
    for img in sections:
        combined.paste(img, (0, y))
        y += img.height + gap

    path = out_dir / "variants.png"
    combined.save(path)
    return path


def render_variant_matrix(
    out_dir: Path,
    code: str,
    label: str,
    kind: str,
    sample_base: str,
    slope_fonts: dict[str, Path],
    variants: list[VariantSetting],
) -> Path | None:
    del slope_fonts
    img = render_character_matrix(out_dir, code, label, kind, sample_base, variants)
    path = out_dir / "variant-matrix" / f"U{code}" / f"{label}-matrix.png"
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path)
    return path


def process_glyph(out_dir: Path, gs, gname: str) -> Path:
    pen = RecordingPen()
    flatten_glyph(gs, gname, pen)
    recording = pen.value
    glyph_dir = out_dir / "glyphs" / gname
    glyph_dir.mkdir(parents=True, exist_ok=True)
    write_outline_txt(glyph_dir / "outline.txt", gname, recording)
    write_filled_svg(glyph_dir / "filled.svg", recording)
    write_filled_png_from_glyph(gs, gname, glyph_dir / "filled.png")
    return glyph_dir / "filled.png"


def render_specimen_sheet(
    out_dir: Path,
    font_path: Path,
    characters: list[CharacterRecord],
    sample_base: str,
    cell_w: int = 220,
    cell_h: int = 120,
    font_size: int = 72,
) -> Path | None:
    if not characters:
        return None

    font = ImageFont.truetype(str(font_path), font_size)
    label_font = ImageFont.truetype(str(font_path), 18)
    cols = min(4, max(1, len(characters)))
    rows = (len(characters) + cols - 1) // cols
    img = Image.new("RGB", (cols * cell_w + 20, rows * cell_h + 20), "white")
    draw = ImageDraw.Draw(img)

    for idx, rec in enumerate(characters):
        row, col = divmod(idx, cols)
        x0 = 10 + col * cell_w
        y0 = 10 + row * cell_h
        sample = display_character(rec.code, rec.kind, sample_base)
        bbox = font.getbbox(sample)
        tx = x0 + (cell_w - (bbox[2] - bbox[0])) // 2 - bbox[0]
        ty = y0 + 28 - bbox[1]
        draw.text((tx, ty), sample, font=font, fill="black")
        header = f"{format_code(rec.code)}"
        draw.text((x0 + 8, y0 + 4), header, font=label_font, fill="#444444")
        draw.text((x0 + 8, y0 + cell_h - 22), rec.label, font=label_font, fill="#666666")
        draw.rectangle([x0, y0, x0 + cell_w - 1, y0 + cell_h - 1], outline="#dddddd")

    path = out_dir / "specimen.png"
    img.save(path)
    return path


def format_pr_block(
    result: FontRunResult,
    manifest_path: Path,
    sample_base: str,
    block_report: str,
) -> str:
    if result.skipped:
        return f"SKIP {result.font_path}: {result.skip_reason}"

    try:
        rel_font = result.font_path.relative_to(REPO).as_posix()
    except ValueError:
        rel_font = result.font_path.as_posix()

    lines = [
        f"## {result.font_path.name}",
        "",
        f"Font: `{rel_font}`",
        f"Manifest: `{manifest_path.relative_to(REPO).as_posix()}`",
        "",
        block_report.rstrip(),
        "",
        "### Influenced Characters",
        "",
        "<!-- Format: U+XXXX: <character> (name) -->",
        "",
    ]

    for rec in result.characters:
        shown = display_character(rec.code, rec.kind, sample_base)
        lines.append(
            f"- {format_code(rec.code)}: `{shown}` ({unicode_name(rec.code, rec.label)})"
        )

    glyph_variant_count = sum(len(rec.glyph_names) for rec in result.characters)
    composite_count = sum(len(rec.composites) for rec in result.characters)

    lines.extend(
        [
            "",
            "### Glyph Quantity",
            "",
            f"- {len(result.characters)} influenced Unicode character(s)",
            f"- {glyph_variant_count} glyph variant(s) rendered in this font",
            f"- {composite_count} composite sample(s) rendered",
            f"- {result.artifact_count} total artifact file(s) written",
            "",
            "### Samples",
            "",
        ]
    )

    specimen_rel = "specimen.png"
    if (result.out_dir / "specimen.png").is_file():
        lines.append(f"![All influenced characters in {result.font_path.name}]({specimen_rel})")
        lines.append("")

    for rec in result.characters:
        lines.append(f"#### {format_code(rec.code)} · {rec.label}")
        lines.append("")
        if rec.variant_matrix:
            lines.append(
                f"- Variant matrix (upright / oblique / italic × OpenType variants): "
                f"![matrix]({rec.variant_matrix})"
            )
        primary = pick_primary_glyph(rec.glyph_names)
        if primary:
            rel = f"glyphs/{primary}/filled.png"
            lines.append(f"- Glyph (`{primary}`): ![{primary}]({rel})")
        for base, comp_rel in rec.composites:
            lines.append(f"- Composite on `{base}`: ![{base}+U{rec.code}]({comp_rel})")
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def format_pr_template(
    manifest: dict,
    sample_base: str,
    block_report: str,
    result: FontRunResult | None,
) -> str:
    lines = [
        "### Motivation and Context",
        "",
        "Add compound Chao-tone combining marks (Unicode 18.0 / Iosevka #2970) with "
        "caret/caron-consistent joins, dotted-grave/acute variants following `cv96`, "
        "and Latin letter U+1DF11 LATIN SMALL LETTER L WITH FISHHOOK.",
        "",
        block_report.rstrip(),
        "",
        "### Influenced Characters",
        "",
    ]
    for section, kind in (("marks", "mark"), ("letters", "letter")):
        for entry in manifest.get(section, []):
            code = entry["code"].upper()
            shown = display_character(code, kind, sample_base)
            lines.append(
                f"- {format_code(code)}: `{shown}` ({unicode_name(code, entry.get('label', code))})"
            )
    lines.extend(["", "### Glyph Quantity", ""])
    if result and not result.skipped:
        glyph_variant_count = sum(len(rec.glyph_names) for rec in result.characters)
        lines.append(f"- {len(result.characters)} influenced Unicode character(s)")
        lines.append(f"- {glyph_variant_count} glyph variant(s) in Iosevka-Regular")
        lines.append("- 16 new compound-tone mark glyphs + 2 dotted mark variants + 1 letter")
    else:
        lines.append("- 16 compound-tone marks, 2 dotted-grave/acute variants, 1 letter")
    lines.extend(["", "### Samples", ""])
    if result and not result.skipped:
        lines.append(
            "![Specimen](.glyph-test-output/Iosevka-Regular/specimen.png)"
        )
        for rec in result.characters:
            if rec.variant_matrix:
                lines.append(
                    f"- {format_code(rec.code)} variant matrix: "
                    f"![{rec.label}](.glyph-test-output/Iosevka-Regular/{rec.variant_matrix})"
                )
    return "\n".join(lines).rstrip() + "\n"


def run_font(
    font_path: Path,
    manifest: dict,
    out_root: Path,
    slope_fonts: dict[str, Path],
) -> FontRunResult:
    out_dir = out_root / font_slug(font_path)
    if not font_path.is_file():
        return FontRunResult(
            font_path=font_path,
            out_dir=out_dir,
            skipped=True,
            skip_reason="font file not found",
        )

    font = TTFont(font_path)
    order = font.getGlyphOrder()
    gs = font.getGlyphSet()
    bases = manifest.get("composite_bases", ["a"])
    sample_base = bases[0] if bases else "a"

    characters: list[CharacterRecord] = []
    artifact_count = 0
    seen_glyphs: set[str] = set()

    for entry in manifest.get("marks", []):
        code = entry["code"].upper()
        variants = parse_variant_settings(entry)
        rec = CharacterRecord(
            code=code,
            label=entry.get("label", code),
            kind="mark",
            variant_features=variants,
        )
        for gname in discover_glyphs(order, code, entry.get("name_prefixes")):
            if gname in seen_glyphs:
                continue
            seen_glyphs.add(gname)
            process_glyph(out_dir, gs, gname)
            rec.glyph_names.append(gname)
            artifact_count += 3
        for base in bases:
            cols = variant_columns(variants)
            for col_name, features in cols:
                png = process_composite(
                    out_dir,
                    gs,
                    order,
                    font_path,
                    base,
                    code,
                    rec.label,
                    features or None,
                    suffix=col_name,
                )
                rec.composites.append((base, png.relative_to(out_dir).as_posix()))
                artifact_count += 3
        matrix = render_variant_matrix(
            out_dir, code, rec.label, "mark", sample_base, slope_fonts, variants
        )
        if matrix:
            rec.variant_matrix = matrix.relative_to(out_dir).as_posix()
            artifact_count += 1
        if rec.glyph_names or rec.composites:
            characters.append(rec)

    for entry in manifest.get("letters", []):
        code = entry["code"].upper()
        variants = parse_variant_settings(entry)
        rec = CharacterRecord(
            code=code,
            label=entry.get("label", code),
            kind="letter",
            variant_features=variants,
        )
        for gname in discover_glyphs(order, code, entry.get("name_prefixes")):
            if gname in seen_glyphs:
                continue
            seen_glyphs.add(gname)
            process_glyph(out_dir, gs, gname)
            rec.glyph_names.append(gname)
            artifact_count += 3
        matrix = render_variant_matrix(
            out_dir, code, rec.label, "letter", sample_base, slope_fonts, variants
        )
        if matrix:
            rec.variant_matrix = matrix.relative_to(out_dir).as_posix()
            artifact_count += 1
        if rec.glyph_names:
            characters.append(rec)

    font.close()

    render_specimen_sheet(out_dir, font_path, characters, sample_base)
    if (out_dir / "specimen.png").is_file():
        artifact_count += 1

    return FontRunResult(
        font_path=font_path,
        out_dir=out_dir,
        characters=characters,
        artifact_count=artifact_count,
    )


def write_index(
    out_root: Path,
    manifest_path: Path,
    results: list[FontRunResult],
    block_report: str,
) -> None:
    lines = [
        "# Changed glyph test output",
        "",
        f"Manifest: `{manifest_path.relative_to(REPO).as_posix()}`",
        "",
        block_report.rstrip(),
        "",
        "Each font folder contains:",
        "- `pr-body.md` — pull-request sample block",
        "- `specimen.png` — all influenced characters rendered in that font",
        "- `variant-matrix/` — upright / oblique / italic × OpenType variant grids",
        "- `glyphs/<name>/` — outline.txt, filled.svg, filled.png",
        "- `composite/a+U<code>/<label>/` — composite samples on letter `a`",
        "",
    ]
    for result in results:
        if result.skipped:
            continue
        font_dir = result.out_dir
        lines.append(f"## {font_dir.name}")
        lines.append(f"- [PR sample block]({font_dir.name}/pr-body.md)")
        if (font_dir / "specimen.png").is_file():
            lines.append(f"- [Specimen sheet]({font_dir.name}/specimen.png)")
        lines.append("")
    (out_root / "README.md").write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--font", action="append", dest="fonts", type=Path, default=[])
    parser.add_argument(
        "--no-build",
        action="store_true",
        help="Skip rebuilding Iosevka fonts",
    )
    parser.add_argument(
        "--family",
        default="Iosevka",
        help="Font family directory under dist/ for slope testing (default: Iosevka)",
    )
    parser.add_argument("--quiet", action="store_true", help="Do not print PR blocks to stdout")
    args = parser.parse_args()
    args.manifest = args.manifest.resolve()
    args.out = args.out.resolve()

    manifest = load_manifest(args.manifest)
    blocks = load_unicode_blocks()
    block_groups = collect_unicode_blocks(manifest, blocks)
    block_report = format_unicode_blocks_report(block_groups)

    if not args.no_build:
        plans = parse_iosevka_build_plans(BUILD_PLANS)
        build_all_iosevka(plans)

    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "changed-glyphs.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )
    (args.out / "unicode-blocks.md").write_text(block_report, encoding="utf-8")

    print(block_report)

    sample_base = manifest.get("composite_bases", ["a"])[0]
    missing = [
        f"{family}-{suffix}"
        for _label, family, suffix in TEST_STYLE_ROWS
        if not test_style_font(family, suffix).is_file()
    ]
    if missing:
        print(
            "Missing test fonts: " + ", ".join(missing) + ". "
            "Build IosevkaTestSans/Slab/Aile/Etoile first.",
            file=sys.stderr,
        )
        return 1

    stale = [
        p
        for p in args.out.rglob("*")
        if p.is_file() and "rounded-corner" in p.name
    ]
    for path in stale:
        path.unlink()
        print(f"Removed {path}")

    matrix_root = args.out / "variant-matrix"
    if matrix_root.exists():
        shutil.rmtree(matrix_root)

    sheet = render_combined_variant_sheet(args.out, manifest, sample_base)
    print(f"Wrote {sheet}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
