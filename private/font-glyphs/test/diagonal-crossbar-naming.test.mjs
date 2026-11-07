import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import * as Toml from "@iarna/toml";
import * as Variant from "@iosevka/param/variant";

const data = Toml.parse(readFileSync(new URL("../../../params/variants.toml", import.meta.url), "utf8"));
const primes = Variant.parse(data).primes;

test("diagonal crossbars explicitly identify both directions", () => {
	let count = 0;
	for (const [primeName, prime] of primes) {
		for (const key of prime.variants.keys()) {
			if (!key.includes("diagonal-crossbar")) continue;
			count++;
			assert.doesNotMatch(key, /diagonal-crossbar(?!-(?:rising|falling)(?:-|$))/, `${primeName}.${key}`);
		}
	}
	assert.ok(count > 0);
});

test("rising and falling names preserve their ranks and selectors", () => {
	for (const [prime, prefix, selector, risingRank, fallingRank, risingShape, fallingShape] of [
		["capital-e", "", "E", 7, 8, "diagonalCrossbar", "diagonalCrossbarFalling"],
		["capital-g", "toothed-serifless-", "G", 4, 5, "toothedSeriflessDiagonalCrossbar", "toothedSeriflessDiagonalCrossbarFalling"],
		["e", "", "e", 7, 10, "diagonalCrossbar", "diagonalCrossbarFalling"],
		["cyrl-e", "", "cyrl/e", 18, 19, "seriflessDiagonalCrossbar", "seriflessDiagonalCrossbarFalling"],
		["cyrl-capital-e", "", "cyrl/E", 18, 19, "seriflessDiagonalCrossbar", "seriflessDiagonalCrossbarFalling"],
		["lower-o-bar", "", "oBar", 2, 3, "diagonalCrossbar", "diagonalCrossbarFalling"],
		["lower-schwa", "", "schwa", 9, 13, "diagonalCrossbar", "diagonalCrossbarFalling"],
	]) {
		for (const [direction, rank, shape] of [["rising", risingRank, risingShape], ["falling", fallingRank, fallingShape]]) {
			const key = `${prefix}diagonal-crossbar-${direction}`;
			const variant = primes.get(prime).variants.get(key);
			assert.ok(variant, `${prime}.${key}`);
			assert.equal(variant.rank, rank, `${prime}.${key}`);
			assert.equal(variant.selector[selector], shape, `${prime}.${key}`);
		}
	}
});
