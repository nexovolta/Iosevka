import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as TOML from "@iarna/toml";
import { parse } from "@iosevka/param/variant";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const ezhPath = path.join(root, "packages", "font-glyphs", "src", "letter", "latin-ext", "ezh.ptl");
const threePath = path.join(root, "packages", "font-glyphs", "src", "number", "3.ptl");
const tomlPath = path.join(root, "params", "variants.toml");
let ezh = await fs.readFile(ezhPath, "utf8");
let three = await fs.readFile(threePath, "utf8");
const oldToml = await fs.readFile(tomlPath, "utf8");
const before = parse(TOML.parse(oldToml));
if (three.includes("hookStyle     -- [if (hookStyle === HOOK-VERTICAL)"))
	throw new Error("Flat-top three cut variants already exist.");

function replaceOnce(text, from, to) {
	const at = text.indexOf(from);
	if (at < 0 || text.indexOf(from, at + from.length) >= 0)
		throw new Error(`Expected exactly one occurrence of: ${from}`);
	return text.slice(0, at) + to + text.slice(at + from.length);
}

ezh = replaceOnce(
	ezh,
	"glyph-block-import Letter-Arc-Hook : MakeFlatHook MakeCornerHook",
	"glyph-block-import Letter-Arc-Hook : MakeFlatHook MakeCornerHook CutArcTerminal DeltaCutEnd VerticalCutExtension",
);
const unionStart = "\t\t\tinclude : union\n\t\t\t\tif fOunceTop [OunceTop] : if fCursive [CursiveTop] [ConventionalTop]\n\t\t\t\tdispiro\n";
const start = ezh.indexOf(unionStart);
const end = ezh.indexOf("\n\t\t\tif (terminal === TERMINAL-HOOK && hookStyle === 'serifed')", start);
if (start < 0 || end < 0) throw new Error("Cannot locate Ezh bowl.");
let bowl = ezh.slice(start + unionStart.length, end).replace(/^\t/mg, "");
bowl = replaceOnce(
	bowl,
	"\t\t\t\t\t\t[Just 'inwardSerifed'] : InwardSlabArcEnd.RtlRhs df.leftSB bottom stroke hook origBar\n",
	"\t\t\t\t\t\t[Just 'inwardSerifed'] : InwardSlabArcEnd.RtlRhs df.leftSB bottom stroke hook origBar\n" +
		"\t\t\t\t\t\t\t[Just 'diagonalCut'] : DeltaCutEnd df.middle df.leftSB (bottom + O) (bottom + 0.2 * hook) stroke\n" +
		"\t\t\t\t\t\t\t[Just 'verticalCut'] : list\n" +
		"\t\t\t\t\t\t\t\tHookEnd bottom (sw -- stroke)\n" +
		"\t\t\t\t\t\t\t\tg4 (df.leftSB - [VerticalCutExtension hook stroke]) (bottom + hook)\n",
);
ezh = ezh.slice(0, start) + "\t\t\tlocal bowl : dispiro\n" + bowl +
	"\n\t\t\tinclude : union\n\t\t\t\tif fOunceTop [OunceTop] : if fCursive [CursiveTop] [ConventionalTop]\n" +
	"\t\t\t\tif (terminal === TERMINAL-HOOK && hookStyle === 'verticalCut') [CutArcTerminal bowl df.leftSB yMidLeft bottom stroke true false] bowl\n" +
	ezh.slice(end);

three = replaceOnce(
	three,
	"\t\t\tfCornerHook  -- (hookStyle === HOOK-CORNER)\n",
	"\t\t\tfCornerHook  -- (hookStyle === HOOK-CORNER)\n" +
		"\t\t\thookStyle     -- [if (hookStyle === HOOK-VERTICAL) 'verticalCut' : if (hookStyle === HOOK-DIAGONAL) 'diagonalCut' 'serifless']\n",
);
three = replaceOnce(
	three,
	"\t\t\t[Just HOOK-SLAB]   SLAB-CLASSICAL\n",
	"\t\t\t[Just HOOK-SLAB]   SLAB-CLASSICAL\n\t\t\t[Just HOOK-VERTICAL] 6\n\t\t\t[Just HOOK-DIAGONAL] 7\n",
);
three = replaceOnce(
	three,
	"\t\t\tserifedHook {HOOK-SLAB  }\n",
	"\t\t\tserifedHook {HOOK-SLAB  }\n\t\t\tverticalCut {HOOK-VERTICAL}\n\t\t\tdiagonalCut {HOOK-DIAGONAL}\n",
);

const prime = before.primes.get("three");
const bodies = ["flat-top", "flat-top-broken"];
const serifs = ["serifless", "serifed"];
const hooks = ["standard", "flat-hooked", "corner-hooked", "serifed-hooked", "vertical-cut", "diagonal-cut"];
let nextRank = Math.max(...[...prime.variants.values()].map(v => v.rank)) + 1;
const startToml = oldToml.indexOf("[prime.three.variants-buildup]");
const endToml = oldToml.indexOf("[prime.four]", startToml);
if (startToml < 0 || endToml < 0) throw new Error("Cannot locate three stages.");
let section = oldToml.slice(startToml, endToml);
for (const [index, hook] of hooks.entries()) {
	const rankMap = bodies.map(body => {
		const ranks = serifs.map(serif => {
			const key = `${body}${serif === "serifed" ? "-serifed" : ""}${hook === "standard" ? "" : `-${hook}`}`;
			const old = prime.variants.get(key);
			return `${JSON.stringify(serif)} = ${old ? old.rank : nextRank++}`;
		});
		return `${JSON.stringify(body)} = { serifs = { ${ranks.join(", ")} } }`;
	}).join(", ");
	const marker = `[prime.three.variants-buildup.stages.hook.${hook}]\n`;
	if (index < 4) {
		section = replaceOnce(section, marker, `${marker}variantRank = { body = { ${rankMap} } }\n`);
	} else {
		const suffix = hook === "vertical-cut" ? "verticalCut" : "diagonalCut";
		section += `${marker}rank = ${index + 1}\nvariantRank = { body = { ${rankMap} } }\n`;
		section += `descriptionAffix = "${hook} bottom"\nselectorAffix.three = "${suffix}"\nselectorAffix."three/sansSerif" = "${suffix}"\n\n`;
	}
}
assert.equal(nextRank, 74);
const toml = oldToml.slice(0, startToml) + section + oldToml.slice(endToml);
const after = parse(TOML.parse(toml));
for (const [name, oldPrime] of before.primes) {
	const actual = after.primes.get(name);
	assert.equal(actual.tag, oldPrime.tag, name);
	for (const [key, variant] of oldPrime.variants) {
		const v = actual.variants.get(key);
		assert.ok(v, `${name}.${key}`);
		assert.equal(v.tag, variant.tag, `${name}.${key}`);
		assert.equal(v.rank, variant.rank, `${name}.${key}`);
		assert.equal(v.description, variant.description, `${name}.${key}`);
		assert.deepEqual(v.selector, variant.selector, `${name}.${key}`);
	}
}
assert.equal(after.primes.get("three").variants.size, prime.variants.size + 8);
await fs.writeFile(ezhPath, ezh);
await fs.writeFile(threePath, three);
await fs.writeFile(tomlPath, toml);
console.log("Added flat-top three cut variants while preserving existing selectors and ranks.");
