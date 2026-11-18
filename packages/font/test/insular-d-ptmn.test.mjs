import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as Geometry from "@iosevka/geometry";
import { buildGlyphs } from "@iosevka/font-glyphs";
import { LocalizedForm } from "@iosevka/glyph/relation";
import { getParametersT } from "../src/param/index.mjs";

test("phonotypic insular D forms have stem hooks and omit the capital bottom serif", async () => {
	await Geometry.Init();
	const makePara = await getParametersT({ paramsDir: fileURLToPath(new URL("../../../params/", import.meta.url)) });
	for (const spacing of ["term", "quasi-proportional"]) {
		for (const slope of ["upright", "italic"]) {
			for (const weight of [120, 420, 920]) {
				const para = makePara({
					shape: { serifs: "sans", spacing, weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
					menu: { family: "Insular D QA", version: "34.9.0", width: 5, slope, weight: 400 },
					featureControl: { noCvSs: false, noLigation: true },
					variants: { design: { "capital-latin-gamma": "serifless", "latin-gamma": "serifless" } },
				});
				const { glyphStore } = buildGlyphs(para, {
					blockIsNeeded: id => ["Letter-Latin-Upper-D", "Letter-Latin-Lower-D", "Letter-Latin-Upper-Insular-D", "Letter-Latin-Lower-Eth", "Orthography"].includes(id),
					glyphIsNeeded: id => id === "D" || id.startsWith("D.") || id === "d" || id.startsWith("d.") || id === "d/descBase" || id.startsWith("DInsular") || id.startsWith("dInsular"),
				});
				for (const [cp, target] of [[0xA779, "DInsular.phonotypic"], [0xA77A, "dInsular.phonotypic"]]) {
					assert.equal(LocalizedForm.PTMN.get(glyphStore.queryByUnicode(cp)), target);
					const glyph = glyphStore.queryByNameEnsured(target);
					const contours = new Geometry.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours();
					assert.ok(contours.length && contours.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
					assert.ok(contours.flat().some(p => glyph.gizmo.unapply(p).y < 0), target);
				}
				const upper = glyphStore.queryByNameEnsured("DInsular.phonotypic");
				assert.equal(upper.advanceWidth, glyphStore.queryByNameEnsured("D").advanceWidth * para.advanceScaleT);
				const outline = suffix => {
					const glyph = glyphStore.queryByNameEnsured(`DInsular.phonotypic.standard${suffix}`);
					return new Geometry.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours();
				};
				assert.deepEqual(outline("BilateralSerifed"), outline("UnilateralSerifed"));
			}
		}
	}
});
