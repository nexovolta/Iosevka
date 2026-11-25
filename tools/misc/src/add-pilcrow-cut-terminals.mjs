import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

import * as TOML from "@iarna/toml";
import { parse } from "@iosevka/param/variant";

const ptlPath = fileURLToPath(new URL("../../../packages/font-glyphs/src/symbol/punctuation/pilcrow.ptl", import.meta.url));
const tomlPath = fileURLToPath(new URL("../../../params/variants.toml", import.meta.url));
const oldPtl = await fs.readFile(ptlPath, "utf8");
const oldToml = await fs.readFile(tomlPath, "utf8");
if (oldPtl.includes("'pilcrow.verticalCut'")) throw new Error("Pilcrow cuts already exist.");

function replaceOnce(text, from, to) {
	const at = text.indexOf(from);
	if (at < 0 || text.indexOf(from, at + from.length) >= 0)
		throw new Error(`Expected exactly one occurrence of: ${from}`);
	return text.slice(0, at) + to + text.slice(at + from.length);
}

let ptl = replaceOnce(
	oldPtl,
	"glyph-block-import Letter-Arc-Hook : MakeFlatHook MakeCornerHookBase CornerHookDepth",
	"glyph-block-import Letter-Arc-Hook : MakeFlatHook MakeCornerHookBase CornerHookDepth CutArcTerminal DeltaCutEnd VerticalCutExtension",
);
const insert = `
		create-forked-glyph 'pilcrow.verticalCut' : glyph-proc
			local stroke : dispiro
				widths.rhs sw
				flat RightSB CAP [heading Downward]
				curl RightSB (0 + SmallArchDepthA)
				HookEnd 0 (sw -- sw)
				g4 (SB - [VerticalCutExtension SHook sw]) SHook
			include : CutArcTerminal stroke SB CAP 0 sw true false
			include : VBar.m midbarX bulletBot CAP sw

		create-forked-glyph 'pilcrow.diagonalCut' : glyph-proc
			include : dispiro
				widths.rhs sw
				flat RightSB CAP [heading Downward]
				curl RightSB (0 + SmallArchDepthA)
				DeltaCutEnd Middle SB O (0.2 * SHook) sw
			include : VBar.m midbarX bulletBot CAP sw
`;
ptl = replaceOnce(ptl, "\n\tselect-variant 'pilcrow' 0xB6", `${insert}\n\tselect-variant 'pilcrow' 0xB6`);
const reverse = `
		create-forked-glyph 'revPilcrow.verticalCut' : glyph-proc
			include [refer-glyph 'pilcrow.verticalCut'] AS_BASE
			include : FlipAround Middle (CAP / 2) (-1) 1
		create-forked-glyph 'revPilcrow.diagonalCut' : glyph-proc
			include [refer-glyph 'pilcrow.diagonalCut'] AS_BASE
			include : FlipAround Middle (CAP / 2) (-1) 1
`;
ptl = replaceOnce(ptl, "\n\tselect-variant 'revPilcrow' 0x204B", `${reverse}\n\tselect-variant 'revPilcrow' 0x204B`);

const entries = `
[prime.pilcrow.variants.vertical-cut]
rank = 8
description = "Pilcrow sign (\`¶\`) with a vertical-cut terminal"
selector.pilcrow = "verticalCut"
selector.revPilcrow = "verticalCut"

[prime.pilcrow.variants.diagonal-cut]
rank = 9
description = "Pilcrow sign (\`¶\`) with a diagonal-cut terminal"
selector.pilcrow = "diagonalCut"
selector.revPilcrow = "diagonalCut"

`;
const toml = replaceOnce(oldToml, "[prime.partial-derivative]", `${entries}[prime.partial-derivative]`);
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
assert.equal(after.primes.get("pilcrow").variants.size, before.primes.get("pilcrow").variants.size + 2);
await fs.writeFile(ptlPath, ptl);
await fs.writeFile(tomlPath, toml);
console.log("Added pilcrow cuts and preserved all existing selector mappings.");
