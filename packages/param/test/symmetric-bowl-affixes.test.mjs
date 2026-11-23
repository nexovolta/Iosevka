import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import * as Toml from "@iarna/toml";
import { parse } from "../src/variant.mjs";

test("lower beta and Cyrillic ve keep symmetric bowls without a variant-key affix", () => {
	const data = Toml.parse(readFileSync(new URL("../../../params/variants.toml", import.meta.url), "utf8"));
	const { primes } = parse(data);
	const cases = [
		{
			prime: "lower-beta",
			symmetric: "cursive-closed",
			asymmetric: ["cursive-closed-big-bottom-bowl", "cursive-closed-big-top-bowl"],
			selectors: ["grek/beta", "latn/beta"],
		},
		{
			prime: "cyrl-ve",
			symmetric: "earless-rounded-toothless-rounded-closed-short",
			asymmetric: [
				"earless-rounded-toothless-rounded-closed-big-bottom-bowl-short",
				"earless-rounded-toothless-rounded-closed-big-top-bowl-short",
			],
			selectors: ["cyrl/ve", "cyrl/ve.BGR"],
		},
	];

	for (const { prime: primeName, symmetric, asymmetric, selectors } of cases) {
		const variants = primes.get(primeName).variants;
		assert.ok(variants.has(symmetric), `${primeName}.${symmetric} was removed`);
		assert.ok(
			selectors.every(selector => variants.get(symmetric).selector[selector].includes("SymmetricBowls")),
			`${primeName}.${symmetric} no longer selects symmetric bowls`,
		);
		assert.ok(
			asymmetric.every(key => variants.has(key)),
			`${primeName} lost an asymmetric bowl variant`,
		);
		assert.ok(
			![...variants.keys()].some(key => key.includes("symmetric-bowls")),
			`${primeName} still includes the symmetric-bowls key affix`,
		);
	}
});
