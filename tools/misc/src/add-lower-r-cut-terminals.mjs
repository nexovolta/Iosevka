import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import * as TOML from "@iarna/toml";
import { parse } from "@iosevka/param/variant";

const root = new URL("../../../", import.meta.url);
const sourcePath = fileURLToPath(new URL("packages/font-glyphs/src/letter/latin/lower-r.ptl", root));
const tomlPath = fileURLToPath(new URL("params/variants.toml", root));
const oldSource = await readFile(sourcePath, "utf8");
const oldToml = await readFile(tomlPath, "utf8");
if (oldSource.includes("SmallRShape.VerticalCut")) throw new Error("Lower-r cuts already exist.");
function replaceOnce(text, from, to) {
	const at = text.indexOf(from);
	if (at < 0 || text.indexOf(from, at + from.length) !== -1)
		throw new Error(`Expected exactly one occurrence of: ${from}`);
	return text.slice(0, at) + to + text.slice(at + from.length);
}
let source = replaceOnce(oldSource,
	"glyph-block-import Letter-Arc-Hook : CornerHookOutset",
	"glyph-block-import Letter-Arc-Hook : CornerHookOutset CutArcTerminal DeltaCutStart VerticalCutExtension");
const point = "\t\tdefine [HooklessShapeImpl doHookSerif] : function [df md top bottom doTopSerif doBottomSerif cut] : glyph-proc\n";
const shape = `\t\tdefine [Cut diagonal] : function [df md top bottom doTopSerif doBottomSerif cut] : glyph-proc
\t\t\tdefine [object rBarLeftX rBottomLeftSerif rTopLeftSerif rArchMiddleX rSkew rHookRightX rHookDepthY rCorX rArchDepthA] : RDim df md nothing nothing nothing (+1)
\t\t\tlocal shape : dispiro
\t\t\t\twidths.lhs Stroke
\t\t\t\tif diagonal
\t\t\t\t\tDeltaCutStart (rArchMiddleX - rCorX) rHookRightX (top - O) (top - 0.2 * rHookDepthY) Stroke
\t\t\t\t\tlist
\t\t\t\t\t\tg4.up.start (rHookRightX + [VerticalCutExtension rHookDepthY Stroke]) (top - rHookDepthY) [heading Upward]
\t\t\t\t\t\tarcvh 32 DesignParameters.rHookSuperness
\t\t\t\t\t\tg4.left.mid (rArchMiddleX - rCorX) (top - O) [widths.lhs.heading Stroke {.x (-rSkew) .y (-1)}]
\t\t\t\t\t\tarchv 32
\t\t\t\tstraight.down.end (rBarLeftX + [HSwToV : Stroke - ShoulderFine]) [Math.max (bottom + TINY) (top - rArchDepthA)] [widths.lhs.heading ShoulderFine Downward]
\t\t\tinclude : if diagonal shape [CutArcTerminal shape rHookRightX top bottom Stroke false true]
\t\t\tinclude : RLeftBar rBarLeftX bottom top cut
\t\t\tif doBottomSerif : include : rBottomLeftSerif bottom
\t\t\tif doTopSerif : include : rTopLeftSerif top

\t\texport : define [VerticalCut df md top bottom ts bs cut] : [Cut false] df md top bottom ts bs cut
\t\texport : define [DiagonalCut df md top bottom ts bs cut] : [Cut true] df md top bottom ts bs cut

`;
source = replaceOnce(source, point, shape + point);
const earlessPoint = "\t\tdefine [HooklessFlapImpl doHookSerif] : function [df md top bottom doTopSerif doBottomSerif] : glyph-proc\n\t\t\tdefine [object rBarLeftX rBottomLeftSerif rArchMiddleX rHookRightX rCorX rArchTopShiftY rArchDepthA] : RDim df md nothing nothing nothing (+1)\n";
const earlessShape = `\t\texport : define [CutEarless kind diagonal] : function [df md top bottom doTopSerif doBottomSerif cut] : glyph-proc
\t\t\tdefine [object rBarLeftX rArchMiddleX rHookRightX rHookDepthY rBottomLeftSerif rTopLeftSerif rArchDepthA] : RDim df md nothing nothing nothing (+1)
\t\t\tlocal y : StemCutY (bot -- bottom) (top -- top) (cut -- [fallback cut ''])
\t\t\tlocal edge : if (kind === 'rounded') [Math.max rHookRightX : rBarLeftX + [HSwToV : 2.25 * Stroke]] rHookRightX
\t\t\tlocal mid : match kind
\t\t\t\t[Just 'flat'] : Arch.adjust-x.top rArchMiddleX
\t\t\t\t[Just 'corner'] : rArchMiddleX - CorrectionOMidS
\t\t\t\t__ : mix rBarLeftX edge 0.5
\t\t\tlocal shape : dispiro
\t\t\t\twidths.lhs Stroke
\t\t\t\tif diagonal
\t\t\t\t\tDeltaCutStart mid edge (top - O) (top - 0.2 * rHookDepthY) Stroke
\t\t\t\t\tif (kind === 'rounded')
\t\t\t\t\t\tlist [g4 (edge + [VerticalCutExtension rHookDepthY Stroke]) (top - rHookDepthY)] [HookStart top]
\t\t\t\t\t\tlist
\t\t\t\t\t\t\tg4.up.start (edge + [VerticalCutExtension rHookDepthY Stroke]) (top - rHookDepthY) [heading Upward]
\t\t\t\t\t\t\tarcvh nothing DesignParameters.rHookSuperness
\t\t\t\t\t\t\tif (kind === 'flat')
\t\t\t\t\t\t\t\tflat mid top
\t\t\t\t\t\t\t\tg4.left.mid mid (top - O) [heading Leftward]
\t\t\t\tmatch kind
\t\t\t\t\t[Just 'flat'] : curl (rBarLeftX - O) top [heading Leftward]
\t\t\t\t\t[Just 'corner'] : g4 rBarLeftX (top - DToothlessRise)
\t\t\t\t\t__ : list
\t\t\t\t\t\tflat rBarLeftX [Math.max (y.bot + TINY + [HSwToV : Math.abs : TanSlope * Stroke]) (top - rArchDepthA)]
\t\t\t\t\t\tcurl rBarLeftX y.bot [heading Downward]
\t\t\tif (kind === 'flat' && diagonal)
\t\t\t\tinclude : intersection
\t\t\t\t\tHBar.t rBarLeftX (edge + [HSwToV Stroke]) top Stroke
\t\t\t\t\tMaskLeftLine (edge - [HSwToV : 0.3 * Stroke]) (top - Stroke) edge top 1
\t\t\t\tinclude : if diagonal shape [CutArcTerminal shape edge top bottom Stroke false true]
\t\t\tif (kind === 'rounded')
\t\t\t\tinclude : ApplyDiagCut (cut -- [fallback cut '']) (side -- 'l') (x -- rBarLeftX) (bot -- bottom) (top -- top)
\t\t\t\tinclude : RLeftBar rBarLeftX bottom [if (kind === 'corner') (top - DToothlessRise) top] cut
\t\t\tif doBottomSerif : include : rBottomLeftSerif bottom
\t\t\tif (doTopSerif && kind === 'flat') : include : rTopLeftSerif top

`;
source = replaceOnce(source, earlessPoint, earlessShape + earlessPoint);
const cfg = "\t\t\t\tcornerHooked               {SmallRShape.CornerHook      dfN  RMode.CornerHook  RMode.CornerHookSerifed}\n";
source = replaceOnce(source, cfg, cfg +
	"\t\t\t\tverticalCut                {SmallRShape.VerticalCut     dfN  RMode.Standard    RMode.StandardSerifed  }\n" +
	"\t\t\t\tdiagonalCut                {SmallRShape.DiagonalCut     dfN  RMode.Standard    RMode.StandardSerifed  }\n");
for (const [body, kind] of [["FlatTop", "flat"], ["EarlessCorner", "corner"], ["EarlessRounded", "rounded"]]) {
	const entry = `\t\t\t\t''            {SmallRShape.${body}${" ".repeat(17 - body.length)}dfN RMode.Earless    RMode.EarlessSerifed}\n`;
	source = replaceOnce(source, entry, entry +
		`\t\t\t\tverticalCut   {[SmallRShape.CutEarless '${kind}' false] dfN RMode.Earless RMode.EarlessSerifed}\n` +
		`\t\t\t\tdiagonalCut   {[SmallRShape.CutEarless '${kind}' true]  dfN RMode.Earless RMode.EarlessSerifed}\n`);
}
const palatal = '\t\tcreate-glyph "rPalatalHook.\\(suffix)" : glyph-proc\n\t\t\tinclude [refer-glyph "r.\\(suffix)"] AS_BASE ALSO_METRICS\n';
source = replaceOnce(source, palatal, `\t\tcreate-glyph "rPalatalHook.\\(suffix)" : glyph-proc
\t\t\tlocal baseSuffix : suffix.replace 'VerticalCut' ''
\t\t\tset baseSuffix : baseSuffix.replace 'DiagonalCut' ''
\t\t\tif [baseSuffix.startsWith 'verticalCut'] : set baseSuffix : baseSuffix.slice 11
\t\t\tif [baseSuffix.startsWith 'diagonalCut'] : set baseSuffix : baseSuffix.slice 11
\t\t\tset baseSuffix : [baseSuffix.0.toLowerCase] + [baseSuffix.slice 1]
\t\t\tinclude [refer-glyph "r.\\(baseSuffix)"] AS_BASE ALSO_METRICS
`);
for (const family of ["SInsular", "sInsular", "FInsular", "fInsular"]) {
	const prefix = `select-variant '${family}'`;
	const start = source.indexOf(prefix);
	const end = source.indexOf("\n", start);
	if (start < 0 || end < 0) throw new Error(`Cannot find ${family} selector.`);
	const line = source.slice(start, end);
	source = replaceOnce(source, line, line.replace("(follow -- 'r/rTailBase')", "(follow -- 'r/insularBase')"));
}
const originalStart = oldToml.indexOf("[prime.r]");
const originalEnd = oldToml.indexOf("\n[prime.s]", originalStart);
if (originalStart < 0 || originalEnd < 0) throw new Error("Cannot locate r stages.");
const section = oldToml.slice(originalStart, originalEnd).replace(
	/^(selectorAffix\."r\/rTailBase" = .+)$/gm,
	(line) => `${line}\n${line.replace('"r/rTailBase"', '"r/insularBase"')}`,
);
const before = parse(TOML.parse(oldToml));
const prime = before.primes.get("r");
const rankOffset = Math.max(...[...prime.variants.values()].map(v => v.rank));
let stages = section.slice(section.indexOf("[prime.r.variants-buildup.stages.ear.\"*\"]"))
	.replaceAll("prime.r.variants-buildup", "prime.r.variants-extra-buildup");
const bodies = stages.indexOf("[prime.r.variants-extra-buildup.stages.body.standard]");
const cut = stages.indexOf("[prime.r.variants-extra-buildup.stages.cut.\"*\"]");
if (bodies < 0 || cut < 0) throw new Error("Cannot isolate r body stages.");
const cutStages = ["vertical", "diagonal"].map((kind, i) => `[prime.r.variants-extra-buildup.stages.body.${kind}-cut]
rank = ${i + 1}
descriptionAffix = "${kind}-cut terminal"
selectorAffix.r = "${kind}Cut"
selectorAffix."r/sansSerif" = "${kind}Cut"
selectorAffix."r/insularBase" = "${kind}Cut"
selectorAffix."r/rTailBase" = ""
selectorAffix."r/ascBase" = ""
selectorAffix."r/hookTopBase" = ""
selectorAffix."lFlap/r" = ""
selectorAffix.rFlap = ""
selectorAffix.rHalf = ""
selectorAffix.rDouble = ""
selectorAffix.rMidHeightLeftHook = ""
selectorAffix.rDoubleCrossedTail = ""
selectorAffix."dotlessiPigtail/r" = "standard"

`).join("");
stages = stages.slice(0, bodies) + cutStages + stages.slice(cut);
const extra = `
[prime.r.variants-extra-buildup]
entry = "ear"
descriptionLeader = "\`r\`"
rankOffset = ${rankOffset}

${stages}
`;
const toml = oldToml.slice(0, originalStart) + section + "\n" + extra + oldToml.slice(originalEnd);
const after = parse(TOML.parse(toml));
for (const [name, oldPrime] of before.primes) for (const [key, variant] of oldPrime.variants) {
	const actual = after.primes.get(name).variants.get(key);
	assert.ok(actual, `${name}.${key}`);
	assert.equal(actual.tag, variant.tag, `${name}.${key}`);
	assert.equal(actual.rank, variant.rank, `${name}.${key}`);
	assert.equal(actual.description, variant.description, `${name}.${key}`);
	const { "r/insularBase": insular, ...selector } = actual.selector;
	assert.deepEqual(selector, variant.selector, `${name}.${key}`);
	if (name === "r") assert.equal(insular, variant.selector["r/rTailBase"], key);
}
assert.ok(after.primes.get("r").variants.size > prime.variants.size);
await writeFile(sourcePath, source);
await writeFile(tomlPath, toml);
