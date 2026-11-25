import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import * as TOML from "@iarna/toml";
import { parse } from "@iosevka/param/variant";

const root = new URL("../../../", import.meta.url);
const jPath = fileURLToPath(new URL("packages/font-glyphs/src/letter/latin/lower-j.ptl", root));
const tomlPath = fileURLToPath(new URL("params/variants.toml", root));
const oldJ = await readFile(jPath, "utf8");
const oldToml = await readFile(tomlPath, "utf8");
if (oldJ.includes("BottomVerticalCut")) throw new Error("Lower j cuts already exist.");
function replaceOnce(text, from, to) {
	const at = text.indexOf(from);
	if (at < 0 || text.indexOf(from, at + from.length) !== -1)
		throw new Error(`Expected exactly one occurrence of: ${from}`);
	return text.slice(0, at) + to + text.slice(at + from.length);
}
let j = replaceOnce(oldJ,
	"glyph-block-import Letter-Arc-Hook : CornerHookDepth CornerHookStart",
	"glyph-block-import Letter-Arc-Hook : CornerHookDepth CornerHookStart CutArcTerminal DeltaCutEnd VerticalCutExtension");
const straight = "\t\texport : define [Straight df top xMiddle] : glyph-proc\n";
const shape = `\t\tdefine [CutHook df top xMiddle diagonal] : glyph-proc
\t\t\tlocal hookx : Math.min ((xMiddle - df.middle) - [HSwToV HalfStroke] + OXHook) (xMiddle - [HSwToV : 1.5 * Stroke] + OXHook)
\t\t\tlocal xBar : xMiddle + [HSwToV HalfStroke]
\t\t\tset-base-anchor 'below' [mix hookx xMiddle 0.5] Descender
\t\t\tlocal shape : dispiro
\t\t\t\twidths.rhs Stroke
\t\t\t\tflat xBar top [heading Downward]
\t\t\t\tcurl xBar (Descender + ArchDepthA)
\t\t\t\tif diagonal
\t\t\t\t\tDeltaCutEnd [mix hookx xBar 0.5] hookx (Descender + O) (Descender + 0.2 * JHook) Stroke
\t\t\t\t\tlist [HookEnd Descender] [g4 (hookx - [VerticalCutExtension JHook Stroke]) (Descender + JHook)]
\t\t\tinclude : if diagonal shape [CutArcTerminal shape hookx top Descender Stroke true false]

\t\texport : define [VerticalCut df top xMiddle] : CutHook df top xMiddle false
\t\texport : define [DiagonalCut df top xMiddle] : CutHook df top xMiddle true

`;
j = replaceOnce(j, straight, shape + straight);
const corner = "\t\t'BottomCornerHook'     {JBody.CornerHook      XMiddleT.FlatHookSerifless  para.advanceScaleII}\n";
j = replaceOnce(j, corner, corner +
	"\t\t'BottomVerticalCut'    {JBody.VerticalCut     XMiddleT.BentHook           1                  }\n" +
	"\t\t'BottomDiagonalCut'    {JBody.DiagonalCut     XMiddleT.BentHook           1                  }\n");
const classify = "\t\tif [key.includes 'cornerhook'] : set bottom 'BottomCornerHook'\n";
j = replaceOnce(j, classify, classify +
	"\t\tif [key.includes 'verticalcut'] : set bottom 'BottomVerticalCut'\n" +
	"\t\tif [key.includes 'diagonalcut'] : set bottom 'BottomDiagonalCut'\n");

const before = parse(TOML.parse(oldToml));
const prime = before.primes.get("j");
const rankOffset = Math.max(...[...prime.variants.values()].map(v => v.rank));
const topStart = oldToml.indexOf("[prime.j.variants-buildup.stages.top.topSerifless]");
const bottomStart = oldToml.indexOf("[prime.j.variants-buildup.stages.bottom.bottomStraight-single]", topStart);
const nextPrime = oldToml.indexOf("\n[prime.", oldToml.indexOf("[prime.j.variants-buildup.stages.finish-paired.corner-hooked-center-short-serifed]", bottomStart) + 1);
if ([topStart, bottomStart, nextPrime].some(i => i < 0)) throw new Error("Cannot locate lower j stages.");
const topStages = oldToml.slice(topStart, bottomStart).replaceAll("prime.j.variants-buildup", "prime.j.variants-extra-buildup");
const extra = `
[prime.j.variants-extra-buildup]
entry = "top"
descriptionLeader = "\`j\`"
rankOffset = ${rankOffset}

${topStages}
${["vertical", "diagonal"].map((cut, index) => `[prime.j.variants-extra-buildup.stages.bottom.${cut}-cut]
rank = ${index + 1}
next = "END"
keyAffix = "${cut}-cut"
descriptionAffix = "${cut}-cut bottom"
selectorAffix."dotlessj" = "bottom${cut[0].toUpperCase()}${cut.slice(1)}Cut"
selectorAffix."dotlessj/sansSerif" = "bottom${cut[0].toUpperCase()}${cut.slice(1)}Cut"
selectorAffix."dotlessjHookTop" = "bottomBentHook"
`).join("\n")}
`;
const toml = oldToml.slice(0, nextPrime) + "\n" + extra + oldToml.slice(nextPrime);
const after = parse(TOML.parse(toml));
for (const [name, oldPrime] of before.primes) {
	const actualPrime = after.primes.get(name);
	for (const [key, variant] of oldPrime.variants) {
		const actual = actualPrime.variants.get(key);
		assert.ok(actual, `${name}.${key}`);
		assert.equal(actual.tag, variant.tag, `${name}.${key}`);
		assert.equal(actual.rank, variant.rank, `${name}.${key}`);
		assert.equal(actual.description, variant.description, `${name}.${key}`);
		assert.deepEqual(actual.selector, variant.selector, `${name}.${key}`);
	}
}
assert.equal(after.primes.get("j").variants.size, prime.variants.size + 22);
await writeFile(jPath, j);
await writeFile(tomlPath, toml);
