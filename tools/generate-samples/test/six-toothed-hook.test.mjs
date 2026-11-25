import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as Geom from "@iosevka/geometry";

import { buildGlyphData, glyphPath } from "../../../packages/font/src/glyph-svg.mjs";

const paramsDir = fileURLToPath(new URL("../../../params", import.meta.url));

for (const [weight, slope, spacing, width] of [
	...[120, 420, 920].flatMap(weight =>
		["upright", "italic"].map(slope => [weight, slope, "term", 500]),
	),
	[920, "italic", "quasi-proportional", 350],
]) {
	test(`six-family toothed hooks ${weight} ${slope} ${spacing} ${width}`, async () => {
		const { glyphStore } = await buildGlyphData({
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
				if (!suffix)
					assert.equal(
						glyphPath(glyphStore.queryByUnicodeEnsured(codePoint)),
						glyphPath(glyph),
					);
			}
		}
	});
}
