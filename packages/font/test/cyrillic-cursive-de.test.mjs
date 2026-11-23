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

function rightEdge(glyph, contours, y) {
	const hits = [];
	for (const contour of contours) for (const arc of contour) {
		let a = glyph.gizmo.unapply(arc.eval(0));
		for (let i = 1; i <= 64; i++) {
			const b = glyph.gizmo.unapply(arc.eval(i / 64));
			if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
				hits.push(a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y));
			}
			a = b;
		}
	}
	assert.ok(hits.length, `missing outline at y=${y}`);
	return Math.max(...hits);
}

for (const spacing of ["normal", "quasi-proportional"]) for (const slope of ["upright", "italic"]) for (const weight of [120, 420, 920]) {
	test(`cursive flat-bowl Cyrillic de has a smooth right join: ${spacing} ${slope} ${weight}`, () => {
		const para = makePara({
			shape: { serifs: "sans", spacing, weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
			menu: { family: "Cyrillic de join test", version: "34.9.0", width: 5, slope, weight: 400 },
			featureControl: { noCvSs: true, noLigation: true },
			variants: { design: { "capital-latin-gamma": "serifless", "latin-gamma": "serifless" } },
		});
		const name = "cyrl/de.cursiveFlatBowlSerifless";
		const { glyphStore } = buildGlyphs(para, {
			blockIsNeeded: id => id === "Letter-Cyrillic-De",
			glyphIsNeeded: id => id === name,
		});
		const glyph = glyphStore.queryByNameEnsured(name);
		const contours = new Geom.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toBezArcs();
		assert.equal(contours.length, 2, "bowl or hook is disconnected");
		const joinY = para.xHeight - para.stroke / 4;
		const below = rightEdge(glyph, contours, joinY - para.stroke / 8);
		const above = rightEdge(glyph, contours, joinY + para.stroke / 8);
		assert.ok(Math.abs(above - below) < 0.1, `right edge has a step at the join: ${below} vs ${above}`);
	});
}
