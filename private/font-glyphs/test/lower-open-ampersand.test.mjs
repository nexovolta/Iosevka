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
const forms = [
	"flat-bottom",
	"toothed",
	"toothless-corner",
	"toothless-rounded",
];
await Geom.Init();

test("lower-open ampersand exposes tooth forms rather than arc hooks", () => {
	const choices = Variant.parse(variantData, {}).primes.get(
		"ampersand",
	).variants;
	const lowerOpen = [...choices.values()].filter((choice) =>
		choice.key.startsWith("lower-open"),
	);
	assert.deepEqual(
		new Set(lowerOpen.map((choice) => choice.key)),
		new Set(["lower-open", ...forms.map((form) => `lower-open-${form}`)]),
	);
	assert.equal(choices.get("lower-open").selector.ampersand, "lowerOpen");
	assert.equal(
		choices.get("lower-open-toothless-rounded").selector.ampersand,
		"lowerOpenToothlessRounded",
	);
});

test("flat-top ampersand exposes tooth forms without redundant hooks", () => {
	const choices = Variant.parse(variantData, {}).primes.get(
		"ampersand",
	).variants;
	for (const choice of choices.keys()) {
		assert.doesNotMatch(choice, /^flat-top-(?:flat|corner)-hooked/);
	}
	for (const form of forms) {
		for (const serif of ["", "-serifed"]) {
			assert.ok(
				choices.has(`flat-top-${form}${serif}`),
				`${form} ${serif}`,
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
	test(`lower-open ampersand tooth forms are connected at ${weight} ${slope}`, () => {
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
		const choices = para.variants.primes.get("ampersand").variants;
		const outline = (choice) => {
			const name = `ampersand.${choices.get(choice).selector.ampersand}`;
			const glyph = glyphStore.queryByNameEnsured(name);
			const contours = new Geom.SimplifyGeometry(
				glyph.geometry,
				glyph.gizmo,
				true,
			).toContours();
			assert.ok(
				contours.every(
					(c) =>
						c.length >= 3 &&
						c.every(
							(p) => Number.isFinite(p.x) && Number.isFinite(p.y),
						),
				),
				name,
			);
			const areas = contours.map((contour) =>
				contour.reduce((area, p, i) => {
					const q = contour[(i + 1) % contour.length];
					return area + p.x * q.y - q.x * p.y;
				}, 0),
			);
			const outer = areas.reduce(
				(a, b) => (Math.abs(a) > Math.abs(b) ? a : b),
				0,
			);
			assert.notEqual(outer, 0, `${name}: missing outer contour`);
			assert.equal(
				areas.filter((area) => area * outer > 0).length,
				1,
				`${name}: disconnected component`,
			);
			return contours;
		};
		const legacy = outline("lower-open");
		assert.deepEqual(outline("lower-open-toothless-rounded"), legacy);
		const shapes = forms.map((form) =>
			JSON.stringify(outline(`lower-open-${form}`)),
		);
		assert.equal(
			new Set(shapes).size,
			forms.length,
			"tooth forms must have distinct outlines",
		);
		for (const serif of ["", "-serifed"]) {
			const variants = forms.map((form) =>
				JSON.stringify(outline(`flat-top-${form}${serif}`)),
			);
			assert.equal(
				new Set(variants).size,
				forms.length,
				`flat-top${serif}: tooth forms must differ`,
			);
			outline(`flat-top${serif}`);
			outline(`flat-top-and-bottom${serif}`);
			for (const form of forms.filter((form) => form !== "flat-bottom")) {
				outline(`flat-top-and-bottom-${form}${serif}`);
			}
		}
	});
}
