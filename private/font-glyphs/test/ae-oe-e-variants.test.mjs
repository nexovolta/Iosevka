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
const eVariants = [
	...Variant.parse(variantData, {}).primes.get("e").variants.values(),
];
const filter = {
	blockIsNeeded: () => true,
	glyphIsNeeded: () => true,
};

await Geom.Init();

function build(design, weight, slope, enableCvSs) {
	const argv = {
		shape: {
			serifs: "sans",
			spacing: "term",
			weight,
			width: 500,
			slope,
			slopeAngle: slope === "italic" ? 9.4 : 0,
		},
		featureControl: { noCvSs: !enableCvSs },
		variants: {
			design: {
				"capital-latin-gamma": "serifless",
				"latin-gamma": "serifless",
				...design,
			},
		},
	};
	const para = init(data, argv);
	Variant.apply(variantData, para, argv);
	return { para, glyphStore: buildGlyphs(para, filter).glyphStore };
}

function dependencies(glyph) {
	return glyph.geometry.getDependencies().map((g) => g.identifier);
}

test("all lowercase e designs select the corresponding ae and oe components independently of schwa", () => {
	assert.equal(eVariants.length, 12);
	for (const [index, variant] of eVariants.entries()) {
		const weight = [120, 420, 920][index % 3];
		const slope = index % 2 ? "italic" : "upright";
		const schwa =
			index % 2
				? "rounded-serif"
				: "diagonal-crossbar-falling-corner-hooked";
		const design =
			index % 2 ? { schwa, e: variant.key } : { e: variant.key, schwa };
		const { para, glyphStore } = build(design, weight, slope, false);
		const component = glyphStore.queryByNameEnsured("ae/e");
		const expected = glyphStore.queryByNameEnsured(
			`ae/e.${variant.selector.e}`,
		);
		const contours = expected.geometry.toContours();
		assert.ok(contours.length, `${variant.key}: empty e component`);
		assert.deepEqual(
			component.geometry.toContours(),
			contours,
			variant.key,
		);
		assert.deepEqual(
			glyphStore.queryByNameEnsured("oeOpen/e").geometry.toContours(),
			contours,
			`oeOpen/e: ${variant.key}`,
		);
		for (const name of ["ae", "oe", "ue", "cyrl/aye", "cyrl/yaye"]) {
			assert.ok(
				dependencies(glyphStore.queryByNameEnsured(name)).includes(
					"ae/e",
				),
				`${name}: ${variant.key}`,
			);
		}
		const reverse = glyphStore.queryByNameEnsured("aInve/inve");
		assert.deepEqual(
			reverse.geometry.toContours(),
			glyphStore
				.queryByNameEnsured(`aInve/inve.${para.variantSelector.schwa}`)
				.geometry.toContours(),
			`schwa: ${schwa}`,
		);
		for (const point of contours.flat()) {
			assert.ok(
				Number.isFinite(point.x) && Number.isFinite(point.y),
				variant.key,
			);
		}
	}
});

test("e character variants propagate to ae and oe without schwa substitutions", () => {
	const { para, glyphStore } = build(
		{ e: "rounded-flat-hooked", schwa: "diagonal-crossbar-falling-serif" },
		420,
		"upright",
		true,
	);
	const ePrime = para.variants.primes.get("e");
	const schwaPrime = para.variants.primes.get("schwa");
	for (const name of ["ae", "oe", "ue", "cyrl/aye", "cyrl/yaye"]) {
		const glyph = glyphStore.queryByNameEnsured(name);
		for (const variant of ePrime.variants.values()) {
			const target = variant.get(glyph);
			assert.ok(target, `${name}: missing e substitution ${variant.key}`);
			assert.ok(
				dependencies(glyphStore.queryByNameEnsured(target)).includes(
					`ae/e.${variant.selector.e}`,
				),
				`${name}: incorrect e substitution ${variant.key}`,
			);
		}
		for (const variant of schwaPrime.variants.values()) {
			assert.ok(
				!variant.get(glyph),
				`${name}: unexpected schwa substitution ${variant.key}`,
			);
		}
	}
	for (const name of ["aInve", "oInve"]) {
		const glyph = glyphStore.queryByNameEnsured(name);
		for (const variant of schwaPrime.variants.values()) {
			const target = variant.get(glyph);
			assert.ok(
				target,
				`${name}: missing schwa substitution ${variant.key}`,
			);
			assert.ok(
				dependencies(glyphStore.queryByNameEnsured(target)).includes(
					`aInve/inve.${variant.selector.schwa}`,
				),
				`${name}: incorrect schwa substitution ${variant.key}`,
			);
		}
	}
});
