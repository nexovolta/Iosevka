import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

import * as TOML from "@iarna/toml";
import { parse } from "@iosevka/param/variant";

const sixPath = fileURLToPath(new URL("../../../packages/font-glyphs/src/number/6.ptl", import.meta.url));
const ethPath = fileURLToPath(new URL("../../../packages/font-glyphs/src/letter/latin-ext/lower-eth.ptl", import.meta.url));
const tomlPath = fileURLToPath(new URL("../../../params/variants.toml", import.meta.url));
const originalSix = await fs.readFile(sixPath, "utf8");
const originalEth = await fs.readFile(ethPath, "utf8");
const originalToml = await fs.readFile(tomlPath, "utf8");
if (originalSix.includes("SixBodyClosedVerticalCut")) throw new Error("Six cuts already exist.");

function replaceOnce(text, from, to) {
	const at = text.indexOf(from);
	if (at < 0 || text.indexOf(from, at + from.length) >= 0)
		throw new Error(`Expected exactly one occurrence of: ${from}`);
	return text.slice(0, at) + to + text.slice(at + from.length);
}
let six = replaceOnce(originalSix,
	"glyph-block-import Letter-Arc-Hook : Toothed MakeFlatHook CornerHookDepth CornerHookEnd",
	"glyph-block-import Letter-Arc-Hook : Toothed MakeFlatHook CornerHookDepth CornerHookEnd CutArcTerminal DeltaCutEnd VerticalCutExtension");
six = replaceOnce(six, "\tdefine [SixHookTerminal top inward] : if inward\n", "\tdefine [SixHookTerminal top inward cut] : if inward\n");
six = replaceOnce(six,
	"\t\tlist\n\t\t\tHookEnd top\n\t\t\tg4 (RightSB - OX) (top - Hook)\n",
	"\t\tif (cut === 2)\n" +
	"\t\t\tDeltaCutEnd Middle (RightSB - OX) (top + O) (top - 0.2 * Hook) Stroke\n" +
	"\t\t\tlist\n\t\t\t\tHookEnd top\n" +
	"\t\t\t\tg4 (RightSB - OX + [if (cut === 1) [VerticalCutExtension Hook Stroke] 0]) (top - Hook)\n");
six = replaceOnce(six,
	"[top oTop [vertical false] [inward false]] : glyph-proc\n\t\tinclude : dispiro",
	"[top oTop [vertical false] [inward false] [cut 0]] : glyph-proc\n\t\tlocal shape : dispiro");
six = replaceOnce(six,
	"\t\t\t\t\tSixHookTerminal top inward\n\t\tif inward : include",
	"\t\t\t\t\tSixHookTerminal top inward cut\n" +
	"\t\tinclude : if (cut === 1) [CutArcTerminal shape (RightSB - OX) top (2 * [Math.max (oTop + TINY) (top - Hook - Stroke)] - top) Stroke false true] shape\n" +
	"\t\tif inward : include");
six = replaceOnce(six,
	"[top [vertical false] [flatBowl false] [inward false] [oTop [SixBowlOTop top]]] : glyph-proc",
	"[top [vertical false] [flatBowl false] [inward false] [oTop [SixBowlOTop top]] [cut 0]] : glyph-proc");
six = replaceOnce(six,
	"SixClosedStemFromBowl top oTop (vertical -- vertical) (inward -- inward)",
	"SixClosedStemFromBowl top oTop (vertical -- vertical) (inward -- inward) (cut -- cut)");
const begin = "\t\tif [not flatBowl] : include : dispiro\n";
const from = six.indexOf(begin, six.indexOf("\tdefine [ClosedContourSixShape]"));
const end = six.indexOf("\n\t\tif (inward && [not flatBowl])", from);
if (from < 0 || end < 0) throw new Error("Cannot locate closed six bowl.");
let shape = six.slice(from + begin.length, end).replace(/^/gm, "\t");
shape = replaceOnce(shape, "SixHookTerminal top inward", "SixHookTerminal top inward cut");
six = six.slice(0, from) + "\t\tif [not flatBowl] : begin\n\t\t\tlocal shape : dispiro\n" + shape +
	"\n\t\t\tinclude : if (cut === 1) [CutArcTerminal shape (RightSB - OX) top (2 * [Math.max (oTop + TINY) (top - Hook - Stroke)] - top) Stroke false true] shape" + six.slice(end);
const insert = `
	define [SixBodyClosedVerticalCut fFlatBowl _top _oTop] : glyph-proc
		local top : fallback _top CAP
		include : ClosedContourSixShape top (flatBowl -- fFlatBowl) (oTop -- [fallback _oTop [SixBowlOTop top]]) (cut -- 1)
	define [SixBodyClosedDiagonalCut fFlatBowl _top _oTop] : glyph-proc
		local top : fallback _top CAP
		include : ClosedContourSixShape top (flatBowl -- fFlatBowl) (oTop -- [fallback _oTop [SixBowlOTop top]]) (cut -- 2)
`;
six = replaceOnce(six, "\n\tglyph-block-export SixConfig", `${insert}\n\tglyph-block-export SixConfig`);
six = replaceOnce(six,
	"\t\t\tclosedCornerHook   SixBodyClosedCornerHook\n",
	"\t\t\tclosedCornerHook   SixBodyClosedCornerHook\n\t\t\tclosedVerticalCut  SixBodyClosedVerticalCut\n\t\t\tclosedDiagonalCut  SixBodyClosedDiagonalCut\n");
let eth = replaceOnce(originalEth,
	"\tselect-variant 'eth' 0xF0\n",
	"\tselect-variant 'eth' 0xF0\n\tselect-variant 'eth/palatalBase' (shapeFrom -- 'eth')\n");
eth = replaceOnce(eth, "derive-composites 'ethPalatalHook' 0x1DF2F 'eth'", "derive-composites 'ethPalatalHook' 0x1DF2F 'eth/palatalBase'");

const before = parse(TOML.parse(originalToml));
let toml = originalToml;
const cuts = [["closed-vertical-cut", "closedVerticalCut"], ["closed-diagonal-cut", "closedDiagonalCut"]];
for (const [name, selector] of [["six", "six"], ["nine", "nine"], ["lower-eth", "eth"], ["partial-derivative", "partial"]]) {
	const prime = before.primes.get(name);
	const start = toml.indexOf(`[prime.${name}.variants-buildup]`);
	const rest = toml.slice(start);
	const next = rest.slice(1).search(/\n\[prime\.[^.]+\]/);
	if (start < 0 || next < 0) throw new Error(`Cannot locate ${name} stages.`);
	const endSection = start + 1 + next;
	let section = toml.slice(start, endSection);
	if (name === "lower-eth") {
		for (const line of section.match(/^selectorAffix\.eth = .+$/gm) || []) {
			const value = line.slice("selectorAffix.eth = ".length);
			section = replaceOnce(section, line, `${line}\nselectorAffix."eth/palatalBase" = ${value}`);
		}
	}
	const added = cuts.map(([key, suffix], i) =>
		`[prime.${name}.variants-buildup.stages.body.${key}]\nrank = ${11 + i}\ndescriptionAffix = "${key} terminal"\nselectorAffix.${selector} = "${suffix}"\n` +
		(name === "lower-eth" ? 'selectorAffix."eth/palatalBase" = "closedContour"\n' : "") + "\n").join("");
	section = replaceOnce(section, `[prime.${name}.variants-buildup.stages.bowl."*"]`, `${added}[prime.${name}.variants-buildup.stages.bowl."*"]`);
	let nextRank = Math.max(...[...prime.variants.values()].map(v => v.rank)) + 1;
	const stages = TOML.parse(section).prime[name]["variants-buildup"].stages.body;
	for (const bowl of ["round", "flat-bowl"]) {
		const bodyMap = [];
		for (const body of Object.keys(stages).filter(key => key !== "*")) {
			if (body === "curly-bar" && bowl === "flat-bowl") continue;
			const key = `${body}${bowl === "flat-bowl" ? "-flat-bowl" : ""}`;
			const old = prime.variants.get(key);
			bodyMap.push(`${JSON.stringify(body)} = ${old ? old.rank : nextRank++}`);
		}
		const marker = `[prime.${name}.variants-buildup.stages.bowl.${bowl}]\n`;
		section = replaceOnce(section, marker, `${marker}variantRank = { body = { ${bodyMap.join(", ")} } }\n`);
	}
	toml = toml.slice(0, start) + section + toml.slice(endSection);
}
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
		const selector = { ...actual.selector };
		if (name === "lower-eth") {
			assert.equal(selector["eth/palatalBase"], variant.selector.eth, key);
			delete selector["eth/palatalBase"];
		}
		assert.deepEqual(selector, variant.selector, `${name}.${key}`);
	}
	if (["six", "nine", "lower-eth", "partial-derivative"].includes(name))
		assert.equal(current.variants.size, oldPrime.variants.size + 4, name);
}
await fs.writeFile(sixPath, six);
await fs.writeFile(ethPath, eth);
await fs.writeFile(tomlPath, toml);
console.log("Added six-family cuts while protecting the palatal-hook eth base.");
