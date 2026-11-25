import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import * as TOML from "@iarna/toml";
import { parse } from "@iosevka/param/variant";

const root = new URL("../../../", import.meta.url);
const paths = {
	j: fileURLToPath(new URL("packages/font-glyphs/src/letter/latin/upper-j.ptl", root)),
	t: fileURLToPath(new URL("packages/font-glyphs/src/letter/latin/upper-t.ptl", root)),
	toml: fileURLToPath(new URL("params/variants.toml", root)),
};
const oldJ = await readFile(paths.j, "utf8");
const oldT = await readFile(paths.t, "utf8");
const oldToml = await readFile(paths.toml, "utf8");
if (oldJ.includes("JCutHookBase")) throw new Error("Capital J cuts already exist.");
function replaceOnce(text, from, to) {
	const at = text.indexOf(from);
	if (at < 0 || text.indexOf(from, at + from.length) !== -1)
		throw new Error(`Expected exactly one occurrence of: ${from}`);
	return text.slice(0, at) + to + text.slice(at + from.length);
}
let j = replaceOnce(oldJ,
	"glyph-block-import Letter-Arc-Hook : CornerHookDepth CornerHookStart CornerHookEnd",
	"glyph-block-import Letter-Arc-Hook : CornerHookDepth CornerHookStart CornerHookEnd CutArcTerminal DeltaCutEnd VerticalCutExtension");
const anchor = "\tdefine [JFlatHookBase df dfHook top _sw _hookScale] : glyph-proc\n";
const shapes = `\tdefine [JCutHookBase cut] : function [df dfHook top] : glyph-proc
\t\tset-width df.width
\t\tinclude : df.markSet.[if (top > XH) 'capital' 'e']
\t\tlocal xBarRight : df.rightSB - JBalance2
\t\tset-base-anchor 'above' (xBarRight - [HSwToV : 0.75 * Stroke]) top
\t\tset-base-anchor 'overlay' (xBarRight - [HSwToV : 0.75 * Stroke]) (top * OverlayPos)
\t\tset-base-anchor 'jTopSerifAttach' (xBarRight - [HSwToV HalfStroke]) top
\t\tlocal sw : Math.min Stroke : 0.4 * (xBarRight - df.leftSB)
\t\tlocal hookx : 0.75 * df.leftSB
\t\tlocal shape : dispiro
\t\t\twidths.rhs sw
\t\t\tflat xBarRight top [heading Downward]
\t\t\tcurl xBarRight ArchDepthB
\t\t\tif (cut === 'diagonal')
\t\t\t\tDeltaCutEnd [mix hookx xBarRight 0.5] hookx O (0.2 * Hook) sw
\t\t\t\tlist [HookEnd 0 (sw -- sw)] [g4 (hookx - [VerticalCutExtension Hook sw]) Hook]
\t\tinclude : if (cut === 'vertical') [CutArcTerminal shape hookx top 0 sw true false] shape

\tdefine [JDescendingCutHookBase cut] : function [df dfHook top] : glyph-proc
\t\tset-width df.width
\t\tinclude : df.markSet.[if (top > XH) 'capDesc' 'p']
\t\tlocal center : df.middle + JBalance + [HSwToV HalfStroke]
\t\tset-base-anchor 'above' (center - [HSwToV HalfStroke]) top
\t\tset-base-anchor 'overlay' (center - [HSwToV HalfStroke]) (top / 2)
\t\tset-base-anchor 'jTopSerifAttach' (center - [HSwToV HalfStroke]) top
\t\tlocal hookx : center - (df.width * 0.5) - [HSwToV Stroke] + OXHook
\t\tlocal shape : dispiro
\t\t\twidths.rhs Stroke
\t\t\tflat center top [heading Downward]
\t\t\tcurl center (Descender + ArchDepthA)
\t\t\tif (cut === 'diagonal')
\t\t\t\tDeltaCutEnd [mix hookx center 0.5] hookx (Descender + O) (Descender + 0.2 * JHook) Stroke
\t\t\t\tlist [HookEnd Descender] [g4 (hookx - [VerticalCutExtension JHook Stroke]) (Descender + JHook)]
\t\tinclude : if (cut === 'vertical') [CutArcTerminal shape hookx top Descender Stroke true false] shape

`;
j = replaceOnce(j, anchor, shapes + anchor);
const configs = "\t\t\tcornerHook           {JCornerHookBase            [DivFrame para.advanceScaleF]  [DivFrame para.advanceScaleF]}\n";
j = replaceOnce(j, configs, configs +
	"\t\t\tverticalCut          {[JCutHookBase 'vertical']   [DivFrame 1]                   [DivFrame 1]                 }\n" +
	"\t\t\tdiagonalCut          {[JCutHookBase 'diagonal']   [DivFrame 1]                   [DivFrame 1]                 }\n");
const desc = "\t\t\tdescendingCornerHook {JDescendingCornerHookBase  [DivFrame para.advanceScaleI]  [DivFrame para.advanceScaleI]}\n";
j = replaceOnce(j, desc, desc +
	"\t\t\tdescendingVerticalCut {[JDescendingCutHookBase 'vertical'] [DivFrame 1] [DivFrame 1]}\n" +
	"\t\t\tdescendingDiagonalCut {[JDescendingCutHookBase 'diagonal'] [DivFrame 1] [DivFrame 1]}\n");
j = replaceOnce(j, "\tselect-variant 'J/noDescend' (shapeFrom -- 'J')\n",
	"\tselect-variant 'J/noDescend' (shapeFrom -- 'J')\n\tselect-variant 'J/rTailBase' (shapeFrom -- 'J')\n");
const t = replaceOnce(oldT, "(follows -- {'T/rTailBase' 'J/noDescend'})", "(follows -- {'T/rTailBase' 'J/rTailBase'})");

const before = parse(TOML.parse(oldToml));
const prime = before.primes.get("capital-j");
const rankOffset = Math.max(...[...prime.variants.values()].map(v => v.rank));
const start = oldToml.indexOf('[prime.capital-j.variants-buildup.stages.height."*"]');
const hookStart = oldToml.indexOf('[prime.capital-j.variants-buildup.stages.hook."*"]', start);
const topStart = oldToml.indexOf('[prime.capital-j.variants-buildup.stages.topbar."*"]', hookStart);
const end = oldToml.indexOf("[prime.capital-k]", topStart);
if ([start, hookStart, topStart, end].some(i => i < 0)) throw new Error("Cannot locate capital J stages.");
function addProtected(text) {
	return text.replace(/^(selectorAffix\."J\/noDescend" = .+)$/gm, line => `${line}\n${line.replace('"J/noDescend"', '"J/rTailBase"')}`);
}
const originalStages = addProtected(oldToml.slice(start, end));
const extraName = text => text.replaceAll("prime.capital-j.variants-buildup", "prime.capital-j.variants-extra-buildup");
const height = extraName(addProtected(oldToml.slice(start, hookStart)));
const topbar = extraName(addProtected(oldToml.slice(topStart, end)));
const extra = `
[prime.capital-j.variants-extra-buildup]
entry = "height"
descriptionLeader = "\`J\`"
rankOffset = ${rankOffset}

${height}
[prime.capital-j.variants-extra-buildup.stages.hook."*"]
next = "topbar"

${["vertical", "diagonal"].map((cut, index) => `[prime.capital-j.variants-extra-buildup.stages.hook.${cut}-cut]
rank = ${index + 1}
descriptionAffix = "${cut}-cut terminal"
selectorAffix.J = "${cut}Cut"
selectorAffix."J/sansSerif" = "${cut}Cut"
selectorAffix."J/noDescend" = "${cut}Cut"
selectorAffix."J/rTailBase" = "bentHook"
selectorAffix.JCurlyTail = "bentHook"
`).join("\n")}
${topbar}`;
let toml = oldToml.slice(0, start) + originalStages + extra + oldToml.slice(end);
const after = parse(TOML.parse(toml));
for (const [name, oldPrime] of before.primes) {
	const actualPrime = after.primes.get(name);
	for (const [key, variant] of oldPrime.variants) {
		const actual = actualPrime.variants.get(key);
		assert.ok(actual, `${name}.${key}`);
		assert.equal(actual.tag, variant.tag, `${name}.${key}`);
		assert.equal(actual.rank, variant.rank, `${name}.${key}`);
		assert.equal(actual.description, variant.description, `${name}.${key}`);
		const expected = { ...variant.selector };
		if (name === "capital-j") expected["J/rTailBase"] = expected["J/noDescend"];
		assert.deepEqual(actual.selector, expected, `${name}.${key}`);
	}
}
assert.equal(after.primes.get("capital-j").variants.size, prime.variants.size + 40);
await writeFile(paths.j, j);
await writeFile(paths.t, t);
await writeFile(paths.toml, toml);
