import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import * as Toml from "@iarna/toml";

import { parse } from "../src/variant.mjs";

test("ampersand tooth variants preserve existing ranks and expose each new terminal", () => {
	const data = Toml.parse(
		readFileSync(new URL("../../../params/variants.toml", import.meta.url), "utf8"),
	);
	const variants = parse(data).primes.get("ampersand").variants;
	for (const [key, rank] of [
		["lower-open-toothed", 11],
		["et-toothed", 28],
		["et-tailed", 29],
		["et-flat-bottom", 30],
	]) {
		assert.equal(variants.get(key)?.rank, rank, key);
	}

	for (const [body, selector, tops] of [
		["lower-open", "lowerOpen", [["", ""]]],
		[
			"flat-top",
			"flatTop",
			[
				["-serifless", "Serifless"],
				["-serifed", "Serifed"],
			],
		],
		[
			"flat-top-and-bottom",
			"flatTopAndBottom",
			[
				["-serifless", "Serifless"],
				["-serifed", "Serifed"],
			],
		],
		["et", "et", [["", ""]]],
		["et-serifed", "etSerifed", [["", ""]]],
		["et-inward-serifed", "etInwardSerifed", [["", ""]]],
		["et-flat-hooked", "etFlatHook", [["", ""]]],
		["et-corner-hooked", "etCornerHook", [["", ""]]],
		["closed-et", "closedEt", [["", ""]]],
		["upper-open-et", "upperOpenEt", [["", ""]]],
		["upper-open-et-serifed", "upperOpenEtSerifed", [["", ""]]],
		["upper-open-et-inward-serifed", "upperOpenEtInwardSerifed", [["", ""]]],
		["upper-open-et-flat-hooked", "upperOpenEtFlatHook", [["", ""]]],
		["upper-open-et-corner-hooked", "upperOpenEtCornerHook", [["", ""]]],
	]) {
		for (const [terminal, suffix] of [
			["bottom-cut", "BottomCut"],
			[
				"toothed-tailed",
				body.includes("et") && !body.startsWith("flat-") ? "Tailed" : "ToothedTailed",
			],
			["flat-bottom-serifed", "FlatBottomSerifed"],
		]) {
			for (const [keyTop, selectorTop] of tops) {
				const key = `${body}-${terminal}${keyTop}`;
				assert.equal(
					variants.get(key)?.selector.ampersand,
					`${selector}${suffix}${selectorTop}`,
					key,
				);
				assert.ok(variants.get(key).rank > 90, key);
			}
		}
	}
});
