import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import * as TOML from "@iarna/toml";
import { parse } from "@iosevka/param/variant";

const sourceUrl = new URL("../../../packages/font-glyphs/src/letter/latin/lower-f.ptl", import.meta.url);
const tomlUrl = new URL("../../../params/variants.toml", import.meta.url);
let source = await readFile(sourceUrl, "utf8");
let toml = await readFile(tomlUrl, "utf8");
const before = parse(TOML.parse(toml));
function once(text, old, replacement) {
	const at = text.indexOf(old);
	assert.ok(at >= 0 && text.indexOf(old, at + old.length) < 0, `Expected one occurrence: ${old}`);
	return text.slice(0, at) + replacement + text.slice(at + old.length);
}
source = once(source, "CutArcTerminal DeltaCutStart VerticalCutExtension", "CutArcTerminal DeltaCutStart DeltaCutEnd VerticalCutExtension");
source = once(source, "\tdefine CH-DIAGONAL-HOOK 4\n", "\tdefine CH-DIAGONAL-HOOK 4\n\tdefine CH-VERTICAL-CUT  5\n\tdefine CH-DIAGONAL-CUT  6\n");
source = once(source, "\tglyph-block-export SmallFDiagonalTail\n", `\tdefine [SmallFDownCut df barRight xTip diagonal] : glyph-proc
\t\tlocal shape : dispiro
\t\t\twidths.rhs Stroke
\t\t\tflat barRight TINY [heading Downward]
\t\t\tcurl barRight (Descender + ArchDepthA)
\t\t\tif diagonal
\t\t\t\tDeltaCutEnd [mix xTip barRight 0.5] xTip (Descender + O) (Descender + 0.2 * Hook) Stroke
\t\t\t\tlist [HookEnd Descender] [g4 (xTip - [VerticalCutExtension Hook Stroke]) (Descender + Hook)]
\t\tinclude : if diagonal shape [intersection shape [MaskRight xTip]]

\tglyph-block-export SmallFDiagonalTail
`);
const center = "(counterHook === CH-HOOK) || (counterHook === CH-DIAGONAL-HOOK)";
assert.equal(source.split(center).length - 1, 3);
source = source.replaceAll(center, `${center} || (counterHook === CH-VERTICAL-CUT) || (counterHook === CH-DIAGONAL-CUT)`);
const centerTrill = "(ch === CH-HOOK) || (ch === CH-DIAGONAL-HOOK)";
assert.equal(source.split(centerTrill).length - 1, 2);
source = source.replaceAll(centerTrill, `${centerTrill} || (ch === CH-VERTICAL-CUT) || (ch === CH-DIAGONAL-CUT)`);
const downHook = "\t\t\t[Just CH-HOOK]          : SmallFDownHook df barRight [Math.max df.leftSB : barRight - hookSpanK * (crossRight - hookRefLeft)]\n";
assert.equal(source.split(downHook).length - 1, 3);
source = source.replaceAll(downHook, downHook +
	"\t\t\t[Just CH-VERTICAL-CUT]  : SmallFDownCut df barRight [Math.max df.leftSB : barRight - hookSpanK * (crossRight - hookRefLeft)] false\n" +
	"\t\t\t[Just CH-DIAGONAL-CUT]  : SmallFDownCut df barRight [Math.max df.leftSB : barRight - hookSpanK * (crossRight - hookRefLeft)] true\n");
source = once(source, "\t\t\t\tdiagonalTailed {[if narrow pNarrowFSide 1.00]  CH-DIAGONAL-HOOK  'bp'}\n", "\t\t\t\tdiagonalTailed {[if narrow pNarrowFSide 1.00]  CH-DIAGONAL-HOOK  'bp'}\n\t\t\t\tbottomVerticalCut {[if narrow pNarrowFSide 1.00] CH-VERTICAL-CUT 'bp'}\n\t\t\t\tbottomDiagonalCut {[if narrow pNarrowFSide 1.00] CH-DIAGONAL-CUT 'bp'}\n");
source = once(source, "\t\t\tlocal baseSuffix suffix\n\t\t\tif ([suffix.startsWith 'verticalCut'] || [suffix.startsWith 'diagonalCut']) : begin\n\t\t\t\tlocal s : suffix.slice 11\n", "\t\t\tlocal baseSuffix : [suffix.replace 'BottomVerticalCut' 'Tailed'].replace 'BottomDiagonalCut' 'Tailed'\n\t\t\tset baseSuffix : [baseSuffix.replace 'bottomVerticalCut' 'tailed'].replace 'bottomDiagonalCut' 'tailed'\n\t\t\tif ([baseSuffix.startsWith 'verticalCut'] || [baseSuffix.startsWith 'diagonalCut']) : begin\n\t\t\t\tlocal s : baseSuffix.slice 11\n");
source = once(source, "\t\t\tdiagonalTailed {[if body pNarrowFSide 1.00]  CH-DIAGONAL-HOOK}\n", "\t\t\tdiagonalTailed {[if body pNarrowFSide 1.00]  CH-DIAGONAL-HOOK}\n\t\t\tbottomVerticalCut {[if body pNarrowFSide 1.00] CH-VERTICAL-CUT}\n\t\t\tbottomDiagonalCut {[if body pNarrowFSide 1.00] CH-DIAGONAL-CUT}\n");

const prefix = "prime.f.variants-extra-buildup";
toml = once(toml, `[${prefix}]\nentry = "hook"`, `[${prefix}]\nentry = "set"`);
const marker = `[${prefix}.stages.hook."*"]`;
toml = once(toml, marker, `[${prefix}.stages.set.existing]
rank = 1
keyAffix = ""
next = "hook"

[${prefix}.stages.set.bottom-cuts]
rank = 2
keyAffix = ""
next = "bottomHook"

${marker}`);
toml = once(toml, `[${prefix}.stages.hook.diagonal-cut]\nrank = 2`, `[${prefix}.stages.hook.diagonal-cut]\nrank = 2\ngroupRank = 1`);
const main = "prime.f.variants-buildup";
const mainStart = toml.indexOf(`[${main}.stages.hook.full]`);
const mainEnd = toml.indexOf(`[${main}.stages.tail."*"]`, mainStart);
assert.ok(mainStart >= 0 && mainEnd > mainStart);
let hooks = toml.slice(mainStart, mainEnd).replaceAll(`${main}.stages.hook.`, `${prefix}.stages.bottomHook.`);
const extraStart = toml.indexOf(`[${prefix}.stages.hook.vertical-cut]`);
const extraEnd = toml.indexOf(`[${prefix}.stages.tail."*"]`, extraStart);
assert.ok(extraStart >= 0 && extraEnd > extraStart);
const cuts = toml.slice(extraStart, extraEnd).replace("groupRank = 1\n", "")
	.replaceAll(`${prefix}.stages.hook.`, `${prefix}.stages.bottomHook.`)
	.replace("rank = 1\n", "rank = 5\n").replace("rank = 2\n", "rank = 6\n");
const selectors = ["f", '"f/sansSerif"', "fengTrill", '"f/phoneticLeft"', '"f/compLigLeft1"', '"f/compLigLeft2"', '"f/compLigLeft3"', '"f/compLigLeft4"', "fLenis", "fHookBottom"];
const tails = ["vertical", "diagonal"].map((kind, i) => {
	const suffix = `bottom${kind[0].toUpperCase()}${kind.slice(1)}Cut`;
	return `[${prefix}.stages.bottomTail.${kind}-cut]
rank = ${i + 1}
keyAffix = "bottom-${kind}-cut"
descriptionAffix = "${kind}-cut descending bottom hook"
${selectors.map(name => `selectorAffix.${name} = "${name === "fLenis" ? "serifless" : suffix}"`).join("\n")}

`;
}).join("");
const additions = `[${prefix}.stages.bottomHook."*"]
next = "bottomTail"

${hooks}${cuts}[${prefix}.stages.bottomTail."*"]
next = "symmetry"

${tails}`;
toml = once(toml, `[${prefix}.stages.symmetry."*"]`, `${additions}[${prefix}.stages.symmetry."*"]`);
const after = parse(TOML.parse(toml));
for (const [name, oldPrime] of before.primes) for (const [key, variant] of oldPrime.variants) {
	const actual = after.primes.get(name).variants.get(key);
	assert.ok(actual, `${name}.${key}`);
	for (const property of ["tag", "rank", "groupRank", "description"]) assert.deepEqual(actual[property], variant[property], `${name}.${key}.${property}`);
	assert.deepEqual(actual.selector, variant.selector, `${name}.${key}.selector`);
}
assert.equal(after.primes.get("f").variants.size, before.primes.get("f").variants.size + 72);
await writeFile(sourceUrl, source);
await writeFile(tomlUrl, toml);
