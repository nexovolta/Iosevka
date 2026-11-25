import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

import * as TOML from "@iarna/toml";
import { parse } from "@iosevka/param/variant";

const ptlPath = fileURLToPath(new URL("../../../packages/font-glyphs/src/symbol/punctuation/at.ptl", import.meta.url));
const tomlPath = fileURLToPath(new URL("../../../params/variants.toml", import.meta.url));
const oldPtl = await fs.readFile(ptlPath, "utf8");
const oldToml = await fs.readFile(tomlPath, "utf8");
if (oldPtl.includes("TOP-VERTICAL-CUT")) throw new Error("At cuts already exist.");

function replaceOnce(text, from, to) {
	const at = text.indexOf(from);
	if (at < 0 || text.indexOf(from, at + from.length) >= 0)
		throw new Error(`Expected exactly one occurrence of: ${from}`);
	return text.slice(0, at) + to + text.slice(at + from.length);
}
let ptl = replaceOnce(oldPtl,
	"glyph-block-import Letter-Arc-Hook : MakeFlatHook MakeCornerHookBase CornerHookDepth",
	"glyph-block-import Letter-Arc-Hook : MakeFlatHook MakeCornerHookBase CornerHookDepth CutArcTerminal DeltaCutStart VerticalCutExtension");
ptl = replaceOnce(ptl, "\tdefine TOP-INWARD-SERIFED  2\n", "\tdefine TOP-INWARD-SERIFED  2\n\tdefine TOP-VERTICAL-CUT    3\n\tdefine TOP-DIAGONAL-CUT    4\n");
ptl = replaceOnce(ptl,
	"\t\tinclude : dispiro\n\t\t\twidths.rhs sw\n\t\t\tif fFlatHook",
	"\t\tlocal outer : dispiro\n\t\t\twidths.rhs sw\n\t\t\tif fFlatHook");
ptl = replaceOnce(ptl,
	"\t\t\t\t\t\t[Just TOP-INWARD-SERIFED] : InwardSlabArcStart.LtrRhs SB top sw Hook\n",
	"\t\t\t\t\t\t[Just TOP-INWARD-SERIFED] : InwardSlabArcStart.LtrRhs SB top sw Hook\n" +
	"\t\t\t\t\t\t[Just TOP-DIAGONAL-CUT] : DeltaCutStart Middle SB (top - O) (top - 0.2 * Hook) sw\n" +
	"\t\t\t\t\t\t[Just TOP-VERTICAL-CUT] : list\n" +
	"\t\t\t\t\t\t\tg4 (SB - [VerticalCutExtension Hook sw]) (top - Hook)\n" +
	"\t\t\t\t\t\t\tHookStart top (sw -- sw)\n");
ptl = replaceOnce(ptl,
	"\t\tif fCornerHook : include : VBar.l",
	"\t\tinclude : if (topSerif === TOP-VERTICAL-CUT) [CutArcTerminal outer SB top 0 sw true true] outer\n" +
	"\t\tif fCornerHook : include : VBar.l");
ptl = replaceOnce(ptl,
	"\t\tcompactInwardSerifed  {CompactShape  CAP  false  false  TOP-INWARD-SERIFED}\n",
	"\t\tcompactInwardSerifed  {CompactShape  CAP  false  false  TOP-INWARD-SERIFED}\n" +
	"\t\tcompactVerticalCut    {CompactShape  CAP  false  false  TOP-VERTICAL-CUT}\n" +
	"\t\tcompactDiagonalCut    {CompactShape  CAP  false  false  TOP-DIAGONAL-CUT}\n");

const before = parse(TOML.parse(oldToml));
const prime = before.primes.get("at");
const start = oldToml.indexOf("[prime.at.variants-buildup]");
const end = oldToml.indexOf("[prime.percent]", start);
if (start < 0 || end < 0) throw new Error("Cannot locate at stages.");
let section = oldToml.slice(start, end);
for (const [stage, key, variant] of [
	["folds", "compact-flat-hook", "compact-flat-hook"],
	["folds", "compact-corner-hook", "compact-corner-hook"],
	["top-serifs", "serifless", "compact"],
	["top-serifs", "serifed", "compact-serifed"],
	["top-serifs", "inward-serifed", "compact-inward-serifed"],
]) {
	const marker = `[prime.at.variants-buildup.stages.${stage}.${key}]\n`;
	section = replaceOnce(section, marker, `${marker}variantRank = ${prime.variants.get(variant).rank}\n`);
}
let nextRank = Math.max(...[...prime.variants.values()].map(v => v.rank)) + 1;
const additions = [["vertical-cut", "verticalCut"], ["diagonal-cut", "diagonalCut"]].map(([key, suffix], index) =>
	`[prime.at.variants-buildup.stages.top-serifs.${key}]\nrank = ${index + 4}\nvariantRank = ${nextRank++}\ndescriptionAffix = "${key} terminal"\nselectorAffix.at = "${suffix}"\n\n`).join("");
section = replaceOnce(section, "[prime.at.variants-buildup.stages.height.normal]", `${additions}[prime.at.variants-buildup.stages.height.normal]`);
const toml = oldToml.slice(0, start) + section + oldToml.slice(end);
const after = parse(TOML.parse(toml));
for (const [name, oldPrime] of before.primes) {
	const current = after.primes.get(name);
	assert.equal(current.tag, oldPrime.tag, name);
	for (const [key, variant] of oldPrime.variants) {
		const actual = current.variants.get(key);
		assert.ok(actual, `${name}.${key}`);
		assert.equal(actual.tag, variant.tag, `${name}.${key}`);
		assert.equal(actual.rank, variant.rank, `${name}.${key}`);
		assert.equal(actual.description, variant.description, `${name}.${key}`);
		assert.deepEqual(actual.selector, variant.selector, `${name}.${key}`);
	}
}
assert.equal(after.primes.get("at").variants.size, prime.variants.size + 2);
await fs.writeFile(ptlPath, ptl);
await fs.writeFile(tomlPath, toml);
console.log("Added compact at cut terminals and preserved all existing selectors.");
