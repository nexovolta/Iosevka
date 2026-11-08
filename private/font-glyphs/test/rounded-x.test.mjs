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
	test(`rounded X variants at ${weight} ${slope}`, () => {
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
					"capital-latin-gamma": "serifless",
					"latin-gamma": "serifless",
				},
			},
		};
		const para = init(data, argv);
		Variant.apply(variants, para, argv);
		const { glyphStore } = buildGlyphs(para, {
			blockIsNeeded: () => true,
			glyphIsNeeded: () => true,
		});
		for (const [primeName, codes] of [
			["x", [0x78, 0xab57, 0xab53]],
			["capital-x", [0x58, 0xa7b3]],
		]) {
			const prime = para.variants.primes.get(primeName);
			const keys = [...prime.variants.keys()].filter((key) =>
				key.startsWith("rounded-"),
			);
			for (const key of [
				"rounded-serifless",
				"rounded-serifed",
				"rounded-chancery",
			])
				assert.ok(keys.includes(key));
			for (const key of keys) {
				const variant = prime.variants.get(key);
				assert.ok(variant, `${primeName}: ${key}`);
				const minima = [];
				for (const code of codes) {
					const glyph = glyphStore.queryByUnicode(code);
					const name = variant.get(glyph);
					assert.ok(name, `${key}: U+${code.toString(16)}`);
					const target = glyphStore.queryByNameEnsured(name);
					const contours = target.geometry.toContours();
					assert.ok(
						contours.length && contours.every((c) => c.length >= 3),
						name,
					);
					assert.ok(
						contours
							.flat()
							.every(
								(p) =>
									Number.isFinite(p.x) &&
									Number.isFinite(p.y),
							),
						name,
					);
					assert.equal(target.advanceWidth, glyph.advanceWidth, name);
					minima.push(Math.min(...contours.flat().map((p) => p.y)));
				}
				for (const y of minima.slice(1))
					assert.ok(
						y < minima[0] - 50,
						`${primeName}: ${key} descender`,
					);
			}
			assert.ok(
				![...prime.variants.keys()].some((key) =>
					key.startsWith("rounded-chancery-"),
				),
				primeName,
			);
		}
	});
}
