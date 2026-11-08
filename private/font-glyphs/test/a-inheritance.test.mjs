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
const variantData = read("variants");
const prime = Variant.parse(variantData).primes.get("a");
const components = ["ae/a", "ao/a", "au/a", "av/a", "ay/a", "cyrl/aye/a"];
const regular =
	"double-storey-hook-flat-bottom-cut-serifless-curved-bar-rising";
const italic = "single-storey-top-cut-tailed";
const points = [
	0x61, 0xe6, 0x1d02, 0xa733, 0xa735, 0xa737, 0xa739, 0xa73b, 0xa73d, 0xab31,
	0x250, 0x1df5a, 0x1df69, 0x1df6b,
];

await Geom.Init();

function build(
	weight,
	slope,
	design,
	italicDesign = design,
	noCvSs = true,
	otherVariants = {},
) {
	const argv = {
		shape: {
			serifs: "sans",
			spacing: "term",
			weight,
			width: 500,
			slope,
			slopeAngle: slope === "italic" ? 9.4 : 0,
		},
		featureControl: { noCvSs },
		variants: {
			design: {
				a: design,
				"capital-latin-gamma": "serifless",
				"latin-gamma": "serifless",
				...otherVariants,
			},
			italic: { a: italicDesign },
		},
	};
	const para = init(data, argv);
	Variant.apply(variantData, para, argv);
	const { glyphStore } = buildGlyphs(para, {
		blockIsNeeded: () => true,
		glyphIsNeeded: () => true,
	});
	return { para, glyphStore };
}

function contours(glyph) {
	return new Geom.SimplifyGeometry(
		glyph.geometry,
		glyph.gizmo,
		true,
	).toContours();
}

test("every a variant supplies complete forced-double and ligature selectors", () => {
	for (const variant of prime.variants.values()) {
		const expected = variant.selector["a/doubleStorey"];
		for (const component of components) {
			assert.equal(
				variant.selector[component],
				expected,
				`${variant.key}: ${component}`,
			);
		}
		if (/bar-(rising|falling)$/.test(variant.key)) {
			assert.equal(expected, variant.selector.a, variant.key);
			const slope = variant.selector.a.match(
				/(DiagonalBarFalling|DiagonalBar|CurvedBarRising|CurvedBarFalling)$/,
			)[1];
			assert.ok(
				variant.selector["a/sansSerif"].endsWith(slope),
				variant.key,
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
	test(`requested a family resolves and has finite outlines at ${weight} ${slope}`, () => {
		const { para, glyphStore } = build(weight, slope, regular, italic);
		const expected = prime.variants.get(regular).selector["a/doubleStorey"];
		assert.equal(
			para.variantSelector.a,
			prime.variants.get(slope === "italic" ? italic : regular).selector
				.a,
		);
		assert.equal(para.variantSelector["a/doubleStorey"], expected);
		assert.equal(
			para.variantSelector.aHalf,
			prime.variants.get(regular).selector.aHalf,
		);
		for (const component of components) {
			assert.equal(para.variantSelector[component], expected, component);
			const target = component === "cyrl/aye/a" ? "ae/a" : component;
			assert.ok(
				glyphStore.queryByName(`${target}.${expected}`),
				component,
			);
		}
		for (const cp of points) {
			const glyph = glyphStore.queryByUnicode(cp);
			assert.ok(glyph, cp.toString(16));
			const outline = contours(glyph);
			assert.ok(outline.length, cp.toString(16));
			for (const point of outline.flat()) {
				assert.ok(
					Number.isFinite(point.x) && Number.isFinite(point.y),
					cp.toString(16),
				);
			}
		}
		for (const [tail, base] of [
			["singleStoreyTopCutTailed", "singleStoreyTopCutSerifless"],
			["singleStoreyTailedSerifed", "singleStoreySerifless"],
			[
				"doubleStoreyHookFlatTailedCurvedBarRising",
				"doubleStoreyHookFlatSeriflessCurvedBarRising",
			],
		]) {
			const tailOutline = contours(
				glyphStore.queryByNameEnsured(`aSwash.${tail}`),
			);
			const baseOutline = contours(
				glyphStore.queryByNameEnsured(`aSwash.${base}`),
			);
			assert.deepEqual(tailOutline, baseOutline, tail);
			assert.equal(
				tailOutline.length,
				2,
				`${tail}: swash must join the body and preserve its counter`,
			);
		}
	});
}

test("ae keeps its independently selected e when inheriting a", () => {
	const { para, glyphStore } = build(420, "upright", regular, regular, true, {
		e: "rounded-flat-hooked",
		"lower-schwa": "diagonal-crossbar-falling-serif",
	});
	assert.deepEqual(
		contours(glyphStore.queryByNameEnsured("ae/e")),
		contours(
			glyphStore.queryByNameEnsured(`ae/e.${para.variantSelector.e}`),
		),
	);
});

test("a double-storey italic choice takes precedence over the upright choice", () => {
	const chosen =
		"double-storey-hook-corner-toothless-corner-curved-bar-falling";
	const { para } = build(420, "italic", regular, chosen);
	const expected = prime.variants.get(chosen).selector["a/doubleStorey"];
	assert.equal(para.variantSelector["a/doubleStorey"], expected);
	for (const component of components)
		assert.equal(para.variantSelector[component], expected);
});

for (const [weight, slope] of [
	[420, "upright"],
	[920, "italic"],
]) {
	test(`all double-storey component combinations have valid outlines at ${weight} ${slope}`, () => {
		const { glyphStore } = build(weight, slope, regular, italic);
		const suffixes = new Set(
			[...prime.variants.values()]
				.filter((v) => v.selector.a.startsWith("doubleStorey"))
				.map((v) => v.selector["a/doubleStorey"]),
		);
		for (const suffix of suffixes) {
			for (const component of [
				"ae/a",
				"ao/a",
				"au/a",
				"av/a",
				"ay/a",
				"aa",
			]) {
				const name = `${component}.${suffix}`;
				const outline = contours(glyphStore.queryByNameEnsured(name));
				assert.ok(outline.length, name);
				for (const point of outline.flat()) {
					assert.ok(
						Number.isFinite(point.x) && Number.isFinite(point.y),
						name,
					);
				}
			}
		}
	});
}
