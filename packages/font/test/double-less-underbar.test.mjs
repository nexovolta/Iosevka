import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import * as Geometry from "@iosevka/geometry";
import { buildGlyphs } from "@iosevka/font-glyphs";
import { getParametersT } from "../src/param/index.mjs";

test("double nested less-than underbar has two parallel separated chevrons", async () => {
	await Geometry.Init();
	const makePara = await getParametersT({ paramsDir: fileURLToPath(new URL("../../../params/", import.meta.url)) });
	for (const spacing of ["term", "quasi-proportional"]) for (const slope of ["upright", "italic"]) for (const weight of [120, 420, 920]) {
		const para = makePara({
			shape: { serifs: "sans", spacing, weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
			menu: { family: "Double less QA", version: "34.9.0", width: 5, slope, weight: 400 },
			featureControl: { noCvSs: false, noLigation: true },
			variants: { design: { "capital-latin-gamma": "serifless", "latin-gamma": "serifless" } },
		});
		const { glyphStore } = buildGlyphs(para, {
			blockIsNeeded: id => id === "Symbol-Math-Relation-Inequality",
			glyphIsNeeded: id => id.startsWith("doubleNestedLessUnderbar"),
		});
		const glyph = glyphStore.queryByUnicode(0x2aa3);
		assert.ok(glyph);
		const contours = new Geometry.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toBezArcs();
		assert.equal(contours.length, 3, `${spacing} ${slope} ${weight}: chevrons must be separate from each other and the bar`);
		const boxes = contours.map(arcs => {
			const points = arcs.flatMap(arc => Array.from({ length: 32 }, (_, i) => glyph.gizmo.unapply(arc.eval(i / 32))));
			assert.ok(points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
			return {
				left: Math.min(...points.map(p => p.x)), right: Math.max(...points.map(p => p.x)),
				bottom: Math.min(...points.map(p => p.y)), top: Math.max(...points.map(p => p.y)),
			};
		}).sort((a, b) => a.top - b.top);
		const [bar, a, b] = boxes;
		assert.ok(bar.top < Math.min(a.bottom, b.bottom), "underbar must not touch the chevrons");
		assert.ok(Math.abs(a.top - b.top) < 1 && Math.abs(a.bottom - b.bottom) < 1, "chevrons must have equal height");
		assert.ok(Math.abs((a.right - a.left) - (b.right - b.left)) < 1, "chevrons must have equal width");
		assert.ok(Math.abs(a.left - b.left) > glyph.advanceWidth * 0.25, "chevrons must have distinct tips");
	}
});
