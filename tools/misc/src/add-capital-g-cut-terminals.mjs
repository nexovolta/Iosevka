import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import * as TOML from "@iarna/toml";
import { parse } from "@iosevka/param/variant";

const root = new URL("../../../", import.meta.url);
const paths = {
	g: fileURLToPath(new URL("packages/font-glyphs/src/letter/latin/upper-g.ptl", root)),
	c: fileURLToPath(new URL("packages/font-glyphs/src/letter/latin/c.ptl", root)),
	toml: fileURLToPath(new URL("params/variants.toml", root)),
};
const oldG = await readFile(paths.g, "utf8");
const oldC = await readFile(paths.c, "utf8");
const oldToml = await readFile(paths.toml, "utf8");
if (oldG.includes("SLAB-VERTICAL-CUT")) throw new Error("Capital G cuts already exist.");
function replaceOnce(text, from, to) {
	const at = text.indexOf(from);
	if (at < 0 || text.indexOf(from, at + from.length) !== -1)
		throw new Error(`Expected exactly one occurrence of: ${from}`);
	return text.slice(0, at) + to + text.slice(at + from.length);
}
let g = replaceOnce(oldG,
	"glyph-block-import Letter-Arc-Hook : MakeFlatHook MakeCornerHookBase CornerHookDepth",
	"glyph-block-import Letter-Arc-Hook : MakeFlatHook MakeCornerHookBase CornerHookDepth CutArcTerminal DeltaCutStart VerticalCutExtension");
g = replaceOnce(g, "\tdefine SLAB-CORNER-HOOK        5\n",
	"\tdefine SLAB-CORNER-HOOK        5\n\tdefine SLAB-VERTICAL-CUT       6\n\tdefine SLAB-DIAGONAL-CUT       7\n");
g = replaceOnce(g,
	"\t\t\t[Just SLAB-CORNER-HOOK] : [MakeCornerHookBase SB RightSB top 0].hookStartR\n",
	"\t\t\t[Just SLAB-CORNER-HOOK] : [MakeCornerHookBase SB RightSB top 0].hookStartR\n" +
	"\t\t\t[Just SLAB-VERTICAL-CUT] : list [widths.lhs] [g4 (RightSB + [VerticalCutExtension hook Stroke]) (top - hook)] [HookStart top]\n" +
	"\t\t\t[Just SLAB-DIAGONAL-CUT] : list [widths.lhs] [DeltaCutStart Middle RightSB (top - O) (top - 0.2 * hook) Stroke]\n");
g = replaceOnce(g, "\t\tlocal body : union\n\t\t\tdispiro.apply null knots\n",
	"\t\tlocal arc : dispiro.apply null knots\n\t\tlocal body : union\n" +
	"\t\t\tif (slabType === SLAB-VERTICAL-CUT) [CutArcTerminal arc RightSB top 0 Stroke false true] arc\n");
g = replaceOnce(g, "\t\t\tcornerHook       SLAB-CORNER-HOOK\n",
	"\t\t\tcornerHook       SLAB-CORNER-HOOK\n\t\t\tverticalCut      SLAB-VERTICAL-CUT\n\t\t\tdiagonalCut      SLAB-DIAGONAL-CUT\n");
g = replaceOnce(g, "\t\t\ttopCornerHook           {SLAB-CORNER-HOOK}\n",
	"\t\t\ttopCornerHook           {SLAB-CORNER-HOOK}\n" +
	"\t\t\ttopVerticalCut          {SLAB-VERTICAL-CUT}\n\t\t\ttopDiagonalCut          {SLAB-DIAGONAL-CUT}\n");
const c = replaceOnce(oldC, "\t\ttopCornerHook                     {SLAB-CORNER-HOOK  SLAB-NONE       }\n",
	"\t\ttopCornerHook                     {SLAB-CORNER-HOOK  SLAB-NONE       }\n" +
	"\t\ttopVerticalCut                    {CUT-VERTICAL      SLAB-NONE       }\n" +
	"\t\ttopDiagonalCut                    {CUT-DIAGONAL      SLAB-NONE       }\n");

const before = parse(TOML.parse(oldToml));
const oldGPrime = before.primes.get("capital-g");
const maxRank = Math.max(...[...oldGPrime.variants.values()].map(v => v.rank));
const gStart = oldToml.indexOf('[prime.capital-g.variants-buildup.stages.body."*"]');
const topStart = oldToml.indexOf('[prime.capital-g.variants-buildup.stages.top-serif."*"]', gStart);
const hookStart = oldToml.indexOf("[prime.capital-g.variants-buildup.stages.hook.hookless]", topStart);
const nextPrime = oldToml.indexOf("[prime.capital-h]", hookStart);
if ([gStart, topStart, hookStart, nextPrime].some(i => i < 0)) throw new Error("Cannot locate capital G stages.");
const asExtra = s => s.replaceAll("prime.capital-g.variants-buildup", "prime.capital-g.variants-extra-buildup");
const bodyStages = asExtra(oldToml.slice(gStart, topStart));
const hookStages = asExtra(oldToml.slice(hookStart, nextPrime));
const extra = `
[prime.capital-g.variants-extra-buildup]
entry = "body"
descriptionLeader = "\`G\`"
rankOffset = ${maxRank}

${bodyStages}
[prime.capital-g.variants-extra-buildup.stages.top-serif."*"]
next = "hook"

${["vertical", "diagonal"].map((cut, i) => `[prime.capital-g.variants-extra-buildup.stages.top-serif.${cut}-cut]
rank = ${i + 1}
descriptionAffix = "${cut}-cut top"
selectorAffix.G = "${cut}Cut"
selectorAffix."G/sansSerif" = "${cut}Cut"
selectorAffix."G/descBase" = "serifless"
selectorAffix.GHookTop = "serifed"
`).join("\n")}
${hookStages}`;
let toml = replaceOnce(oldToml, "[prime.capital-h]", `${extra}[prime.capital-h]`);
const fallback = 'if = [{ "top-arc" = "vertical-cut" }], then = "serifless", else = "serifless"';
let changed = 0;
toml = toml.split("\n").map(line => {
	if (!line.startsWith('selectorAffix."C/topSerif"') && !line.startsWith('selectorAffix."c/topSerif"')) return line;
	if (!line.includes(fallback)) throw new Error("Unexpected C top selector.");
	changed++;
	return line.replace(fallback, 'if = [{ "top-arc" = "vertical-cut" }], then = "topVerticalCut", else = "topDiagonalCut"');
}).join("\n");
assert.equal(changed, 14);
for (const prime of ["capital-c", "c"]) for (const cut of ["vertical", "diagonal"]) {
	const start = toml.indexOf(`[prime.${prime}.variants.${cut}-cut]`);
	const end = toml.indexOf("\n[prime.", start + 1);
	if (start < 0 || end < 0) throw new Error(`Cannot locate ${prime}.${cut}-cut`);
	const region = toml.slice(start, end);
	const selector = prime === "c" ? "c" : "C";
	const revised = replaceOnce(region, `selector."${selector}/topSerif" = "serifless"`,
		`selector."${selector}/topSerif" = "top${cut[0].toUpperCase()}${cut.slice(1)}Cut"`);
	toml = toml.slice(0, start) + revised + toml.slice(end);
}
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
		const expected = { ...variant.selector };
		if ((name === "capital-c" || name === "c") && key.includes("vertical-cut") && expected[`${name === "c" ? "c" : "C"}/topSerif`] === "serifless" &&
			(key === "vertical-cut" || key.startsWith("top-vertical-cut-")))
			expected[`${name === "c" ? "c" : "C"}/topSerif`] = "topVerticalCut";
		if ((name === "capital-c" || name === "c") && key.includes("diagonal-cut") && expected[`${name === "c" ? "c" : "C"}/topSerif`] === "serifless" &&
			(key === "diagonal-cut" || key.startsWith("top-diagonal-cut-")))
			expected[`${name === "c" ? "c" : "C"}/topSerif`] = "topDiagonalCut";
		assert.deepEqual(actual.selector, expected, `${name}.${key}`);
	}
}
assert.equal(after.primes.get("capital-g").variants.size, oldGPrime.variants.size + 56);
await writeFile(paths.g, g);
await writeFile(paths.c, c);
await writeFile(paths.toml, toml);
