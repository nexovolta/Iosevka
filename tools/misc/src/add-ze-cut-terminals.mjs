import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

import * as TOML from "@iarna/toml";
import { parse } from "@iosevka/param/variant";

const zePath = fileURLToPath(new URL("../../../packages/font-glyphs/src/letter/cyrillic/ze.ptl", import.meta.url));
const yoghPath = fileURLToPath(new URL("../../../packages/font-glyphs/src/letter/latin-ext/yogh.ptl", import.meta.url));
const upperPPath = fileURLToPath(new URL("../../../packages/font-glyphs/src/letter/latin/upper-p.ptl", import.meta.url));
const upperRPath = fileURLToPath(new URL("../../../packages/font-glyphs/src/letter/latin/upper-r.ptl", import.meta.url));
const arcPath = fileURLToPath(new URL("../../../packages/font-glyphs/src/letter/shared/arc-hook.ptl", import.meta.url));
const tomlPath = fileURLToPath(new URL("../../../params/variants.toml", import.meta.url));
const oldZe = await fs.readFile(zePath, "utf8");
const oldYogh = await fs.readFile(yoghPath, "utf8");
const oldUpperP = await fs.readFile(upperPPath, "utf8");
const oldUpperR = await fs.readFile(upperRPath, "utf8");
const oldArc = await fs.readFile(arcPath, "utf8");
const oldToml = await fs.readFile(tomlPath, "utf8");
if (oldZe.includes("define CUT-VERTICAL")) throw new Error("Ze cuts already exist.");

function replaceOnce(text, from, to) {
	const at = text.indexOf(from);
	if (at < 0 || text.indexOf(from, at + from.length) >= 0)
		throw new Error(`Expected exactly one occurrence of: ${from}`);
	return text.slice(0, at) + to + text.slice(at + from.length);
}
const arc = replaceOnce(oldArc,
	"define [DeltaCutStart xMid xEdge yPeak yTip sw] : list\n\t\tg4 [DeltaCutTipX xMid xEdge sw] yTip\n",
	"define [DeltaCutStart xMid xEdge yPeak yTip sw _widths] : list\n\t\tg4 [DeltaCutTipX xMid xEdge sw] yTip _widths\n");
let ze = replaceOnce(oldZe,
	"glyph-block-import Letter-Arc-Hook : MakeFlatHook MakeCornerHookBase CornerHookDepth",
	"glyph-block-import Letter-Arc-Hook : MakeFlatHook MakeCornerHookBase CornerHookDepth CutArcTerminal DeltaCutStart DeltaCutEnd VerticalCutExtension");
ze = replaceOnce(ze, "\tdefine SLAB-CORNER-HOOK 10\n", "\tdefine SLAB-CORNER-HOOK 10\n\tdefine CUT-VERTICAL    11\n\tdefine CUT-DIAGONAL    12\n");
ze = replaceOnce(ze,
	"glyph-block-export CyrZe ZeConfig SLAB-FLAT-HOOK SLAB-CORNER-HOOK CLOSED-CIRCLE CLOSED-STEM FLAT-CONNECTION",
	"glyph-block-export CyrZe ZeConfig SLAB-FLAT-HOOK SLAB-CORNER-HOOK CUT-VERTICAL CUT-DIAGONAL CLOSED-CIRCLE CLOSED-STEM FLAT-CONNECTION");

for (const [name, next, sink, left, top] of [
	["UpperShapeT sink", "LowerShapeT sink lowerEnd", "sink", true, true],
	["LowerShapeT sink lowerEnd", "UpperShape]", "sink", true, false],
	["UpperShape]", "LowerShape]", "dispiro", false, true],
	["LowerShape]", "TresilloUpperShape]", "dispiro", false, false],
]) {
	const region = ze.indexOf(left ? "define flex-params [CyrZe]" : "define flex-params [CyrRevZe]");
	const start = ze.indexOf(`define [${name}`, region);
	const nextPos = ze.indexOf(`define [${next}`, start + 1);
	const end = nextPos < 0 ? -1 : ze.lastIndexOf("\n", nextPos) + 1;
	if (start < 0 || end < 0) throw new Error(`Cannot locate ${name}`);
	let shape = ze.slice(start, end);
	shape = replaceOnce(shape, `return : ${sink}\n`, `local shape : ${sink}\n`);
	const side = left ? "L" : "R";
	const edge = left ? "left" : "right";
	const dir = left ? "-" : "+";
	const thickness = left ? "rhs" : "lhs";
	const corner = top ? "Start" : "End";
	const style = top ? "slabTop" : "slabBot";
	const hook = top ? "hook" : "hookBot";
	const y = top ? "top" : "bot";
	const vertY = top ? `(top - ${hook})` : `(bot + ${hook})`;
	const peak = top ? "(top - yo)" : "(bot + yo)";
	const tip = top ? `(top - 0.2 * ${hook})` : `(bot + 0.2 * ${hook})`;
	const marker = `[Just SLAB-CORNER-HOOK] : [MakeCornerHookBase left right top bot (sw -- stroke)].hook${corner}${side}\n`;
	const diagonal = top
		? `list [widths.${thickness} stroke] [DeltaCutStart middle ${edge} ${peak} ${tip} stroke]`
		: `DeltaCutEnd middle ${edge} ${peak} ${tip} stroke`;
	const vertical = top
		? `list [g4 (${edge} ${dir} [VerticalCutExtension ${hook} stroke]) ${vertY} [widths.${thickness} stroke]] [HookStart top (sw -- stroke) (o -- yo)]`
		: `list [HookEnd bot (sw -- stroke) (o -- yo)] [g4 (${edge} ${dir} [VerticalCutExtension ${hook} stroke]) ${vertY}]`;
	const indent = shape.slice(shape.lastIndexOf("\n", shape.indexOf(marker)) + 1, shape.indexOf(marker));
	shape = replaceOnce(shape, marker, marker + `${indent}[Just CUT-DIAGONAL] : ${diagonal}\n${indent}[Just CUT-VERTICAL] : ${vertical}\n`);
	const condition = name.startsWith("LowerShapeT") ? `(${style} === CUT-VERTICAL && [not lowerEnd])` : `(${style} === CUT-VERTICAL)`;
	const trailing = shape.match(/\n(\s*)$/);
	if (!trailing) throw new Error(`Cannot find end of ${name}`);
	shape = shape.slice(0, trailing.index) +
		`\n\t\t\treturn : if ${condition} [CutArcTerminal shape ${edge} top bot stroke ${left} ${top}] shape\n\n`;
	ze = ze.slice(0, start) + shape + ze.slice(end);
}
ze = replaceOnce(ze,
	"\t\ttopCornerHook                     {SLAB-CORNER-HOOK  SLAB-NONE       }\n",
	"\t\ttopCornerHook                     {SLAB-CORNER-HOOK  SLAB-NONE       }\n" +
	"\t\ttopVerticalCut                    {CUT-VERTICAL      SLAB-NONE       }\n" +
	"\t\ttopDiagonalCut                    {CUT-DIAGONAL      SLAB-NONE       }\n");
ze = replaceOnce(ze, "\t\tCornerHook SLAB-CORNER-HOOK\n",
	"\t\tCornerHook SLAB-CORNER-HOOK\n\t\tVerticalCut CUT-VERTICAL\n\t\tDiagonalCut CUT-DIAGONAL\n");
const compatibilityStart = ze.indexOf("\tdefine TresilloCutCompatibility");
const compatibilityEnd = ze.indexOf("\tselect-variant 'Tresillo'", compatibilityStart);
if (compatibilityStart < 0 || compatibilityEnd < 0) throw new Error("Cannot locate Tresillo compatibility aliases.");
ze = ze.slice(0, compatibilityStart) + ze.slice(compatibilityEnd);

let yogh = replaceOnce(oldYogh,
	"glyph-block-import Letter-Cyrillic-Ze : CyrZe SLAB-FLAT-HOOK SLAB-CORNER-HOOK",
	"glyph-block-import Letter-Cyrillic-Ze : CyrZe SLAB-FLAT-HOOK SLAB-CORNER-HOOK CUT-VERTICAL CUT-DIAGONAL");
yogh = replaceOnce(yogh,
	"glyph-block-import Letter-Arc-Hook : MakeFlatHook MakeCornerHookBase CornerHookDepth",
	"glyph-block-import Letter-Arc-Hook : MakeFlatHook MakeCornerHookBase CornerHookDepth CutArcTerminal DeltaCutStart VerticalCutExtension");
yogh = replaceOnce(yogh,
	"\t\t\t\t[Just SLAB-CORNER-HOOK] : [MakeCornerHookBase (SB + offset) (RightSB - offset) (top - offset) (bot + offset)].hookStartL\n",
	"\t\t\t\t[Just SLAB-CORNER-HOOK] : [MakeCornerHookBase (SB + offset) (RightSB - offset) (top - offset) (bot + offset)].hookStartL\n" +
	"\t\t\t\t[Just CUT-DIAGONAL] : DeltaCutStart Middle (SB + offset) (top - offset - O) (top - offset - 0.2 * Hook) Stroke [widths.rhs Stroke]\n" +
	"\t\t\t\t[Just CUT-VERTICAL] : list [g4 (SB + offset - [VerticalCutExtension Hook Stroke]) (top - Hook) [widths.rhs Stroke]] [HookStart (top - offset)]\n");
const yStart = yogh.indexOf("\tdefine [UpperHalfT ");
const yEnd = yogh.indexOf("\n\tglyph-block-export LowerHalfT", yStart);
if (yStart < 0 || yEnd < 0) throw new Error("Cannot locate Yogh upper shape.");
let ySection = yogh.slice(yStart, yEnd);
ySection = replaceOnce(ySection, "\t\treturn : sink\n", "\t\tlocal shape : sink\n");
ySection += "\n\t\treturn : if (slab === CUT-VERTICAL && [not _taper]) [CutArcTerminal shape (SB + offset) top bot Stroke true true] shape\n";
yogh = yogh.slice(0, yStart) + ySection + yogh.slice(yEnd);
yogh = replaceOnce(yogh, "\t\ttopCornerHook           {SLAB-CORNER-HOOK}\n",
	"\t\ttopCornerHook           {SLAB-CORNER-HOOK}\n\t\ttopVerticalCut          {CUT-VERTICAL}\n\t\ttopDiagonalCut          {CUT-DIAGONAL}\n");

let upperP = replaceOnce(oldUpperP,
	"glyph-block-import Letter-Arc-Hook : MakeFlatHook MakeCornerHook",
	"glyph-block-import Letter-Arc-Hook : MakeFlatHook MakeCornerHook CutArcTerminal DeltaCutStart VerticalCutExtension");
upperP = replaceOnce(upperP,
	"\t\t\t\t[Just 'topCornerHook'] : [MakeCornerHook left df.rightSB bowlTop bowlBottom (sw -- sw) (hook -- hook)].hookStartL\n",
	"\t\t\t\t[Just 'topCornerHook'] : [MakeCornerHook left df.rightSB bowlTop bowlBottom (sw -- sw) (hook -- hook)].hookStartL\n" +
	"\t\t\t\t[Just 'topDiagonalCut'] : DeltaCutStart [mix left right 0.5] left (bowlTop - O) (bowlTop - 0.2 * hook) sw\n" +
	"\t\t\t\t[Just 'topVerticalCut'] : list [g4 (left - [VerticalCutExtension hook sw]) (bowlTop - hook)] [HookStart bowlTop]\n");
upperP = replaceOnce(upperP,
	"\t\tinclude : tagged 'bowl' : dispiro\n\t\t\twidths.rhs sw\n\t\t\tPRotundaOutlineKnots top df mul bp overshoot sw 0 endX hook hookStyle\n",
	"\t\tlocal bowl : dispiro\n\t\t\twidths.rhs sw\n\t\t\tPRotundaOutlineKnots top df mul bp overshoot sw 0 endX hook hookStyle\n" +
	"\t\tinclude : tagged 'bowl' : if (hookStyle === 'topVerticalCut') [CutArcTerminal bowl [mix 0 df.leftSB mul] top [PBarPosY top sw bp] sw true true] bowl\n");
const upperR = replaceOnce(oldUpperR,
	"{'serifless' 'unilateralSerifed' 'unilateralInwardSerifed' 'topFlatHook' 'topCornerHook'}",
	"{'serifless' 'unilateralSerifed' 'unilateralInwardSerifed' 'topFlatHook' 'topCornerHook' 'topVerticalCut' 'topDiagonalCut'}");

const before = parse(TOML.parse(oldToml));
const styles = [
	["rounded", "Rounded", "serifless"], ["serifed", "Serifed", "unilateralSerifed"],
	["inward-serifed", "InwardSerifed", "unilateralInwardSerifed"],
	["flat-hooked", "FlatHook", "topFlatHook"], ["corner-hooked", "CornerHook", "topCornerHook"],
	["vertical-cut", "VerticalCut", "topVerticalCut"], ["diagonal-cut", "DiagonalCut", "topDiagonalCut"],
];
const cuts = styles.slice(5);
function conditional(values) {
	let value = JSON.stringify(values.at(-1));
	for (let i = values.length - 2; i >= 0; i--)
		value = `{ if = [{ "top-arc" = ${JSON.stringify(styles[i][0])} }], then = ${JSON.stringify(values[i])}, else = ${value} }`;
	return value;
}
function selectorValue(field, top, bottom) {
	if (field.endsWith("/topSerif")) return top[2];
	if (field.endsWith("/descBase"))
		return `top${top[0].endsWith("-cut") ? "Rounded" : top[1]}BottomSerifed`;
	if (field.toLowerCase().includes("dzze")) return `topRoundedBottom${bottom[1]}`;
	return `top${top[1]}Bottom${bottom[1]}`;
}
let toml = oldToml;
for (const [name, capital] of [["cyrl-capital-ze", true], ["cyrl-ze", false]]) {
	const prime = before.primes.get(name);
	const start = toml.indexOf(`[prime.${name}.variants-extra-buildup]`);
	const end = toml.indexOf(capital ? `[prime.${name}.variants.` : `[prime.${name}.variants-buildup]`, start);
	if (start < 0 || end < 0) throw new Error(`Cannot locate ${name} stages.`);
	let section = toml.slice(start, end);
	const prefix = `[prime.${name}.variants-extra-buildup.stages.`;
	const tops = cuts.map(([key], i) => `${prefix}top-arc.${key}]\nrank = ${i + 6}\nkeyAffix = "top-${key}"\ndescriptionAffix = "${key} top"\n\n`).join("");
	section = replaceOnce(section, `${prefix}bottom-arc.rounded]`, `${tops}${prefix}bottom-arc.rounded]`);
	let nextRank = Math.max(...[...prime.variants.values()].map(v => v.rank)) + 1;
	const ranks = new Map();
	for (const [body] of capital ? [["non-descending"]] : [["non-descending"], ["tall"]]) {
		for (const [top] of styles) for (const [bottom] of styles) {
			const key = `${body === "tall" ? "tall-" : ""}top-${top}-bottom-${bottom}`;
			const old = prime.variants.get(key);
			ranks.set(`${body}/${top}/${bottom}`, old ? old.rank : nextRank++);
		}
	}
	const fields = Object.keys(TOML.parse(section).prime[name]["variants-extra-buildup"].stages["bottom-arc"].rounded.selectorAffix);
	for (const [index, bottom] of styles.entries()) {
		const marker = `${prefix}bottom-arc.${bottom[0]}]`;
		const rankMap = body => styles.map(([top]) => `${JSON.stringify(top)} = ${ranks.get(`${body}/${top}/${bottom[0]}`)}`).join(", ");
		const rankExpr = capital
			? `{ "top-arc" = { ${rankMap("non-descending")} } }`
			: `{ body = { "non-descending" = { "top-arc" = { ${rankMap("non-descending")} } }, tall = { "top-arc" = { ${rankMap("tall")} } } } }`;
		if (index < 5) {
			const pos = section.indexOf(marker);
			let next = section.indexOf("\n[prime.", pos + marker.length);
			if (pos < 0) throw new Error(`Cannot locate ${marker}`);
			if (next < 0) next = section.length;
			let stage = section.slice(pos, next);
			for (const field of fields) {
				const nameField = `selectorAffix.${JSON.stringify(field)}`;
				const line = stage.split("\n").find(x => x.startsWith(`${nameField} = `));
				if (!line) throw new Error(`Missing ${nameField} in ${marker}`);
				const old = line.slice(nameField.length + 3);
				const [a, b] = cuts.map(top => selectorValue(field, top, bottom));
				stage = replaceOnce(stage, line, `${nameField} = { if = [{ "top-arc" = "vertical-cut" }], then = ${JSON.stringify(a)}, else = { if = [{ "top-arc" = "diagonal-cut" }], then = ${JSON.stringify(b)}, else = ${old} } }`);
			}
			stage = replaceOnce(stage, `${marker}\n`, `${marker}\nvariantRank = ${rankExpr}\n`);
			section = section.slice(0, pos) + stage + section.slice(next);
		} else {
			section += `${marker}\nrank = ${index + 1}\nnext = "END"\nkeyAffix = "bottom-${bottom[0]}"\ndescriptionAffix = "${bottom[0]} bottom"\nvariantRank = ${rankExpr}\n`;
			for (const field of fields)
				section += `selectorAffix.${JSON.stringify(field)} = ${conditional(styles.map(top => selectorValue(field, top, bottom)))}\n`;
			section += "\n";
		}
	}
	toml = toml.slice(0, start) + section + toml.slice(end);
	assert.equal(nextRank, capital ? 67 : 133);
}
const after = parse(TOML.parse(toml));
for (const [name, oldPrime] of before.primes) {
	const current = after.primes.get(name);
	assert.equal(current.tag, oldPrime.tag, name);
	for (const [key, variant] of oldPrime.variants) {
		const actual = current.variants.get(key);
		assert.ok(actual, `${name}.${key}`);
		assert.equal(actual.tag, variant.tag, `${name}.${key}`);
		assert.equal(actual.rank, variant.rank, `${name}.${key}`);
		assert.equal(actual.description, variant.description, `${name}.${key}`);
		assert.deepEqual(actual.selector, variant.selector, `${name}.${key}`);
	}
}
assert.equal(after.primes.get("cyrl-capital-ze").variants.size, before.primes.get("cyrl-capital-ze").variants.size + 24);
assert.equal(after.primes.get("cyrl-ze").variants.size, before.primes.get("cyrl-ze").variants.size + 48);
await fs.writeFile(zePath, ze);
await fs.writeFile(yoghPath, yogh);
await fs.writeFile(upperPPath, upperP);
await fs.writeFile(upperRPath, upperR);
await fs.writeFile(arcPath, arc);
await fs.writeFile(tomlPath, toml);
console.log("Added independent Cyrillic Ze cuts and Yogh/Et top cuts.");
