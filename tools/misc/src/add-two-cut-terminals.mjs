import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

import * as TOML from "@iarna/toml";
import { parse } from "@iosevka/param/variant";

const ptlPath = fileURLToPath(new URL("../../../packages/font-glyphs/src/number/2.ptl", import.meta.url));
const tomlPath = fileURLToPath(new URL("../../../params/variants.toml", import.meta.url));
const originalPtl = await fs.readFile(ptlPath, "utf8");
const originalToml = await fs.readFile(tomlPath, "utf8");
if (originalPtl.includes("define HOOK-VERTICAL")) throw new Error("Two cuts already exist.");

function replaceOnce(text, from, to) {
	const at = text.indexOf(from);
	if (at < 0 || text.indexOf(from, at + from.length) >= 0)
		throw new Error(`Expected exactly one occurrence of: ${from}`);
	return text.slice(0, at) + to + text.slice(at + from.length);
}

let ptl = replaceOnce(
	originalPtl,
	"glyph-block-import Letter-Arc-Hook : MakeFlatHook MakeCornerHook",
	"glyph-block-import Letter-Arc-Hook : MakeFlatHook MakeCornerHook CutArcTerminal DeltaCutStart VerticalCutExtension",
);
ptl = replaceOnce(ptl, "\tdefine HOOK-SLAB   4\n", "\tdefine HOOK-SLAB   4\n\tdefine HOOK-VERTICAL 5\n\tdefine HOOK-DIAGONAL 6\n");
for (const [name, next, edge] of [
	["TwoStraightNeckArcT", "TwoArcShapeT", "left"],
	["TwoArcShapeT", "TwoShape", "(left - offsetU)"],
]) {
	const start = ptl.indexOf(`\tdefine [${name} `);
	const end = ptl.indexOf(`\tdefine [${next} `, start);
	if (start < 0 || end < 0) throw new Error(`Cannot locate ${name}.`);
	let section = ptl.slice(start, end);
	section = replaceOnce(section, "\t\treturn : sink\n", "\t\tlocal shape : sink\n");
	const slab = `\t\t\t\t[Just HOOK-SLAB]   : SerifedArcStart.LtrRhs ${edge} top sw hook\n`;
	section = replaceOnce(section, slab, slab +
		`\t\t\t\t[Just HOOK-DIAGONAL] : DeltaCutStart [mix left right 0.5] ${edge} (top - O) (top - 0.2 * hook) sw\n` +
		`\t\t\t\t[Just HOOK-VERTICAL] : list\n\t\t\t\t\tg4 (${edge} - [VerticalCutExtension hook sw]) (top - hook)\n\t\t\t\t\tHookStart top (sw -- sw)\n`);
	section += `\t\treturn : if (hookStyle === HOOK-VERTICAL) [CutArcTerminal shape ${edge} top 0 sw true true] shape\n\n`;
	ptl = ptl.slice(0, start) + section + ptl.slice(end);
}
for (const indent of ["\t\t\t", "\t\t\t\t"]) {
	const line = `\n${indent}serifedHook   HOOK-SLAB\n`;
	ptl = replaceOnce(ptl, line, `${line}${indent}verticalCut   HOOK-VERTICAL\n${indent}diagonalCut   HOOK-DIAGONAL\n`);
}

const before = parse(TOML.parse(originalToml));
const prime = before.primes.get("two");
const start = originalToml.indexOf("[prime.two.variants-buildup]");
const end = originalToml.indexOf("[prime.three]", start);
if (start < 0 || end < 0) throw new Error("Cannot locate two variants.");
let section = originalToml.slice(start, end);
section = replaceOnce(section, "[prime.two.variants-buildup.stages.serifs.serifless]",
	`[prime.two.variants-buildup.stages.hook.vertical-cut]\nrank = 6\ndescriptionAffix = "vertical-cut terminal"\nselectorAffix.two = "verticalCut"\nselectorAffix."two/sansSerif" = "verticalCut"\n\n` +
	`[prime.two.variants-buildup.stages.hook.diagonal-cut]\nrank = 7\ndescriptionAffix = "diagonal-cut terminal"\nselectorAffix.two = "diagonalCut"\nselectorAffix."two/sansSerif" = "diagonalCut"\n\n` +
	`[prime.two.variants-buildup.stages.serifs.serifless]`);
const bodies = ["straight-neck", "curly-neck"];
const hooks = ["rounded", "flat-hooked", "corner-hooked", "inward-serifed", "serifed-hooked", "vertical-cut", "diagonal-cut"];
let rank = Math.max(...[...prime.variants.values()].map(v => v.rank)) + 1;
for (const serif of ["serifless", "serifed"]) {
	const branches = bodies.map(body => {
		const entries = hooks.map(hook => {
			const key = `${body}${hook === "rounded" ? "" : `-${hook}`}-${serif}`;
			const old = prime.variants.get(key);
			return `${JSON.stringify(hook)} = ${old ? old.rank : rank++}`;
		});
		return `${JSON.stringify(body)} = { hook = { ${entries.join(", ")} } }`;
	});
	const marker = `[prime.two.variants-buildup.stages.serifs.${serif}]\n`;
	section = replaceOnce(section, marker, `${marker}variantRank = { body = { ${branches.join(", ")} } }\n`);
}
assert.equal(rank, 29);
const toml = originalToml.slice(0, start) + section + originalToml.slice(end);
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
assert.equal(after.primes.get("two").variants.size, prime.variants.size + 8);
await fs.writeFile(ptlPath, ptl);
await fs.writeFile(tomlPath, toml);
console.log("Added two cut terminals and preserved all existing selector mappings.");
