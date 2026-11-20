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
	for (const size of ["big", "small"]) {
		test(`${size} top bowls: ${slope} ${weight}`, () => {
			const name = size === "big" ? "big-top-bowl" : "big-bottom-bowl";
			const para = makePara({
				shape: { serifs: "sans", spacing: "normal", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
				menu: { family: "Bowl test", version: "34.9.0", width: 5, slope, weight: 400 },
				featureControl: { noCvSs: true, noLigation: true },
				variants: { design: { "capital-b": `${name}-serifless`, "lower-beta": name, "cyrl-ve": `${name}-tall`, "capital-latin-gamma": "serifless", "latin-gamma": "serifless" } },
			});
			const { glyphStore } = buildGlyphs(para, {
				blockIsNeeded: id => id === "Letter-Latin-Upper-B",
				glyphIsNeeded: () => true,
			});
			for (const name of ["B", "grek/beta", "latn/beta", "cyrl/ve", "cyrl/ve.BGR"]) {
				const glyph = glyphStore.queryByNameEnsured(name);
				const contours = new Geom.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours();
				assert.ok(contours.length > 0, `${name} is empty`);
				assert.ok(contours.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), name);
			}
			const b = glyphStore.queryByNameEnsured("B");
			const strike = b.gizmo.unapply(b.baseAnchors.strike);
			assert.ok(size === "big" ? strike.y < para.cap * 0.5 : strike.y > para.cap * 0.5);
			const stem = size === "big" ? "bigTopBowl" : "smallTopBowl";
			for (const suffix of ["", "Tall", "BGRTall"]) {
				const ve = glyphStore.queryByNameEnsured(`smcpB.${stem}${suffix}`);
				const points = new Geom.SimplifyGeometry(ve.geometry, ve.gizmo, true).toContours()
					.flat().map(p => ve.gizmo.unapply(p));
				const top = Math.max(...points.map(p => p.y));
				let expected = suffix ? para.ascender : para.xHeight;
				if (suffix === "BGRTall") {
					const reference = glyphStore.queryByNameEnsured("smcpB.roundedTopTall");
					const referencePoints = new Geom.SimplifyGeometry(reference.geometry, reference.gizmo, true)
						.toContours().flat().map(p => reference.gizmo.unapply(p));
					expected = Math.max(...referencePoints.map(p => p.y));
				}
				assert.ok(Math.abs(top - expected) < 3, `${stem}${suffix} has the wrong height`);
			}
		});
	}
}
