import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import * as TOML from "@iarna/toml";
import { parse } from "@iosevka/param/variant";

const root = new URL("../../../", import.meta.url);
const sourcePath = fileURLToPath(new URL("packages/font-glyphs/src/letter/latin-ext/long-s.ptl", root));
const tomlPath = fileURLToPath(new URL("params/variants.toml", root));
const [oldSource, oldToml] = await Promise.all([readFile(sourcePath, "utf8"), readFile(tomlPath, "utf8")]);
function replaceOnce(text, from, to) {
	const at = text.indexOf(from);
	if (at < 0 || text.indexOf(from, at + from.length) !== -1)
		throw new Error(`Expected exactly one occurrence of: ${from}`);
	return text.slice(0, at) + to + text.slice(at + from.length);
}
let source = replaceOnce(oldSource, "\tselect-variant 'esh' 0x283\n\n", "");
source = replaceOnce(source,
	"\tdefine [EshUpperTerminal df sign x top bot kind] : match kind\n",
	"\tdefine [EshUpperTerminal df sign x top bot kind] : match kind\n\t\t[Just 'compact'] : LongSUpperHalf sign x top bot (HookX + QuarterStroke) Hook Stroke false\n");
source = replaceOnce(source,
	"\tdefine [EshLowerTerminal df sign x top bot kind] : match kind\n",
	"\tdefine [EshLowerTerminal df sign x top bot kind] : match kind\n\t\t[Just 'compact'] : LongSLowerHalf sign x top bot (HookX + QuarterStroke) Hook Stroke false\n");
const isShape = "\tdefine [IsShape top bot _kind] : glyph-proc\n";
source = replaceOnce(source, isShape, `\tdefine EshCutTerminalStyles : object
\t\tCompact 'compact'
\t\tCornerHooked 'cornerHooked'
\t\tSshaped 'sshaped'
\t\tFlatTailed 'flat'
\t\tDiagonalTailed 'diagonal'
\t\tTailed 'tailed'
\t\tDiagonalCut 'diagonalCut'

\tforeach {topSuffix topKind} [pairs-of EshCutTerminalStyles] : do
\t\tforeach {bottomSuffix bottomKind} [pairs-of EshCutTerminalStyles] : do
\t\t\tif (topKind === 'diagonalCut' || bottomKind === 'diagonalCut') : begin
\t\t\t\tlocal suffix "top\\(topSuffix)Bottom\\(bottomSuffix)"
\t\t\t\tcreate-glyph "esh.\\(suffix)" : glyph-proc
\t\t\t\t\tinclude : MarkSet.bp
\t\t\t\t\tlocal join : mix Descender Ascender 0.5
\t\t\t\t\tinclude : union
\t\t\t\t\t\tEshUpperTerminal [DivFrame 1] (+1) Middle Ascender join topKind
\t\t\t\t\t\tEshLowerTerminal [DivFrame 1] (+1) Middle join Descender bottomKind
\t\t\t\t\tinclude : LeaningAnchor.Above.At Middle
\t\t\t\t\tinclude : LeaningAnchor.Below.At Middle
\t\t\t\t\tset-base-anchor 'overlay' Middle [mix Descender Ascender OverlayPos]
\t\t\t\t\tinclude : NarrowEsh

\t\t\t\tcreate-glyph "eshBaseline.\\(suffix)" : glyph-proc
\t\t\t\t\tinclude : MarkSet.b
\t\t\t\t\tlocal join : Ascender / 2
\t\t\t\t\tinclude : union
\t\t\t\t\t\tEshUpperTerminal [DivFrame 1] (+1) Middle Ascender join topKind
\t\t\t\t\t\tEshLowerTerminal [DivFrame 1] (+1) Middle join 0 bottomKind
\t\t\t\t\tinclude : NarrowEsh

\t\t\t\tcreate-glyph "eshHookBase.\\(suffix)" : glyph-proc
\t\t\t\t\tinclude : MarkSet.b
\t\t\t\t\tinclude : LongSShape Ascender 0 (HookX + QuarterStroke) Hook

\tselect-variant 'esh' 0x283

` + isShape);
source = replaceOnce(source, "\t\ttailed 'tailed'\n\tforeach {suffix kind} [pairs-of EshRelatedConfig]",
	"\t\ttailed 'tailed'\n\t\tdiagonalCut 'diagonalCut'\n\tforeach {suffix kind} [pairs-of EshRelatedConfig]");
source = replaceOnce(source,
	"\t\tlocal base : query-glyph srcs.0\n\t\tlocal stem : base.gizmo.unapply base.baseAnchors.overlay\n",
	"\t\tlocal cutSource : [srcs.0.includes 'DiagonalCut'] || (srcs.0 === 'esh' && [[fallback para.variantSelector.esh 'compact'].includes 'DiagonalCut'])\n\t\tlocal safeSource : if cutSource 'esh.compact' srcs.0\n\t\tlocal base : query-glyph safeSource\n\t\tlocal stem : base.gizmo.unapply base.baseAnchors.overlay\n");
source = replaceOnce(source, "\t\t\trefer-glyph srcs.0\n\t\t\tPalatalHook.r\n",
	"\t\t\trefer-glyph safeSource\n\t\t\tPalatalHook.r\n");

const styles = [
	["compact", "Compact", "compact"],
	["corner-hooked", "CornerHooked", "cornerHooked"],
	["sshaped", "Sshaped", "sshaped"],
	["flat-tailed", "FlatTailed", "flatTailed"],
	["diagonal-tailed", "DiagonalTailed", "diagonalTailed"],
	["tailed", "Tailed", "tailed"],
	["diagonal-cut", "DiagonalCut", "diagonalCut"],
];
const tops = styles.map(([key, suffix, related], rank) => `[prime.lower-esh.variants-extra-buildup.stages.top.${key}]
rank = ${rank + 1}
next = "bottom"
keyAffix = "top-${key}"
descriptionAffix = "${key} top"
selectorAffix.esh = "top${suffix}"
selectorAffix.eshCurlyTail = "${related}"
selectorAffix.dotlessiStretchedHookLeftRTail = "${key === "diagonal-cut" ? "compact" : related}"
`);
const bottoms = styles.map(([key, suffix, related], rank) => `[prime.lower-esh.variants-extra-buildup.stages.bottom.${key}]
rank = ${rank + 1}
next = "END"
keyAffix = "bottom-${key}"
descriptionAffix = "${key} bottom"
${key === "diagonal-cut" ? "" : 'enableIf = [{ top = "diagonal-cut" }]\n'}selectorAffix.esh = "bottom${suffix}"
selectorAffix.reveshLoop = "${related}"
selectorAffix.Is = "${related}"
selectorAffix.is = "${related}"
`);
const extra = `[prime.lower-esh.variants-extra-buildup]
entry = "top"
descriptionLeader = "Lower esh"
rankOffset = 6

${tops.join("\n")}
${bottoms.join("\n")}
`;
const where = "\n[prime.long-s]";
let toml = replaceOnce(oldToml, 'description = "Lower esh with curved tails and diagonal terminals"',
	'description = "Lower esh with curved tails"');
toml = replaceOnce(toml, where, `\n${extra}${where}`);
const before = parse(TOML.parse(oldToml));
const after = parse(TOML.parse(toml));
for (const [family, oldPrime] of before.primes) {
	for (const [key, variant] of oldPrime.variants) {
		const actual = after.primes.get(family).variants.get(key);
		assert.ok(actual, `${family}.${key}`);
		assert.equal(actual.tag, variant.tag, `${family}.${key}`);
		assert.equal(actual.rank, variant.rank, `${family}.${key}`);
		assert.equal(actual.description, family === "lower-esh" && key === "tailed"
			? "Lower esh with curved tails" : variant.description, `${family}.${key}`);
		assert.deepEqual(actual.selector, variant.selector, `${family}.${key}`);
	}
}
assert.equal(after.primes.get("lower-esh").variants.size, 19);
await Promise.all([writeFile(sourcePath, source), writeFile(tomlPath, toml)]);
