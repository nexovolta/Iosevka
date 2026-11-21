import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import * as Geom from "@iosevka/geometry";
import { buildGlyphs } from "../../font-glyphs/lib/index.mjs";
import { getParametersT } from "../src/param/index.mjs";

await Geom.Init();
const makePara = await getParametersT({
	paramsDir: fileURLToPath(new URL("../../../params", import.meta.url)),
});

const variants = [
	["serifless", "serifless", 0],
	["serifed", "serifed", 0],
	["diagonalCrossbar", "diagonalCrossbar", 1],
	["diagonalCrossbarMiddleSerifed", "diagonalCrossbarMiddleSerifed", 1],
	["diagonalCrossbarFalling", "diagonalCrossbarFalling", -1],
	["diagonalCrossbarFallingMiddleSerifed", "diagonalCrossbarFallingMiddleSerifed", -1],
];

function inspectGlyph(glyph) {
	const geometry = new Geom.SimplifyGeometry(glyph.geometry, glyph.gizmo, true);
	const contours = geometry.toContours().map(contour => contour.map(point => glyph.gizmo.unapply(point)));
	const arcs = geometry.toBezArcs().flat();
	const points = arcs.flatMap(arc => [0, 0.25, 0.5, 0.75, 1].map(t => glyph.gizmo.unapply(arc.eval(t))));
	assert.ok(contours.length > 0);
	assert.ok(contours.every(contour => contour.length >= 3 && contour.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))));
	assert.ok(points.length > 0 && points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y)));
	return {
		advanceWidth: glyph.advanceWidth,
		contours,
		bounds: [
			Math.min(...points.map(point => point.x)),
			Math.min(...points.map(point => point.y)),
			Math.max(...points.map(point => point.x)),
			Math.max(...points.map(point => point.y)),
		],
		points,
	};
}

function horizontalCrossings(contours, y) {
	const crossings = [];
	for (const contour of contours) for (let i = 0; i < contour.length; i++) {
		const a = contour[i];
		const b = contour[(i + 1) % contour.length];
		if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
			crossings.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y));
		}
	}
	return crossings.sort((a, b) => a - b);
}

function reflectedError(source, target, centerY) {
	const directedError = (from, to) => Math.max(...from.map(point => {
		const reflected = { x: point.x, y: 2 * centerY - point.y };
		return Math.min(...to.map(candidate => Math.hypot(reflected.x - candidate.x, reflected.y - candidate.y)));
	}));
	return Math.max(directedError(source, target), directedError(target, source));
}

for (const spacing of ["normal", "quasi-proportional"]) for (const slope of ["upright", "italic"]) for (const weight of [120, 420, 920]) {
	test(`Greek capital Theta serif placement and circle clearance: ${spacing} ${slope} ${weight}`, () => {
		const para = makePara({
			shape: { serifs: "sans", spacing, weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
			menu: { family: "Theta serif test", version: "34.9.0", width: 5, slope, weight: 400 },
			featureControl: { noCvSs: true, noLigation: true },
			variants: { design: { "capital-latin-gamma": "serifless", "latin-gamma": "serifless" } },
		});
		const { glyphStore } = buildGlyphs(para, {
			blockIsNeeded: id => id === "Letter-Greek-Upper-Theta" || id === "Letter-Latin-O",
			glyphIsNeeded: id => id === "O" || id.startsWith("grek/Theta."),
		});
		const inspected = new Map([["O", "O"], ...variants.map(([suffix]) => [suffix, `grek/Theta.${suffix}`])].map(([key, name]) => [
			key,
			inspectGlyph(glyphStore.queryByNameEnsured(name)),
		]));
		const base = inspected.get("serifless");

		for (const [suffix] of variants) {
			const glyph = inspected.get(suffix);
			const hasSerifs = suffix === "serifed" || suffix.endsWith("MiddleSerifed");
			assert.ok(Math.abs(glyph.bounds[1] - base.bounds[1]) < 0.1, `${suffix}: top of circle changed`);
			assert.ok(Math.abs(glyph.bounds[3] - base.bounds[3]) < 0.1, `${suffix}: bottom of circle changed`);
			if (spacing === "normal" || !hasSerifs) {
				assert.ok(Math.abs(glyph.bounds[0] - base.bounds[0]) < 0.1, `${suffix}: left side changed`);
				assert.ok(Math.abs(glyph.bounds[2] - base.bounds[2]) < 0.1, `${suffix}: right side changed`);
			} else {
				assert.ok(glyph.bounds[2] - glyph.bounds[0] > base.bounds[2] - base.bounds[0], `${suffix}: quasi-proportional circle was not widened`);
				assert.ok(Math.abs(glyph.advanceWidth - para.width * para.advanceScaleT) < 0.1, `${suffix}: advance did not use advanceScaleT`);
				assert.ok(Math.abs((glyph.bounds[0] + glyph.bounds[2]) / 2 - glyph.advanceWidth / 2) < 0.1, `${suffix}: widened circle is not centered`);
				const referenceRing = horizontalCrossings(inspected.get("O").contours, para.cap / 4);
				const widenedRing = horizontalCrossings(glyph.contours, para.cap / 4);
				assert.equal(referenceRing.length, 4, "reference circle does not have two ring edges");
				assert.equal(widenedRing.length, 4, `${suffix}: circle has a duplicated outline`);
			}
		}

		const straightSerifs = inspected.get("serifed");
		const straightPlain = inspected.get("serifless");
		const risingSerifs = inspected.get("diagonalCrossbarMiddleSerifed");
		const fallingSerifs = inspected.get("diagonalCrossbarFallingMiddleSerifed");
		assert.notDeepEqual(straightSerifs.points, straightPlain.points, "straight serifs were not added");
		assert.notDeepEqual(risingSerifs.points, inspected.get("diagonalCrossbar").points, "rising serifs were not added");
		assert.notDeepEqual(fallingSerifs.points, inspected.get("diagonalCrossbarFalling").points, "falling serifs were not added");
		assert.ok(straightSerifs.points.length > straightPlain.points.length, "straight serifs are not centered on the bar");
		assert.ok(risingSerifs.points.length > inspected.get("diagonalCrossbar").points.length);
		assert.ok(fallingSerifs.points.length > inspected.get("diagonalCrossbarFalling").points.length);
		if (spacing === "normal" && slope === "upright") {
			assert.ok(reflectedError(straightSerifs.points, straightSerifs.points, para.cap / 2) < 1, "straight serifs are not centered");
			assert.ok(reflectedError(risingSerifs.points, fallingSerifs.points, para.cap / 2) < 8, "diagonal serifs do not flank in opposite directions");
		}
	});
}
