import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { Boolean as BooleanGeom } from "typo-geom";
import { buildGlyphData } from "../../../packages/font/src/glyph-svg.mjs";

const paramsDir = fileURLToPath(new URL("../../../params", import.meta.url));

for (const slope of ["upright", "italic"]) {
	test(`a-v and a-y joins have no spurious counters: ${slope}`, async () => {
		const { para, glyphStore } = await buildGlyphData({
			paramsDir,
			shape: { serifs: "sans", spacing: "term", weight: 930, width: 586, slope, slopeAngle: slope === "italic" ? 10 : 0 },
			menu: { family: "Iosevka", version: "34.9.0", width: 5, slope, weight: 930 },
			featureControl: { noCvSs: true },
			metricOverride: {
				xHeight: 518,
				cap: 693,
				ascender: 732,
				descender: -186,
				sb: 60,
				contrast: 1.102,
				archDepth: 192,
				smallArchDepth: 256,
			},
			variants: { design: {
				a: "double-storey-hook-diagonal-cut-bottom-cut-serifless-curved-bar-falling",
				v: "straight-bilateral-motion-serifed",
				y: "straight-bilateral-motion-serifed",
			} },
		});
		const left = glyphStore.queryByNameEnsured("av/a");
		const leftPoints = left.geometry.toBezArcs().flatMap(c => c.flatMap(a =>
			[a.a, a.b, a.c, a.d].map(p => left.gizmo.unapply(p))));
		const stemRight = Math.max(...leftPoints.map(p => p.x));
		for (const name of ["av", "avBar", "ay"]) {
			const glyph = glyphStore.queryByNameEnsured(name);
			const contours = BooleanGeom.removeOverlap(glyph.geometry.toBezArcs(), "nonZero", 16384);
			for (const contour of contours) {
				const points = contour.flatMap(a => [a.a, a.b, a.c, a.d].map(p => glyph.gizmo.unapply(p)));
				const minX = Math.min(...points.map(p => p.x));
				const maxX = Math.max(...points.map(p => p.x));
				const minY = Math.min(...points.map(p => p.y));
				const maxY = Math.max(...points.map(p => p.y));
				assert.ok(
					!(Math.abs(minX - stemRight) < 1 && maxX - minX > 0.01 && maxX - minX < 0.18 * para.stroke
						&& minY > 0 && maxY < para.xHeight * 0.5),
					`${name} has a stray counter beside the a stem`,
				);
			}
		}
	});
}
