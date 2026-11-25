import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import * as TOML from "@iarna/toml";
import { parse } from "@iosevka/param/variant";

const root = new URL("../../../", import.meta.url);
const sourcePath = fileURLToPath(new URL("packages/font-glyphs/src/letter/latin/lower-f.ptl", root));
const tomlPath = fileURLToPath(new URL("params/variants.toml", root));
const oldSource = await readFile(sourcePath, "utf8");
const oldToml = await readFile(tomlPath, "utf8");
if (oldSource.includes("define [CutFShape")) throw new Error("Lower-f cuts already exist.");
function replaceOnce(text, from, to) {
	const at = text.indexOf(from);
	if (at < 0 || text.indexOf(from, at + from.length) !== -1)
		throw new Error(`Expected exactly one occurrence of: ${from}`);
	return text.slice(0, at) + to + text.slice(at + from.length);
}
let source = replaceOnce(oldSource,
	"glyph-block-import Letter-Arc-Hook : CornerHookDepth CornerHookOffset CornerHookOutset",
	"glyph-block-import Letter-Arc-Hook : CornerHookDepth CornerHookOffset CornerHookOutset CutArcTerminal DeltaCutStart VerticalCutExtension");
source = replaceOnce(source,
	"define [StandardFShape df m bh counterHook sym] : glyph-proc",
	"define [StandardFShape df m bh counterHook sym cut] : glyph-proc");
source = replaceOnce(source,
	"\t\tinclude : StdFShapeT dispiro df 0 barLeft0 Stroke hookExtra\n",
	`\t\tif cut
\t\t: then : begin
\t\t\tlocal hookEnd : Math.max (barLeft0 + [HSwToV : 2.125 * Stroke]) (df.rightSB + RBalance2 - (OX - O) + hookExtra)
\t\t\tlocal shape : dispiro
\t\t\t\twidths.lhs Stroke
\t\t\t\tif (cut === 'diagonal')
\t\t\t\t\tDeltaCutStart [mix barLeft0 hookEnd 0.5] hookEnd (Ascender - O) (Ascender - 0.2 * Hook) Stroke
\t\t\t\t\tlist [g4 (hookEnd + [VerticalCutExtension Hook Stroke]) (Ascender - Hook * 0.75)] [HookStart Ascender]
\t\t\t\tflat barLeft0 (Ascender - ArchDepthA * 0.8)
\t\t\t\tcurl barLeft0 0 [heading Downward]
\t\t\tinclude : if (cut === 'diagonal') shape [CutArcTerminal shape hookEnd Ascender 0 Stroke false true]
\t\t: else : include : StdFShapeT dispiro df 0 barLeft0 Stroke hookExtra
`);
const narrow = "\tdefine [NarrowStdFShapeT sink df offset barleft sw _hookExtra] : begin\n";
source = replaceOnce(source, narrow,
	"\tdefine [CutFShape cut] : function [df m bh counterHook sym] : StandardFShape df m bh counterHook sym cut\n\n" + narrow);
const entry = "\t\t\t''             {StandardFShape         dfN}\n";
source = replaceOnce(source, entry, entry +
	"\t\t\tverticalCut    {[CutFShape 'vertical']  dfN}\n" +
	"\t\t\tdiagonalCut    {[CutFShape 'diagonal']  dfN}\n");
source = replaceOnce(source, `\t\tfunction [body] : object # hooks
\t\t\tserifless      {[if body pNarrowFSide 0.95]  CH-NONE           'b' }
\t\t\tserifed        {[if body pNarrowFSide 0.95]  CH-SERIF          'b' }
\t\t\textended       {[if body pNarrowFSide 0.95]  CH-EXTENSION      'bp'}
\t\t\ttailed         {[if body pNarrowFSide 1.00]  CH-HOOK           'bp'}
\t\t\tdiagonalTailed {[if body pNarrowFSide 1.00]  CH-DIAGONAL-HOOK  'bp'}
`, `\t\tfunction [body] : begin
\t\t\tlocal narrow : body && body !== 'verticalCut' && body !== 'diagonalCut'
\t\t\treturn : object
\t\t\t\tserifless      {[if narrow pNarrowFSide 0.95]  CH-NONE           'b' }
\t\t\t\tserifed        {[if narrow pNarrowFSide 0.95]  CH-SERIF          'b' }
\t\t\t\textended       {[if narrow pNarrowFSide 0.95]  CH-EXTENSION      'bp'}
\t\t\t\ttailed         {[if narrow pNarrowFSide 1.00]  CH-HOOK           'bp'}
\t\t\t\tdiagonalTailed {[if narrow pNarrowFSide 1.00]  CH-DIAGONAL-HOOK  'bp'}
`);
const palatal = '\t\t\tinclude [refer-glyph "f.\\(suffix)"] AS_BASE ALSO_METRICS\n';
source = replaceOnce(source, palatal, `\t\t\tlocal baseSuffix suffix
\t\t\tif ([suffix.startsWith 'verticalCut'] || [suffix.startsWith 'diagonalCut']) : begin
\t\t\t\tlocal s : suffix.slice 11
\t\t\t\tset baseSuffix : [s.0.toLowerCase] + [s.slice 1]
\t\t\tinclude [refer-glyph "f.\\(baseSuffix)"] AS_BASE ALSO_METRICS
`);
const before = parse(TOML.parse(oldToml));
const prime = before.primes.get("f");
const rankOffset = Math.max(...[...prime.variants.values()].map(v => v.rank));
const start = oldToml.indexOf("[prime.f.variants-buildup.stages.hook.\"*\"]");
const end = oldToml.indexOf("\n[prime.g]", start);
if (start < 0 || end < 0) throw new Error("Cannot locate f stages.");
let stages = oldToml.slice(start, end).replaceAll("prime.f.variants-buildup", "prime.f.variants-extra-buildup");
const hooks = stages.indexOf("[prime.f.variants-extra-buildup.stages.hook.full]");
const tails = stages.indexOf("[prime.f.variants-extra-buildup.stages.tail.\"*\"]");
if (hooks < 0 || tails < 0) throw new Error("Cannot isolate f hook stages.");
const cutStages = ["vertical", "diagonal"].map((cut, i) => `[prime.f.variants-extra-buildup.stages.hook.${cut}-cut]
rank = ${i + 1}
descriptionAffix = "${cut}-cut top"
selectorAffix.f = "${cut}Cut"
selectorAffix."f/sansSerif" = "${cut}Cut"
selectorAffix.fengTrill = ""
selectorAffix."f/phoneticLeft" = "${cut}Cut"
selectorAffix."f/compLigLeft1" = "flatHookCLC1"
selectorAffix."f/compLigLeft2" = "flatHookCLC2"
selectorAffix."f/compLigLeft3" = "flatHookCLC3"
selectorAffix."f/compLigLeft4" = "flatHookCLC4"
selectorAffix.fLenis = "${cut}Cut"
selectorAffix.fHookBottom = ""

`).join("");
stages = stages.slice(0, hooks) + cutStages + stages.slice(tails);
const extra = `
[prime.f.variants-extra-buildup]
entry = "hook"
descriptionLeader = "\`f\`"
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
assert.equal(after.primes.get("f").variants.size, prime.variants.size + 60);
await writeFile(sourcePath, source);
await writeFile(tomlPath, toml);
