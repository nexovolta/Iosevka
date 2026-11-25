import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import * as TOML from "@iarna/toml";

import { apply } from "../src/variant.mjs";

const data = TOML.parse(await readFile(new URL("../../../params/variants.toml", import.meta.url), "utf8"));
function resolve(upright, italic, e, isItalic = true) {
	const para = { slab: false, isItalic, isOblique: false };
	apply(data, para, {
		shape: { serifs: "sans" },
		variants: { design: { e }, upright: { a: upright }, oblique: { a: upright }, italic: { a: italic } },
	});
	return para.variantSelector;
}

test("forced double-storey a follows e's hook when both slopes use single-storey a", () => {
	for (const [e, hook] of [
		["flat-crossbar", ""],
		["flat-crossbar-flat-hooked", "HookFlat"],
		["flat-crossbar-corner-hooked", "HookCorner"],
		["flat-crossbar-vertical-cut", "HookVerticalCut"],
		["rounded-diagonal-cut", "HookDiagonalCut"],
	]) {
		for (const italic of [false, true]) {
			const selectors = resolve("single-storey-serifless", "single-storey-serifless", e, italic);
			assert.equal(selectors["a/doubleStorey"], `doubleStorey${hook}Serifless`);
			assert.equal(selectors["ae/a"], `doubleStorey${hook}Serifless`);
			assert.equal(selectors.aHalf, "doubleStoreySerifless");
		}
	}
});

test("a double-storey choice on either slope keeps its own hook", () => {
	const a = "double-storey-hook-corner-serifless";
	for (const [upright, italic] of [
		[a, "single-storey-serifless"],
		["single-storey-serifless", a],
	]) {
		const selectors = resolve(upright, italic, "flat-crossbar-vertical-cut");
		assert.equal(selectors["a/doubleStorey"], "doubleStoreyHookCornerSerifless");
		assert.equal(selectors["ae/a"], "doubleStoreyHookCornerSerifless");
	}
});

test("the forced hook uses the e selection of the current slope", () => {
	for (const [isItalic, hook] of [[false, "HookFlat"], [true, "HookDiagonalCut"]]) {
		const para = { slab: false, isItalic, isOblique: false };
		apply(data, para, {
			shape: { serifs: "sans" },
			variants: {
				upright: { a: "single-storey-serifless", e: "flat-crossbar-flat-hooked" },
				oblique: { a: "double-storey-hook-corner-serifless" },
				italic: { a: "single-storey-serifless", e: "rounded-diagonal-cut" },
			},
		});
		assert.equal(para.variantSelector["a/doubleStorey"], `doubleStorey${hook}Serifless`);
	}
});
