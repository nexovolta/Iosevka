import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import * as TOML from "@iarna/toml";
import { parse } from "@iosevka/param/variant";

const ptlPath = fileURLToPath(new URL("../../../packages/font-glyphs/src/symbol/letter.ptl", import.meta.url));
const tomlPath = fileURLToPath(new URL("../../../params/variants.toml", import.meta.url));
const oldPtl = await readFile(ptlPath, "utf8");
const oldToml = await readFile(tomlPath, "utf8");
if (oldPtl.includes("define TOP-VERTICAL-CUT")) throw new Error("Sterling cuts already exist.");
function replaceOnce(text, from, to) {
	const at = text.indexOf(from);
	if (at < 0 || text.indexOf(from, at + from.length) !== -1)
		throw new Error(`Expected exactly one occurrence of: ${from}`);
	return text.slice(0, at) + to + text.slice(at + from.length);
}
let ptl = replaceOnce(oldPtl,
	"glyph-block-import Letter-Arc-Hook : MakeFlatHook MakeCornerHookBase CornerHookDepth",
	"glyph-block-import Letter-Arc-Hook : MakeFlatHook MakeCornerHookBase CornerHookDepth CutArcTerminal DeltaCutStart VerticalCutExtension");
ptl = replaceOnce(ptl, "\tdefine TOP-INWARD-SERIFED  2\n",
	"\tdefine TOP-INWARD-SERIFED  2\n\tdefine TOP-VERTICAL-CUT    3\n\tdefine TOP-DIAGONAL-CUT    4\n");
ptl = replaceOnce(ptl, "\t\tserifedCornerHook      {1  TOP-SERIFLESS       false  true }\n",
	"\t\tserifedCornerHook      {1  TOP-SERIFLESS       false  true }\n" +
	"\t\tseriflessVerticalCut   {0  TOP-VERTICAL-CUT    false  false}\n" +
	"\t\tserifedVerticalCut     {1  TOP-VERTICAL-CUT    false  false}\n" +
	"\t\tseriflessDiagonalCut   {0  TOP-DIAGONAL-CUT    false  false}\n" +
	"\t\tserifedDiagonalCut     {1  TOP-DIAGONAL-CUT    false  false}\n");
ptl = replaceOnce(ptl,
	"\t\t\tinclude : union\n\t\t\t\tif (fFlatHook || fCornerHook)\n",
	"\t\t\tlocal mainStroke : if (fFlatHook || fCornerHook)\n");
ptl = replaceOnce(ptl,
	"\t\t\t\tHBar.b SB RightSB 0\n\t\t\tif serifGrade",
	"\t\t\tinclude : union\n" +
	"\t\t\t\tif (topSerif === TOP-VERTICAL-CUT) [CutArcTerminal mainStroke hookEndX CAP 0 Stroke false true] mainStroke\n" +
	"\t\t\t\tHBar.b SB RightSB 0\n\t\t\tif serifGrade");
ptl = replaceOnce(ptl,
	"\t\t\t\t\t\t\t[Just TOP-INWARD-SERIFED] : InwardSlabArcStart.RtlLhs hookEndX CAP Stroke Hook\n",
	"\t\t\t\t\t\t\t[Just TOP-INWARD-SERIFED] : InwardSlabArcStart.RtlLhs hookEndX CAP Stroke Hook\n" +
	"\t\t\t\t\t\t\t[Just TOP-VERTICAL-CUT] : list [g4 (hookEndX + [VerticalCutExtension Hook Stroke]) (CAP - Hook * 0.85)] [HookStart CAP]\n" +
	"\t\t\t\t\t\t\t[Just TOP-DIAGONAL-CUT] : DeltaCutStart [mix xBarLeft hookEndX 0.5] hookEndX (CAP - O) (CAP - 0.2 * Hook) Stroke\n");

const entries = `
[prime.sterling.variants-buildup.stages.top-hooks.vertical-cut]
rank = 6
variantRank = { "bottom-serifs" = { serifless = 11, serifed = 13 } }
descriptionAffix = "with a vertical-cut top"
selectorAffix."currency/sterlingSign" = "VerticalCut"

[prime.sterling.variants-buildup.stages.top-hooks.diagonal-cut]
rank = 7
variantRank = { "bottom-serifs" = { serifless = 12, serifed = 14 } }
descriptionAffix = "with a diagonal-cut top"
selectorAffix."currency/sterlingSign" = "DiagonalCut"

`;
const toml = replaceOnce(oldToml, "[prime.micro-sign]", `${entries}[prime.micro-sign]`);
const before = parse(TOML.parse(oldToml));
const after = parse(TOML.parse(toml));
for (const [name, oldPrime] of before.primes) {
	const newPrime = after.primes.get(name);
	assert.equal(newPrime.tag, oldPrime.tag, name);
	for (const [key, variant] of oldPrime.variants) {
		const actual = newPrime.variants.get(key);
		assert.ok(actual, `${name}.${key}`);
		assert.equal(actual.tag, variant.tag, `${name}.${key}`);
		assert.equal(actual.rank, variant.rank, `${name}.${key}`);
		assert.equal(actual.description, variant.description, `${name}.${key}`);
		assert.deepEqual(actual.selector, variant.selector, `${name}.${key}`);
	}
}
assert.equal(after.primes.get("sterling").variants.size, before.primes.get("sterling").variants.size + 4);
await writeFile(ptlPath, ptl);
await writeFile(tomlPath, toml);
