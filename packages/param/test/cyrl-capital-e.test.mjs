import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import * as Toml from "@iarna/toml";
import { parse } from "../src/variant.mjs";

test("Cyrillic capital E and Ukrainian Ye combine both terminals with a serifed crossbar", () => {
	const data = Toml.parse(readFileSync(new URL("../../../params/variants.toml", import.meta.url), "utf8"));
	const prime = parse(data).primes.get("cyrl-capital-e");
	const terminals = [
		["rounded", "Rounded"], ["serifed", "Serifed"],
		["inward-serifed", "InwardSerifed"], ["flat-hooked", "FlatHook"],
		["corner-hooked", "CornerHook"],
	];
	const bars = [
		["", ""], ["diagonal-crossbar-rising-", "DiagonalCrossbar"],
		["diagonal-crossbar-falling-", "DiagonalCrossbarFalling"],
	];
	for (const [prefix, barSuffix] of bars) for (const [top, topSuffix] of terminals) {
		for (const [bottom, bottomSuffix] of terminals) {
			const key = `${prefix}top-${top}-bottom-${bottom}`;
			const plain = prime.variants.get(key);
			const capped = prime.variants.get(`${key}-middle-serifed`);
			assert.ok(plain && capped, key);
			for (const selector of ["cyrl/E", "cyrl/YeUkrainian"]) {
				assert.equal(plain.selector[selector], `top${topSuffix}Bottom${bottomSuffix}${barSuffix}`);
				assert.equal(capped.selector[selector], `top${topSuffix}Bottom${bottomSuffix}Capped${barSuffix}`);
				assert.equal(capped.selector[`${selector}/topSerif`], plain.selector[`${selector}/topSerif`]);
			}
			assert.equal(capped.selector["currency/euroSign"], plain.selector["currency/euroSign"]);
			assert.equal(capped.rank, plain.rank + 75);
		}
	}
});
