import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import * as TOML from "@iarna/toml";
import { parse } from "@iosevka/param/variant";

const root = new URL("../../../", import.meta.url);
const paths = Object.fromEntries([
	["il", "packages/font-glyphs/src/letter/latin/lower-il.ptl"],
	["j", "packages/font-glyphs/src/letter/latin/lower-j.ptl"],
	["r", "packages/font-glyphs/src/letter/latin/lower-r.ptl"],
	["toml", "params/variants.toml"],
].map(([key, path]) => [key, fileURLToPath(new URL(path, root))]));
const old = Object.fromEntries(await Promise.all(
	Object.entries(paths).map(async ([key, path]) => [key, await readFile(path, "utf8")]),
));

function replaceOnce(text, from, to) {
	const at = text.indexOf(from);
	if (at < 0 || text.indexOf(from, at + from.length) !== -1)
		throw new Error(`Expected exactly one occurrence of: ${from}`);
	return text.slice(0, at) + to + text.slice(at + from.length);
}

function protectGlyph(text, name, next) {
	const start = `\t\tcreate-glyph "${name}.\\(suffix)" : glyph-proc\n`;
	const end = `\n\t\t${next}`;
	const at = text.indexOf(start);
	const stop = text.indexOf(end, at + start.length);
	if (at < 0 || stop < 0) throw new Error(`Cannot locate ${name}`);
	const body = text.slice(at + start.length, stop);
	const safe = `\t\t\tlocal safeSuffix : [suffix.replace 'topDiagonalCut' 'topTailed'].replace 'BottomDiagonalCut' 'BottomTailed'
\t\t\tif (safeSuffix !== suffix) : begin
\t\t\t\tinclude [refer-glyph "${name}.\\(safeSuffix)"] AS_BASE ALSO_METRICS
\t\t\t: else : begin
${body.split("\n").map(line => line.trim() ? `\t${line}` : "").join("\n")}`;
	return text.slice(0, at) + start + safe + text.slice(stop);
}

let il = replaceOnce(old.il,
	"glyph-block-import Letter-Arc-Hook : MakeMidHeightLeftHookL",
	"glyph-block-import Letter-Arc-Hook : MakeMidHeightLeftHookL DeltaCutEnd");
const flatTailed = "\t\texport : define [FlatTailed df top bot xMiddle _stroke] : glyph-proc\n";
il = replaceOnce(il, flatTailed, `\t\texport : define [DiagonalCut df top bot xMiddle _stroke] : glyph-proc
\t\t\tlocal stroke : fallback _stroke Stroke
\t\t\tlocal fine : [AdviceStroke 3] * (stroke / Stroke)
\t\t\tlocal left : xMiddle - [HSwToV : 0.5 * stroke]
\t\t\tlocal right : mix df.leftSB df.rightSB (1.1 - [TailedDotlessIShift df])
\t\t\tlocal rightTerm : Math.max right (left + [HSwToV stroke] + [Math.max HookX : HSwToV : 1.1 * fine])
\t\t\tlocal hookDepth : Math.max (stroke * 0.9) (Hook * [StrokeWidthBlend 0.85 1] * df.adws)
\t\t\tinclude : dispiro
\t\t\t\twidths.lhs stroke
\t\t\t\tflat left top [heading Downward]
\t\t\t\tcurl left (bot + SmallArchDepthB * 0.8)
\t\t\t\tDeltaCutEnd [mix left rightTerm 0.55] rightTerm (bot + O) (bot + 0.2 * hookDepth) stroke
\t\t\tset-base-anchor 'trailing' [mix left rightTerm 0.5] bot
\t\t\tset-base-anchor 'palatalHookAttach' [mix left rightTerm 0.5] bot
\t\t\tset-base-anchor 'palatalHookMask' [mix left rightTerm 0.5] (bot + O + HalfStroke)

` + flatTailed);
il = replaceOnce(il,
	"\t\t\t[Just 'diagonal']  DiagTailed\n",
	"\t\t\t[Just 'diagonal']  DiagTailed\n\t\t\t[Just 'diagonalCut'] DiagonalCut\n");
il = replaceOnce(il,
	"\t\t'topDiagonalTailed'     {ILSerifs.None               'diagonal'  0     false}\n",
	"\t\t'topDiagonalTailed'     {ILSerifs.None               'diagonal'  0     false}\n\t\t'topDiagonalCut'        {ILSerifs.None               'diagonalCut' 0    false}\n");
il = replaceOnce(il,
	"\t\t'BottomDiagonalTailed' {ILBody.DiagTailed       'diagonal'  0   }\n",
	"\t\t'BottomDiagonalTailed' {ILBody.DiagTailed       'diagonal'  0   }\n\t\t'BottomDiagonalCut'    {ILBody.DiagonalCut      'diagonalCut' 0  }\n");
il = replaceOnce(il,
	"\t\t'topDiagPL'                     {[ILWithCasualTop 'diagonal' ILBody.PhoneticLeft]  ILSerifs.None               ILMarks.Serifless  [XMiddleT mode].PhoneticLeft       1                    0     }\n",
	"\t\t'topDiagPL'                     {[ILWithCasualTop 'diagonal' ILBody.PhoneticLeft]  ILSerifs.None               ILMarks.Serifless  [XMiddleT mode].PhoneticLeft       1                    0     }\n\t\t'topDiagonalCutPL'              {[ILWithCasualTop 'diagonalCut' ILBody.PhoneticLeft] ILSerifs.None              ILMarks.Serifless  [XMiddleT mode].PhoneticLeft       1                    0     }\n");
il = protectGlyph(il, "dotlessiRetroflexHook", "define [AiStem]");
il = protectGlyph(il, "lPalatalHook", "create-glyph \"lHighBar.");

let j = replaceOnce(old.j,
	"\t\t'topDiagonalTailed'     {JSerifs.None         'diagonal'  'none'    false}\n",
	"\t\t'topDiagonalTailed'     {JSerifs.None         'diagonal'  'none'    false}\n\t\t'topDiagonalCut'        {JSerifs.None         'diagonalCut' 'none'  false}\n");
j = replaceOnce(j, "if [key.includes 'verticalcut'] : set bottom 'BottomVerticalCut'",
	"if [key.endsWith 'bottomverticalcut'] : set bottom 'BottomVerticalCut'");
j = replaceOnce(j, "if [key.includes 'diagonalcut'] : set bottom 'BottomDiagonalCut'",
	"if [key.endsWith 'bottomdiagonalcut'] : set bottom 'BottomDiagonalCut'");
const r = replaceOnce(old.r, "\t\tBottomDiagonalTailed false\n",
	"\t\tBottomDiagonalTailed false\n\t\tBottomDiagonalCut    false\n");

function block(text, heading) {
	const start = text.indexOf(`[${heading}]\n`);
	if (start < 0) throw new Error(`Missing ${heading}`);
	const next = text.indexOf("\n[", start + 1);
	if (next < 0) throw new Error(`Missing next heading after ${heading}`);
	return text.slice(start, next).trimEnd();
}

function copyStage(text, family, stage, name, newName = name) {
	return block(text, `prime.${family}.variants-buildup.stages.${stage}.${name}`)
		.replace(`[prime.${family}.variants-buildup.stages.${stage}.${name}]`,
			`[prime.${family}.variants-extra-buildup.stages.${stage}.${newName}]`);
}

function finishBottom(stage, rank, allowedTop = null) {
	stage = stage.replace(/rank = \d+/, `rank = ${rank}`)
		.replace(/next = "finish-(single|paired)"/, 'next = "END"')
		.replace(/^enableIf = .*\n/m, "");
	if (allowedTop) stage = stage.replace('next = "END"\n', `next = "END"\nenableIf = [{ top = "${allowedTop}" }]\n`);
	return stage;
}

const before = parse(TOML.parse(old.toml));
let toml = old.toml;
for (const family of ["i", "l"]) {
	const original = TOML.parse(old.toml).prime[family]["variants-buildup"];
	const rankOffset = Math.max(...[...before.primes.get(family).variants.values()].map(v => v.rank));
	const tops = Object.keys(original.stages.top).map(name => copyStage(old.toml, family, "top", name));
	let topCut = copyStage(old.toml, family, "top", "topTailed", "topDiagonalCut")
		.replace('keyAffix = "top-tailed"', 'keyAffix = "top-diagonal-cut"')
		.replace('descriptionAffix = "tailed top"', 'descriptionAffix = "diagonal-cut top"');
	for (const selector of family === "i"
		? ["dotlessi", "dotlessi/sansSerif", "dotlessi/compLigRight", "cyrl/ghe.SRB"]
		: ["l", "l/sansSerif", "l/compLigRight", "l/reduced/decompress"]) {
		topCut = replaceOnce(topCut, `selectorAffix."${selector}" = "topTailed"`,
			`selectorAffix."${selector}" = "topDiagonalCut"`);
	}
	if (family === "l") topCut = replaceOnce(topCut, '"topTailedPL"', '"topDiagonalCutPL"');
	tops.push(topCut);
	const names = ["bottomSerifless-single", "bottomBaseSerifed-paired", "bottomHooky-paired",
		"bottomHookyLeft-paired", "bottomTailed-paired", "bottomFlatTailed-paired",
		"bottomSemiTailed-paired", "bottomDiagonalTailed-paired"];
	const bottoms = names.map((name, index) =>
		finishBottom(copyStage(old.toml, family, "bottom", name), index + 2, "topDiagonalCut"));
	let bottomCut = copyStage(old.toml, family, "bottom", "bottomTailed-paired", "bottomDiagonalCut");
	bottomCut = finishBottom(bottomCut, 1)
		.replace('keyAffix = "bottom-tailed"', 'keyAffix = "bottom-diagonal-cut"')
		.replace('descriptionAffix = "curly bottom tail"', 'descriptionAffix = "diagonal-cut bottom"')
		.replaceAll('"bottomTailed"', '"bottomDiagonalCut"');
	const extra = `[prime.${family}.variants-extra-buildup]
entry = "top"
descriptionLeader = "\`${family}\`"
rankOffset = ${rankOffset}

${tops.join("\n\n")}

${bottomCut}

${bottoms.join("\n\n")}
`;
	const nextPrime = toml.indexOf("\n[prime.", toml.indexOf(`[prime.${family}]`) + 1);
	if (nextPrime < 0) throw new Error(`Cannot find end of ${family}`);
	toml = toml.slice(0, nextPrime) + `\n${extra}` + toml.slice(nextPrime);
}

let jTop = block(toml, "prime.j.variants-extra-buildup.stages.top.topTailed")
	.replace("stages.top.topTailed]", "stages.top.topDiagonalCut]")
	.replace('keyAffix = "top-tailed"', 'keyAffix = "top-diagonal-cut"')
	.replace('descriptionAffix = "tailed top"', 'descriptionAffix = "diagonal-cut top"');
for (const selector of ["dotlessj", "dotlessj/sansSerif"]) {
	jTop = replaceOnce(jTop, `selectorAffix."${selector}" = "topTailed"`,
		`selectorAffix."${selector}" = "topDiagonalCut"`);
}
const jBottomNames = ["bottomStraight-single", "bottomBentHook-paired", "bottomFlatHook-paired",
	"bottomCornerHook-paired", "bottomDiagonalTailed-paired", "bottomNarrowBentHook-paired"];
const jBottoms = jBottomNames.map((name, index) =>
	finishBottom(copyStage(old.toml, "j", "bottom", name), index + 3, "topDiagonalCut"));
const jFirstBottom = "\n[prime.j.variants-extra-buildup.stages.bottom.vertical-cut]";
toml = replaceOnce(toml, jFirstBottom, `\n${jTop}\n${jFirstBottom}`);
const afterJ = toml.indexOf("\n[prime.k]", toml.indexOf(jFirstBottom));
if (afterJ < 0) throw new Error("Cannot find end of j");
toml = toml.slice(0, afterJ) + `\n${jBottoms.join("\n\n")}\n` + toml.slice(afterJ);

const after = parse(TOML.parse(toml));
for (const [family, oldPrime] of before.primes) {
	for (const [key, variant] of oldPrime.variants) {
		const actual = after.primes.get(family).variants.get(key);
		assert.ok(actual, `${family}.${key}`);
		assert.equal(actual.tag, variant.tag, `${family}.${key}`);
		assert.equal(actual.rank, variant.rank, `${family}.${key}`);
		assert.equal(actual.description, variant.description, `${family}.${key}`);
		assert.deepEqual(actual.selector, variant.selector, `${family}.${key}`);
	}
}
await Promise.all(Object.entries({ il, j, r, toml }).map(([key, text]) => writeFile(paths[key], text)));
