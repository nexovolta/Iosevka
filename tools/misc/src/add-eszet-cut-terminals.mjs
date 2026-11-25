import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import * as TOML from "@iarna/toml";
import { parse } from "@iosevka/param/variant";

const root = new URL("../../../", import.meta.url);
const sourcePath = fileURLToPath(new URL("packages/font-glyphs/src/letter/latin-ext/eszet.ptl", root));
const tomlPath = fileURLToPath(new URL("params/variants.toml", root));
const oldSource = await readFile(sourcePath, "utf8");
const oldToml = await readFile(tomlPath, "utf8");
if (oldSource.includes("traditionalVerticalCut")) throw new Error("Eszet cuts already exist.");
function replaceOnce(text, from, to) {
	const at = text.indexOf(from);
	if (at < 0 || text.indexOf(from, at + from.length) !== -1)
		throw new Error(`Expected exactly one occurrence of: ${from}`);
	return text.slice(0, at) + to + text.slice(at + from.length);
}
let source = replaceOnce(oldSource,
	"glyph-block-import Letter-Arc-Hook : CornerHookDepth CornerHookStart",
	"glyph-block-import Letter-Arc-Hook : CornerHookDepth CornerHookStart CutArcTerminal DeltaCutStart VerticalCutExtension");
source = replaceOnce(source,
	"define [Traditional fFlathook fCorner] : function [slab term] : glyph-proc",
	"define [Traditional fFlathook fCorner fCut] : function [slab term] : glyph-proc");
const shapeStart = source.indexOf("\t\tinclude : if fFlathook\n");
const shapeEnd = source.indexOf("\t\tlocal t : mix 0 Ascender 0.7\n", shapeStart);
if (shapeStart < 0 || shapeEnd < 0) throw new Error("Cannot locate eszet top shape.");
const oldShape = source.slice(shapeStart + "\t\tinclude : if fFlathook\n".length, shapeEnd);
const nestedShape = oldShape.split("\n").map(line => line ? `\t${line}` : line).join("\n");
source = source.slice(0, shapeStart) + `\t\tlocal cutShape : if fCut : dispiro
\t\t\twidths.lhs Stroke
\t\t\tif (fCut === 'diagonal')
\t\t\t\tDeltaCutStart [mix SB xHook 0.5] xHook (Ascender - O) (Ascender - 0.2 * Hook) Stroke
\t\t\t\tlist [g4 (xHook + [VerticalCutExtension Hook Stroke]) (Ascender - Hook)] [HookStart Ascender]
\t\t\tflat SB XH
\t\t\tcurl SB 0 [heading Downward]
\t\tinclude : if fCut
\t\t\tif (fCut === 'diagonal') cutShape [CutArcTerminal cutShape xHook Ascender 0 Stroke false true]
\t\t\tif fFlathook
${nestedShape}` + source.slice(shapeEnd);
const entry = "\t\t\ttraditionalCornerHook    [Traditional true true]\n";
source = replaceOnce(source, entry, entry +
	"\t\t\ttraditionalVerticalCut   [Traditional false false 'vertical']\n" +
	"\t\t\ttraditionalDiagonalCut   [Traditional false false 'diagonal']\n");
const scotsEntry = "\t\t\ttraditionalCornerHook    FlatTopScotsS\n";
source = replaceOnce(source, scotsEntry, scotsEntry +
	"\t\t\ttraditionalVerticalCut   FlatTopScotsS\n" +
	"\t\t\ttraditionalDiagonalCut   FlatTopScotsS\n");

const before = parse(TOML.parse(oldToml));
const prime = before.primes.get("lower-eszet");
const rankOffset = Math.max(...[...prime.variants.values()].map(v => v.rank));
const start = oldToml.indexOf("[prime.lower-eszet.variants-buildup.stages.body.\"*\"]");
const end = oldToml.indexOf("\n[prime.", oldToml.indexOf("[prime.lower-eszet.variants-buildup.stages.serifs.dual-serifed-half-ascender]", start) + 1);
if (start < 0 || end < 0) throw new Error("Cannot locate eszet stages.");
let stages = oldToml.slice(start, end).replaceAll("prime.lower-eszet.variants-buildup", "prime.lower-eszet.variants-extra-buildup");
const hookStart = stages.indexOf("[prime.lower-eszet.variants-extra-buildup.stages.hook.bent-hook]");
const modernStart = stages.indexOf("[prime.lower-eszet.variants-extra-buildup.stages.body.sulzbacher]", hookStart);
const terminalStart = stages.indexOf("[prime.lower-eszet.variants-extra-buildup.stages.terminal.\"*\"]", modernStart);
if ([hookStart, modernStart, terminalStart].some(i => i < 0)) throw new Error("Cannot isolate eszet hooks.");
const hooks = ["vertical", "diagonal"].map((cut, i) => `[prime.lower-eszet.variants-extra-buildup.stages.hook.${cut}-cut]
rank = ${i + 1}
descriptionAffix = "${cut}-cut top"
selectorAffix.eszet = "${cut}Cut"
selectorAffix.middleScotsS = "bentHook"

`).join("");
stages = stages.slice(0, hookStart) + hooks + stages.slice(terminalStart);
const extra = `
[prime.lower-eszet.variants-extra-buildup]
entry = "body"
descriptionLeader = "Eszet (\`ß\`)"
rankOffset = ${rankOffset}

${stages}
`;
const toml = oldToml.slice(0, end) + "\n" + extra + oldToml.slice(end);
const after = parse(TOML.parse(toml));
for (const [name, oldPrime] of before.primes) {
	for (const [key, variant] of oldPrime.variants) {
		const actual = after.primes.get(name).variants.get(key);
		assert.ok(actual, `${name}.${key}`);
		assert.equal(actual.tag, variant.tag, `${name}.${key}`);
		assert.equal(actual.rank, variant.rank, `${name}.${key}`);
		assert.equal(actual.description, variant.description, `${name}.${key}`);
		assert.deepEqual(actual.selector, variant.selector, `${name}.${key}`);
	}
}
assert.equal(after.primes.get("lower-eszet").variants.size, prime.variants.size + 20);
await writeFile(sourcePath, source);
await writeFile(tomlPath, toml);
