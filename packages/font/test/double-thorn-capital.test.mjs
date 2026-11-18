import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import * as Geometry from "@iosevka/geometry";
import { buildGlyphs } from "@iosevka/font-glyphs";
import { getParametersT } from "../src/param/index.mjs";

test("capital double thorn follows capital B and keeps both counters open", async () => {
	await Geometry.Init();
	const makePara = await getParametersT({ paramsDir: fileURLToPath(new URL("../../../params/", import.meta.url)) });
	for (const slope of ["upright", "italic"]) for (const weight of [120, 420, 920]) {
		for (const design of ["standard-serifless", "more-asymmetric-unilateral-serifed", "standard-interrupted-bilateral-serifed", "standard-broken-rising-serifless", "more-asymmetric-broken-falling-bilateral-serifed"]) {
			const para = makePara({
				shape: { serifs: "sans", spacing: "term", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
				menu: { family: "Double thorn QA", version: "34.9.0", width: 5, slope, weight: 400 },
				featureControl: { noCvSs: false, noLigation: true },
				variants: { design: { "capital-latin-gamma": "serifless", "latin-gamma": "serifless", "capital-b": design } },
			});
			const { glyphStore } = buildGlyphs(para, {
				blockIsNeeded: id => ["Letter-Latin-Upper-B", "Letter-Latin-Double-Thorn-Wynn"].includes(id),
				glyphIsNeeded: id => id.startsWith("ThornDouble"),
			});
			const glyph = glyphStore.queryByNameEnsured("ThornDouble");
			const selected = glyphStore.queryByNameEnsured(`ThornDouble.${para.variantSelector.B}`);
			const contours = new Geometry.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toBezArcs();
			const selectedContours = new Geometry.SimplifyGeometry(selected.geometry, selected.gizmo, true).toBezArcs();
			const sample = cs => cs.map(c => c.flatMap(a => Array.from({ length: 4 }, (_, i) => a.eval(i / 4))));
			assert.deepEqual(sample(contours), sample(selectedContours), `${slope} ${weight} ${design}`);
			assert.ok(contours.flat().every(arc => Array.from({ length: 16 }, (_, i) => arc.eval(i / 16)).every(p => Number.isFinite(p.x) && Number.isFinite(p.y))));
			if (!design.includes("interrupted")) assert.equal(contours.length, 3, `${slope} ${weight} ${design}: two counters`);
		}
	}
});
