# Changed glyph test output

Manifest: `changed-glyphs.json`

## Unicode blocks with changed glyphs

- **Greek and Coptic**: U+03B6, U+03BE, U+03C2

Each font folder contains:
- `pr-body.md` — pull-request sample block
- `specimen.png` — all influenced characters rendered in that font
- `variant-matrix/` — upright / oblique / italic × OpenType variant grids
- `glyphs/<name>/` — outline.txt, filled.svg, filled.png
- `composite/a+U<code>/<label>/` — composite samples on letter `a`

## IosevkaTestEtoile-Regular
- [PR sample block](IosevkaTestEtoile-Regular/pr-body.md)
- [Specimen sheet](IosevkaTestEtoile-Regular/specimen.png)

## IosevkaTestEtoile-Italic
- [PR sample block](IosevkaTestEtoile-Italic/pr-body.md)
- [Specimen sheet](IosevkaTestEtoile-Italic/specimen.png)
