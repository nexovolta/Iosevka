import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as Toml from "@iarna/toml";
import { buildGlyphs } from "@iosevka/font-glyphs";
import * as Geom from "@iosevka/geometry";
import { init } from "@iosevka/param";
import * as Variant from "@iosevka/param/variant";

const paramsDir = fileURLToPath(new URL("../../../params/", import.meta.url));
const read = name => Toml.parse(readFileSync(path.join(paramsDir, `${name}.toml`), "utf8"));
const data = Object.assign({}, ...["parameters", "shape-weight", "shape-width", "shape-slope"].map(read));
const variants = read("variants");
const shape = { serifs: "sans", spacing: "term", weight: 420, width: 500, slope: "upright", slopeAngle: 0 };
const hooks = ["serifless", "flat-hooked", "corner-hooked", "inward-serifed", "serifed"];
const cyrillicKeys = hooks.flatMap(hook => hook === "serifless"
	? ["serifless", "base-serifed"]
	: [`${hook}-serifless`, `${hook}-base-serifed`]);

test("koppa selectors are independent and preserve existing feature tags", () => {
	const oldData = structuredClone(variants);
	delete oldData.prime["capital-qoppa"];
	delete oldData.prime["cyrl-capital-koppa"];
	const oldPrimes = Variant.parse(oldData, {}).primes;
	const primes = Variant.parse(variants, {}).primes;
	for (const [key, prime] of oldPrimes) assert.equal(primes.get(key).tag, prime.tag, key);
	for (const key of ["cyrl-koppa", "cyrl-capital-koppa"]) {
		const prime = primes.get(key);
		assert.deepEqual([...prime.variants.keys()], cyrillicKeys);
		assert.deepEqual([...prime.variants.values()].map(v => v.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
	}
	const argv = {
		shape,
		featureControl: { noCvSs: true },
		variants: { design: {
			"qoppa": "serifless",
			"capital-qoppa": "base-serifed",
			"cyrl-koppa": "corner-hooked-serifless",
			"cyrl-capital-koppa": "flat-hooked-base-serifed",
		} },
	};
	const para = init(data, argv);
	Variant.apply(variants, para, argv);
	assert.equal(para.variantSelector["grek/qoppa"], "serifless");
	assert.equal(para.variantSelector["grek/Qoppa"], "baseSerifed");
	assert.equal(para.variantSelector["cyrl/koppa"], "cornerHook");
	assert.equal(para.variantSelector["cyrl/Koppa"], "flatHookBaseSerifed");
});

test("each koppa alternate resolves to a distinct glyph of the correct case", async () => {
	await Geom.Init();
	const argv = {
		shape,
		featureControl: { noCvSs: false },
		variants: { design: { "capital-latin-gamma": "serifless", "latin-gamma": "serifless" } },
	};
	const para = init(data, argv);
	Variant.apply(variants, para, argv);
	const { glyphStore } = buildGlyphs(para, { blockIsNeeded: () => true, glyphIsNeeded: () => true });
	for (const [key, code] of [
		["qoppa", 0x3d9], ["capital-qoppa", 0x3d8],
		["cyrl-koppa", 0x481], ["cyrl-capital-koppa", 0x480],
	]) {
		const prime = para.variants.primes.get(key);
		const glyph = glyphStore.queryByUnicode(code);
		const shapes = [];
		for (const variant of prime.variants.values()) {
			const name = variant.get(glyph);
			assert.ok(name, `${key}: ${variant.key}`);
			const target = glyphStore.queryByNameEnsured(name);
			const contours = target.geometry.toContours();
			assert.ok(contours.length && contours.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), name);
			assert.equal(target.advanceWidth, glyph.advanceWidth, name);
			for (const previous of shapes) assert.notDeepEqual(contours, previous, `${key}: ${variant.key}`);
			shapes.push(contours);
		}
	}
});
