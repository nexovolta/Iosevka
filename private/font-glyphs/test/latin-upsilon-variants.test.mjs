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
const read = (name) =>
	Toml.parse(readFileSync(path.join(paramsDir, `${name}.toml`), "utf8"));
const data = Object.assign(
	{},
	...["parameters", "shape-weight", "shape-width", "shape-slope"].map(read),
);
const variants = read("variants");
await Geom.Init();

for (const [weight, slope] of [
	[120, "upright"],
	[420, "upright"],
	[920, "upright"],
	[920, "italic"],
]) {
	test(`Latin upsilon serifed variants at ${weight} ${slope}`, () => {
		const argv = {
			shape: {
				serifs: "sans",
				spacing: "term",
				weight,
				width: 500,
				slope,
				slopeAngle: slope === "italic" ? 9.4 : 0,
			},
			featureControl: { noCvSs: false },
			variants: {
				design: {
					"capital-latin-upsilon": "serifed",
					"latin-upsilon": "serifed",
					"capital-latin-gamma": "serifless",
					"latin-gamma": "serifless",
				},
			},
		};
		const para = init(data, argv);
		Variant.apply(variants, para, argv);
		assert.equal(para.variantSelector["latn/Upsilon"], "serifed");
		assert.equal(para.variantSelector["latn/upsilon"], "serifed");
		const prime = para.variants.primes.get("capital-latin-upsilon");
		assert.deepEqual([...prime.variants.keys()], ["serifless", "serifed"]);
		const lowerPrime = para.variants.primes.get("latin-upsilon");
		assert.deepEqual([...lowerPrime.variants.keys()], ["serifless", "serifed"]);
		const { glyphStore } = buildGlyphs(para, {
			blockIsNeeded: () => true,
			glyphIsNeeded: () => true,
		});
		for (const [code, name] of [
			[0x1b1, "latn/Upsilon"],
			[0x28a, "latn/upsilon"],
		]) {
			const glyph = glyphStore.queryByUnicode(code);
			const serifed = glyphStore.queryByNameEnsured(`${name}.serifed`);
			const serifless = glyphStore.queryByNameEnsured(
				`${name}.serifless`,
			);
			assert.deepEqual(
				glyph.geometry.toContours(),
				serifed.geometry.toContours(),
			);
			assert.notDeepEqual(
				serifed.geometry.toContours(),
				serifless.geometry.toContours(),
			);
			assert.equal(serifed.advanceWidth, serifless.advanceWidth);
			assert.ok(
				serifed.geometry
					.toContours()
					.flat()
					.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
			);
		}

		test("Latin upsilon cases select serifs independently", () => {
			for (const [upper, lower] of [["serifed", "serifless"], ["serifless", "serifed"]]) {
				const argv = {
					shape: { serifs: "sans", spacing: "term", weight: 420, width: 500, slope: "upright", slopeAngle: 0 },
					featureControl: { noCvSs: false },
					variants: { design: { "capital-latin-upsilon": upper, "latin-upsilon": lower } },
				};
				const para = init(data, argv);
				Variant.apply(variants, para, argv);
				assert.equal(para.variantSelector["latn/Upsilon"], upper);
				assert.equal(para.variantSelector["latn/upsilon"], lower);
				assert.notEqual(
					para.variants.primes.get("capital-latin-upsilon").tag,
					para.variants.primes.get("latin-upsilon").tag,
				);
			}
		});
	});
}
