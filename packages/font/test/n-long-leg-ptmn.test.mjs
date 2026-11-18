import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as Geometry from "@iosevka/geometry";
import { buildGlyphs } from "@iosevka/font-glyphs";
import { LocalizedForm } from "@iosevka/glyph/relation";
import { getParametersT } from "../src/param/index.mjs";

test("phonotypic N with long right leg uses the reversed N form", async () => {
	await Geometry.Init();
	const makePara = await getParametersT({ paramsDir: fileURLToPath(new URL("../../../params/", import.meta.url)) });
	for (const slope of ["upright", "italic"]) for (const weight of [120, 420, 920]) {
		const para = makePara({
			shape: { serifs: "sans", spacing: "term", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
			menu: { family: "N long leg PTMN QA", version: "34.9.0", width: 5, slope, weight: 400 },
			featureControl: { noCvSs: false, noLigation: true },
			variants: { design: { "capital-latin-gamma": "serifless", "latin-gamma": "serifless" } },
		});
		const { glyphStore } = buildGlyphs(para, {
			blockIsNeeded: id => ["Letter-Latin-Upper-N", "Letter-Latin-Lower-N", "Orthography"].includes(id),
			glyphIsNeeded: id => /^(?:N|NLongLeg|Eng\.phonotypic|cyrl\/I|nCapLongLeg)(?:\.|$)/.test(id),
		});
		const glyph = glyphStore.queryByUnicode(0x0220);
		assert.ok(glyph);
		assert.equal(LocalizedForm.PTMN.get(glyph), "NLongLeg.phonotypic");
		const contours = name => {
			const target = glyphStore.queryByNameEnsured(name);
			return new Geometry.SimplifyGeometry(target.geometry, target.gizmo, true).toContours();
		};
		assert.notDeepEqual(contours("NLongLeg.phonotypic"), contours("Eng.phonotypic"));
		assert.notDeepEqual(contours("NLongLeg.phonotypic"), contours("cyrl/I"));
		const target = glyphStore.queryByNameEnsured("NLongLeg.phonotypic");
		const points = contours("NLongLeg.phonotypic").flat().map(point => target.gizmo.unapply(point));
		assert.ok(points.some(point => point.y < 0), "the reversed N keeps its long right leg");
	}
});
