import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import * as Toml from "@iarna/toml";
import { parse } from "../src/variant.mjs";

test("Greek capital Theta exposes centered serif variants for both diagonal directions", () => {
	const data = Toml.parse(readFileSync(new URL("../../../params/variants.toml", import.meta.url), "utf8"));
	const theta = parse(data).primes.get("capital-theta").variants;
	const variants = [
		["serifless", "serifless", 1],
		["serifed", "serifed", 2],
		["diagonal-crossbar-rising", "diagonalCrossbar", 3],
		["diagonal-crossbar-falling", "diagonalCrossbarFalling", 4],
		["diagonal-crossbar-rising-middle-serifed", "diagonalCrossbarMiddleSerifed", 5],
		["diagonal-crossbar-falling-middle-serifed", "diagonalCrossbarFallingMiddleSerifed", 6],
	];

	for (const [key, selector, rank] of variants) {
		const variant = theta.get(key);
		assert.ok(variant, key);
		assert.equal(variant.selector["grek/Theta"], selector);
		assert.equal(variant.rank, rank);
	}
});
