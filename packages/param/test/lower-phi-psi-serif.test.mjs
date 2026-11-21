import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import * as Toml from "@iarna/toml";
import { parse } from "../src/variant.mjs";

test("lower phi and psi expose top serif combinations without changing existing ranks", () => {
	const data = Toml.parse(readFileSync(new URL("../../../params/variants.toml", import.meta.url), "utf8"));
	const { primes } = parse(data);
	const phi = primes.get("lower-phi").variants;
	const psi = primes.get("lower-psi").variants;

	for (const [height, suffix, rank] of [["", "", 1], ["short-neck-", "ShortNeck", 3], ["shorter-neck-", "ShorterNeck", 5]]) {
		for (const [serif, suffixSerif, delta] of [["", "", 0], ["base-serifed", "BaseSerifed", 1], ["top-serifed", "TopSerifed", null], ["top-base-serifed", "TopBaseSerifed", null]]) {
			const key = ["straight", height.replace(/-$/, ""), serif].filter(Boolean).join("-");
			const variant = phi.get(key);
			assert.ok(variant, key);
			assert.equal(variant.selector["grek/phi"], `straight${suffix}${suffixSerif}`);
			assert.equal(variant.selector["grek/phiSymbol"], `straight${suffix}${suffixSerif}`);
			if (delta !== null) assert.equal(variant.rank, rank + delta);
		}
	}
	for (const [body, suffix, rank] of [["neo-hellenic", "neohellenic", 7], ["cursive", "cursive", 9]]) {
		for (const [serif, stem, symbol, delta] of [
			["", "", "", 0], ["-base-serifed", "BaseSerifed", "BaseSerifed", 1],
			["-top-serifed", "", "TopSerifed", null], ["-top-base-serifed", "BaseSerifed", "TopBaseSerifed", null],
		]) {
			const variant = phi.get(body + serif);
			assert.ok(variant, body + serif);
			assert.equal(variant.selector["grek/phi"], suffix + stem);
			assert.equal(variant.selector["grek/phiSymbol"], `straight${symbol}`);
			if (delta !== null) assert.equal(variant.rank, rank + delta);
		}
	}
	const serifTypes = [
		["serifless", "Serifless", "Serifless"], ["left-serifed", "LeftSerifed", "LeftSerifed"],
		["base-serifed", "BaseSerifed", "BaseSerifed"], ["left-base-serifed", "LeftBaseSerifed", "LeftBaseSerifed"],
		["top-serifed", "TopSerifed", "Serifless"], ["top-left-serifed", "TopLeftSerifed", "LeftSerifed"],
		["top-base-serifed", "TopBaseSerifed", "BaseSerifed"], ["top-left-base-serifed", "TopLeftBaseSerifed", "LeftBaseSerifed"],
	];
	for (const [height, suffix, rank] of [["", "", 1], ["short-neck-", "shortNeck", 4], ["shorter-neck-", "shorterNeck", 7], ["flat-top-", "flatTop", 10]]) {
		for (const [index, [serif, glyph, noAscend]] of serifTypes.entries()) {
			const key = height + serif;
			const variant = psi.get(key);
			if (height === "flat-top-" && index >= 4) {
				assert.equal(variant, undefined, key);
				continue;
			}
			assert.ok(variant, key);
			const expected = suffix ? `${suffix}${glyph}` : glyph[0].toLowerCase() + glyph.slice(1);
			assert.equal(variant.selector["grek/psi"], expected);
			assert.equal(variant.selector["grek/psi/sansSerif"], suffix ? `${suffix}Serifless` : "serifless");
			assert.equal(variant.selector["grek/psi/noAscend"], `flatTop${noAscend}`);
			if (index < 3) assert.equal(variant.rank, rank + index);
		}
		assert.equal(psi.has(`${height}serifed`), false);
	}
	for (const composite of [data.default, ...Object.values(data.composite)]) {
		if (composite["lower-psi"]) assert.ok(psi.has(composite["lower-psi"]), composite["lower-psi"]);
	}
});
