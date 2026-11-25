import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as Geom from "@iosevka/geometry";

import { buildGlyphData, glyphPath } from "../../../packages/font/src/glyph-svg.mjs";

const paramsDir = fileURLToPath(new URL("../../../params", import.meta.url));
const variants = [
	["corner-serifed-hooked", "cornerSerifedHooked"],
	["smooth-serifed-hooked", "smoothSerifedHooked"],
	["corner-inward-serifed", "cornerInwardSerifed"],
	["smooth-inward-serifed", "smoothInwardSerifed"],
];

for (const [index, [weight, slope, spacing = "term", width = 500, serifs = "sans"]] of [
	[120, "upright"],
	[120, "italic"],
	[420, "upright"],
	[420, "italic"],
	[920, "upright"],
	[920, "italic"],
	[920, "italic", "quasi-proportional", 350, "slab"],
].entries()) {
	test(`serifed question and glottal hooks ${weight} ${slope} ${spacing} ${width} ${serifs}`, async () => {
		const [variant, suffix] = variants[index % variants.length];
		const { glyphStore } = await buildGlyphData({
			paramsDir,
			shape: {
				serifs,
				spacing,
				weight,
				width,
				slope,
				slopeAngle: slope === "italic" ? 9.4 : 0,
			},
			menu: { family: "Iosevka", version: "34.9.0", width: 5, slope, weight },
			featureControl: { noCvSs: true },
			variants: {
				design: { question: variant, "glottal-stop": variant, "punctuation-dot": "round" },
			},
		});

		for (const [, style] of variants) {
			for (const prefix of [
				"glottalStop",
				"revGlottalStop",
				"capGlottalStop",
				"revCapGlottalStop",
				"smallGlottalStop",
				"revSmallGlottalStop",
				"question.round",
				"questionDown.round",
				"revQuestion.round",
			]) {
				const name = `${prefix}.${style}`;
				const glyph = glyphStore.queryByNameEnsured(name);
				const contours = new Geom.SimplifyGeometry(
					glyph.geometry,
					glyph.gizmo,
					true,
				).toContours();
				assert.equal(
					contours.length,
					prefix.includes("Question") || prefix.startsWith("question") ? 2 : 1,
					name,
				);
				assert.ok(
					contours.every(
						contour =>
							contour.length >= 3 &&
							contour.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)),
					),
					`${name}: invalid points`,
				);
			}
			for (const prefix of ["interrobang.round", "gnaborretni.round"]) {
				assert.ok(glyphPath(glyphStore.queryByNameEnsured(`${prefix}.${style}`)));
			}
		}

		for (const [codePoint, prefix] of [
			[0x3f, "question.round"],
			[0xbf, "questionDown.round"],
			[0x2e2e, "revQuestion.round"],
			[0x203d, "interrobang.round"],
			[0x2e18, "gnaborretni.round"],
			[0x294, "glottalStop"],
			[0x295, "revGlottalStop"],
			[0x241, "capGlottalStop"],
			[0x242, "smallGlottalStop"],
			[0xa7ce, "revCapGlottalStop"],
			[0xa7cf, "revSmallGlottalStop"],
		]) {
			assert.equal(
				glyphPath(glyphStore.queryByUnicodeEnsured(codePoint)),
				glyphPath(glyphStore.queryByNameEnsured(`${prefix}.${suffix}`)),
				`${codePoint.toString(16)}: ${suffix} not selected`,
			);
		}
		for (const codePoint of [0x296, 0x2a1, 0x2a2, 0x1df56]) {
			assert.ok(glyphPath(glyphStore.queryByUnicodeEnsured(codePoint)));
		}
		for (const prefix of [
			"glottalStop",
			"revGlottalStop",
			"question.round",
			"revQuestion.round",
		]) {
			assert.notEqual(
				glyphPath(glyphStore.queryByNameEnsured(`${prefix}.smoothSerifedHooked`)),
				glyphPath(glyphStore.queryByNameEnsured(`${prefix}.smoothInwardSerifed`)),
				`${prefix}: serif styles have identical outlines`,
			);
		}
	});
}
