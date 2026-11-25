import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as TOML from "@iarna/toml";
import { parse } from "@iosevka/param/variant";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const ptlPath = path.join(
	root,
	"packages",
	"font-glyphs",
	"src",
	"symbol",
	"punctuation",
	"section.ptl",
);
const tomlPath = path.join(root, "params", "variants.toml");
const oldPtl = await fs.readFile(ptlPath, "utf8");
const oldToml = await fs.readFile(tomlPath, "utf8");
if (
	oldPtl.includes("define CUT-VERTICAL") ||
	oldToml.includes("[prime.section.variants-buildup.stages.top-arc.vertical-cut]")
)
	throw new Error("Section cut variants already exist; refusing to apply twice.");

function replaceOnce(text, before, after) {
	const at = text.indexOf(before);
	if (at < 0 || text.indexOf(before, at + before.length) >= 0)
		throw new Error(`Expected exactly one occurrence of: ${before}`);
	return text.slice(0, at) + after + text.slice(at + before.length);
}

let ptl = oldPtl;
ptl = replaceOnce(
	ptl,
	"glyph-block-import Letter-Arc-Hook : MakeFlatHook MakeCornerHookBase",
	"glyph-block-import Letter-Arc-Hook : MakeFlatHook MakeCornerHookBase CutArcTerminal DeltaCutStart VerticalCutExtension",
);
ptl = replaceOnce(
	ptl,
	"\tdefine SLAB-CORNER-HOOK 5\n",
	"\tdefine SLAB-CORNER-HOOK 5\n\tdefine CUT-VERTICAL 6\n\tdefine CUT-DIAGONAL 7\n",
);
ptl = replaceOnce(
	ptl,
	"\t\t[Just SLAB-CORNER-HOOK] : [MakeCornerHookBase SB RightSB top bot (sw -- Stroke)].hookStartR\n\t\t__ : list",
	"\t\t[Just SLAB-CORNER-HOOK] : [MakeCornerHookBase SB RightSB top bot (sw -- Stroke)].hookStartR\n" +
		"\t\t[Just CUT-DIAGONAL] : DeltaCutStart Middle (RightSB - offset) (top - offset - O) (top - offset - 0.2 * Hook) Stroke\n" +
		"\t\t[Just CUT-VERTICAL] : list\n\t\t\tg4 (RightSB - offset + [VerticalCutExtension Hook Stroke]) (top - Hook)\n\t\t\tHookStart (top - offset)\n\t\t__ : list",
);
ptl = replaceOnce(
	ptl,
	"\tdefine [s sink offset st] : begin\n\t\treturn : sink",
	"\tdefine [s sink offset st] : begin\n\t\tlocal shape : sink",
);
ptl = replaceOnce(
	ptl,
	"\t\t\t\tcorner RightSB (top - Hook - TINY)\n\tdefine [halfShape st opposite]",
	"\t\t\t\tcorner RightSB (top - Hook - TINY)\n" +
		"\t\treturn : if (st == CUT-VERTICAL) [CutArcTerminal shape (RightSB - offset) top bot Stroke false true] shape\n" +
		"\tdefine [halfShape st opposite]",
);
ptl = replaceOnce(
	ptl,
	"\t\tinwardSerifed {SLAB-INWARD       SLAB-INWARD     }\n",
	"\t\tinwardSerifed {SLAB-INWARD       SLAB-INWARD     }\n\t\tverticalCut   {CUT-VERTICAL      CUT-VERTICAL    }\n\t\tdiagonalCut   {CUT-DIAGONAL      CUT-DIAGONAL    }\n",
);
ptl = replaceOnce(
	ptl,
	"\t\tCornerHook SLAB-CORNER-HOOK\n",
	"\t\tCornerHook SLAB-CORNER-HOOK\n\t\tVerticalCut CUT-VERTICAL\n\t\tDiagonalCut CUT-DIAGONAL\n",
);
ptl = replaceOnce(
	ptl,
	"\talias 'section/topHook.cornerHook' null 'section.topCornerHookBottomRounded'\n",
	"\talias 'section/topHook.cornerHook' null 'section.topCornerHookBottomRounded'\n" +
		"\talias 'section/topHook.verticalCut' null 'section.topVerticalCutBottomRounded'\n" +
		"\talias 'section/topHook.diagonalCut' null 'section.topDiagonalCutBottomRounded'\n",
);
ptl = replaceOnce(
	ptl,
	"\talias 'section/bottomHook.cornerHook' null 'section.topRoundedBottomCornerHook'\n",
	"\talias 'section/bottomHook.cornerHook' null 'section.topRoundedBottomCornerHook'\n" +
		"\talias 'section/bottomHook.verticalCut' null 'section.topRoundedBottomVerticalCut'\n" +
		"\talias 'section/bottomHook.diagonalCut' null 'section.topRoundedBottomDiagonalCut'\n",
);

const parsed = TOML.parse(oldToml);
const original = parsed.prime.section["variants-buildup"];
const originalBottoms = original.stages["bottom-arc"];
const oldStyles = [
	["rounded", "Rounded", "serifless"],
	["serifed", "Serifed", "serifed"],
	["inward-serifed", "InwardSerifed", "inwardSerifed"],
	["flat-hooked", "FlatHook", "flatHook"],
	["corner-hooked", "CornerHook", "cornerHook"],
];
const cuts = [
	["vertical-cut", "VerticalCut", "verticalCut"],
	["diagonal-cut", "DiagonalCut", "diagonalCut"],
];
const styles = [...oldStyles, ...cuts];
const rankMap = new Map();
let nextRank = 26;
for (const [top] of styles)
	for (const [bottom] of styles) {
		const oldRank = originalBottoms[bottom]?.variantRank?.["top-arc"]?.[top];
		rankMap.set(`${top}/${bottom}`, oldRank ?? nextRank++);
	}
assert.equal(nextRank, 50);

const startMarker = "[prime.section.variants-buildup]";
const endMarker = "[prime.ascii-grave]";
const start = oldToml.indexOf(startMarker);
const end = oldToml.indexOf(endMarker, start);
if (start < 0 || end < 0) throw new Error("Cannot locate section selector stages.");
let section = oldToml.slice(start, end);

let newTopStages = "";
for (const [index, [key, , suffix]] of cuts.entries()) {
	newTopStages += `[prime.section.variants-buildup.stages.top-arc.${key}]\nrank = ${index + 6}\nkeyAffix = ""\ndescriptionAffix = "${key} top"\nselectorAffix."section/topHook" = "${suffix}"\n\n`;
}
section = replaceOnce(
	section,
	"[prime.section.variants-buildup.stages.bottom-arc.rounded]",
	`${newTopStages}[prime.section.variants-buildup.stages.bottom-arc.rounded]`,
);

for (const [bottom, suffix] of oldStyles) {
	const marker = `[prime.section.variants-buildup.stages.bottom-arc.${bottom}]`;
	const at = section.indexOf(marker);
	const next = section.indexOf("\n[prime.section.", at + marker.length);
	const endOfStage = next < 0 ? section.length : next;
	let stage = section.slice(at, endOfStage);
	for (const [field, values] of [
		["keyAffix", cuts.map(([top]) => `top-${top}-bottom-${bottom}`)],
		["selectorAffix.section", cuts.map(([, topSuffix]) => `top${topSuffix}Bottom${suffix}`)],
	]) {
		const match = stage.match(new RegExp(`^${field.replaceAll(".", "\\.")} = (.+)$`, "m"));
		if (!match) throw new Error(`Missing ${field} in ${marker}`);
		const wrapped = `{ if = [{ "top-arc" = "vertical-cut" }], then = ${JSON.stringify(values[0])}, else = { if = [{ "top-arc" = "diagonal-cut" }], then = ${JSON.stringify(values[1])}, else = ${match[1]} } }`;
		stage = replaceOnce(stage, match[0], `${field} = ${wrapped}`);
	}
	const rankLine = stage.match(/^variantRank = .+$/m)?.[0];
	if (!rankLine) throw new Error(`Missing rank map in ${marker}`);
	const ranks = styles
		.map(([top]) => `${JSON.stringify(top)} = ${rankMap.get(`${top}/${bottom}`)}`)
		.join(", ");
	stage = replaceOnce(stage, rankLine, `variantRank = { "top-arc" = { ${ranks} } }`);
	section = section.slice(0, at) + stage + section.slice(endOfStage);
}

function conditional(values) {
	let result = JSON.stringify(values[values.length - 1]);
	for (let i = values.length - 2; i >= 0; i--)
		result = `{ if = [{ "top-arc" = ${JSON.stringify(styles[i][0])} }], then = ${JSON.stringify(values[i])}, else = ${result} }`;
	return result;
}
for (const [index, [bottom, bottomSuffix, bottomSelector]] of cuts.entries()) {
	const keys = styles.map(([top]) => (top === bottom ? bottom : `top-${top}-bottom-${bottom}`));
	const values = styles.map(([top, topSuffix]) =>
		top === bottom ? bottomSelector : `top${topSuffix}Bottom${bottomSuffix}`,
	);
	const ranks = styles
		.map(([top]) => `${JSON.stringify(top)} = ${rankMap.get(`${top}/${bottom}`)}`)
		.join(", ");
	section += `[prime.section.variants-buildup.stages.bottom-arc.${bottom}]\nrank = ${index + 6}\nnext = "END"\n`;
	section += `keyAffix = ${conditional(keys)}\ndescriptionAffix = "${bottom} bottom"\n`;
	section += `selectorAffix."section/bottomHook" = "${bottomSelector}"\nselectorAffix.section = ${conditional(values)}\n`;
	section += `variantRank = { "top-arc" = { ${ranks} } }\n\n`;
}
const toml = oldToml.slice(0, start) + section + oldToml.slice(end);
const before = parse(parsed).primes.get("section");
const after = parse(TOML.parse(toml)).primes.get("section");
assert.equal(after.tag, before.tag);
for (const [key, variant] of before.variants) {
	const actual = after.variants.get(key);
	assert.ok(actual, `Missing existing section variant ${key}`);
	assert.equal(actual.rank, variant.rank, key);
	assert.equal(actual.description, variant.description, key);
	assert.deepEqual(actual.selector, variant.selector, key);
}
assert.equal(after.variants.size, before.variants.size + 24);
await fs.writeFile(ptlPath, ptl);
await fs.writeFile(tomlPath, toml);
console.log("Added section-sign cut variants while preserving existing selectors and ranks.");
