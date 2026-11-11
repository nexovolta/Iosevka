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
const readParams = (name) =>
	Toml.parse(readFileSync(path.join(paramsDir, `${name}.toml`), "utf8"));
const data = Object.assign(
	{},
	...["parameters", "shape-weight", "shape-width", "shape-slope"].map(
		readParams,
	),
);
const variants = readParams("variants");
await Geom.Init();

test("corner-hooked f uses only the fi/ffi terminal as the i tittle", () => {
	const prime = Variant.parse(variants, {}).primes.get("f");
	for (const variant of prime.variants.values()) {
		if (!variant.key.startsWith("corner-hooked")) continue;
		assert.ok(
			variant.selector["f/compLigLeft1"].startsWith("cornerHookCLC1"),
		);
		for (const n of [2, 3, 4]) {
			assert.ok(
				variant.selector[`f/compLigLeft${n}`].startsWith(
					`flatHookCLC${n}`,
				),
			);
		}
	}
});

for (const [weight, slope] of [
	[120, "upright"],
	[120, "italic"],
	[420, "upright"],
	[420, "italic"],
	[920, "upright"],
	[920, "italic"],
]) {
	test(`corner-hooked f has a flat bottom hook and generates ligature components at ${weight} ${slope}`, () => {
		const argv = {
			shape: {
				serifs: "sans",
				spacing: "term",
				weight,
				width: 500,
				slope,
				slopeAngle: slope === "italic" ? 9.4 : 0,
			},
			featureControl: { noCvSs: true },
			variants: {
				design: {
					"capital-latin-gamma": "serifless",
					"latin-gamma": "serifless",
					f: "corner-hooked-tailed",
				},
			},
		};
		const para = init(data, argv);
		Variant.apply(variants, para, argv);
		const { glyphStore } = buildGlyphs(para, {
			blockIsNeeded: () => true,
			glyphIsNeeded: () => true,
		});
		const belowBaseline = (name) =>
			glyphStore
				.queryByNameEnsured(name)
				.geometry.toContours()
				.flat()
				.filter((p) => p.y < -1)
				.map((p) => [p.x, p.y]);
		assert.deepEqual(
			belowBaseline("f.cornerHookTailed"),
			belowBaseline("f.flatHookTailed"),
		);
		const tailPoints = (name) =>
			belowBaseline(name).filter(([, y]) => y < -100);
		for (const tail of ["Tailed", "DiagonalTailed"]) {
			for (const serif of [
				"Serifless",
				"MiddleSerifed",
				"MiddleSerifedXH",
				"MiddleSerifedHalfAscender",
			]) {
				for (const prefix of ["longs", "longsBar"]) {
					assert.deepEqual(
						tailPoints(`${prefix}.cornerHook${tail}${serif}`),
						tailPoints(`${prefix}.flatHook${tail}${serif}`),
						`${prefix} ${tail} ${serif}: bottom hook differs`,
					);
				}
			}
		}
		for (const tail of ["Descending", "Tailed", "DiagonalTailed"]) {
			assert.deepEqual(
				tailPoints(`eszet.traditionalCornerHook${tail}Serifless`),
				tailPoints(`eszet.traditionalFlatHook${tail}Serifless`),
				`eszett ${tail}: top hook affects bottom`,
			);
		}
		for (const name of [
			"f",
			"f/compLigLeft1",
			"f/compLigLeft2",
			"f/compLigLeft3",
			"f/compLigLeft4",
		]) {
			const glyph = glyphStore.queryByNameEnsured(name);
			const contours = glyph.geometry.toContours();
			assert.ok(contours.length, `${name} is empty`);
			assert.ok(
				contours.every(
					(c) =>
						c.length >= 3 &&
						c.every(
							(p) => Number.isFinite(p.x) && Number.isFinite(p.y),
						),
				),
			);
		}
	});
}
