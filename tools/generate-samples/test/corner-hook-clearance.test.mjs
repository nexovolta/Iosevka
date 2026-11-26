import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { calculateMetrics } from "@iosevka/font-glyphs/aesthetics";
import { Boolean as BooleanGeom } from "typo-geom";
import { buildGlyphData, glyphPath } from "../../../packages/font/src/glyph-svg.mjs";

const paramsDir = fileURLToPath(new URL("../../../params", import.meta.url));
const metricOverride = {
	xHeight: 518,
	cap: 693,
	ascender: 732,
	descender: -186,
	sb: 60,
	contrast: 1.102,
	archDepth: 192,
	smallArchDepth: 256,
};

for (const [weight, width, spacing] of [
	[260, 586, "term"],
	[530, 586, "term"],
	[930, 586, "term"],
	[930, 416, "term"],
	[930, 416, "quasi-proportional"],
]) {
	test(`italic corner-hook clearance: ${weight} ${width} ${spacing}`, async () => {
		const { para, glyphStore } = await buildGlyphData({
			paramsDir,
			shape: { serifs: "sans", spacing, weight, width, slope: "italic", slopeAngle: 10 },
			menu: { family: "Iosevka", version: "34.9.0", width: 5, slope: "italic", weight },
			featureControl: { noCvSs: true },
			metricOverride,
		});
		const glyph = name => glyphStore.queryByNameEnsured(name);
		const checkContours = (name, count) => {
			const g = glyph(name);
			const contours = BooleanGeom.removeOverlap(g.geometry.toBezArcs(), "nonZero", 16384);
			assert.equal(contours.length, count, `${name}: unexpected closed counter or detached piece`);
			assert.ok(contours.flat().every(arc =>
				[arc.a, arc.b, arc.c, arc.d].every(p => Number.isFinite(p.x) && Number.isFinite(p.y))), name);
		};

		for (const family of ["e", "reve"]) {
			for (const suffix of [
				"flatCrossbarCornerHook", "roundedCornerHook",
				"diagonalCrossbarCornerHook", "diagonalCrossbarFallingCornerHook",
			]) checkContours(`${family}.${suffix}`, 2);
		}
		for (const hump of ["", "FlatHump"]) {
			for (const family of ["y", "yCap", "grek/lambda"]) {
				checkContours(`${family}.cursive${hump}CornerHookSerifless`, 1);
			}
		}
		for (const suffix of ["singleStoreyCornerHookSerifless", "singleStoreyCornerHookFlatBowlSerifless"]) {
			checkContours(`g.${suffix}`, 2);
		}
		checkContours("cyrl/de.serbianCornerHookSerifless", 2);
		assert.equal(glyphPath(glyph("cyrl/de.serbianCornerHookSerifless")), glyphPath(glyph("g.singleStoreyCornerHookSerifless")));

		if (weight === 530 && width === 586) {
			const metrics = calculateMetrics(para);
			const horizontalSegments = name => {
				const g = glyph(name);
				return g.geometry.toBezArcs().flatMap(contour => contour.map(arc =>
					[arc.a, arc.b, arc.c, arc.d].map(p => g.gizmo.unapply(p))))
					.filter(points => points.every(p => Math.abs(p.y - points[0].y) < 0.01));
			};
			const horizontalEnd = (name, y, side) => {
				const segments = horizontalSegments(name).filter(points => Math.abs(points[0].y - y) < 0.01);
				assert.ok(segments.length, `${name}: missing horizontal hook`);
				const xs = segments.flat().map(p => p.x);
				return side === "left" ? Math.min(...xs) : Math.max(...xs);
			};
			for (const [corner, flat, y, side] of [
				["a.doubleStoreyHookCornerSerifless", "a.doubleStoreyHookFlatSerifless", 518, "left"],
				["e.flatCrossbarCornerHook", "e.flatCrossbarFlatHook", 0, "right"],
				["schwa.flatCrossbarCornerHook", "schwa.flatCrossbarFlatHook", 518, "left"],
				["Schwa.flatCrossbarCornerHook", "Schwa.flatCrossbarFlatHook", 693, "left"],
				["g.singleStoreyCornerHookSerifless", "g.singleStoreyFlatHookSerifless", -186, "left"],
				["g.doubleStoreyOpenCornerHook", "g.doubleStoreyOpenFlatHook", -186, "left"],
				["g.doubleStoreyDisjointCornerHook", "g.doubleStoreyDisjointFlatHook", -186, "left"],
				["y.cursiveCornerHookSerifless", "y.cursiveFlatHookSerifless", -186, "left"],
				["yCap.cursiveCornerHookSerifless", "yCap.cursiveFlatHookSerifless", 0, "left"],
				["grek/lambda.cursiveCornerHookSerifless", "grek/lambda.cursiveFlatHookSerifless", 732, "left"],
			]) {
				const cornerEnd = horizontalEnd(corner, y, side);
				const flatEnd = horizontalEnd(flat, y, side);
				const extension = side === "left" ? flatEnd - cornerEnd : cornerEnd - flatEnd;
				assert.ok(extension > 0.05 * para.stroke, `${corner}: horizontal hook is not extended`);
			}
			const sw = metrics.AdviceStroke2(2, 3, metrics.XH);
			const shortened = sw + 0.75 * (metrics.Hook - sw);
			for (const [name, y] of [
				["a.doubleStoreyHookCornerSerifless", metrics.XH - shortened],
				["e.flatCrossbarCornerHook", shortened],
				["schwa.flatCrossbarCornerHook", metrics.XH - shortened],
				["Schwa.flatCrossbarCornerHook", metrics.CAP - metrics.Hook],
				["g.doubleStoreyOpenCornerHook", metrics.Descender + metrics.Stroke + 0.75 * (metrics.Hook - metrics.Stroke)],
				["g.doubleStoreyDisjointCornerHook", metrics.Descender + metrics.Stroke + 0.75 * (metrics.Hook - metrics.Stroke)],
			]) {
				assert.ok(horizontalSegments(name).some(points =>
					Math.abs(points[0].y - y) < 0.1 &&
					Math.abs(points[3].x - points[0].x) > 0.5 * metrics.Stroke),
				`${name}: incorrect vertical terminal length`);
			}
			for (const name of ["y.cursiveCornerHookSerifless", "g.singleStoreyCornerHookSerifless"]) {
				assert.ok(horizontalSegments(name).some(points =>
					points[0].y < -0.3 * metrics.Stroke && points[0].y > metrics.Descender + metrics.Stroke &&
					Math.abs(points[3].x - points[0].x) > metrics.Stroke),
				`${name}: descending corner terminal is too long`);
			}
			assert.ok(horizontalSegments("grek/lambda.cursiveCornerHookSerifless").some(points =>
				points[0].y > metrics.Ascender - 2 * metrics.Stroke && points[0].y < metrics.Ascender - metrics.Stroke &&
				Math.abs(points[3].x - points[0].x) > metrics.Stroke),
			"cursive lambda corner terminal is too long");
		}
	});
}

test("heavy upright e and schwa corner hooks retain crossbar clearance", async () => {
	const weight = 930;
	const { para, glyphStore } = await buildGlyphData({
		paramsDir,
		shape: { serifs: "sans", spacing: "term", weight, width: 586, slope: "upright", slopeAngle: 0 },
		menu: { family: "Iosevka", version: "34.9.0", width: 5, slope: "upright", weight },
		featureControl: { noCvSs: true },
		metricOverride,
	});
	const metrics = calculateMetrics(para);
	const sw = metrics.AdviceStroke2(2, 3, metrics.XH);
	const barBottom = metrics.XH * metrics.DesignParameters.eBarPos - sw / 2;
	const depth = Math.min(Math.max(metrics.Hook, metrics.DToothlessRise + sw), barBottom - 0.2 * sw);
	assert.ok(barBottom - depth > 0.15 * sw, "corner hook is too close to the crossbar");
	for (const [name, y] of [
		["e.flatCrossbarCornerHook", depth],
		["reve.flatCrossbarCornerHook", depth],
		["schwa.flatCrossbarCornerHook", metrics.XH - depth],
	]) {
		const g = glyphStore.queryByNameEnsured(name);
		assert.ok(g.geometry.toBezArcs().flat().some(arc => {
			const points = [arc.a, arc.b, arc.c, arc.d].map(p => g.gizmo.unapply(p));
			return points.every(p => Math.abs(p.y - y) < 0.1) &&
				Math.abs(points[3].x - points[0].x) > 0.5 * sw;
		}), `${name}: missing fitted corner terminal`);
	}
});
