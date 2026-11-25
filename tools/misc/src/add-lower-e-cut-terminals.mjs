import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";

import * as TOML from "@iarna/toml";
import { parse } from "@iosevka/param/variant";

const sourceUrl = new URL(
	"../../../packages/font-glyphs/src/letter/latin/lower-e.ptl",
	import.meta.url,
);
const paramsUrl = new URL("../../../params/variants.toml", import.meta.url);
let source = await readFile(sourceUrl, "utf8");
let params = await readFile(paramsUrl, "utf8");
const before = parse(TOML.parse(params));

function once(text, oldText, newText) {
	const at = text.indexOf(oldText);
	assert.ok(at >= 0 && text.indexOf(oldText, at + oldText.length) < 0, oldText);
	return text.slice(0, at) + newText + text.slice(at + oldText.length);
}

source = once(
	source,
	"glyph-block-import Letter-Arc-Hook : MakeFlatHook MakeCornerHook",
	"glyph-block-import Letter-Arc-Hook : MakeFlatHook MakeCornerHook CutArcTerminal DeltaCutEnd VerticalCutExtension",
);
source = once(
	source,
	"\tdefine SLAB-CORNER-HOOK 5\n",
	"\tdefine SLAB-CORNER-HOOK 5\n\tdefine SLAB-VERTICAL-CUT 6\n\tdefine SLAB-DIAGONAL-CUT 7\n",
);
for (const [direction, edge] of [
	["R", "df.rightSB"],
	["L", "df.leftSB"],
]) {
	const line = `\t\t\t[Just SLAB-CORNER-HOOK] : [MakeCornerHook df.leftSB df.rightSB top 0 (sw -- stroke)].hookEnd${direction}\n`;
	const sign = direction === "R" ? "+" : "-";
	source = once(
		source,
		line,
		`${line}\t\t\t[Just SLAB-DIAGONAL-CUT] : DeltaCutEnd df.middle ${edge} O (0.2 * hook) stroke
\t\t\t[Just SLAB-VERTICAL-CUT] : list
\t\t\t\tHookEnd 0 (sw -- stroke)
\t\t\t\tg4 (${edge} ${sign} [VerticalCutExtension hook stroke]) hook
`,
	);
}

for (const [name, reversed, returnsPath] of [
	["SmallEShape", false, true],
	["RevSmallEShape", true, false],
	["SmallERoundedShape", false, true],
	["RevSmallERoundedShape", true, false],
]) {
	const start = source.indexOf(`\tdefine flex-params [${name}]`);
	const end = source.indexOf("\n\tdefine flex-params [", start + 1);
	assert.ok(start >= 0 && end > start, name);
	let part = source.slice(start, end);
	const marker = returnsPath ? "\t\tlocal path : include : dispiro\n" : "\t\tinclude : dispiro\n";
	const pathStart = part.indexOf(marker);
	const pathEnd = part.indexOf("\n\n", pathStart);
	assert.ok(pathStart >= 0 && pathEnd > pathStart, name);
	const knots = part
		.slice(pathStart + marker.length, pathEnd)
		.split("\n")
		.map(line => `\t${line}`)
		.join("\n");
	const head = returnsPath
		? "\t\tlocal path nothing\n\t\tdefine [outline] : glyph-proc\n\t\t\tset path : include : dispiro\n"
		: "\t\tdefine [outline] : dispiro\n";
	const body = returnsPath
		? knots
		: knots
				.split("\n")
				.map(line => line.slice(1))
				.join("\n");
	const edge = reversed ? "df.leftSB" : "df.rightSB";
	const left = reversed ? "true" : "false";
	const replacement = `${head}${body}\n\t\tinclude : if (tailSlab === SLAB-VERTICAL-CUT) [CutArcTerminal [outline] ${edge} top 0 stroke ${left} false] [outline]`;
	part = part.slice(0, pathStart) + replacement + part.slice(pathEnd);
	source = source.slice(0, start) + part + source.slice(end);
}

for (const config of ["SmallEConfig", "SchwaConfig"]) {
	const start = source.indexOf(`\tdefine ${config} : object`);
	const end = source.indexOf("\n\n", start);
	assert.ok(start >= 0 && end > start);
	const configs = [
		["flatCrossbar", "SmallEShape", "RevSmallEShape", ""],
		["rounded", "SmallERoundedShape", "RevSmallERoundedShape", ""],
		["diagonalCrossbar", "SmallEShape", "RevSmallEShape", " 1"],
		["diagonalCrossbarFalling", "SmallEShape", "RevSmallEShape", " (-1)"],
	];
	let addition = "";
	for (const [prefix, body, reverse, diag] of configs) {
		for (const [suffix, slab] of [
			["VerticalCut", "SLAB-VERTICAL-CUT"],
			["DiagonalCut", "SLAB-DIAGONAL-CUT"],
		]) {
			addition += `\n\t\t${prefix}${suffix} {${body} ${reverse} ${slab}${diag}}`;
		}
	}
	source = source.slice(0, end) + addition + source.slice(end);
}

for (const [prime, leader, selector] of [
	["e", "`e`", "e"],
	["lower-schwa", "Latin Small Schwa (`ə`)", "schwa"],
	["capital-schwa", "Latin Capital Schwa (`Ə`)", "Schwa"],
]) {
	const main = `prime.${prime}.variants-buildup`;
	const extra = `prime.${prime}.variants-extra-buildup`;
	const start = params.indexOf(`[${main}.stages.body."*"]`);
	const terminal = params.indexOf(`[${main}.stages.terminal.hooked]`, start);
	const next = params.indexOf("\n[prime.", terminal + 1);
	assert.ok(start >= 0 && terminal > start && next > terminal);
	const body = params.slice(start, terminal).replaceAll(main, extra);
	const base = Math.max(...[...before.primes.get(prime).variants.values()].map(v => v.rank));
	let stages = `[${extra}]\nentry = "body"\ndescriptionLeader = "${leader}"\nrankOffset = ${base}\n\n${body}`;
	for (const [kind, rank, suffix] of [
		["vertical", 1, "verticalCut"],
		["diagonal", 2, "diagonalCut"],
	]) {
		stages += `[${extra}.stages.terminal.${kind}-cut]\nrank = ${rank}\ndescriptionAffix = "${kind}-cut hook"\nselectorAffix.${selector} = "${suffix}"\n`;
		if (prime === "e")
			stages += `selectorAffix.eCap = "${suffix}"\nselectorAffix.eNotch = ""\n`;
		stages += "\n";
	}
	params = params.slice(0, next) + "\n" + stages + params.slice(next);
}
const after = parse(TOML.parse(params));
for (const [name, oldPrime] of before.primes)
	for (const [key, variant] of oldPrime.variants) {
		const actual = after.primes.get(name).variants.get(key);
		for (const property of ["tag", "rank", "groupRank", "description", "selector"])
			assert.deepEqual(actual[property], variant[property], `${name}.${key}.${property}`);
	}
await writeFile(sourceUrl, source);
await writeFile(paramsUrl, params);
