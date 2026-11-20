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

for (const slope of ["upright", "italic"]) for (const weight of [120, 420, 920]) {
	test(`big top circle selects a vertically flipped double-circle eight: ${slope} ${weight}`, () => {
		const para = makePara({
			shape: { serifs: "sans", spacing: "term", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
			menu: { family: "Eight test", version: "34.9.0", width: 5, slope, weight: 400 },
			featureControl: { noCvSs: true, noLigation: true },
			variants: { design: { eight: "big-top-circle", "capital-latin-gamma": "serifless", "latin-gamma": "serifless" } },
		});
		const { glyphStore } = buildGlyphs(para, {
			blockIsNeeded: id => id === "Digits-Eight",
			glyphIsNeeded: id => /^eight\.lnum/.test(id),
		});
		const original = glyphStore.queryByNameEnsured("eight.lnum.twoCircles");
		const flipped = glyphStore.queryByNameEnsured("eight.lnum.bigTopCircle");
		assert.equal(para.variantSelector.eight, "bigTopCircle");
		const arcs = glyph => glyph.geometry.toBezArcs().flat();
		const a = arcs(original);
		const b = arcs(flipped);
		assert.equal(a.length, b.length);
		const points = (glyph, arcs) => arcs.flatMap(arc =>
			[0, 0.5, 1].map(t => glyph.gizmo.unapply(arc.eval(t))),
		);
		const reflected = points(flipped, b);
		for (const p of points(original, a)) {
			assert.ok(reflected.some(q => Math.abs(p.x - q.x) < 0.01 && Math.abs(p.y + q.y - para.cap) < 0.01));
		}
	});
}
