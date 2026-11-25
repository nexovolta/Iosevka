import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

import * as TOML from "@iarna/toml";
import { parse } from "@iosevka/param/variant";

const ptlPath = fileURLToPath(new URL("../../../packages/font-glyphs/src/number/5.ptl", import.meta.url));
const tomlPath = fileURLToPath(new URL("../../../params/variants.toml", import.meta.url));
const oldPtl = await fs.readFile(ptlPath, "utf8");
const oldToml = await fs.readFile(tomlPath, "utf8");
if (oldPtl.includes("define flex-params [FiveVerticalCut]")) throw new Error("Five cuts already exist.");

function replaceOnce(text, from, to) {
	const at = text.indexOf(from);
	if (at < 0 || text.indexOf(from, at + from.length) >= 0)
		throw new Error(`Expected exactly one occurrence of: ${from}`);
	return text.slice(0, at) + to + text.slice(at + from.length);
}
let ptl = replaceOnce(oldPtl,
	"glyph-block-import Letter-Arc-Hook : Toothed Toothless Rounded Flat CornerHookDepth CornerHookEnd",
	"glyph-block-import Letter-Arc-Hook : Toothed Toothless Rounded Flat CornerHookDepth CornerHookEnd CutArcTerminal DeltaCutEnd VerticalCutExtension");
const classes = `
	define flex-params [FiveVerticalCut] : namespace
		local-parameter : box
		local-parameter : sw -- Stroke
		local-parameter : barSw -- sw
		local-parameter : hook -- Hook

		export : define [hookEndL] : list
			HookEnd box.b (sw -- sw)
			g4 (box.l - [VerticalCutExtension hook sw]) (box.b + hook)
		export : define [serifEndL] : glyph-proc

	define flex-params [FiveDiagonalCut] : namespace
		local-parameter : box
		local-parameter : sw -- Stroke
		local-parameter : barSw -- sw
		local-parameter : hook -- Hook

		export : define [hookEndL] : DeltaCutEnd [mix box.l box.r 0.5] box.l (box.b + O) (box.b + 0.2 * hook) sw
		export : define [serifEndL] : glyph-proc

`;
ptl = replaceOnce(ptl, "\tdefine flex-params [FiveShape]", `${classes}\tdefine flex-params [FiveShape]`);
ptl = replaceOnce(ptl,
	"\t\t\t\tlocal fiveStroke : include : dispiro\n",
	"\t\t\t\tlocal rawFiveStroke : dispiro\n");
ptl = replaceOnce(ptl,
	"\t\t\t\tlocal firstKnot fiveStroke.rhsKnots.0\n",
	"\t\t\t\tlocal fiveStroke : include rawFiveStroke\n" +
	"\t\t\t\tlocal firstKnot fiveStroke.rhsKnots.0\n" +
	"\t\t\t\tif (bowlBotArcC === FiveVerticalCut) : begin\n" +
	"\t\t\t\t\tcurrentGlyph.clearGeometry\n" +
	"\t\t\t\t\tinclude : CutArcTerminal rawFiveStroke SB t2 0 sw true false\n");
const config = "\t\t\t'serifedHook'   {Rounded  Toothed  (1.000 * DesignParameters.fiveBarPos)  0      0.025}\n";
ptl = replaceOnce(ptl, config, config +
	"\t\t\t'verticalCut'   {Rounded  FiveVerticalCut  (1.000 * DesignParameters.fiveBarPos)  0      0.025}\n" +
	"\t\t\t'diagonalCut'   {Rounded  FiveDiagonalCut  (1.000 * DesignParameters.fiveBarPos)  0      0.025}\n" +
	"\t\t\t'flatVerticalCut' {Flat FiveVerticalCut (0.875 * DesignParameters.fiveBarPos) (1/3) 0.050}\n" +
	"\t\t\t'flatDiagonalCut' {Flat FiveDiagonalCut (0.875 * DesignParameters.fiveBarPos) (1/3) 0.050}\n");

const before = parse(TOML.parse(oldToml));
const prime = before.primes.get("five");
const start = oldToml.indexOf("[prime.five.variants-buildup]");
const end = oldToml.indexOf("[prime.six]", start);
if (start < 0 || end < 0) throw new Error("Cannot locate five selector stages.");
let section = oldToml.slice(start, end);
const cuts = [["vertical-cut", "verticalCut"], ["diagonal-cut", "diagonalCut"], ["flat-vertical-cut", "flatVerticalCut"], ["flat-diagonal-cut", "flatDiagonalCut"]];
const added = cuts.map(([key, suffix], i) =>
	`[prime.five.variants-buildup.stages.arc.${key}]\nrank = ${i + 7}\ndescriptionAffix = "${key} terminal"\nselectorAffix.five = "${suffix}"\nselectorAffix."five/sansSerif" = "${suffix}"\nselectorAffix.zhuangToneFive = "${suffix}"\n\n`).join("");
section = replaceOnce(section, "[prime.five.variants-buildup.stages.bowl.standard]", `${added}[prime.five.variants-buildup.stages.bowl.standard]`);
const bars = ["upright", "oblique", "more-oblique"];
const arcs = ["arched", "flat", "flat-hooked", "corner-hooked", "inward-serifed", "serifed-hooked", ...cuts.map(([key]) => key)];
const bowls = ["standard", "broken"];
let rank = Math.max(...[...prime.variants.values()].map(v => v.rank)) + 1;
for (const serif of ["serifless", "serifed"]) {
	const barMap = bars.map(bar => {
		const arcMap = arcs.map(arc => {
			const bowlMap = bowls.map(bowl => {
				const key = `${bar}-${arc}${bowl === "broken" ? "-broken" : ""}-${serif}`;
				const old = prime.variants.get(key);
				return `${JSON.stringify(bowl)} = ${old ? old.rank : rank++}`;
			});
			return `${JSON.stringify(arc)} = { bowl = { ${bowlMap.join(", ")} } }`;
		});
		return `${JSON.stringify(bar)} = { arc = { ${arcMap.join(", ")} } }`;
	});
	const marker = `[prime.five.variants-buildup.stages.serifs.${serif}]\n`;
	section = replaceOnce(section, marker, `${marker}variantRank = { "upper-left-bar" = { ${barMap.join(", ")} } }\n`);
}
assert.equal(rank, 121);
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
assert.equal(after.primes.get("five").variants.size, prime.variants.size + 48);
await fs.writeFile(ptlPath, ptl);
await fs.writeFile(tomlPath, toml);
console.log("Added five cut terminals and preserved all existing selectors.");
