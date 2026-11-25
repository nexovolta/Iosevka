import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import * as TOML from "@iarna/toml";
import { parse } from "@iosevka/param/variant";

const root = new URL("../../../", import.meta.url);
const sourcePath = fileURLToPath(new URL("packages/font-glyphs/src/letter/latin/lower-t.ptl", root));
const tomlPath = fileURLToPath(new URL("params/variants.toml", root));
const oldSource = await readFile(sourcePath, "utf8");
const oldToml = await readFile(tomlPath, "utf8");
if (oldSource.includes("define VerticalCut : namespace")) throw new Error("Lower-t cuts already exist.");
function replaceOnce(text, from, to) {
	const at = text.indexOf(from);
	if (at < 0 || text.indexOf(from, at + from.length) !== -1)
		throw new Error(`Expected exactly one occurrence of: ${from}`);
	return text.slice(0, at) + to + text.slice(at + from.length);
}
let source = oldSource.replaceAll("\r\n", "\n");
const point = "\tdefine NarrowBentHook : namespace\n";
const shape = `\tdefine [CutTBody df sym top bot _sw fFitHook fNoCrossbar diagonal] : glyph-proc
\t\tlocal sw : fallback _sw Stroke
\t\tdefine [object xLeft xHook yHook adb] : BentHook.Dims df sym [if fFitHook sw Stroke]
\t\tif [not fNoCrossbar] : include : BentHook.CrossBar df sym sw
\t\tlocal shape : dispiro
\t\t\twidths.lhs sw
\t\t\tflat xLeft top [heading Downward]
\t\t\tcurl xLeft (bot + adb)
\t\t\tif diagonal
\t\t\t\tDeltaCutEnd [mix xLeft xHook 0.5] xHook (bot + O) (bot + 0.2 * yHook) sw
\t\t\t\tlist [HookEnd bot (sw -- sw)] [g4 (xHook + [VerticalCutExtension yHook sw]) (bot + yHook)]
\t\tinclude : if diagonal shape [CutArcTerminal shape xHook top bot sw false false]
\t\tinclude : LeaningAnchor.Above.VBar.l xLeft
\t\tinclude : LeaningAnchor.Below.Hook xLeft xHook
\t\tset-base-anchor 'hooktopAttach' (xLeft + [HSwToV : 0.5 * sw]) top
\t\tset-base-anchor 'bottomRight' xHook (bot + [if diagonal (0.2 * yHook) yHook])
\t\tset-base-anchor 'overlay' (xLeft + [HSwToV : 0.625 * sw]) [mix 0 XH 0.58]

\tdefine VerticalCut : namespace
\t\texport : define BarLeftPos BentHook.BarLeftPos
\t\texport : define [Body df sym top bot sw fit noCrossbar] : CutTBody df sym top bot sw fit noCrossbar false
\t\texport : define [Retroflex df sym top bot] : FlatHook.Retroflex df sym top bot

\tdefine DiagonalCut : namespace
\t\texport : define BarLeftPos BentHook.BarLeftPos
\t\texport : define [Body df sym top bot sw fit noCrossbar] : CutTBody df sym top bot sw fit noCrossbar true
\t\texport : define [Retroflex df sym top bot] : FlatHook.Retroflex df sym top bot

`;
source = replaceOnce(source, point, shape + point);
const cfg = "\t\t\tcornerHook     {dfF  CornerHook    }\n";
source = replaceOnce(source, cfg, cfg +
	"\t\t\tverticalCut    {dfN  VerticalCut   }\n" +
	"\t\t\tdiagonalCut    {dfN  DiagonalCut   }\n");
const palatal = `\t\tcreate-glyph "tPalatalHook.\\(suffix)" : glyph-proc
\t\t\tset-width df.width
\t\t\tinclude : df.markSet.bp
\t\t\tinclude : Style.Body df sym top 0`;
source = replaceOnce(source, palatal, `\t\tcreate-glyph "tPalatalHook.\\(suffix)" : glyph-proc
\t\t\tset-width df.width
\t\t\tinclude : df.markSet.bp
\t\t\tlocal palatalStyle : if (Style === VerticalCut || Style === DiagonalCut) BentHook Style
\t\t\tinclude : palatalStyle.Body df sym top 0`);

const before = parse(TOML.parse(oldToml));
const prime = before.primes.get("t");
const rankOffset = Math.max(...[...prime.variants.values()].map(v => v.rank));
const stagesStart = oldToml.indexOf("[prime.t.variants-buildup.stages.body.\"*\"]");
const end = oldToml.indexOf("\n[prime.u]", stagesStart);
if (stagesStart < 0 || end < 0) throw new Error("Cannot locate t stages.");
let stages = oldToml.slice(stagesStart, end).replaceAll("prime.t.variants-buildup", "prime.t.variants-extra-buildup");
const bodies = stages.indexOf("[prime.t.variants-extra-buildup.stages.body.bent-hook]");
const symmetry = stages.indexOf("[prime.t.variants-extra-buildup.stages.symmetry.\"*\"]");
if (bodies < 0 || symmetry < 0) throw new Error("Cannot isolate t body stages.");
const cutStages = ["vertical", "diagonal"].map((cut, i) => `[prime.t.variants-extra-buildup.stages.body.${cut}-cut]
rank = ${i + 1}
descriptionAffix = "${cut}-cut terminal"
selectorAffix.t = "${cut}Cut"
selectorAffix."t/phoneticLeft1" = "${cut}Cut"
selectorAffix."t/phoneticLeft2" = "${cut}Cut"
selectorAffix."t/compLigRight" = "${cut}Cut"
selectorAffix.tHookTop = "flatHook"
selectorAffix.tHookTopRTail = "hookless"
selectorAffix.tRTail = "hookless"
selectorAffix.tCurlyTail = "flatHook"
selectorAffix."tsLig/upperHalf" = "bentHook"

`).join("");
stages = stages.slice(0, bodies) + cutStages + stages.slice(symmetry);
const extra = `
[prime.t.variants-extra-buildup]
entry = "body"
descriptionLeader = "\`t\`"
rankOffset = ${rankOffset}

${stages}
`;
const toml = oldToml.slice(0, end) + "\n" + extra + oldToml.slice(end);
const after = parse(TOML.parse(toml));
for (const [name, oldPrime] of before.primes) for (const [key, variant] of oldPrime.variants) {
	const actual = after.primes.get(name).variants.get(key);
	assert.ok(actual, `${name}.${key}`);
	assert.equal(actual.tag, variant.tag, `${name}.${key}`);
	assert.equal(actual.rank, variant.rank, `${name}.${key}`);
	assert.equal(actual.description, variant.description, `${name}.${key}`);
	assert.deepEqual(actual.selector, variant.selector, `${name}.${key}`);
}
assert.equal(after.primes.get("t").variants.size, prime.variants.size + 12);
await writeFile(sourcePath, oldSource.includes("\r\n") ? source.replaceAll("\n", "\r\n") : source);
await writeFile(tomlPath, toml);
