import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as TOML from "@iarna/toml";
import * as Geom from "@iosevka/geometry";
import { parse } from "@iosevka/param/variant";
import { buildGlyphData, glyphPath } from "../../../packages/font/src/glyph-svg.mjs";

const paramsDir = fileURLToPath(new URL("../../../params", import.meta.url));
const cuts = [
	["smooth-vertical-cut", "smoothVerticalCut", "smooth"],
	["corner-vertical-cut", "cornerVerticalCut", "corner"],
	["smooth-diagonal-cut", "smoothDiagonalCut", "smooth"],
	["corner-diagonal-cut", "cornerDiagonalCut", "corner"],
];
const tails = [
	["curly-tail", "CurlyTail", "curlyTail"],
	["straight-tail", "StraightTail", "straightTail"],
	["diagonal-tail", "DiagonalTail", "diagonalTail"],
	["straight-tail-sharp-corner", "StraightTailSharpCorner", "straightTailSharpCorner"],
	["diagonal-tail-sharp-corner", "DiagonalTailSharpCorner", "diagonalTailSharpCorner"],
];

test("P1 selectors preserve final sigma tails and protected glottal forms", async () => {
	const config = TOML.parse(await readFile(new URL("../../../params/variants.toml", import.meta.url), "utf8"));
	const variants = parse(config).primes;
	for (const [variant, suffix, protectedSuffix] of cuts) {
		for (const family of ["question", "glottal-stop"])
			assert.equal(variants.get(family).variants.get(variant).selector[family === "question" ? "question" : "glottalStop"], suffix);
		assert.equal(variants.get("glottal-stop").variants.get(variant).selector["revGlottalStop/palatalBase"], protectedSuffix);
	}
	for (const [top, topSuffix] of [["vertical-cut", "verticalCut"], ["diagonal-cut", "diagonalCut"]]) {
		for (const [tail, tailSuffix] of tails) {
			const selector = variants.get("lower-final-sigma").variants.get(`${top}-${tail}`).selector;
			assert.equal(selector["grek/sigmaFinal"], `${topSuffix}${tailSuffix}`);
			assert.equal(selector["grek/stigma"], `${topSuffix}${tailSuffix}`);
		}
	}
});

for (const [index, [weight, slope, spacing = "term", width = 500, serifs = "sans"]] of [
	[120, "upright"],
	[420, "upright"],
	[920, "upright"],
	[120, "italic"],
	[420, "italic"],
	[920, "italic"],
	[920, "italic", "term", 416],
	[920, "italic", "quasi-proportional", 416, "slab"],
].entries()) {
	test(`P1 cut terminals ${weight} ${slope} ${spacing} ${width} ${serifs}`, async () => {
		const [variant, suffix, protectedSuffix] = cuts[index % cuts.length];
		const [tailVariant, tailSuffix] = tails[index % tails.length];
		const topVariant = suffix.includes("Vertical") ? "vertical-cut" : "diagonal-cut";
		const topSuffix = suffix.includes("Vertical") ? "verticalCut" : "diagonalCut";
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
				design: {
					question: variant,
					"glottal-stop": variant,
					"lower-final-sigma": `${topVariant}-${tailVariant}`,
					"punctuation-dot": "round",
				},
			},
		});
		const glyph = name => glyphStore.queryByNameEnsured(name);
		const path = name => glyphPath(glyph(name));
		const check = (name, count) => {
			const g = glyph(name);
			const contours = new Geom.SimplifyGeometry(g.geometry, g.gizmo, true).toContours();
			assert.equal(contours.length, count, name);
			assert.ok(contours.every(c => c.length >= 3 && c.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))), name);
		};
		for (const [, style] of cuts) {
			for (const prefix of [
				"glottalStop", "revGlottalStop", "capGlottalStop",
				"revCapGlottalStop", "smallGlottalStop", "revSmallGlottalStop",
			]) check(`${prefix}.${style}`, 1);
			for (const dot of ["round", "square", "diamond", "hexagon"]) {
				for (const prefix of ["question", "questionDown", "revQuestion"])
					check(`${prefix}.${dot}.${style}`, 2);
				for (const prefix of ["interrobang", "gnaborretni"])
					assert.ok(path(`${prefix}.${dot}.${style}`));
			}
		}
		for (const top of ["verticalCut", "diagonalCut"]) {
			for (const [, tail, original] of tails) {
				check(`grek/sigmaFinal.${top}${tail}`, 1);
				const bottom = name => {
					const g = glyph(name);
					const points = new Geom.SimplifyGeometry(g.geometry, g.gizmo, true).toContours().flat();
					return Math.min(...points.map(p => p.y));
				};
				assert.equal(bottom(`grek/sigmaFinal.${top}${tail}`), bottom(`grek/sigmaFinal.${original}`), `${top}${tail}: descender depth changed`);
				assert.equal(path(`grek/stigma.${top}${tail}`), path(`grek/stigma.${original}`));
			}
		}
		for (const [cp, name] of [
			[0x3f, `question.round.${suffix}`],
			[0xbf, `questionDown.round.${suffix}`],
			[0x2e2e, `revQuestion.round.${suffix}`],
			[0x294, `glottalStop.${suffix}`],
			[0x295, `revGlottalStop.${suffix}`],
			[0x3c2, `grek/sigmaFinal.${topSuffix}${tailSuffix}`],
		]) assert.equal(glyphPath(glyphStore.queryByUnicodeEnsured(cp)), path(name));
		assert.equal(path("revGlottalStop/palatalBase"), path(`revGlottalStop.${protectedSuffix}`));
		assert.ok(glyphPath(glyphStore.queryByUnicodeEnsured(0x1df3a)));
	});
}
