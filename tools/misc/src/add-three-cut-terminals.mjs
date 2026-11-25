import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as TOML from "@iarna/toml";
import { parse } from "@iosevka/param/variant";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const ptlPath = path.join(root, "packages", "font-glyphs", "src", "number", "3.ptl");
const tomlPath = path.join(root, "params", "variants.toml");
const oldPtl = await fs.readFile(ptlPath, "utf8");
const oldToml = await fs.readFile(tomlPath, "utf8");
if (
	oldPtl.includes("define HOOK-VERTICAL") ||
	oldToml.includes("[prime.three.variants-buildup.stages.body.vertical-cut]")
)
	throw new Error("Three cut variants already exist; refusing to apply twice.");

function replaceOnce(text, before, after) {
	const at = text.indexOf(before);
	if (at < 0 || text.indexOf(before, at + before.length) >= 0)
		throw new Error(`Expected exactly one occurrence of: ${before}`);
	return text.slice(0, at) + after + text.slice(at + before.length);
}

let ptl = oldPtl;
ptl = replaceOnce(
	ptl,
	"glyph-block-import Letter-Arc-Hook : MakeFlatHook MakeCornerHook Rounded Flat",
	"glyph-block-import Letter-Arc-Hook : MakeFlatHook MakeCornerHook Rounded Flat CutArcTerminal DeltaCutStart DeltaCutEnd VerticalCutExtension",
);
ptl = replaceOnce(
	ptl,
	"\tdefine HOOK-SLAB   4\n",
	"\tdefine HOOK-SLAB   4\n\tdefine HOOK-VERTICAL 5\n\tdefine HOOK-DIAGONAL 6\n",
);
ptl = replaceOnce(
	ptl,
	"\t\tinclude : sink\n\t\t\twidths.rhs sw\n\t\t\tmatch hookStyle",
	"\t\tlocal upper : sink\n\t\t\twidths.rhs sw\n\t\t\tmatch hookStyle",
);
ptl = replaceOnce(
	ptl,
	"\t\t\t\t[Just HOOK-SLAB]   : SerifedArcStart.LtrRhs (SB + offset) (top - offset) sw Hook\n\t\t\t\t__ : list",
	"\t\t\t\t[Just HOOK-SLAB]   : SerifedArcStart.LtrRhs (SB + offset) (top - offset) sw Hook\n" +
		"\t\t\t\t[Just HOOK-DIAGONAL] : DeltaCutStart xMid (SB + offset) (top - offset - O) (top - offset - 0.2 * Hook) sw\n" +
		"\t\t\t\t[Just HOOK-VERTICAL] : list\n\t\t\t\t\tg4 (SB + offset - [VerticalCutExtension Hook sw]) (top - Hook)\n\t\t\t\t\tHookStart (top - offset) (sw -- sw)\n\t\t\t\t__ : list",
);
ptl = replaceOnce(
	ptl,
	"\t\tinclude : sink\n\t\t\twidths.rhs fine",
	"\t\tlocal lower : sink\n\t\t\twidths.rhs fine",
);
ptl = replaceOnce(
	ptl,
	"\t\t\t\t[Just HOOK-SLAB]   : SerifedArcEnd.RtlRhs (SB + offset) offset sw Hook\n\t\t\t\t__ : list",
	"\t\t\t\t[Just HOOK-SLAB]   : SerifedArcEnd.RtlRhs (SB + offset) offset sw Hook\n" +
		"\t\t\t\t[Just HOOK-DIAGONAL] : DeltaCutEnd xMid (SB + offset) (offset + O) (offset + 0.2 * Hook) sw\n" +
		"\t\t\t\t[Just HOOK-VERTICAL] : list\n\t\t\t\t\tHookEnd offset (sw -- sw)\n\t\t\t\t\tg4 (SB + offset - [VerticalCutExtension Hook sw]) (offset + Hook)\n\t\t\t\t__ : list",
);
ptl = replaceOnce(
	ptl,
	"\t\tif (hookStyle === HOOK-INWARD) : include : ArcStartSerif.InwardL",
	"\t\tinclude : if (hookStyle === HOOK-VERTICAL) [CutArcTerminal upper (SB + offset) top 0 sw true true] upper\n" +
		"\t\tinclude : if (bottomHookStyle === HOOK-VERTICAL) [CutArcTerminal lower (SB + offset) top 0 sw true false] lower\n" +
		"\t\tif (hookStyle === HOOK-INWARD) : include : ArcStartSerif.InwardL",
);
ptl = replaceOnce(
	ptl,
	"\t\tserifedHooked {HOOK-SLAB    HOOK-SLAB  }\n",
	"\t\tserifedHooked {HOOK-SLAB    HOOK-SLAB  }\n\t\tverticalCut   {HOOK-VERTICAL HOOK-VERTICAL}\n\t\tdiagonalCut   {HOOK-DIAGONAL HOOK-DIAGONAL}\n",
);
ptl = replaceOnce(
	ptl,
	"\t\tSerifed HOOK-SLAB\n",
	"\t\tSerifed HOOK-SLAB\n\t\tVerticalCut HOOK-VERTICAL\n\t\tDiagonalCut HOOK-DIAGONAL\n",
);

const data = TOML.parse(oldToml);
const original = data.prime.three["variants-buildup"];
const oldStyles = [
	["rounded", "Rounded"],
	["flat-hooked", "FlatHook"],
	["corner-hooked", "CornerHook"],
	["inward-serifed", "InwardSerifed"],
	["serifed-hooked", "Serifed"],
];
const cuts = [
	["vertical-cut", "VerticalCut"],
	["diagonal-cut", "DiagonalCut"],
];
const styles = [...oldStyles, ...cuts];
const ranks = new Map();
let nextRank = 42;
for (const [top] of styles)
	for (const [bottom] of styles) {
		const oldRank = original.stages["rounded-bottom-arc"][bottom]?.variantRank?.body?.[top];
		ranks.set(`${top}/${bottom}`, oldRank ?? nextRank++);
	}
assert.equal(nextRank, 66);

const start = oldToml.indexOf("[prime.three.variants-buildup]");
const end = oldToml.indexOf("[prime.four]", start);
if (start < 0 || end < 0) throw new Error("Cannot locate three selector stages.");
let section = oldToml.slice(start, end);
let bodies = "";
for (const [index, [key]] of cuts.entries()) {
	bodies += `[prime.three.variants-buildup.stages.body.${key}]\nrank = ${index + 8}\nnext = "rounded-bottom-arc"\nkeyAffix = ""\ndescriptionAffix = "${key} top"\nselectorAffix."cyrl/ksi/top" = "rounded"\n\n`;
}
section = replaceOnce(
	section,
	'[prime.three.variants-buildup.stages.rounded-bottom-arc."*"]',
	`${bodies}[prime.three.variants-buildup.stages.rounded-bottom-arc."*"]`,
);

for (const [bottom, suffix] of oldStyles) {
	const marker = `[prime.three.variants-buildup.stages.rounded-bottom-arc.${bottom}]`;
	const at = section.indexOf(marker);
	const next = section.indexOf("\n[prime.three.", at + marker.length);
	if (at < 0 || next < 0) throw new Error(`Cannot locate ${marker}`);
	let stage = section.slice(at, next);
	for (const [field, values] of [
		["keyAffix", cuts.map(([top]) => `top-${top}-bottom-${bottom}`)],
		["selectorAffix.three", cuts.map(([, topSuffix]) => `top${topSuffix}Bottom${suffix}`)],
		[
			'selectorAffix."three/sansSerif"',
			cuts.map(([, topSuffix]) => `top${topSuffix}Bottom${suffix}`),
		],
	]) {
		const line = stage.split("\n").find(x => x.startsWith(`${field} = `));
		if (!line) throw new Error(`Missing ${field} in ${marker}`);
		const oldValue = line.slice(field.length + 3);
		const value = `{ if = [{ body = "vertical-cut" }], then = ${JSON.stringify(values[0])}, else = { if = [{ body = "diagonal-cut" }], then = ${JSON.stringify(values[1])}, else = ${oldValue} } }`;
		stage = replaceOnce(stage, line, `${field} = ${value}`);
	}
	const oldRanks = stage.match(/^variantRank = .+$/m)?.[0];
	if (!oldRanks) throw new Error(`Missing rank map in ${marker}`);
	const map = styles
		.map(([top]) => `${JSON.stringify(top)} = ${ranks.get(`${top}/${bottom}`)}`)
		.join(", ");
	stage = replaceOnce(stage, oldRanks, `variantRank = { body = { ${map} } }`);
	section = section.slice(0, at) + stage + section.slice(next);
}

function conditional(values) {
	let result = JSON.stringify(values[values.length - 1]);
	for (let i = values.length - 2; i >= 0; i--)
		result = `{ if = [{ body = ${JSON.stringify(styles[i][0])} }], then = ${JSON.stringify(values[i])}, else = ${result} }`;
	return result;
}
let newBottoms = "";
for (const [index, [bottom, bottomSuffix]] of cuts.entries()) {
	const keys = styles.map(([top]) => (top === bottom ? bottom : `top-${top}-bottom-${bottom}`));
	const names = styles.map(([top, topSuffix]) =>
		top === bottom
			? bottom === "vertical-cut"
				? "verticalCut"
				: "diagonalCut"
			: `top${topSuffix}Bottom${bottomSuffix}`,
	);
	const rankMap = styles
		.map(([top]) => `${JSON.stringify(top)} = ${ranks.get(`${top}/${bottom}`)}`)
		.join(", ");
	newBottoms += `[prime.three.variants-buildup.stages.rounded-bottom-arc.${bottom}]\nrank = ${index + 6}\nkeyAffix = ${conditional(keys)}\ndescriptionAffix = "${bottom} bottom"\n`;
	newBottoms += `selectorAffix.three = ${conditional(names)}\nselectorAffix."three/sansSerif" = ${conditional(names)}\nvariantRank = { body = { ${rankMap} } }\n\n`;
}
section = replaceOnce(
	section,
	"[prime.three.variants-buildup.stages.body.flat-top-broken]",
	`${newBottoms}[prime.three.variants-buildup.stages.body.flat-top-broken]`,
);
const toml = oldToml.slice(0, start) + section + oldToml.slice(end);
const before = parse(data).primes.get("three");
const after = parse(TOML.parse(toml)).primes.get("three");
assert.equal(after.tag, before.tag);
for (const [key, variant] of before.variants) {
	const actual = after.variants.get(key);
	assert.ok(actual, `Missing existing three variant ${key}`);
	assert.equal(actual.rank, variant.rank, key);
	assert.equal(actual.description, variant.description, key);
	assert.deepEqual(actual.selector, variant.selector, key);
}
assert.equal(after.variants.size, before.variants.size + 24);
await fs.writeFile(ptlPath, ptl);
await fs.writeFile(tomlPath, toml);
console.log("Added rounded three cut variants while preserving existing selectors and ranks.");
