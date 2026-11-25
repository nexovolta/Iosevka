import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import * as TOML from "@iarna/toml";
import { parse } from "@iosevka/param/variant";

const root = new URL("../../../", import.meta.url);
const paths = {
	s: fileURLToPath(new URL("packages/font-glyphs/src/letter/latin/s.ptl", root)),
	sigmoid: fileURLToPath(new URL("packages/font-glyphs/src/letter/latin-ext/sigmoid-s.ptl", root)),
	toml: fileURLToPath(new URL("params/variants.toml", root)),
};
const oldS = await readFile(paths.s, "utf8");
const oldSigmoid = await readFile(paths.sigmoid, "utf8");
const oldToml = await readFile(paths.toml, "utf8");
if (oldS.includes("SLAB-VERTICAL-CUT")) throw new Error("S cuts already exist.");
function replaceOnce(text, from, to) {
	const at = text.indexOf(from);
	if (at < 0 || text.indexOf(from, at + from.length) !== -1)
		throw new Error(`Expected exactly one occurrence of: ${from}`);
	return text.slice(0, at) + to + text.slice(at + from.length);
}
let s = replaceOnce(oldS,
	"glyph-block-import Letter-Arc-Hook : MakeFlatHook MakeCornerHookBase CornerHookDepth CornerHookOffset MakeMidHeightLeftHook",
	"glyph-block-import Letter-Arc-Hook : MakeFlatHook MakeCornerHookBase CornerHookDepth CornerHookOffset MakeMidHeightLeftHook CutArcTerminal DeltaCutStart DeltaCutEnd VerticalCutExtension");
s = replaceOnce(s, "\tdefine SLAB-CORNER-HOOK 5\n", "\tdefine SLAB-CORNER-HOOK 5\n\tdefine SLAB-VERTICAL-CUT 6\n\tdefine SLAB-DIAGONAL-CUT 7\n");
for (const [name, next, leftTop, hook] of [
	["SStrokeImpl", "RevSStrokeImpl", false, "Hook"],
	["RevSStrokeImpl", "SmallSStrokeImpl", true, "Hook"],
	["SmallSStrokeImpl", "RevSmallSStrokeImpl", false, "SHook"],
	["RevSmallSStrokeImpl", "SStrokeAlt", true, "SHook"],
]) {
	const start = s.indexOf(`\tdefine [${name} `);
	const end = s.indexOf(`\n\tdefine [${next}`, start);
	if (start < 0 || end < 0) throw new Error(`Cannot locate ${name}`);
	let region = s.slice(start, end);
	region = replaceOnce(region, "] : begin\n", " _unclipped] : begin\n");
	region = replaceOnce(region, "\t\treturn : dispiro\n", "\t\tlocal shape : dispiro\n");
	for (const [top, left] of [[true, leftTop], [false, !leftTop]]) {
		const edge = left ? "df.leftSB" : "df.rightSB";
		const sign = left ? "-" : "+";
		const side = left ? "L" : "R";
		const corner = top ? "Start" : "End";
		const marker = `[Just SLAB-CORNER-HOOK] : [MakeCornerHookBase df.leftSB df.rightSB top bot (sw -- stroke)].hook${corner}${side}\n`;
		const thickness = top ? (left ? "rhs" : "lhs") : (left ? "rhs" : "lhs");
		const vertical = top
			? `list [g4 (${edge} ${sign} [VerticalCutExtension ${hook} stroke]) (top - ${hook}) [widths.${thickness} stroke]] [HookStart top (sw -- stroke)]`
			: `list [HookEnd bot (sw -- stroke)] [g4 (${edge} ${sign} [VerticalCutExtension ${hook} stroke]) (bot + ${hook})]`;
		const diagonal = top
			? `list [widths.${thickness} stroke] [DeltaCutStart df.middle ${edge} (top - O) (top - 0.2 * ${hook}) stroke]`
			: `DeltaCutEnd df.middle ${edge} (bot + O) (bot + 0.2 * ${hook}) stroke`;
		region = replaceOnce(region, marker, marker +
			`\t\t\t\t[Just SLAB-VERTICAL-CUT] : ${vertical}\n` +
			`\t\t\t\t[Just SLAB-DIAGONAL-CUT] : ${diagonal}\n`);
	}
	region += `\n\t\tlocal clipped shape\n` +
		`\t\tif (st === SLAB-VERTICAL-CUT && [not _unclipped]) : set clipped : CutArcTerminal clipped ${leftTop ? "df.leftSB" : "df.rightSB"} top bot stroke ${leftTop} true\n` +
		`\t\tif (sb === SLAB-VERTICAL-CUT && [not _unclipped]) : set clipped : CutArcTerminal clipped ${leftTop ? "df.rightSB" : "df.leftSB"} top bot stroke ${!leftTop} false\n` +
		"\t\treturn clipped\n";
	s = s.slice(0, start) + region + s.slice(end);
}
s = replaceOnce(s, "\t\tCornerHook SLAB-CORNER-HOOK\n",
	"\t\tCornerHook SLAB-CORNER-HOOK\n\t\tVerticalCut SLAB-VERTICAL-CUT\n\t\tDiagonalCut SLAB-DIAGONAL-CUT\n");
for (const [which, fn, height, ess] of [
	["Upper", "SStrokeImpl", "CAP", "EssUpper"],
	["Lower", "SmallSStrokeImpl", "XH", "EssLower"],
]) {
	const original = `\t\tdefine [${which}SBaseWithAttach df sw] : glyph-proc\n` +
		`\t\t\tinclude : SAutoSlabStart df doTS ${height} sw Hook\n` +
		`\t\t\tlocal stroke : include : ${fn} df ${height} 0 doTS doBS sw ${ess}\n` +
		"\t\t\treturn stroke.lhsKnots.(stroke.lhsKnots.length - 1)";
	const args = which === "Upper" ? "nothing true" : "true";
	const revised = `\t\tdefine [${which}SBaseWithAttach df sw] : glyph-proc\n` +
		"\t\t\tlocal start nothing\n" +
		"\t\t\tlocal probe : new-glyph : glyph-proc\n" +
		`\t\t\t\tlocal stroke : include : ${fn} df ${height} 0 doTS doBS sw ${ess} ${args}\n` +
		"\t\t\t\tset start stroke.lhsKnots.(stroke.lhsKnots.length - 1)\n" +
		`\t\t\tinclude : SAutoSlabStart df doTS ${height} sw Hook\n` +
		`\t\t\tinclude : ${fn} df ${height} 0 doTS doBS sw ${ess}\n` +
		"\t\t\treturn start";
	s = replaceOnce(s, original, revised);
}
s = replaceOnce(s, "\tselect-variant 's/phoneticRight'\n",
	"\tselect-variant 's/phoneticRight'\n\tselect-variant 's/palatalBase' (shapeFrom -- 's')\n" +
	"\tselect-variant 's/palatalPhoneticRight' (shapeFrom -- 's/phoneticRight')\n");
s = replaceOnce(s, "derive-composites 'sPalatalHook' 0x1D8A 's' :", "derive-composites 'sPalatalHook' 0x1D8A 's/palatalBase' :");
s = replaceOnce(s, "derive-composites 'sPalatalHook/phoneticRight' null 's/phoneticRight' :", "derive-composites 'sPalatalHook/phoneticRight' null 's/palatalPhoneticRight' :");

let sigmoid = replaceOnce(oldSigmoid, "glyph-block-import Letter-Arc-Hook : MakeFlatHook MakeCornerHookBase",
	"glyph-block-import Letter-Arc-Hook : MakeFlatHook MakeCornerHookBase CutArcTerminal DeltaCutStart VerticalCutExtension");
sigmoid = replaceOnce(sigmoid, "\tdefine SLAB-CORNER-HOOK 5\n", "\tdefine SLAB-CORNER-HOOK 5\n\tdefine SLAB-VERTICAL-CUT 6\n\tdefine SLAB-DIAGONAL-CUT 7\n");
sigmoid = replaceOnce(sigmoid,
	"\t\treturn : glyph-proc\n\t\t\tinclude : union\n",
	"\t\tlocal upper : dispiro\n" +
	"\t\t\tmatch styTop\n" +
	"\t\t\t\t[Just SLAB-CLASSICAL] : SerifedArcStart.RtlLhs df.rightSB top sw hook\n" +
	"\t\t\t\t[Just SLAB-INWARD] : InwardSlabArcStart.RtlLhs df.rightSB top sw hook\n" +
	"\t\t\t\t[Just SLAB-FLAT-HOOK] : [MakeFlatHook df.leftSB df.rightSB top 0 (sw -- sw)].hookStartR\n" +
	"\t\t\t\t[Just SLAB-CORNER-HOOK] : [MakeCornerHookBase df.leftSB df.rightSB top 0 (sw -- sw)].hookStartR\n" +
	"\t\t\t\t[Just SLAB-VERTICAL-CUT] : list [g4 (df.rightSB + [VerticalCutExtension hook sw]) (top - hook) [widths.lhs sw]] [HookStart top (sw -- sw)]\n" +
	"\t\t\t\t[Just SLAB-DIAGONAL-CUT] : list [widths.lhs sw] [DeltaCutStart df.middle df.rightSB (top - O) (top - 0.2 * hook) sw]\n" +
	"\t\t\t\t__ : list [g4 df.rightSB (top - hook) [widths.lhs sw]] [HookStart top (sw -- sw)]\n" +
	"\t\t\tg4 df.leftSB (top - archDepth)\n\t\t\t~~~ [SNeck df top sw ess]\n\t\t\tg4 r archDepth [widths.rhs sw]\n\t\t\tarcvh\n\t\t\tg4.left.mid xBot O\n\n" +
	"\t\treturn : glyph-proc\n\t\t\tinclude : union\n");
const sigmoidStart = sigmoid.indexOf("\t\t\t\tdispiro\n\t\t\t\t\tmatch styTop", sigmoid.indexOf("\t\treturn : glyph-proc"));
const sigmoidEnd = sigmoid.indexOf("\n\t\t\tinclude : SAutoSlabStart", sigmoidStart);
if (sigmoidStart < 0 || sigmoidEnd < 0) throw new Error("Cannot locate sigmoid S upper stroke.");
sigmoid = sigmoid.slice(0, sigmoidStart) +
	"\t\t\t\tif (styTop === SLAB-VERTICAL-CUT) [CutArcTerminal upper df.rightSB top 0 sw false true] upper" +
	sigmoid.slice(sigmoidEnd);

const before = parse(TOML.parse(oldToml));
const styles = [
	["rounded", "Rounded"], ["serifed", "Serifed"], ["inward-serifed", "InwardSerifed"],
	["flat-hooked", "FlatHook"], ["corner-hooked", "CornerHook"],
	["vertical-cut", "VerticalCut"], ["diagonal-cut", "DiagonalCut"],
];
const isCut = x => x[0].endsWith("-cut");
const sans = x => ["serifed", "inward-serifed"].includes(x[0]) ? "Rounded" : x[1];
function value(field, top, bottom) {
	const actualTop = top[1];
	const protectedTop = isCut(top) ? "Rounded" : actualTop;
	const protectedBottom = isCut(bottom) ? "Rounded" : bottom[1];
	const tailBottom = ["serifed", "inward-serifed"].includes(bottom[0]) ? bottom[1] : "Serifed";
	if (field === "tsLig/lowerHalf")
		return ({ rounded: "serifless", serifed: "bilateralSerifed", "inward-serifed": "bilateralInwardSerifed", "flat-hooked": "flatHook", "corner-hooked": "cornerHook", "vertical-cut": "verticalCut", "diagonal-cut": "diagonalCut" })[bottom[0]];
	if (field.endsWith("/sansSerif")) return `top${sans(top)}Bottom${sans(bottom)}`;
	if (field.endsWith("RTail")) return `top${protectedTop}Bottom${tailBottom}`;
	if (field === "s/palatalBase") return `top${protectedTop}Bottom${protectedBottom}`;
	if (field === "s/palatalPhoneticRight") return `top${protectedTop}BottomRounded`;
	if (field.endsWith("Swash") || field === "s/phoneticRight") return `top${actualTop}BottomRounded`;
	return `top${actualTop}Bottom${bottom[1]}`;
}
function conditional(values) {
	let answer = JSON.stringify(values.at(-1));
	for (let i = values.length - 2; i >= 0; i--)
		answer = `{ if = [{ "top-arc" = ${JSON.stringify(styles[i][0])} }], then = ${JSON.stringify(values[i])}, else = ${answer} }`;
	return answer;
}
let toml = oldToml;
for (const name of ["capital-s", "s"]) {
	const prime = before.primes.get(name);
	const start = toml.indexOf(`[prime.${name}.variants-extra-buildup]`);
	const end = toml.indexOf(`[prime.${name}.variants.serifless]`, start);
	if (start < 0 || end < 0) throw new Error(`Cannot locate ${name} stages.`);
	let section = toml.slice(start, end);
	const prefix = `[prime.${name}.variants-extra-buildup.stages.`;
	section = replaceOnce(section, `${prefix}bottom-arc.rounded]`,
		styles.slice(5).map(([key], i) => `${prefix}top-arc.${key}]\nrank = ${i + 6}\nkeyAffix = "top-${key}"\ndescriptionAffix = "${key} top"\n\n`).join("") + `${prefix}bottom-arc.rounded]`);
	let nextRank = Math.max(...[...prime.variants.values()].map(v => v.rank)) + 1;
	const ranks = new Map();
	for (const [top] of styles) for (const [bottom] of styles) {
		const old = prime.variants.get(`top-${top}-bottom-${bottom}`);
		ranks.set(`${top}/${bottom}`, old ? old.rank : nextRank++);
	}
	const firstStage = TOML.parse(section).prime[name]["variants-extra-buildup"].stages["bottom-arc"].rounded;
	const fields = Object.keys(firstStage.selectorAffix);
	if (name === "s") fields.push("s/palatalBase", "s/palatalPhoneticRight");
	for (const [index, bottom] of styles.entries()) {
		const marker = `${prefix}bottom-arc.${bottom[0]}]`;
		const rankExpr = `{ "top-arc" = { ${styles.map(([top]) => `${JSON.stringify(top)} = ${ranks.get(`${top}/${bottom[0]}`)}`).join(", ")} } }`;
		if (index < 5) {
			const pos = section.indexOf(marker);
			let next = section.indexOf("\n[prime.", pos + marker.length);
			if (pos < 0) throw new Error(`Cannot locate ${marker}`);
			if (next < 0) next = section.length;
			let stage = section.slice(pos, next);
			for (const field of fields) {
				const source = field === "s/palatalBase" ? "s" : field === "s/palatalPhoneticRight" ? "s/phoneticRight" : field;
				const sourceName = `selectorAffix.${JSON.stringify(source)}`;
				const line = stage.split("\n").find(x => x.startsWith(`${sourceName} = `));
				if (!line) throw new Error(`Missing ${sourceName}`);
				const previous = line.slice(sourceName.length + 3);
				const targetName = `selectorAffix.${JSON.stringify(field)}`;
				const newLine = `${targetName} = { if = [{ "top-arc" = "vertical-cut" }], then = ${JSON.stringify(value(field, styles[5], bottom))}, else = { if = [{ "top-arc" = "diagonal-cut" }], then = ${JSON.stringify(value(field, styles[6], bottom))}, else = ${previous} } }`;
				if (source === field) stage = replaceOnce(stage, line, newLine);
				else stage = replaceOnce(stage, line, `${line}\n${newLine}`);
			}
			stage = replaceOnce(stage, `${marker}\n`, `${marker}\nvariantRank = ${rankExpr}\n`);
			section = section.slice(0, pos) + stage + section.slice(next);
		} else {
			section += `${marker}\nrank = ${index + 1}\nnext = "END"\nkeyAffix = "bottom-${bottom[0]}"\ndescriptionAffix = "${bottom[0]} bottom"\nvariantRank = ${rankExpr}\n`;
			for (const field of fields) section += `selectorAffix.${JSON.stringify(field)} = ${conditional(styles.map(top => value(field, top, bottom)))}\n`;
			section += "\n";
		}
	}
	toml = toml.slice(0, start) + section + toml.slice(end);
}
const simpleStart = toml.indexOf("[prime.s.variants.serifless]");
const simpleEnd = toml.indexOf("\n[prime.", toml.indexOf("[prime.s.variants.unilateral-inward-serifed-corner-hooked]", simpleStart) + 1);
if (simpleStart < 0 || simpleEnd < 0) throw new Error("Cannot locate simple s variants.");
let simple = toml.slice(simpleStart, simpleEnd);
simple = simple.replace(/^selector\.s = (.+)$/gm, '$&\nselector."s/palatalBase" = $1');
simple = simple.replace(/^selector\."s\/phoneticRight" = (.+)$/gm, '$&\nselector."s/palatalPhoneticRight" = $1');
toml = toml.slice(0, simpleStart) + simple + toml.slice(simpleEnd);

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
		const expected = { ...variant.selector };
		if (name === "s") {
			expected["s/palatalBase"] = expected.s;
			expected["s/palatalPhoneticRight"] = expected["s/phoneticRight"];
		}
		assert.deepEqual(actual.selector, expected, `${name}.${key}`);
	}
}
for (const name of ["capital-s", "s"])
	assert.equal(after.primes.get(name).variants.size, before.primes.get(name).variants.size + 24);
await writeFile(paths.s, s);
await writeFile(paths.sigmoid, sigmoid);
await writeFile(paths.toml, toml);
