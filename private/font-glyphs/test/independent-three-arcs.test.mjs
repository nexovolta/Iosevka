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
const variantData = readParams("variants");
const arcs = [
	"rounded",
	"flat-hooked",
	"corner-hooked",
	"inward-serifed",
	"serifed-hooked",
];
await Geom.Init();

test("rounded three has independent top and bottom arcs", () => {
	const choices = Variant.parse(variantData, {}).primes.get("three").variants;
	assert.equal(choices.size, 41);
	for (const top of arcs)
		for (const bottom of arcs) {
			const key = top === bottom ? top : `top-${top}-bottom-${bottom}`;
			assert.ok(choices.has(key), key);
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
	test(`three arc combinations generate valid ${weight} ${slope} outlines`, () => {
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
		Variant.apply(variantData, para, argv);
		const { glyphStore } = buildGlyphs(para, {
			blockIsNeeded: () => true,
			glyphIsNeeded: () => true,
		});
		const choices = para.variants.primes.get("three").variants;
		for (const variant of choices.values()) {
			for (const style of ["lnum", "onum"]) {
				const name = `three.${style}.${variant.selector.three}`;
				const contours = glyphStore
					.queryByNameEnsured(name)
					.geometry.toContours();
				assert.ok(contours.length, `${name}: empty`);
				assert.ok(
					contours.every(
						(c) =>
							c.length >= 3 &&
							c.every(
								(p) =>
									Number.isFinite(p.x) &&
									Number.isFinite(p.y),
							),
					),
					name,
				);
			}
		}
	});
}
