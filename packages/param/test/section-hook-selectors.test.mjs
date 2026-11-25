import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import * as Toml from "@iarna/toml";
import { parse } from "../src/variant.mjs";

test("section sign exposes independent top and bottom hook selectors", () => {
	const data = Toml.parse(readFileSync(new URL("../../../params/variants.toml", import.meta.url), "utf8"));
	const variants = parse(data).primes.get("section").variants;
	const hooks = ["serifless", "serifed", "inwardSerifed", "flatHook", "cornerHook"];

	assert.equal(variants.size, hooks.length ** 2);
	for (const topHook of hooks) {
		for (const bottomHook of hooks) {
			const matches = [...variants.values()].filter(
				variant =>
					variant.selector["section/topHook"] === topHook &&
					variant.selector["section/bottomHook"] === bottomHook,
			);
			assert.equal(matches.length, 1, `${topHook} top, ${bottomHook} bottom`);
		}
	}
});
