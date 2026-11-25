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

test("variant ranks can depend on multiple earlier stages", () => {
	const rank = { top: { a: { bottom: { b: 17 } } } };
	const data = {
		default: {},
		prime: {
			fixture: {
				"variants-buildup": {
					entry: "top",
					stages: {
						top: { a: { next: "bottom" } },
						bottom: { b: { next: "end" } },
						end: { x: { next: "END", variantRank: rank } },
					},
				},
			},
		},
	};
	assert.equal(parse(data).primes.get("fixture").variants.get("a-b-x").rank, 17);
	rank.top.a.bottom.b = 0;
	assert.throws(() => parse(data), /Missing variant rank for bottom.b/);
	delete rank.top.a.bottom.b;
	assert.throws(() => parse(data), /Missing variant rank for bottom.b/);
});

test("Cyrillic capital E overflow variants resolve through their assigned feature", () => {
	const data = Toml.parse(readFileSync(new URL("../../../params/variants.toml", import.meta.url), "utf8"));
	const parsed = parse(data);
	const prime = parsed.primes.get("cyrl-capital-e");
	const variants = [...prime.variants.values()].filter(variant => variant.tag === prime.overflowTag);
	assert.ok(variants.length);
	const ranks = new Set();
	for (const variant of variants) {
		assert.ok(variant.rank >= 1 && variant.rank <= 255, variant.key);
		assert.ok(!ranks.has(variant.rank), variant.key);
		ranks.add(variant.rank);
		assert.equal(parsed.selectorTree.get(variant.tag, variant.rank)[1], variant);
	}
});
