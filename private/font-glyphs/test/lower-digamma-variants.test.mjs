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
const choices = [
	"flat-top",
	"flat-top-bend",
	"flat-top-upturn",
	"toothless-corner",
	"toothless-rounded",
];
await Geom.Init();

test("lower digamma exposes exactly five variants and retains existing CV ranks", () => {
	const prime = Variant.parse(variantData, {}).primes.get("lower-digamma");
	assert.deepEqual([...prime.variants.keys()], choices);
	assert.equal(prime.variants.get("flat-top").rank, 1);
	assert.equal(prime.variants.get("toothless-corner").rank, 2);
	assert.equal(prime.variants.get("toothless-rounded").rank, 3);
	assert.equal(variantData.default.design["lower-digamma"], "flat-top");
});

for (const [weight, slope] of [
	[120, "upright"],
	[120, "italic"],
	[420, "upright"],
	[420, "italic"],
	[920, "upright"],
	[920, "italic"],
]) {
	test(`lower digamma constructions at ${weight} ${slope}`, () => {
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
		const prime = para.variants.primes.get("lower-digamma");
		const outlines = new Set();
		const simplified = (glyph) =>
			new Geom.SimplifyGeometry(
				glyph.geometry,
				glyph.gizmo,
				true,
			).toContours();
		let advance;
		for (const choice of choices) {
			const name = `grek/digamma.${prime.variants.get(choice).selector["grek/digamma"]}`;
			const glyph = glyphStore.queryByNameEnsured(name);
			const contours = simplified(glyph);
			assert.equal(
				contours.length,
				1,
				`${name}: disconnected parts or counters`,
			);
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
			const points = contours.flat();
			assert.ok(
				Math.min(...points.map((p) => p.y)) < -1,
				`${name}: missing descender`,
			);
			if (advance === undefined) advance = glyph.advanceWidth;
			assert.equal(
				glyph.advanceWidth,
				advance,
				`${name}: advance width differs`,
			);
			outlines.add(JSON.stringify(contours));
		}
		assert.equal(outlines.size, 5);
		const flatTopContours = glyphStore
			.queryByNameEnsured("grek/digamma.flatTop")
			.geometry.toContours();
		const flatTopBar = flatTopContours[flatTopContours.length - 1];
		const barY = (contour) =>
			contour.reduce((sum, point) => sum + point.y, 0) / contour.length;
		for (const [choice, source] of [
			["flat-top-bend", "rLongLeg.flatTopSerifless"],
			["toothless-rounded", "rLongLeg.earlessRoundedSerifless"],
			["toothless-corner", "rLongLeg.earlessCornerSerifless"],
		]) {
			const glyph = glyphStore.queryByNameEnsured(
				`grek/digamma.${prime.variants.get(choice).selector["grek/digamma"]}`,
			);
			const body = glyphStore.queryByNameEnsured(source);
			const raw = glyph.geometry.toContours();
			const original = body.geometry.toContours();
			assert.ok(
				original.every((contour) =>
					raw.some(
						(candidate) =>
							JSON.stringify(candidate) ===
							JSON.stringify(contour),
					),
				),
				`${choice}: r body changed`,
			);
			assert.ok(
				raw.length > original.length,
				`${choice}: middle bar is missing`,
			);
			assert.ok(
				barY(raw[raw.length - 1]) < barY(flatTopBar),
				`${choice}: middle bar must sit lower than the flat-top bar`,
			);
		}
		const top = (name) =>
			Math.max(
				...simplified(glyphStore.queryByNameEnsured(name))
					.flat()
					.map((p) => p.y),
			);
		assert.ok(
			top("grek/digamma.flatTopUpturn") > top("grek/digamma.flatTop"),
			"upturn must extend above the flat top",
		);
	});
}

test("build-plan choices select digamma without changing other glyphs when CVs are disabled", () => {
	let baseline;
	for (const choice of choices) {
		const argv = {
			shape: {
				serifs: "sans",
				spacing: "term",
				weight: 420,
				width: 500,
				slope: "italic",
				slopeAngle: 9.4,
			},
			featureControl: { noCvSs: true },
			variants: {
				design: {
					"capital-latin-gamma": "serifless",
					"latin-gamma": "serifless",
					"lower-digamma": choice,
				},
			},
		};
		const para = init(data, argv);
		Variant.apply(variantData, para, argv);
		const { glyphStore } = buildGlyphs(para, {
			blockIsNeeded: () => true,
			glyphIsNeeded: () => true,
		});
		const contours = (glyph) =>
			new Geom.SimplifyGeometry(
				glyph.geometry,
				glyph.gizmo,
				true,
			).toContours();
		const selected = glyphStore.queryByUnicode(0x3dd);
		const suffix = para.variants.primes
			.get("lower-digamma")
			.variants.get(choice).selector["grek/digamma"];
		assert.deepEqual(
			contours(selected),
			contours(glyphStore.queryByNameEnsured(`grek/digamma.${suffix}`)),
			choice,
		);
		const others = [0x72, 0x491, 0x3dc].map((cp) =>
			contours(glyphStore.queryByUnicode(cp)),
		);
		if (!baseline) baseline = others;
		else
			assert.deepEqual(
				others,
				baseline,
				`${choice}: unrelated glyphs changed`,
			);
	}
});
