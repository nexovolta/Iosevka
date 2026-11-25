import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";

import * as TOML from "@iarna/toml";
import { parse } from "@iosevka/param/variant";

const sourceUrl = new URL(
	"../../../packages/font-glyphs/src/letter/latin/lower-g.ptl",
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
	"MakeFlatHook MakeCornerHook CornerHookDepth CornerHookEnd",
	"MakeFlatHook MakeCornerHook CornerHookDepth CornerHookEnd CutArcTerminal DeltaCutEnd VerticalCutExtension",
);
source = once(source, "[fSwash false] [sw Stroke]", "[fSwash false] [cut nothing] [sw Stroke]");
source = once(
	source,
	"\t\tlocal MakeHook : if fCorner MakeCornerHook MakeFlatHook\n",
	`\t\tlocal MakeHook : if fCorner MakeCornerHook MakeFlatHook
\t\tlocal endHook : match cut
\t\t\t[Just 'vertical'] : list
\t\t\t\tHookEnd bot (sw -- sw)
\t\t\t\tg4 (SB - [VerticalCutExtension hook sw]) (bot + hook)
\t\t\t[Just 'diagonal'] : DeltaCutEnd [mix SB RightSB 0.5] SB (bot + O) (bot + 0.2 * hook) sw
\t\t\t__ : [MakeHook SB RightSB groundy bot (sw -- sw)].hookEndL
`,
);
for (const condition of ["fDisjoint && fFlat", "fFlat && !fDisjoint"]) {
	const marker = `\t\tif (${condition}) : include : dispiro\n`;
	const start = source.indexOf(marker);
	const end = source.indexOf("\n\t\tif (", start + marker.length);
	assert.ok(start >= 0 && end > start, condition);
	const knots = source
		.slice(start + marker.length, end)
		.replace("\t\t\t[MakeHook SB RightSB groundy bot (sw -- sw)].hookEndL", "\t\t\tbegin endHook")
		.split("\n")
		.map(line => `\t${line}`)
		.join("\n");
	const replacement = `\t\tif (${condition}) : begin\n\t\t\tlocal shape : dispiro\n${knots}\n\t\t\tinclude : if (cut === 'vertical') [CutArcTerminal shape SB groundy bot sw true false] shape`;
	source = source.slice(0, start) + replacement + source.slice(end);
}
source = once(
	source,
	"define [DoubleStoreyGShape fOpen fFlat _fDisjoint ear fCorner]",
	"define [DoubleStoreyGShape fOpen fFlat _fDisjoint ear fCorner cut]",
);
source = once(
	source,
	"(fCorner -- fCorner) (fDisjoint -- fDisjoint)",
	"(fCorner -- fCorner) (fDisjoint -- fDisjoint) (cut -- cut)",
);
source = once(
	source,
	"\t\t\tdoubleStoreyDisjointCornerHook {false true  true  true}\n",
	`\t\t\tdoubleStoreyDisjointCornerHook {false true  true  true}
\t\t\tdoubleStoreyOpenVerticalCut {true true false false 'vertical'}
\t\t\tdoubleStoreyOpenDiagonalCut {true true false false 'diagonal'}
\t\t\tdoubleStoreyDisjointVerticalCut {false true true false 'vertical'}
\t\t\tdoubleStoreyDisjointDiagonalCut {false true true false 'diagonal'}
`,
);
source = once(
	source,
	"{{fOpen fFlat fDisjoint fCorner} ear}",
	"{{fOpen fFlat fDisjoint fCorner cut} ear}",
);
source = once(
	source,
	"DoubleStoreyGShape fOpen fFlat fDisjoint ear fCorner\n",
	"DoubleStoreyGShape fOpen fFlat fDisjoint ear fCorner cut\n",
);
source = once(
	source,
	"\t\texport : define [CrossedHook df y0 _ada _adb]",
	`\t\texport : define [CutHook df y0 _ada _adb cut] : begin
\t\t\tlocal ada : fallback _ada df.smallArchDepthA
\t\t\tlocal shape : dispiro
\t\t\t\twidths.rhs df.mvs
\t\t\t\tflat df.rightSB y0 [heading Downward]
\t\t\t\tcurl df.rightSB (Descender + ada)
\t\t\t\tif (cut === 'vertical')
\t\t\t\t\tlist
\t\t\t\t\t\tHookEnd Descender (sw -- df.mvs)
\t\t\t\t\t\tg4 (df.leftSB - [VerticalCutExtension SHook df.mvs]) (Descender + SHook)
\t\t\t\t\tDeltaCutEnd df.middle df.leftSB (Descender + O) (Descender + 0.2 * SHook) df.mvs
\t\t\treturn : if (cut === 'vertical') [CutArcTerminal shape df.leftSB y0 Descender df.mvs true false] shape
\t\texport : define [VerticalCut df y0 ada adb] : CutHook df y0 ada adb 'vertical'
\t\texport : define [DiagonalCut df y0 ada adb] : CutHook df y0 ada adb 'diagonal'
\t\texport : define [CrossedHook df y0 _ada _adb]`,
);
source = once(
	source,
	"\t\t\tsingleStoreyCornerHook {SingleStorey.CornerHook  0    }\n",
	`\t\t\tsingleStoreyCornerHook {SingleStorey.CornerHook  0    }
\t\t\tsingleStoreyVerticalCut {SingleStorey.VerticalCut 0}
\t\t\tsingleStoreyDiagonalCut {SingleStorey.DiagonalCut 0}
`,
);
const palatalStart = source.indexOf('\t\tcreate-glyph "gPalatalHook.');
const palatalEnd = source.indexOf("\n\t\tif (hookShape === SingleStorey.BentHook)", palatalStart);
assert.ok(palatalStart >= 0 && palatalEnd > palatalStart);
let palatal = source.slice(palatalStart, palatalEnd);
palatal = once(
	palatal,
	"\t\t\tinclude : hookShape subDf (XH - hookStart)",
	"\t\t\tinclude : [if (hookShape === SingleStorey.VerticalCut || hookShape === SingleStorey.DiagonalCut) SingleStorey.BentHook hookShape] subDf (XH - hookStart)",
);
source = source.slice(0, palatalStart) + palatal + source.slice(palatalEnd);

const main = "prime.g.variants-buildup";
const extra = "prime.g.variants-extra-buildup";
const start = params.indexOf(`[${main}.stages.storey.double-storey]`);
const end = params.indexOf(
	"\n[prime.",
	params.indexOf(`[${main}.stages.storey.double-circle-disjoint]`, start) + 1,
);
assert.ok(start >= 0 && end > start);
const sections = params
	.slice(start, end)
	.split(/(?=^\[)/m)
	.filter(Boolean);
const keep = [];
for (const section of sections) {
	const heading = section.match(/^\[([^\]]+)\]/)?.[1];
	assert.ok(heading, section);
	if (
		heading.endsWith(".storey.double-circle") ||
		heading.endsWith(".storey.double-circle-disjoint") ||
		heading.endsWith(".openness.closed")
	)
		continue;
	if (/\.(bottom|hook)\.(bent-hook|corner-hooked)$/.test(heading)) continue;
	if (/\.(bottom|hook)\.flat-hooked$/.test(heading)) {
		for (const [kind, rank, suffix] of [
			["vertical", 1, "verticalCut"],
			["diagonal", 2, "diagonalCut"],
		]) {
			let added = section
				.replaceAll(main, extra)
				.replace(".flat-hooked]", `.${kind}-cut]`)
				.replace("rank = 2", `rank = ${rank}`)
				.replace(/descriptionAffix = "[^"]+"/, `descriptionAffix = "${kind}-cut hook"`)
				.replaceAll('"flatHook"', `"${suffix}"`);
			added = added.replace(
				`selectorAffix."g/hookTopBase" = "${suffix}"`,
				'selectorAffix."g/hookTopBase" = "bentHook"',
			);
			keep.push(added);
		}
	} else keep.push(section.replaceAll(main, extra));
}
const offset = Math.max(...[...before.primes.get("g").variants.values()].map(v => v.rank));
params = `${params.slice(0, end)}\n[${extra}]\nentry = "storey"\ndescriptionLeader = "\`g\`"\nrankOffset = ${offset}\n\n${keep.join("")}${params.slice(end)}`;
const after = parse(TOML.parse(params));
for (const [name, oldPrime] of before.primes)
	for (const [key, variant] of oldPrime.variants) {
		const actual = after.primes.get(name).variants.get(key);
		for (const property of ["tag", "rank", "groupRank", "description", "selector"])
			assert.deepEqual(actual[property], variant[property], `${name}.${key}.${property}`);
	}
await writeFile(sourceUrl, source);
await writeFile(paramsUrl, params);
