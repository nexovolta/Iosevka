import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { calculateMetrics } from "@iosevka/font-glyphs/aesthetics";
import * as Geom from "@iosevka/geometry";
import { Boolean as BooleanGeom } from "typo-geom";

import { buildGlyphData, glyphPath } from "../../../packages/font/src/glyph-svg.mjs";

const paramsDir = fileURLToPath(new URL("../../../params", import.meta.url));

function leftStemProfile(glyph, capHeight) {
	const contours = BooleanGeom.removeOverlap(glyph.geometry.toBezArcs(), "nonZero", 16384);
	const segments = [];
	for (const contour of contours) {
		for (const arc of contour) {
			let a = glyph.gizmo.unapply(arc.eval(0));
			for (let j = 1; j <= 64; j++) {
				const b = glyph.gizmo.unapply(arc.eval(j / 64));
				segments.push([a, b]);
				a = b;
			}
		}
	}
	return [0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7].map(fraction => {
		const y = capHeight * fraction;
		const intersections = [];
		for (const [a, b] of segments)
			if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y))
				intersections.push(a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y));
		assert.ok(intersections.length, `missing stem at ${fraction} of cap height`);
		return Math.min(...intersections);
	});
}

for (const [weight, slope, spacing, width] of [
	...[120, 420, 920].flatMap(weight =>
		["upright", "italic"].map(slope => [weight, slope, "term", 500]),
	),
	[920, "italic", "quasi-proportional", 350],
]) {
	test(`six-family toothed hooks ${weight} ${slope} ${spacing} ${width}`, async () => {
		const { para, glyphStore } = await buildGlyphData({
			paramsDir,
			shape: {
				serifs: "sans",
				spacing,
				weight,
				width,
				slope,
				slopeAngle: slope === "italic" ? 9.4 : 0,
			},
			menu: { family: "Iosevka", version: "34.9.0", width: 5, slope, weight },
			featureControl: { noCvSs: true },
			variants: {
				design: Object.fromEntries(
					["six", "nine", "lower-eth", "partial-derivative"].map(key => [
						key,
						"closed-serifed-hooked",
					]),
				),
			},
		});
		for (const [prefix, codePoint] of [
			["six.lnum", 0x36],
			["nine.lnum", 0x39],
			["dInsular/oldBowl", 0x2202],
			["eth", 0xf0],
		]) {
			for (const suffix of ["", "FlatBowl"]) {
				const name = `${prefix}.closedSerifedHook${suffix}`;
				const glyph = glyphStore.queryByNameEnsured(name);
				const contours = new Geom.SimplifyGeometry(
					glyph.geometry,
					glyph.gizmo,
					true,
				).toContours();
				assert.equal(contours.length, 2, `${name}: disconnected or filled bowl`);
				assert.ok(
					contours.every(
						contour =>
							contour.length >= 3 &&
							contour.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)),
					),
					`${name}: invalid points`,
				);
				assert.notEqual(
					glyphPath(glyph),
					glyphPath(glyphStore.queryByNameEnsured(`${prefix}.closedContour${suffix}`)),
					`${name}: terminal did not change`,
				);
				if (prefix === "six.lnum") {
					const profile = leftStemProfile(glyph, calculateMetrics(para).CAP);
					assert.ok(
						Math.max(...profile) - Math.min(...profile) < 0.5,
						`${name}: bump or dent in outer stem (${profile.join(", ")})`,
					);
				}
				if (!suffix)
					assert.equal(
						glyphPath(glyphStore.queryByUnicodeEnsured(codePoint)),
						glyphPath(glyph),
					);
			}
		}
	});
}
